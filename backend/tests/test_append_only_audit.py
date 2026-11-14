"""Audit tables reject UPDATE and DELETE at the database level."""

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError

from activity_models import ActivityEvent
from cashier_models import Cashier
from models import SaleReversal, StockAdjustment
from tests.conftest import requires_database
from tests.test_sale_reversal import pos, reverse  # noqa: F401
from tests.test_product_archiving import add_product, sell


pytestmark = requires_database


def make_history(client, headers, db_session):
    product = add_product(db_session, stock=5)
    sell(client, headers, product.id)
    assert reverse(client, headers, "TXN-ARCH-0001").status_code == 200
    db_session.expire_all()
    return product


@pytest.mark.parametrize(
    "statement",
    [
        "UPDATE activity_events SET summary = 'tampered'",
        "DELETE FROM activity_events",
        "UPDATE stock_adjustments SET quantity_change = quantity_change",
        "DELETE FROM stock_adjustments",
        "UPDATE sale_reversals SET reason_code = 'other', note = 'x'",
        "UPDATE sale_reversals SET amount = 0",
        "DELETE FROM sale_reversals",
    ],
)
def test_history_cannot_be_rewritten(pos, db_session, statement):
    client, headers = pos
    make_history(client, headers, db_session)

    with pytest.raises(DBAPIError, match="append-only"):
        db_session.execute(text(statement))
        db_session.commit()

    db_session.rollback()
    assert db_session.scalars(select(ActivityEvent)).all()
    assert db_session.scalars(select(StockAdjustment)).all()
    assert db_session.scalars(select(SaleReversal)).one().amount == 350.0


def test_deleting_an_account_still_clears_references_but_keeps_names(pos, db_session):
    client, headers = pos
    make_history(client, headers, db_session)

    boss = db_session.scalars(select(Cashier).where(Cashier.username == "boss")).one()
    db_session.delete(boss)
    db_session.commit()

    reversal = db_session.scalars(select(SaleReversal)).one()
    assert reversal.authorized_by is None
    assert reversal.authorized_by_username == "boss"
