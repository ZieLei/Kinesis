"""Service management: permissions, duplicates, archive/restore/delete, audit."""

from concurrent.futures import ThreadPoolExecutor

import pytest
from sqlalchemy import select

from activity_models import ActivityEvent
from models import SaleServiceItem, Service
from tests.conftest import ADMIN_ORIGIN, requires_database
from tests.helpers import bearer, pair_native
from tests.test_pos_auth import admin_client, cashier_login_native
from tests.test_sale_reversal import pos  # noqa: F401  (cashier1 + supervisor "boss")


pytestmark = requires_database

NEW = {"name": "Chain Cleaning", "description": "Degrease and lube", "price": "120.00", "estimated_cost": "20.00"}


@pytest.fixture()
def supervisor_headers(pos, db_session):
    # A second terminal: signing a cashier in on a terminal ends the session
    # of whoever was signed in there.
    client, _ = pos
    token = pair_native(client, db_session, device_id="KNS-test-device-0002")["session_token"]
    session = cashier_login_native(client, token, username="boss", pin="654321")
    return {**bearer(token), "X-Cashier-Session": session}


@pytest.fixture()
def admin(client_factory, db_session):
    client, csrf = admin_client(client_factory, db_session)
    return client, {"Origin": ADMIN_ORIGIN, "X-CSRF-Token": csrf}


def events(db, event_type):
    db.expire_all()
    return db.scalars(select(ActivityEvent).where(ActivityEvent.event_type == event_type)).all()


def make(client, headers, **overrides):
    return client.post("/api/services", headers=headers, json={**NEW, **overrides})


def test_create_validates_and_audits(pos, db_session):
    client, headers = pos

    created = make(client, headers)
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["archived"] is False and body["price"] == 120.0

    assert make(client, headers, name="   ").status_code == 422
    assert make(client, headers, price="-1").status_code == 422
    assert make(client, headers, price="99999999").status_code == 422
    assert make(client, headers, name="x" * 81).status_code == 422
    assert make(client, headers, estimated_cost="-5", name="Other").status_code == 422

    assert [e.actor_name for e in events(db_session, "service.created")] == ["Test Cashier"]


def test_duplicate_names_are_rejected_ignoring_case_and_spaces(pos):
    client, headers = pos
    assert make(client, headers).status_code == 201

    clash = make(client, headers, name="  chain    CLEANING ")

    assert clash.status_code == 409 and "already exists" in clash.json()["detail"]


def test_only_a_supervisor_can_edit_or_archive_in_the_pos(pos, supervisor_headers):
    client, cashier = pos
    sid = make(client, cashier).json()["id"]

    assert client.put(f"/api/services/{sid}", headers=cashier, json={"price": "150.00"}).status_code == 403
    assert client.post(f"/api/services/{sid}/archive", headers=cashier).status_code == 403

    edited = client.put(f"/api/services/{sid}", headers=supervisor_headers, json={"price": "150.00", "name": "Chain Cleaning Deluxe"})
    assert edited.status_code == 200 and edited.json()["price"] == 150.0


def test_price_change_is_audited_and_does_not_touch_past_sales(pos, supervisor_headers, db_session):
    client, cashier = pos
    sid = make(client, cashier).json()["id"]

    sale = client.post(
        "/api/sales",
        headers=cashier,
        json={"transaction_code": "SVC-TEST-0001", "payment_method": "cash", "services": [{"service_id": sid, "quantity": 1}], "amount_tendered": "500.00"},
    )
    assert sale.status_code == 200, sale.text

    client.put(f"/api/services/{sid}", headers=supervisor_headers, json={"price": "180.00"})

    line = db_session.scalars(select(SaleServiceItem)).one()
    assert float(line.unit_price) == 120.0
    updated = events(db_session, "service.updated")
    assert updated and updated[0].severity == "warning"
    assert updated[0].details["changes"]["price"] == {"from": "120.00", "to": "180.00"}
    assert updated[0].actor_name == "Boss"


def test_unchanged_edit_records_nothing_and_empty_edit_is_rejected(pos, supervisor_headers, db_session):
    client, cashier = pos
    sid = make(client, cashier).json()["id"]

    same = client.put(f"/api/services/{sid}", headers=supervisor_headers, json={"price": "120.00"})
    empty = client.put(f"/api/services/{sid}", headers=supervisor_headers, json={})

    assert same.status_code == 200
    assert empty.status_code == 400
    assert events(db_session, "service.updated") == []


def test_archived_services_leave_the_pos_cannot_be_sold_or_edited(pos, supervisor_headers):
    client, cashier = pos
    sid = make(client, cashier).json()["id"]

    assert client.post(f"/api/services/{sid}/archive", headers=supervisor_headers).status_code == 200
    again = client.post(f"/api/services/{sid}/archive", headers=supervisor_headers)
    listing = client.get("/api/services", headers=cashier).json()
    sale = client.post(
        "/api/sales",
        headers=cashier,
        json={"transaction_code": "SVC-TEST-0002", "payment_method": "cash", "services": [{"service_id": sid, "quantity": 1}], "amount_tendered": "500.00"},
    )
    edit = client.put(f"/api/services/{sid}", headers=supervisor_headers, json={"price": "99.00"})

    assert again.status_code == 200 and "already archived" in again.json()["message"]
    assert listing["count"] == 0
    assert sale.status_code == 409 and "archived" in sale.json()["detail"]
    assert edit.status_code == 409


def test_a_name_can_be_reused_after_archiving_but_restore_then_conflicts(pos, supervisor_headers, admin):
    client, cashier = pos
    adm, adm_headers = admin
    first = make(client, cashier).json()["id"]
    client.post(f"/api/services/{first}/archive", headers=supervisor_headers)

    second = make(client, cashier)
    restore = adm.post(f"/api/admin/services/{first}/restore", headers=adm_headers)

    assert second.status_code == 201
    assert restore.status_code == 409


def test_admin_restore_and_delete_rules(pos, supervisor_headers, admin, db_session):
    client, cashier = pos
    adm, h = admin
    sold = make(client, cashier, name="Sold Service").json()["id"]
    unsold = make(client, cashier, name="Never Sold").json()["id"]
    client.post("/api/sales", headers=cashier, json={"transaction_code": "SVC-TEST-0003", "payment_method": "cash", "services": [{"service_id": sold, "quantity": 2}], "amount_tendered": "1000.00"})

    refuse = adm.delete(f"/api/admin/services/{sold}", headers=h)
    allow = adm.delete(f"/api/admin/services/{unsold}", headers=h)
    adm.post(f"/api/admin/services/{sold}/archive", headers=h)
    restored = adm.post(f"/api/admin/services/{sold}/restore", headers=h)

    assert refuse.status_code == 409 and "Archive it instead" in refuse.json()["detail"]
    assert allow.status_code == 200
    assert restored.status_code == 200 and restored.json()["service"]["archived"] is False
    assert db_session.get(Service, unsold) is None
    assert [e.actor_name for e in events(db_session, "service.deleted")] == ["admin"]
    assert len(events(db_session, "service.restored")) == 1


def test_admin_list_has_stats_filters_sorting_and_counts(pos, supervisor_headers, admin):
    client, cashier = pos
    adm, h = admin
    a = make(client, cashier, name="Alpha Service", price="100.00").json()["id"]
    b = make(client, cashier, name="Bravo Service", price="300.00").json()["id"]
    client.post("/api/sales", headers=cashier, json={"transaction_code": "SVC-TEST-0004", "payment_method": "cash", "services": [{"service_id": b, "quantity": 3}], "amount_tendered": "2000.00"})
    client.post(f"/api/services/{a}/archive", headers=supervisor_headers)

    active = adm.get("/api/admin/services").json()
    archived = adm.get("/api/admin/services", params={"state": "archived"}).json()
    everything = adm.get("/api/admin/services", params={"state": "all", "sort": "revenue", "direction": "desc"}).json()
    found = adm.get("/api/admin/services", params={"search": "bravo", "state": "all"}).json()

    assert [i["name"] for i in active["items"]] == ["Bravo Service"]
    assert active["items"][0]["times_sold"] == 3 and active["items"][0]["revenue"] == 900.0
    assert active["items"][0]["can_delete"] is False and active["items"][0]["last_sold_at"]
    assert [i["name"] for i in archived["items"]] == ["Alpha Service"] and archived["items"][0]["can_delete"] is True
    assert [i["name"] for i in everything["items"]] == ["Bravo Service", "Alpha Service"]
    assert (active["active_count"], active["archived_count"]) == (1, 1)
    assert found["count"] == 1
    assert adm.get("/api/admin/services", params={"sort": "bogus"}).status_code == 422


def test_admin_endpoints_require_an_admin_session(pos, client_factory):
    client, cashier = pos

    assert client_factory().get("/api/admin/services").status_code in (401, 403)
    assert client.get("/api/admin/services", headers=cashier).status_code in (401, 403)
    assert client.delete("/api/admin/services/1", headers=cashier).status_code in (401, 403, 405)


def test_simultaneous_creates_of_one_name_make_exactly_one(pos):
    client, cashier = pos

    with ThreadPoolExecutor(max_workers=8) as pool:
        results = [f.result(timeout=30) for f in [pool.submit(lambda: make(client, cashier, name="Race Service")) for _ in range(8)]]

    assert sorted(r.status_code for r in results) == [201] + [409] * 7


def test_login_and_session_expose_the_supervisor_flag(pos, supervisor_headers):
    client, cashier = pos

    assert client.get("/api/cashier-auth/session", headers=cashier).json()["cashier"]["is_supervisor"] is False
    assert client.get("/api/cashier-auth/session", headers=supervisor_headers).json()["cashier"]["is_supervisor"] is True
