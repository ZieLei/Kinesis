"""Admin stock management: listing, add stock, adjustments, history."""

from decimal import Decimal

import pytest
from sqlalchemy import func, select

from activity_models import ActivityEvent
from models import InventoryReceipt, StockAdjustment
from tests.conftest import ADMIN_ORIGIN, requires_database
from tests.test_pos_auth import admin_client
from tests.test_product_archiving import add_product, pos, reload, sell  # noqa: F401


pytestmark = requires_database

BASE = "/api/admin/inventory"


@pytest.fixture()
def admin(client_factory, db_session):
    client, csrf = admin_client(client_factory, db_session)
    return client, {"Origin": ADMIN_ORIGIN, "X-CSRF-Token": csrf}


def listing(admin, **params):
    client, headers = admin
    response = client.get(f"{BASE}/products", headers=headers, params=params)
    assert response.status_code == 200, response.text
    return response.json()


def names(body):
    return [item["name"] for item in body["items"]]


def add_stock(admin, product, quantity=5, unit_cost="100.00", **extra):
    client, headers = admin
    return client.post(
        f"{BASE}/receipts",
        headers=headers,
        json={
            "product_id": product.id,
            "quantity": quantity,
            "unit_cost": unit_cost,
            "expected_stock": extra.pop("expected_stock", product.stock),
            **extra,
        },
    )


def adjust(admin, product, change, reason="damaged", **extra):
    client, headers = admin
    return client.post(
        f"{BASE}/adjustments",
        headers=headers,
        json={
            "product_id": product.id,
            "quantity_change": change,
            "reason": reason,
            "expected_stock": extra.pop("expected_stock", product.stock),
            **extra,
        },
    )


@pytest.fixture()
def catalog(db_session):
    # Default low-stock threshold is 5.
    return {
        "out": add_product(db_session, name="Axle nut", stock=0, sku="AXL-001"),
        "low": add_product(db_session, name="Brake pad", stock=3, sku="BRK-001"),
        "ok": add_product(db_session, name="Chain lube", stock=40, sku="CHN-001"),
    }


# --------------------------------------------------------------------------


def test_listing_requires_admin(pos, catalog):
    client, headers = pos
    assert client.get(f"{BASE}/products", headers=headers).status_code in (401, 403)


def test_listing_status_search_sort_and_pagination(admin, catalog, db_session):
    archived = add_product(db_session, name="Discontinued bell", stock=9, sku="BEL-001")
    archived = reload(db_session, archived.id)
    from datetime import datetime, timezone
    archived.archived_at = datetime.now(timezone.utc)
    db_session.commit()

    body = listing(admin)
    assert names(body) == ["Axle nut", "Brake pad", "Chain lube"]  # archived hidden
    assert body["total"] == 3
    assert body["low_stock_threshold"] == 5
    assert [item["stock_status"] for item in body["items"]] == ["out", "low", "in_stock"]
    assert body["categories"] == ["Brakes"]

    assert names(listing(admin, status="low")) == ["Brake pad"]
    assert names(listing(admin, status="out")) == ["Axle nut"]
    assert names(listing(admin, status="in_stock")) == ["Chain lube"]
    assert names(listing(admin, search="chn-0")) == ["Chain lube"]
    assert names(listing(admin, search="%")) == []  # wildcards are literal
    assert listing(admin, category="brakes")["total"] == 3
    assert names(listing(admin, sort="stock", direction="desc")) == [
        "Chain lube", "Brake pad", "Axle nut"
    ]

    page = listing(admin, limit=2, offset=2)
    assert names(page) == ["Chain lube"] and page["total"] == 3


def test_add_stock_updates_stock_cost_and_audit(admin, catalog, db_session):
    product = catalog["out"]

    response = add_stock(admin, product, quantity=8, unit_cost="120.00", note="Restock")

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["product"]["stock"] == 8
    assert body["product"]["stock_status"] == "in_stock"
    assert body["product"]["average_cost"] == 120.0
    assert body["receipt"]["notes"] == "Restock"

    assert reload(db_session, product.id).stock == 8
    assert db_session.scalar(select(InventoryReceipt)).notes == "Restock"

    db_session.expire_all()
    event = db_session.scalars(
        select(ActivityEvent).where(ActivityEvent.event_type == "inventory.stock_adjusted")
    ).one()
    assert (event.actor_type, event.actor_name) == ("admin", "admin")
    assert event.details["changes"]["stock"]["delta"] == 8


def test_add_stock_rejects_stale_view_and_archived(admin, catalog, db_session):
    product = catalog["low"]

    stale = add_stock(admin, product, expected_stock=2)
    assert stale.status_code == 409
    assert "changed" in stale.json()["detail"]
    assert reload(db_session, product.id).stock == 3

    product = reload(db_session, product.id)
    from datetime import datetime, timezone
    product.archived_at = datetime.now(timezone.utc)
    db_session.commit()

    assert add_stock(admin, product).status_code == 409


def test_write_off_records_reason_before_and_after(admin, catalog, db_session):
    product = catalog["ok"]

    response = adjust(admin, product, -4, reason="damaged", note="Leaking cans")

    assert response.status_code == 201, response.text
    assert response.json()["product"]["stock"] == 36

    record = db_session.scalars(select(StockAdjustment)).one()
    assert (record.stock_before, record.stock_after, record.quantity_change) == (40, 36, -4)
    assert (record.reason, record.note) == ("damaged", "Leaking cans")
    assert (record.actor_type, record.actor_name) == ("admin", "admin")
    assert record.product_name == "Chain lube"


def test_adjustment_validation(admin, catalog, db_session):
    product = catalog["low"]

    assert adjust(admin, product, -1, reason="other").status_code == 422  # note needed
    assert adjust(admin, product, 2, reason="damaged").status_code == 422  # only counts add
    assert adjust(admin, product, 0, reason="count_correction").status_code == 422

    too_many = adjust(admin, product, -4)
    assert too_many.status_code == 409
    assert reload(db_session, product.id).stock == 3

    assert adjust(admin, product, -1, expected_stock=7).status_code == 409

    counted = adjust(admin, product, 2, reason="count_correction")
    assert counted.status_code == 201, counted.text
    assert reload(db_session, product.id).stock == 5

    assert db_session.scalar(select(StockAdjustment.reason)) == "count_correction"


def test_adjustments_require_admin(pos, catalog):
    client, headers = pos
    response = client.post(
        f"{BASE}/adjustments",
        headers=headers,
        json={
            "product_id": catalog["ok"].id,
            "quantity_change": -1,
            "reason": "lost",
            "expected_stock": 40,
        },
    )
    assert response.status_code in (401, 403)


def test_history_lists_receipts_and_adjustments(admin, catalog):
    client, headers = admin
    product = catalog["out"]

    assert add_stock(admin, product, quantity=6, unit_cost="50.00").status_code == 201
    product.stock = 6
    assert adjust(admin, product, -1, reason="lost").status_code == 201

    history = client.get(f"{BASE}/products/{product.id}/history", headers=headers)
    assert history.status_code == 200, history.text

    entries = history.json()["items"]
    assert [entry["type"] for entry in entries] == ["adjustment", "receipt"]
    assert entries[0]["quantity_change"] == -1 and entries[0]["reason"] == "lost"
    assert entries[1]["quantity_change"] == 6 and entries[1]["unit_cost"] == 50.0


def test_pos_receipts_still_work(pos, catalog, db_session):
    client, headers = pos
    product = catalog["out"]

    response = client.post(
        "/api/inventory/receipts",
        headers=headers,
        json={"items": [{"product_id": product.id, "quantity": 3, "unit_cost": "10.00"}]},
    )

    assert response.status_code == 201, response.text
    assert reload(db_session, product.id).stock == 3
    assert reload(db_session, product.id).average_cost == Decimal("10.0000")


# --------------------------------------------------------------------------
# Add product
# --------------------------------------------------------------------------


def create_product(admin, **fields):
    client, headers = admin
    body = {"name": "Clutch cable", "category": "Cables", "price": "180.00", **fields}
    return client.post("/api/admin/products", headers=headers, json=body)


def test_create_product_without_stock(admin, db_session):
    from models import Product

    response = create_product(admin)

    assert response.status_code == 201, response.text
    body = response.json()
    assert (body["stock"], body["name"], body["archived"]) == (0, "Clutch cable", False)
    assert body["sku"]  # generated from the SKU settings
    assert db_session.scalar(select(InventoryReceipt)) is None

    db_session.expire_all()
    event = db_session.scalars(
        select(ActivityEvent).where(ActivityEvent.event_type == "inventory.product_created")
    ).one()
    assert (event.actor_type, event.actor_name) == ("admin", "admin")

    # Immediately available to the inventory listing and Add stock.
    assert names(listing(admin)) == ["Clutch cable"]
    product = db_session.get(Product, body["id"])
    assert add_stock(admin, product, quantity=2).status_code == 201


def test_create_product_records_opening_stock_as_receipt(admin, db_session):
    from models import InventoryReceiptItem, Product

    response = create_product(
        admin, sku="CLT-001", initial_stock=10, initial_unit_cost="95.50",
        note="Supplier A opening order",
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert (body["stock"], body["sku"], body["average_cost"]) == (10, "CLT-001", 95.5)

    receipt = db_session.scalars(select(InventoryReceipt)).one()
    assert receipt.notes == "Supplier A opening order"
    item = db_session.scalars(select(InventoryReceiptItem)).one()
    assert (item.product_id, item.quantity, item.unit_cost) == (body["id"], 10, Decimal("95.5000"))

    client, headers = admin
    history = client.get(f"{BASE}/products/{body['id']}/history", headers=headers).json()
    assert [entry["type"] for entry in history["items"]] == ["receipt"]

    db_session.expire_all()
    assert db_session.get(Product, body["id"]).stock == 10


def test_create_product_validation(admin, db_session):
    from models import Product

    assert create_product(admin, sku="DUP-001").status_code == 201

    duplicate = create_product(admin, name="Other", sku="DUP-001")
    assert duplicate.status_code == 409
    assert "DUP-001" in duplicate.json()["detail"]

    assert create_product(admin, name="   ").status_code == 422
    assert create_product(admin, category="").status_code == 422
    assert create_product(admin, price="0").status_code == 422
    assert create_product(admin, price="-5").status_code == 422
    assert create_product(admin, price="1.234").status_code == 422
    assert create_product(admin, initial_stock=-1).status_code == 422
    assert create_product(admin, initial_stock=100001, initial_unit_cost="1").status_code == 422
    assert create_product(admin, initial_stock=5).status_code == 422  # cost required

    db_session.expire_all()
    assert db_session.scalar(select(func.count(Product.id))) == 1
    assert db_session.scalar(select(InventoryReceipt)) is None


def test_create_product_requires_admin(pos):
    client, headers = pos
    response = client.post(
        "/api/admin/products",
        headers=headers,
        json={"name": "X", "category": "Y", "price": "1.00"},
    )
    assert response.status_code in (401, 403)


def test_pos_product_creation_unchanged(pos):
    client, headers = pos
    response = client.post(
        "/api/products",
        headers=headers,
        json={"name": "Brake pad", "category": "Brakes", "price": "350.00", "stock": 5},
    )
    assert response.status_code == 201, response.text
    assert response.json()["stock"] == 5
