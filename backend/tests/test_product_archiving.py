"""Product archiving: delete vs archive, selling, restocking, restore, audit."""

from decimal import Decimal

import pytest
from sqlalchemy import func, select

from activity_models import ActivityEvent
from models import InventoryReceipt, Product, Sale, SaleItem
from tests.conftest import ADMIN_ORIGIN, requires_database
from tests.helpers import bearer, create_cashier, pair_native
from tests.test_pos_auth import admin_client, cashier_login_native


pytestmark = requires_database


@pytest.fixture()
def pos(client_factory, db_session):
    client = client_factory()
    token = pair_native(client, db_session)["session_token"]
    create_cashier(db_session)
    headers = {**bearer(token), "X-Cashier-Session": cashier_login_native(client, token)}

    return client, headers


def add_product(db, name="Brake pad", stock=5, sku="BRK-001") -> Product:
    product = Product(
        name=name,
        category="Brakes",
        price=Decimal("350.00"),
        stock=stock,
        sku=sku,
        how_much_sold=0,
    )
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


def sell(client, headers, product_id, code="TXN-ARCH-0001", quantity=1):
    return client.post(
        "/api/sales",
        headers=headers,
        json={
            "transaction_code": code,
            "payment_method": "cash",
            "items": [{"product_id": product_id, "quantity": quantity}],
            "amount_tendered": "5000.00",
        },
    )


def events(db, event_type):
    db.expire_all()
    return db.scalars(
        select(ActivityEvent).where(ActivityEvent.event_type == event_type)
    ).all()


def reload(db, product_id):
    db.expire_all()
    return db.get(Product, product_id)


def archive_with_history(client, headers, db, stock=5, sold=2):
    product = add_product(db, stock=stock)
    assert sell(client, headers, product.id, quantity=sold).status_code == 200
    response = client.delete(f"/api/products/{product.id}", headers=headers)
    assert response.status_code == 200, response.text
    return product.id, response.json()


# --------------------------------------------------------------------------


def test_product_without_history_is_permanently_deleted(pos, db_session):
    client, headers = pos
    product = add_product(db_session)

    response = client.delete(f"/api/products/{product.id}", headers=headers)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["message"] == "Product deleted successfully."
    assert body["id"] == product.id
    assert (body["deleted"], body["archived"]) == (True, False)
    assert reload(db_session, product.id) is None

    [event] = events(db_session, "inventory.product_deleted")
    assert event.details["permanent"] is True
    assert events(db_session, "inventory.product_archived") == []


def test_product_with_sales_is_archived_and_history_preserved(pos, db_session):
    client, headers = pos
    product_id, body = archive_with_history(client, headers, db_session, stock=5, sold=2)

    # Existing clients read message/id; new fields are additive.
    assert body["id"] == product_id and body["message"]
    assert (body["archived"], body["deleted"]) == (True, False)

    product = reload(db_session, product_id)
    assert product.archived_at is not None
    assert product.stock == 3  # archiving never changes stock
    assert product.sku == "BRK-001"

    line = db_session.scalars(select(SaleItem)).one()
    assert (line.product_id, line.product_name, line.quantity) == (product_id, "Brake pad", 2)

    [event] = events(db_session, "inventory.product_archived")
    assert event.details["stock"] == 3
    assert event.actor_type == "cashier"
    assert events(db_session, "inventory.product_deleted") == []

    # Hidden from the active catalog, still visible on request.
    listed = client.get("/api/products", headers=headers).json()["items"]
    assert product_id not in [item["id"] for item in listed]

    everything = client.get(
        "/api/products", headers=headers, params={"include_archived": True}
    ).json()["items"]
    assert [item["archived"] for item in everything if item["id"] == product_id] == [True]

    # Deleting again is idempotent and never escalates to a hard delete.
    again = client.delete(f"/api/products/{product_id}", headers=headers)
    assert again.status_code == 200
    assert again.json()["archived"] is True
    assert reload(db_session, product_id) is not None
    assert len(events(db_session, "inventory.product_archived")) == 1


def test_product_with_only_receipt_history_is_archived(pos, db_session):
    client, headers = pos
    product = add_product(db_session, stock=0)

    received = client.post(
        "/api/inventory/receipts",
        headers=headers,
        json={"items": [{"product_id": product.id, "quantity": 4, "unit_cost": "200.00"}]},
    )
    assert received.status_code == 201, received.text

    response = client.delete(f"/api/products/{product.id}", headers=headers)

    assert response.json()["archived"] is True
    assert reload(db_session, product.id).stock == 4


def test_archived_product_cannot_be_sold(pos, db_session):
    client, headers = pos
    product_id, _ = archive_with_history(client, headers, db_session)

    response = sell(client, headers, product_id, code="TXN-ARCH-0002")

    assert response.status_code == 409
    assert "archived" in response.json()["detail"]
    assert reload(db_session, product_id).stock == 3
    assert db_session.scalar(select(func.count(Sale.id))) == 1


def test_retried_sale_is_still_replayed_after_archiving(pos, db_session):
    client, headers = pos
    product_id, _ = archive_with_history(client, headers, db_session)

    # Same transaction code and payload as the completed sale.
    replay = sell(client, headers, product_id, code="TXN-ARCH-0001", quantity=2)

    assert replay.status_code == 200, replay.text
    assert db_session.scalar(select(func.count(Sale.id))) == 1


def test_archived_product_cannot_be_restocked(pos, db_session):
    client, headers = pos
    product_id, _ = archive_with_history(client, headers, db_session)

    response = client.post(
        "/api/inventory/receipts",
        headers=headers,
        json={"items": [{"product_id": product_id, "quantity": 4, "unit_cost": "200.00"}]},
    )

    assert response.status_code == 409
    assert "archived" in response.json()["detail"]
    assert reload(db_session, product_id).stock == 3
    assert db_session.scalar(select(func.count(InventoryReceipt.id))) == 0


def test_restore_is_admin_only(pos, db_session):
    client, headers = pos
    product_id, _ = archive_with_history(client, headers, db_session)

    response = client.post(f"/api/admin/products/{product_id}/restore", headers=headers)

    assert response.status_code in (401, 403)
    assert reload(db_session, product_id).archived_at is not None


def test_admin_restore_returns_product_with_prior_stock_and_sku(
    pos, client_factory, db_session
):
    client, headers = pos
    product_id, _ = archive_with_history(client, headers, db_session)
    admin, csrf = admin_client(client_factory, db_session)
    admin_headers = {"Origin": ADMIN_ORIGIN, "X-CSRF-Token": csrf}

    response = admin.post(f"/api/admin/products/{product_id}/restore", headers=admin_headers)

    assert response.status_code == 200, response.text
    body = response.json()
    assert (body["archived"], body["stock"], body["sku"]) == (False, 3, "BRK-001")

    [event] = events(db_session, "inventory.product_restored")
    assert event.actor_type == "admin"
    assert event.actor_name == "admin"
    assert event.details["stock"] == 3

    # Restoring twice is a no-op, and the product is sellable again.
    assert admin.post(
        f"/api/admin/products/{product_id}/restore", headers=admin_headers
    ).status_code == 200
    assert len(events(db_session, "inventory.product_restored")) == 1
    assert sell(client, headers, product_id, code="TXN-ARCH-0003").status_code == 200


def test_restore_unknown_product_is_404(client_factory, db_session):
    admin, csrf = admin_client(client_factory, db_session)

    response = admin.post(
        "/api/admin/products/999999/restore",
        headers={"Origin": ADMIN_ORIGIN, "X-CSRF-Token": csrf},
    )

    assert response.status_code == 404


# --------------------------------------------------------------------------
# POST /api/products/{id}/archive: the POS "Archive" action never deletes.


def test_archive_keeps_a_product_without_history(pos, db_session):
    client, headers = pos
    product = add_product(db_session, stock=4)
    product.image_path = "products/brake.webp"
    db_session.commit()

    response = client.post(f"/api/products/{product.id}/archive", headers=headers)

    assert response.status_code == 200, response.text
    body = response.json()
    assert (body["archived"], body["deleted"]) == (True, False)
    assert body["id"] == product.id

    kept = reload(db_session, product.id)
    assert kept is not None and kept.archived_at is not None
    assert (kept.stock, kept.sku, kept.image_path) == (4, "BRK-001", "products/brake.webp")

    [event] = events(db_session, "inventory.product_archived")
    assert event.actor_type == "cashier"
    assert events(db_session, "inventory.product_deleted") == []

    listed = client.get("/api/products", headers=headers).json()["items"]
    assert product.id not in [item["id"] for item in listed]


def test_archive_is_idempotent(pos, db_session):
    client, headers = pos
    product = add_product(db_session)

    first = client.post(f"/api/products/{product.id}/archive", headers=headers)
    archived_at = reload(db_session, product.id).archived_at
    again = client.post(f"/api/products/{product.id}/archive", headers=headers)

    assert (first.status_code, again.status_code) == (200, 200)
    assert again.json()["archived"] is True
    assert reload(db_session, product.id).archived_at == archived_at
    assert len(events(db_session, "inventory.product_archived")) == 1


def test_archived_without_history_can_be_restored(pos, client_factory, db_session):
    client, headers = pos
    product = add_product(db_session, stock=4)
    assert client.post(f"/api/products/{product.id}/archive", headers=headers).status_code == 200

    admin, csrf = admin_client(client_factory, db_session)
    response = admin.post(
        f"/api/admin/products/{product.id}/restore",
        headers={"Origin": ADMIN_ORIGIN, "X-CSRF-Token": csrf},
    )

    assert response.status_code == 200, response.text
    assert (response.json()["archived"], response.json()["stock"]) == (False, 4)


def test_archive_unknown_product_is_404(pos):
    client, headers = pos

    assert client.post("/api/products/999999/archive", headers=headers).status_code == 404


def test_archive_requires_a_cashier_session(pos, db_session):
    client, headers = pos
    product = add_product(db_session)
    terminal_only = {k: v for k, v in headers.items() if k != "X-Cashier-Session"}

    response = client.post(f"/api/products/{product.id}/archive", headers=terminal_only)

    assert response.status_code in (401, 403)
    assert reload(db_session, product.id).archived_at is None
