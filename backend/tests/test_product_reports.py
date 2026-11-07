"""Product sales reports and active-inventory figures after archiving."""

from datetime import datetime, timezone
from decimal import Decimal

import pytest
from sqlalchemy import select

from models import Sale, SaleItem
from tests.conftest import ADMIN_ORIGIN, requires_database
from tests.test_pos_auth import admin_client
from tests.test_product_archiving import add_product, pos, reload, sell  # noqa: F401


pytestmark = requires_database


def report(client, headers, **params):
    response = client.get("/api/reports/products", headers=headers, params=params)
    assert response.status_code == 200, response.text
    return response.json()


def rows_by_name(body):
    return {row["name"]: row for row in body["top_products"]}


def add_orphan_line(db, sale_id, *, name, sku, category, quantity, line_total):
    """A sale line whose product was hard-deleted before archiving existed."""

    db.add(
        SaleItem(
            sale_id=sale_id,
            product_id=None,
            product_name=name,
            sku=sku,
            category=category,
            unit_price=Decimal(line_total) / quantity,
            quantity=quantity,
            line_total=Decimal(line_total),
        )
    )
    db.commit()


# --------------------------------------------------------------------------


def test_rename_and_recategorize_do_not_split_a_product(pos, db_session):
    client, headers = pos
    product = add_product(db_session, name="Brake pad", stock=10)
    assert sell(client, headers, product.id, code="TXN-RPT-0001", quantity=2).status_code == 200

    product = reload(db_session, product.id)
    product.name = "Brake pad (front)"
    product.category = "Brake parts"
    db_session.commit()
    assert sell(client, headers, product.id, code="TXN-RPT-0002", quantity=1).status_code == 200

    body = report(client, headers, limit=10)

    [row] = body["top_products"]
    assert (row["product_id"], row["units_sold"]) == (product.id, 3)
    assert (row["name"], row["category"]) == ("Brake pad (front)", "Brake parts")

    # Category breakdown keeps each sale's original category.
    categories = {item["category"]: item["units_sold"] for item in body["categories"]}
    assert categories == {"Brakes": 2, "Brake parts": 1}

    # Historical sale lines were not rewritten.
    names = db_session.scalars(select(SaleItem.product_name).order_by(SaleItem.id)).all()
    assert names == ["Brake pad", "Brake pad (front)"]


def test_archived_and_deleted_products_keep_their_sales(pos, db_session):
    client, headers = pos
    archived = add_product(db_session, name="Old chain", stock=5, sku="CHN-001")
    active = add_product(db_session, name="Spark plug", stock=20, sku="SPK-001")

    assert sell(client, headers, archived.id, code="TXN-RPT-0010", quantity=4).status_code == 200
    assert sell(client, headers, active.id, code="TXN-RPT-0011", quantity=1).status_code == 200
    assert client.delete(f"/api/products/{archived.id}", headers=headers).json()["archived"]

    sale_id = db_session.scalar(select(Sale.id).order_by(Sale.id).limit(1))

    # Like the real OIL-001 lines: renamed before it was deleted, so the
    # saved names differ but the SKU is the same. The newest name wins.
    add_orphan_line(db_session, sale_id, name="Engine oil", sku="OIL-001",
                    category="Oil", quantity=1, line_total="250.00")
    add_orphan_line(db_session, sale_id, name="Synthetic Engine Oil", sku="OIL-001",
                    category="Oil", quantity=2, line_total="576.50")
    # No SKU at all: grouped by saved name.
    add_orphan_line(db_session, sale_id, name="Mystery part", sku=None,
                    category="Misc", quantity=1, line_total="10.00")

    rows = rows_by_name(report(client, headers, limit=10))

    assert set(rows) == {"Old chain", "Spark plug", "Synthetic Engine Oil", "Mystery part"}

    assert rows["Old chain"]["units_sold"] == 4
    assert (rows["Old chain"]["archived"], rows["Old chain"]["deleted"]) == (True, False)

    oil = rows["Synthetic Engine Oil"]
    assert (oil["product_id"], oil["sku"], oil["category"]) == (None, "OIL-001", "Oil")
    assert (oil["units_sold"], oil["revenue"]) == (3, 826.50)
    assert (oil["archived"], oil["deleted"]) == (False, True)

    assert rows["Mystery part"]["deleted"] is True


def test_how_much_sold_is_not_used(pos, db_session):
    client, headers = pos
    product = add_product(db_session, stock=10)
    assert sell(client, headers, product.id, code="TXN-RPT-0020", quantity=2).status_code == 200

    product = reload(db_session, product.id)
    product.how_much_sold = 999
    db_session.commit()

    [row] = report(client, headers)["top_products"]
    assert row["units_sold"] == 2


def test_view_all_filters_and_pagination(pos, db_session):
    client, headers = pos
    sold = []

    for index, quantity in enumerate((5, 3, 1)):
        product = add_product(
            db_session, name=f"Part {index}", stock=20, sku=f"PRT-00{index}"
        )
        sold.append(product.id)
        code = f"TXN-RPT-010{index}"
        assert sell(client, headers, product.id, code=code, quantity=quantity).status_code == 200

    unsold = add_product(db_session, name="Unsold part", stock=3, sku="UNS-001")
    archived_unsold = add_product(db_session, name="Archived unsold", stock=3, sku="ARC-001")
    archived_unsold = reload(db_session, archived_unsold.id)
    archived_unsold.archived_at = datetime.now(timezone.utc)
    db_session.commit()

    # Same endpoint and ranking as the Top Products card.
    top = report(client, headers, limit=5)
    assert [row["product_id"] for row in top["top_products"]] == sold
    assert top["total_products"] == 3

    everything = report(client, headers, limit=10, include_unsold=True)
    names = [row["name"] for row in everything["top_products"]]
    assert names == ["Part 0", "Part 1", "Part 2", "Unsold part"]

    page_two = report(client, headers, limit=2, offset=2, include_unsold=True)
    assert [row["name"] for row in page_two["top_products"]] == ["Part 2", "Unsold part"]
    assert page_two["total_products"] == 4

    zero = report(client, headers, limit=10, include_unsold=True, max_units=0)
    assert [row["product_id"] for row in zero["top_products"]] == [unsold.id]

    ranged = report(client, headers, limit=10, min_units=2, max_units=4)
    assert [row["name"] for row in ranged["top_products"]] == ["Part 1"]

    by_sku = report(client, headers, limit=10, search="prt-002")
    assert [row["name"] for row in by_sku["top_products"]] == ["Part 2"]

    by_category = report(client, headers, limit=10, category=["brakes", "Nope"])
    assert by_category["total_products"] == 3


def test_active_inventory_figures_exclude_archived(pos, client_factory, db_session):
    client, headers = pos
    low_active = add_product(db_session, name="Low active", stock=2, sku="LOW-001")
    low_archived = add_product(db_session, name="Low archived", stock=1, sku="LOW-002")
    assert sell(client, headers, low_archived.id, code="TXN-RPT-0030", quantity=1).status_code == 200
    assert client.delete(f"/api/products/{low_archived.id}", headers=headers).json()["archived"]

    assert reload(db_session, low_archived.id).stock == 0  # stock preserved as-is

    valuation = client.get("/api/inventory/valuation", headers=headers)
    assert valuation.status_code == 200, valuation.text
    assert [row["product_id"] for row in valuation.json()["products"]] == [low_active.id]

    admin, csrf = admin_client(client_factory, db_session)
    overview = admin.get(
        "/api/admin/overview/operations",
        headers={"Origin": ADMIN_ORIGIN, "X-CSRF-Token": csrf},
    )
    assert overview.status_code == 200, overview.text
    inventory = overview.json()["inventory_summary"]

    assert inventory["total_products"] == 1
    assert inventory["out_of_stock_count"] == 0
    assert inventory["low_stock_count"] == 1
    assert [row["id"] for row in inventory["low_stock_products"]] == [low_active.id]
