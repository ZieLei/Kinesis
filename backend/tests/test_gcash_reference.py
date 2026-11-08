"""GCash reference numbers: normalization, format validation and duplicates."""

from decimal import Decimal

import pytest
from sqlalchemy import func, select

from models import Product, Sale
from tests.conftest import requires_database
from tests.helpers import bearer, create_cashier, pair_native
from tests.test_pos_auth import cashier_login_native


pytestmark = requires_database

CANONICAL = "1234567890123"


@pytest.fixture()
def pos(client_factory, db_session):
    client = client_factory()
    token = pair_native(client, db_session)["session_token"]
    create_cashier(db_session)
    headers = {
        **bearer(token),
        "X-Cashier-Session": cashier_login_native(client, token),
    }

    return client, headers


@pytest.fixture()
def product(db_session) -> Product:
    product = Product(
        name="Chain kit",
        category="Drivetrain",
        price=Decimal("1200.00"),
        stock=10,
        sku="CHN-001",
        how_much_sold=0,
    )
    db_session.add(product)
    db_session.commit()
    db_session.refresh(product)
    return product


def pay_gcash(client, headers, product_id, reference, code="TXN-GCASH-0001"):
    return client.post(
        "/api/sales",
        headers=headers,
        json={
            "transaction_code": code,
            "payment_method": "gcash",
            "items": [{"product_id": product_id, "quantity": 1}],
            "reference_number": reference,
        },
    )


def sale_count(db) -> int:
    db.expire_all()
    return db.scalar(select(func.count(Sale.id)))


def stock_of(db, product_id) -> int:
    db.expire_all()
    return db.get(Product, product_id).stock


# --------------------------------------------------------------------------
# Valid references and formatting variations
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "reference",
    [
        CANONICAL,
        "1234 567 890123",  # GCash's own 4-3-6 display grouping
        "1234-567-890123",
        "  1234567890123  ",
        "1234\t567 890123",  # tab and non-breaking space
        "12 34 56 78 90 12 3",
    ],
)
def test_reference_is_stored_in_canonical_form(pos, product, db_session, reference):
    client, headers = pos

    response = pay_gcash(client, headers, product.id, reference)

    assert response.status_code == 200, response.text
    assert response.json()["reference_number"] == CANONICAL

    db_session.expire_all()
    stored = db_session.scalar(select(Sale.reference_number))
    assert stored == CANONICAL
    assert stock_of(db_session, product.id) == 9


# --------------------------------------------------------------------------
# Malformed references
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "reference",
    [
        "123456789012",  # 12 digits
        "12345678901234",  # 14 digits
        "12345678901AB",  # letters
        "1234567890l23",  # OCR-style letter for a digit
        "１２３４５６７８９０１２３",  # full-width digits
        "1234.567.890123",  # unsupported separator
        "#1234567890123",
    ],
)
def test_malformed_reference_is_rejected(pos, product, db_session, reference):
    client, headers = pos

    response = pay_gcash(client, headers, product.id, reference)

    assert response.status_code == 422, response.text
    assert "exactly 13 digits" in response.text
    assert sale_count(db_session) == 0
    assert stock_of(db_session, product.id) == 10


@pytest.mark.parametrize("reference", ["", "   ", " - - ", None])
def test_missing_reference_is_rejected(pos, product, db_session, reference):
    client, headers = pos

    response = pay_gcash(client, headers, product.id, reference)

    assert response.status_code == 422, response.text
    assert "require a reference number" in response.text
    assert sale_count(db_session) == 0


def test_cash_sale_still_rejects_a_reference(pos, product, db_session):
    client, headers = pos

    response = client.post(
        "/api/sales",
        headers=headers,
        json={
            "transaction_code": "TXN-CASH-0001",
            "payment_method": "cash",
            "items": [{"product_id": product.id, "quantity": 1}],
            "amount_tendered": "2000.00",
            "reference_number": CANONICAL,
        },
    )

    assert response.status_code == 422, response.text
    assert sale_count(db_session) == 0


# --------------------------------------------------------------------------
# Duplicates
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "second_reference",
    [CANONICAL, "1234 567 890123", "1234-567-890123"],
)
def test_duplicate_reference_in_any_format_is_rejected(
    pos, product, db_session, second_reference
):
    client, headers = pos

    first = pay_gcash(client, headers, product.id, CANONICAL, code="TXN-GCASH-0001")
    assert first.status_code == 200, first.text

    second = pay_gcash(
        client, headers, product.id, second_reference, code="TXN-GCASH-0002"
    )

    assert second.status_code == 409, second.text
    assert "already been recorded" in second.text
    assert sale_count(db_session) == 1
    assert stock_of(db_session, product.id) == 9


def test_duplicate_of_legacy_formatted_reference_is_rejected(
    pos, product, db_session
):
    """Sales saved before normalization keep their original text."""

    client, headers = pos

    legacy = Sale(
        transaction_code="LEGACY-0001",
        payment_method="gcash",
        reference_number="1234 567-890123",
        status="completed",
        gross_subtotal=Decimal("100.00"),
        subtotal=Decimal("100.00"),
        total=Decimal("100.00"),
        amount_tendered=Decimal("100.00"),
        change_due=Decimal("0.00"),
    )
    db_session.add(legacy)
    db_session.commit()

    response = pay_gcash(client, headers, product.id, CANONICAL)

    assert response.status_code == 409, response.text
    assert sale_count(db_session) == 1

    # The legacy row is not rewritten.
    db_session.expire_all()
    assert (
        db_session.scalar(
            select(Sale.reference_number).where(
                Sale.transaction_code == "LEGACY-0001"
            )
        )
        == "1234 567-890123"
    )


def test_retry_with_reformatted_reference_replays_the_sale(pos, product, db_session):
    """Same transaction code, same payment: idempotent replay, not a 409."""

    client, headers = pos

    first = pay_gcash(client, headers, product.id, CANONICAL)
    assert first.status_code == 200, first.text

    retry = pay_gcash(client, headers, product.id, "1234 567 890123")

    assert retry.status_code == 200, retry.text
    assert retry.json()["id"] == first.json()["id"]
    assert sale_count(db_session) == 1
    assert stock_of(db_session, product.id) == 9


def test_different_reference_on_same_transaction_code_conflicts(
    pos, product, db_session
):
    client, headers = pos

    first = pay_gcash(client, headers, product.id, CANONICAL)
    assert first.status_code == 200, first.text

    retry = pay_gcash(client, headers, product.id, "9999999999999")

    assert retry.status_code == 409, retry.text
    assert sale_count(db_session) == 1
