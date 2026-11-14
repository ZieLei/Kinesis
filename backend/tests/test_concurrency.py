"""Simultaneous requests from several tills against the real database."""

from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal

import pytest
from sqlalchemy import func, select

from models import Product, Sale, StockAdjustment
from tests.conftest import requires_database
from tests.test_product_archiving import add_product
from tests.test_sale_reversal import pos, reverse  # noqa: F401


pytestmark = requires_database

WORKERS = 12


def post_sale(client, headers, code, items, **extra):
    body = {
        "transaction_code": code,
        "payment_method": "cash",
        "items": [{"product_id": pid, "quantity": qty} for pid, qty in items],
        "amount_tendered": "100000.00",
        **extra,
    }
    return client.post("/api/sales", headers=headers, json=body)


def run_parallel(jobs):
    with ThreadPoolExecutor(max_workers=len(jobs)) as pool:
        futures = [pool.submit(job) for job in jobs]
        return [future.result(timeout=60) for future in futures]


def test_last_unit_is_sold_exactly_once(pos, db_session):
    client, headers = pos
    product = add_product(db_session, stock=1)

    results = run_parallel(
        [
            (lambda n=n: post_sale(client, headers, f"TXN-LAST-{n:04d}", [(product.id, 1)]))
            for n in range(WORKERS)
        ]
    )

    codes = sorted(r.status_code for r in results)
    assert codes == [200] + [409] * (WORKERS - 1), codes
    db_session.expire_all()
    assert db_session.get(Product, product.id).stock == 0
    assert db_session.scalar(select(func.count(Sale.id))) == 1


def test_stock_never_goes_negative_under_mixed_quantities(pos, db_session):
    client, headers = pos
    product = add_product(db_session, stock=10)

    results = run_parallel(
        [
            (lambda n=n: post_sale(client, headers, f"TXN-MIX-{n:04d}", [(product.id, 3)]))
            for n in range(WORKERS)
        ]
    )

    sold = sum(1 for r in results if r.status_code == 200)
    assert sold == 3  # 10 // 3
    assert {r.status_code for r in results} <= {200, 409}
    db_session.expire_all()
    assert db_session.get(Product, product.id).stock == 10 - 3 * sold


def test_opposite_lock_order_does_not_deadlock(pos, db_session):
    client, headers = pos
    first = add_product(db_session, name="Alpha", stock=50, sku="ALP-1")
    second = add_product(db_session, name="Beta", stock=50, sku="BET-1")

    jobs = []
    for n in range(WORKERS):
        pair = [(first.id, 1), (second.id, 1)]
        if n % 2:
            pair.reverse()
        jobs.append(lambda n=n, pair=pair: post_sale(client, headers, f"TXN-LOCK-{n:04d}", pair))

    results = run_parallel(jobs)

    assert [r.status_code for r in results] == [200] * WORKERS
    db_session.expire_all()
    assert db_session.get(Product, first.id).stock == 50 - WORKERS
    assert db_session.get(Product, second.id).stock == 50 - WORKERS


def test_same_transaction_code_creates_one_sale(pos, db_session):
    client, headers = pos
    product = add_product(db_session, stock=10)

    results = run_parallel(
        [
            (lambda: post_sale(client, headers, "TXN-SAME-0001", [(product.id, 2)]))
            for _ in range(WORKERS)
        ]
    )

    assert [r.status_code for r in results] == [200] * WORKERS
    assert len({r.json()["id"] for r in results}) == 1
    db_session.expire_all()
    assert db_session.scalar(select(func.count(Sale.id))) == 1
    assert db_session.get(Product, product.id).stock == 8


def test_same_gcash_reference_is_accepted_once(pos, db_session):
    client, headers = pos
    product = add_product(db_session, stock=20)

    def gcash(n):
        return client.post(
            "/api/sales",
            headers=headers,
            json={
                "transaction_code": f"TXN-GC-{n:04d}",
                "payment_method": "gcash",
                "reference_number": "1234567890123",
                "items": [{"product_id": product.id, "quantity": 1}],
            },
        )

    results = run_parallel([(lambda n=n: gcash(n)) for n in range(WORKERS)])

    assert sorted(r.status_code for r in results) == [200] + [409] * (WORKERS - 1)
    db_session.expire_all()
    assert db_session.scalar(select(func.count(Sale.id))) == 1
    assert db_session.get(Product, product.id).stock == 19


def test_simultaneous_voids_restock_once(pos, db_session):
    client, headers = pos
    product = add_product(db_session, stock=5)
    assert post_sale(client, headers, "TXN-VOID-0001", [(product.id, 2)]).status_code == 200

    results = run_parallel(
        [(lambda: reverse(client, headers, "TXN-VOID-0001")) for _ in range(6)]
    )

    assert all(r.status_code == 200 for r in results)
    db_session.expire_all()
    assert db_session.get(Product, product.id).stock == 5
    assert db_session.scalar(select(func.count(StockAdjustment.id))) == 1
    assert db_session.scalar(select(Sale.status)) == "voided"
