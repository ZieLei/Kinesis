"""Admin product management: edit, images, archive/delete, restore."""

from datetime import datetime, timezone
from decimal import Decimal

import pytest
from sqlalchemy import select

from activity_models import ActivityEvent
from models import Product, SaleItem, StockAdjustment
from tests.conftest import ADMIN_ORIGIN, requires_database
from tests.test_admin_inventory import adjust, listing
from tests.test_pos_auth import admin_client
from tests.test_product_archiving import add_product, pos, reload, sell  # noqa: F401


pytestmark = requires_database

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64


@pytest.fixture()
def admin(client_factory, db_session):
    client, csrf = admin_client(client_factory, db_session)
    return client, {"Origin": ADMIN_ORIGIN, "X-CSRF-Token": csrf}


def edit(admin, product_id, **fields):
    client, headers = admin
    return client.put(f"/api/admin/products/{product_id}", headers=headers, json=fields)


def upload(admin, product_id, data=PNG, name="part.png", mime="image/png"):
    client, headers = admin
    return client.post(
        f"/api/admin/products/{product_id}/image",
        headers=headers,
        files={"file": (name, data, mime)},
    )


def image_file(product):
    from main import resolve_image_path

    return resolve_image_path(product.image_path)


def events(db, event_type):
    db.expire_all()
    return db.scalars(
        select(ActivityEvent).where(ActivityEvent.event_type == event_type)
    ).all()


def archive(db, product):
    product = reload(db, product.id)
    product.archived_at = datetime.now(timezone.utc)
    db.commit()
    return product


# --------------------------------------------------------------------------
# Edit
# --------------------------------------------------------------------------


def test_edit_changes_catalog_fields_only(pos, admin, db_session):
    client, headers = pos
    product = add_product(db_session, name="Brake pad", stock=10, sku="BRK-001")
    product = reload(db_session, product.id)
    product.average_cost = Decimal("120.0000")
    db_session.commit()
    assert sell(client, headers, product.id, quantity=2).status_code == 200

    response = edit(
        admin,
        product.id,
        name="Brake pad (front)",
        category="Brake parts",
        price="399.00",
        sku="BRK-FRONT",
        # Not editable here; must be ignored.
        stock=999,
        average_cost="1.00",
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert (body["name"], body["category"], body["sku"]) == (
        "Brake pad (front)", "Brake parts", "BRK-FRONT"
    )
    assert reload(db_session, product.id).price == Decimal("399.00")

    product = reload(db_session, product.id)
    assert product.stock == 8  # 10 minus the sale, untouched by the edit
    assert product.average_cost == Decimal("120.0000")

    # The historical sale line keeps what was sold.
    line = db_session.scalars(select(SaleItem)).one()
    assert (line.product_name, line.sku, line.category, line.unit_price) == (
        "Brake pad", "BRK-001", "Brakes", Decimal("350.00")
    )

    [event] = [
        e for e in events(db_session, "inventory.product_updated")
        if e.details.get("product_id") == product.id
    ]
    assert (event.actor_type, event.actor_name) == ("admin", "admin")
    assert set(event.details["changes"]) == {"name", "category", "price", "sku"}


def test_edit_validation(admin, db_session):
    product = add_product(db_session, sku="BRK-001")
    add_product(db_session, name="Other", sku="OTH-001")

    assert edit(admin, product.id, sku="").status_code == 422
    assert edit(admin, product.id, sku="   ").status_code == 422
    assert edit(admin, product.id, sku=None).status_code == 422
    assert edit(admin, product.id, name=None).status_code == 422
    assert edit(admin, product.id, name="  ").status_code == 422
    assert edit(admin, product.id, price="0").status_code == 422
    assert edit(admin, product.id, price=None).status_code == 422
    assert edit(admin, product.id).status_code == 422

    duplicate = edit(admin, product.id, sku="OTH-001")
    assert duplicate.status_code == 409

    assert edit(admin, 999999, name="X").status_code == 404
    assert reload(db_session, product.id).sku == "BRK-001"


def test_archived_products_cannot_be_edited(admin, db_session):
    product = archive(db_session, add_product(db_session))

    response = edit(admin, product.id, name="New name")

    assert response.status_code == 409
    assert "Restore" in response.json()["detail"]
    assert upload(admin, product.id).status_code == 409
    assert reload(db_session, product.id).name == "Brake pad"


def test_edit_requires_admin(pos, db_session):
    client, headers = pos
    product = add_product(db_session)
    assert client.put(
        f"/api/admin/products/{product.id}", headers=headers, json={"name": "X"}
    ).status_code in (401, 403)


def test_pos_edit_unchanged(pos, db_session):
    client, headers = pos
    product = add_product(db_session)
    response = client.put(
        f"/api/products/{product.id}", headers=headers, json={"price": "360.00"}
    )
    assert response.status_code == 200, response.text
    assert reload(db_session, product.id).price == Decimal("360.00")


# --------------------------------------------------------------------------
# Images
# --------------------------------------------------------------------------


def test_upload_replace_and_remove_image(admin, db_session):
    product = add_product(db_session)

    first = upload(admin, product.id)
    assert first.status_code == 200, first.text
    assert first.json()["image_url"] == f"/api/products/{product.id}/image"
    first_file = image_file(reload(db_session, product.id))
    assert first_file.is_file()

    client, headers = admin
    served = client.get(f"/api/products/{product.id}/image", headers=headers)
    assert served.status_code == 200
    assert served.headers["content-type"] == "image/png"

    replaced = upload(admin, product.id, data=JPEG, name="part.jpg", mime="image/jpeg")
    assert replaced.status_code == 200
    second_file = image_file(reload(db_session, product.id))
    assert second_file.is_file() and second_file.suffix == ".jpg"
    assert not first_file.exists()  # replaced file cleaned up

    removed = client.delete(f"/api/admin/products/{product.id}/image", headers=headers)
    assert removed.status_code == 200
    assert reload(db_session, product.id).image_path is None
    assert not second_file.exists()

    changes = [
        e.details["changes"]["image_path"]
        for e in events(db_session, "inventory.product_updated")
        if "image_path" in e.details.get("changes", {})
    ]
    assert len(changes) == 3  # added, replaced, removed
    assert all(e.actor_type == "admin" for e in events(db_session, "inventory.product_updated"))


def test_image_validation_and_authorization(pos, admin, db_session):
    product = add_product(db_session)

    assert upload(admin, product.id, data=b"not an image", name="x.png").status_code == 415
    assert upload(admin, product.id, data=b"", name="x.png").status_code == 400
    too_big = PNG + b"\x00" * (5 * 1024 * 1024)
    assert upload(admin, product.id, data=too_big).status_code == 413
    assert upload(admin, 999999).status_code == 404
    assert reload(db_session, product.id).image_path is None

    client, headers = pos
    assert client.post(
        f"/api/admin/products/{product.id}/image",
        headers=headers,
        files={"file": ("p.png", PNG, "image/png")},
    ).status_code in (401, 403)


# --------------------------------------------------------------------------
# Archive, delete, restore
# --------------------------------------------------------------------------


def test_delete_without_history_is_permanent(admin, db_session):
    product = add_product(db_session)
    assert upload(admin, product.id).status_code == 200
    stored = image_file(reload(db_session, product.id))

    client, headers = admin
    response = client.delete(f"/api/admin/products/{product.id}", headers=headers)

    assert response.status_code == 200
    assert (response.json()["deleted"], response.json()["archived"]) == (True, False)
    assert reload(db_session, product.id) is None
    assert not stored.exists()


def test_adjustment_only_history_archives(admin, db_session):
    product = add_product(db_session, stock=5)
    assert adjust(admin, product, -1, reason="damaged").status_code == 201

    client, headers = admin
    response = client.delete(f"/api/admin/products/{product.id}", headers=headers)

    assert response.json()["archived"] is True
    assert reload(db_session, product.id).stock == 4
    assert db_session.scalar(select(StockAdjustment.product_id)) == product.id


def test_archived_view_and_restore(pos, admin, db_session):
    client, headers = pos
    product = add_product(db_session, name="Old chain", stock=6, sku="CHN-001")
    assert sell(client, headers, product.id, quantity=1).status_code == 200

    admin_client_, admin_headers = admin
    archived = admin_client_.delete(f"/api/admin/products/{product.id}", headers=admin_headers)
    assert archived.json()["archived"] is True
    [event] = events(db_session, "inventory.product_archived")
    assert event.actor_type == "admin"

    assert listing(admin)["total"] == 0
    view = listing(admin, archived=True)
    assert [item["name"] for item in view["items"]] == ["Old chain"]
    assert view["items"][0]["archived_at"] is not None
    assert view["items"][0]["stock"] == 5

    restored = admin_client_.post(
        f"/api/admin/products/{product.id}/restore", headers=admin_headers
    )
    assert restored.status_code == 200
    assert listing(admin, archived=True)["total"] == 0
    assert [item["name"] for item in listing(admin)["items"]] == ["Old chain"]
    assert edit(admin, product.id, name="Old chain (restored)").status_code == 200


def create(admin, **fields):
    client, headers = admin
    body = {"name": "Spark plug", "category": "Ignition", "price": "120.00", **fields}
    return client.post("/api/admin/products", headers=headers, json=body)


def test_duplicate_product_names_are_rejected(admin, db_session):
    assert create(admin).status_code == 201

    same = create(admin, name="  spark   PLUG ", category="ignition")
    other_category = create(admin, category="Electrical")

    assert same.status_code == 409
    assert "already exists" in same.json()["detail"]
    assert other_category.status_code == 201
    assert len(db_session.scalars(select(Product)).all()) == 2


def test_rename_into_a_duplicate_is_rejected_but_self_rename_is_fine(admin, db_session):
    first = create(admin).json()
    second = create(admin, name="Air filter").json()

    clash = edit(admin, second["id"], name="Spark plug", category="Ignition")
    own_case_change = edit(admin, first["id"], name="SPARK PLUG")

    assert clash.status_code == 409
    assert own_case_change.status_code == 200


def test_restoring_into_a_duplicate_is_rejected(admin, db_session):
    original = create(admin).json()
    db_session.get(Product, original["id"]).archived_at = datetime.now(timezone.utc)
    db_session.commit()
    assert create(admin).status_code == 201  # archived products do not block

    client, headers = admin
    restore = client.post(
        f"/api/admin/products/{original['id']}/restore", headers=headers
    )

    assert restore.status_code == 409


def test_pos_create_rejects_duplicates(pos, db_session):
    client, headers = pos
    body = {"name": "Chain", "category": "Drive", "price": "500.00", "stock": 0}

    assert client.post("/api/products", headers=headers, json=body).status_code in (200, 201)
    assert client.post("/api/products", headers=headers, json=body).status_code == 409
