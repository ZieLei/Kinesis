"""Void / refund: authorization, preserved records, stock, audit, reports."""

from decimal import Decimal

import pytest
from sqlalchemy import select

from activity_models import ActivityEvent
from auth.password import hash_password
from cashier_models import Cashier
from models import Product, Sale, SaleItem, SaleReversal, StockAdjustment
from tests.conftest import requires_database
from tests.helpers import bearer, create_cashier, pair_native
from tests.test_pos_auth import admin_client, cashier_login_native  # noqa: F401
from tests.test_product_archiving import add_product, sell


pytestmark = requires_database


@pytest.fixture()
def pos(client_factory, db_session):
    client = client_factory()
    token = pair_native(client, db_session)["session_token"]
    create_cashier(db_session)
    supervisor = Cashier(
        username="boss",
        display_name="Boss",
        pin_hash=hash_password("654321"),
        is_active=True,
        is_supervisor=True,
    )
    db_session.add(supervisor)
    db_session.commit()
    headers = {**bearer(token), "X-Cashier-Session": cashier_login_native(client, token)}
    return client, headers


def reverse(client, headers, code, **overrides):
    body = {
        "kind": "void",
        "reason_code": "cashier_error",
        "supervisor_username": "boss",
        "supervisor_pin": "654321",
    }
    body.update(overrides)
    return client.post(f"/api/sales/{code}/reversal", headers=headers, json=body)


def stock(db, product_id):
    db.expire_all()
    return db.get(Product, product_id).stock


def test_void_restocks_and_preserves_original(pos, db_session):
    client, headers = pos
    product = add_product(db_session, stock=5)
    assert sell(client, headers, product.id, quantity=2).status_code == 200
    assert stock(db_session, product.id) == 3

    response = reverse(client, headers, "TXN-ARCH-0001")

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "voided"
    assert body["total"] == 700.0 and len(body["items"]) == 1
    assert body["reversal"]["authorized_by_username"] == "boss"
    assert stock(db_session, product.id) == 5
    assert db_session.get(Product, product.id).how_much_sold == 0

    adjustment = db_session.scalars(select(StockAdjustment)).one()
    assert (adjustment.reason, adjustment.quantity_change) == ("sale_reversal", 2)
    assert (adjustment.stock_before, adjustment.stock_after) == (3, 5)
    assert db_session.scalars(select(SaleItem)).one().quantity == 2
    assert db_session.scalars(
        select(ActivityEvent).where(ActivityEvent.event_type == "sale.voided")
    ).all()


def test_wrong_supervisor_pin_changes_nothing(pos, db_session):
    client, headers = pos
    product = add_product(db_session)
    sell(client, headers, product.id)

    response = reverse(client, headers, "TXN-ARCH-0001", supervisor_pin="000000")

    assert response.status_code == 403
    assert db_session.scalars(select(Sale)).one().status == "completed"
    assert stock(db_session, product.id) == 4


def test_non_supervisor_cannot_authorize(pos, db_session):
    client, headers = pos
    product = add_product(db_session)
    sell(client, headers, product.id)

    response = reverse(
        client, headers, "TXN-ARCH-0001", supervisor_username="cashier1", supervisor_pin="123456"
    )

    assert response.status_code == 403


def test_requires_cashier_session(pos, db_session):
    client, headers = pos
    product = add_product(db_session)
    sell(client, headers, product.id)

    bare = {"Authorization": headers["Authorization"]}

    assert reverse(client, bare, "TXN-ARCH-0001").status_code == 401


def test_other_reason_needs_note(pos, db_session):
    client, headers = pos
    product = add_product(db_session)
    sell(client, headers, product.id)

    assert reverse(client, headers, "TXN-ARCH-0001", reason_code="other").status_code == 422
    assert reverse(
        client, headers, "TXN-ARCH-0001", reason_code="bogus"
    ).status_code == 422


def test_refund_without_restock_leaves_stock(pos, db_session):
    client, headers = pos
    product = add_product(db_session, stock=5)
    sell(client, headers, product.id)

    response = reverse(
        client,
        headers,
        "TXN-ARCH-0001",
        kind="refund",
        reason_code="defective_item",
        return_to_stock=False,
    )

    assert response.status_code == 200
    assert response.json()["status"] == "refunded"
    assert response.json()["reversal"]["restocked"] is False
    assert stock(db_session, product.id) == 4
    assert db_session.scalars(select(StockAdjustment)).all() == []


def test_double_reversal_is_idempotent_or_conflict(pos, db_session):
    client, headers = pos
    product = add_product(db_session, stock=5)
    sell(client, headers, product.id)

    assert reverse(client, headers, "TXN-ARCH-0001").status_code == 200
    again = reverse(client, headers, "TXN-ARCH-0001")
    different = reverse(client, headers, "TXN-ARCH-0001", kind="refund")

    assert again.status_code == 200
    assert different.status_code == 409
    assert stock(db_session, product.id) == 5
    assert len(db_session.scalars(select(SaleReversal)).all()) == 1


def test_reversed_sale_leaves_reports_and_unknown_code_404(pos, db_session):
    client, headers = pos
    product = add_product(db_session)
    sell(client, headers, product.id)
    reverse(client, headers, "TXN-ARCH-0001")

    listing = client.get("/api/sales", headers=headers).json()
    report = client.get("/api/reports/sales?period=daily", headers=headers)

    assert listing["statuses"]["voided"] == 1
    assert report.status_code == 200
    assert report.json()["current"]["transactions"] == 0
    assert reverse(client, headers, "NOPE").status_code == 404


def test_sales_list_filters_and_summary_reports_reversals(pos, db_session):
    client, headers = pos
    product = add_product(db_session, stock=10)
    sell(client, headers, product.id, code="TXN-KEEP-0001")
    sell(client, headers, product.id, code="TXN-GONE-0002", quantity=2)
    reverse(client, headers, "TXN-GONE-0002")

    voided = client.get("/api/sales?status=voided", headers=headers).json()
    found = client.get("/api/sales?search=keep", headers=headers).json()
    wildcard = client.get("/api/sales?search=%25", headers=headers).json()
    everything = client.get("/api/sales", headers=headers).json()
    bad = client.get("/api/sales?status=bogus", headers=headers)

    assert [i["transaction_code"] for i in voided["items"]] == ["TXN-GONE-0002"]
    assert voided["count"] == 1
    assert [i["transaction_code"] for i in found["items"]] == ["TXN-KEEP-0001"]
    assert wildcard["count"] == 0
    assert everything["count"] == 2 and everything["statuses"] == {"completed": 1, "voided": 1}
    assert bad.status_code == 422

    current = client.get("/api/reports/sales?period=daily", headers=headers).json()["current"]
    assert current["transactions"] == 1
    assert current["sales"] == 350.0
    assert current["reversed_transactions"] == 1
    assert current["reversed_amount"] == 700.0


def test_legacy_sale_of_deleted_product_stays_in_history(pos, db_session):
    client, headers = pos
    product = add_product(db_session, stock=5)
    sell(client, headers, product.id, code="TXN-LEGACY-01")
    item = db_session.scalars(select(SaleItem)).one()
    item.product_id = None  # product hard-deleted before archiving existed
    db_session.commit()
    db_session.delete(db_session.get(Product, product.id))
    db_session.commit()

    sale = client.get("/api/sales/TXN-LEGACY-01", headers=headers).json()
    report = client.get("/api/reports/products?period=daily", headers=headers).json()
    summary = client.get("/api/reports/sales?period=daily", headers=headers).json()["current"]

    assert sale["items"][0]["product_name"] == "Brake pad"
    assert [p["name"] for p in report["top_products"]] == ["Brake pad"]
    assert summary["transactions"] == 1 and summary["sales"] == 350.0
    # Reversing it cannot restock a product that no longer exists, but works.
    response = reverse(client, headers, "TXN-LEGACY-01")
    assert response.status_code == 200
    assert db_session.scalars(select(StockAdjustment)).all() == []


def test_stock_history_shows_sales_and_reversal_restock(
    pos, client_factory, db_session
):

    client, headers = pos
    admin, _csrf = admin_client(client_factory, db_session)
    product = add_product(db_session, stock=5)
    sell(client, headers, product.id, quantity=2)
    reverse(client, headers, "TXN-ARCH-0001")

    history = admin.get(f"/api/admin/inventory/products/{product.id}/history").json()
    entries = {(e["type"], e["quantity_change"]): e for e in history["items"]}

    assert set(entries) == {("sale", -2), ("adjustment", 2)}
    assert entries[("sale", -2)]["note"] == "TXN-ARCH-0001 (voided)"
    assert entries[("adjustment", 2)]["reason"] == "sale_reversal"


def test_admin_overview_counts_only_completed_and_reports_reversals(
    pos, client_factory, db_session
):
    client, headers = pos
    product = add_product(db_session, stock=10)
    sell(client, headers, product.id, code="TXN-OV-0001")
    sell(client, headers, product.id, code="TXN-OV-0002", quantity=3)
    reverse(client, headers, "TXN-OV-0002")

    admin, _csrf = admin_client(client_factory, db_session)
    body = admin.get("/api/admin/overview/operations").json()

    assert body["sales_today"]["transactions"] == 1
    assert body["sales_today"]["revenue"] == 350.0
    assert body["sales_today"]["reversed_transactions"] == 1
    assert body["sales_today"]["reversed_amount"] == 1050.0
    assert body["cashier_performance"][0]["transactions"] == 1
    assert body["inventory_summary"]["total_products"] == 1


def test_admin_can_rename_terminal(client_factory, db_session):
    from models import Terminal
    from tests.conftest import ADMIN_ORIGIN

    pos_client = client_factory()
    pair_native(pos_client, db_session)
    terminal = db_session.scalars(select(Terminal)).one()

    admin, csrf = admin_client(client_factory, db_session)
    headers = {"Origin": ADMIN_ORIGIN, "X-CSRF-Token": csrf}
    url = f"/api/admin/terminals/{terminal.id}/name"

    ok = admin.patch(url, headers=headers, json={"name": "  Front   counter "})
    blank = admin.patch(url, headers=headers, json={"name": "   "})
    missing = admin.patch("/api/admin/terminals/9999/name", headers=headers, json={"name": "x"})
    anonymous = pos_client.patch(url, json={"name": "Hacked"})

    assert ok.status_code == 200 and ok.json()["name"] == "Front counter"
    assert blank.status_code == 422
    assert missing.status_code == 404
    assert anonymous.status_code in (401, 403)
    db_session.expire_all()
    assert db_session.get(Terminal, terminal.id).name == "Front counter"
