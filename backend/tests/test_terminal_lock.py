"""The terminal lock is enforced by the server, so reloading the app cannot bypass it."""

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from activity_models import ActivityEvent
from cashier_models import CashierSession
from cashier_routes import TERMINAL_LOCKED_DETAIL
from models import AppSettings
from tests.conftest import requires_database
from tests.test_product_archiving import add_product, pos, sell  # noqa: F401


pytestmark = requires_database

PIN = "123456"


def session_row(db):
    db.expire_all()
    return db.scalars(select(CashierSession).where(CashierSession.revoked_at.is_(None))).one()


def age_activity(db, minutes):
    row = session_row(db)
    row.last_activity_at = datetime.now(timezone.utc) - timedelta(minutes=minutes)
    db.commit()


def get_session(client, headers):
    response = client.get("/api/cashier-auth/session", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def test_a_fresh_session_is_unlocked_and_reports_the_lock_period(pos):
    client, headers = pos
    body = get_session(client, headers)

    assert body["locked"] is False
    assert body["lock_after_minutes"] == 5


def test_locking_blocks_every_cashier_request_until_the_pin_is_verified(pos, db_session):
    client, headers = pos
    product = add_product(db_session, stock=10)

    assert sell(client, headers, product.id, code="TXN-LCK-0001").status_code == 200

    assert client.post("/api/cashier-auth/lock", headers=headers).json() == {"locked": True}

    # What a page reload does: ask the server. It says locked.
    assert get_session(client, headers)["locked"] is True

    blocked = sell(client, headers, product.id, code="TXN-LCK-0002")
    assert blocked.status_code == 423
    assert blocked.json()["detail"] == TERMINAL_LOCKED_DETAIL

    # A wrong PIN does not unlock.
    wrong = client.post("/api/cashier-auth/verify-pin", headers=headers, json={"pin": "000000"})
    assert wrong.status_code == 401
    assert get_session(client, headers)["locked"] is True

    right = client.post("/api/cashier-auth/verify-pin", headers=headers, json={"pin": PIN})
    assert right.status_code == 200, right.text
    unlocked = {**headers, "X-Cashier-Session": right.json()["session_token"]}

    assert get_session(client, unlocked)["locked"] is False
    assert sell(client, unlocked, product.id, code="TXN-LCK-0002").status_code == 200

    # The locked session's token no longer works at all.
    assert client.get("/api/cashier-auth/session", headers=headers).status_code == 401

    types = db_session.scalars(
        select(ActivityEvent.event_type).where(ActivityEvent.event_type.like("cashier.terminal_%")).order_by(ActivityEvent.id)
    ).all()
    assert types == ["cashier.terminal_locked", "cashier.terminal_unlocked"]


def test_inactivity_locks_the_terminal_even_if_the_app_never_said_so(pos, db_session):
    client, headers = pos
    product = add_product(db_session, stock=10)

    age_activity(db_session, minutes=4)
    assert get_session(client, headers)["locked"] is False

    age_activity(db_session, minutes=6)
    assert get_session(client, headers)["locked"] is True
    assert sell(client, headers, product.id, code="TXN-LCK-0010").status_code == 423


def test_activity_pings_keep_it_unlocked_but_cannot_unlock_it(pos, db_session):
    client, headers = pos

    age_activity(db_session, minutes=4)
    assert client.post("/api/cashier-auth/activity", headers=headers).json() == {"locked": False}
    assert (datetime.now(timezone.utc) - session_row(db_session).last_activity_at).total_seconds() < 30

    # Once the period has passed, a ping cannot rescue the session.
    age_activity(db_session, minutes=6)
    assert client.post("/api/cashier-auth/activity", headers=headers).json() == {"locked": True}
    assert get_session(client, headers)["locked"] is True


def test_older_apps_keep_a_session_active_with_the_session_ping(pos, db_session):
    client, headers = pos

    age_activity(db_session, minutes=4)
    assert get_session(client, headers)["locked"] is False
    assert (datetime.now(timezone.utc) - session_row(db_session).last_activity_at).total_seconds() < 30


def test_the_session_ping_never_unlocks_a_locked_terminal(pos, db_session):
    client, headers = pos

    age_activity(db_session, minutes=6)
    before = session_row(db_session).last_activity_at

    assert get_session(client, headers)["locked"] is True
    assert session_row(db_session).last_activity_at == before

    client.post("/api/cashier-auth/lock", headers=headers)
    assert get_session(client, headers)["locked"] is True


def test_a_disabled_lock_never_locks_by_inactivity_but_can_still_be_locked(pos, db_session):
    client, headers = pos
    row = db_session.get(AppSettings, 1)

    if row is None:
        row = AppSettings(id=1, settings={}, version=1)
        db_session.add(row)

    row.settings = {**(row.settings or {}), "inactivityLock": "disabled"}
    db_session.commit()

    age_activity(db_session, minutes=55)
    body = get_session(client, headers)
    assert (body["locked"], body["lock_after_minutes"]) == (False, None)

    client.post("/api/cashier-auth/lock", headers=headers)
    assert get_session(client, headers)["locked"] is True


def test_sign_out_still_works_while_locked(pos):
    client, headers = pos
    client.post("/api/cashier-auth/lock", headers=headers)

    assert client.post("/api/cashier-auth/logout", headers=headers).status_code == 200
    assert client.get("/api/cashier-auth/session", headers=headers).status_code == 401
