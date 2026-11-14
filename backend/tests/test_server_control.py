"""Server controls: restart/shutdown requests, maintenance mode, notifications, activity attribution."""

import json
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

import server_control_routes
from activity_models import ActivityEvent
from tests.conftest import ADMIN_ORIGIN, requires_database
from tests.helpers import bearer, pair_native
from tests.test_pos_auth import admin_client
from tests.test_product_archiving import add_product, pos, sell  # noqa: F401


pytestmark = requires_database


@pytest.fixture()
def control_dir(tmp_path, monkeypatch):
    directory = tmp_path / "control"
    directory.mkdir()
    monkeypatch.setattr(server_control_routes, "control_directory", lambda: directory)
    return directory


def admin_headers(csrf):
    return {"Origin": ADMIN_ORIGIN, "X-CSRF-Token": csrf}


def test_requires_an_administrator(client_factory):
    client = client_factory()

    for method, path in [
        ("get", "/api/admin/server/status"),
        ("post", "/api/admin/server/restart"),
        ("post", "/api/admin/server/shutdown"),
        ("get", "/api/admin/notifications"),
    ]:
        assert getattr(client, method)(path).status_code == 401, path


def test_restart_writes_a_request_for_the_helper_and_names_the_admin(client_factory, db_session, control_dir):
    admin, csrf = admin_client(client_factory, db_session)

    response = admin.post("/api/admin/server/restart", headers=admin_headers(csrf))
    assert response.status_code == 202, response.text
    body = response.json()
    assert (body["action"], body["state"]) == ("restart", "requested")

    request = json.loads((control_dir / "request.json").read_text())
    assert request["id"] == body["id"]
    assert request["command"] == "restart"  # what kinesisctl is asked to do
    assert request["requested_by"] == "admin"

    event = db_session.scalars(select(ActivityEvent).where(ActivityEvent.event_type == "server.restart_requested")).one()
    assert (event.actor_type, event.actor_name) == ("admin", "admin")

    status_body = admin.get("/api/admin/server/status").json()
    assert status_body["control"]["available"] is True
    assert status_body["control"]["pending"]["action"] == "restart"


def test_shutdown_asks_for_kinesisctl_stop_and_a_second_request_waits(client_factory, db_session, control_dir):
    admin, csrf = admin_client(client_factory, db_session)

    assert admin.post("/api/admin/server/shutdown", headers=admin_headers(csrf)).status_code == 202
    assert json.loads((control_dir / "request.json").read_text())["command"] == "stop"

    again = admin.post("/api/admin/server/restart", headers=admin_headers(csrf))
    assert again.status_code == 409


def test_an_old_request_does_not_block_a_new_one(client_factory, db_session, control_dir):
    admin, csrf = admin_client(client_factory, db_session)
    old = datetime.now(timezone.utc) - timedelta(seconds=server_control_routes.REQUEST_VALID_SECONDS + 5)
    (control_dir / "request.json").write_text(json.dumps({"id": "x", "action": "restart", "requested_at": old.isoformat()}))

    assert admin.post("/api/admin/server/restart", headers=admin_headers(csrf)).status_code == 202


def test_without_the_helper_the_request_is_refused_clearly(client_factory, db_session, tmp_path, monkeypatch):
    monkeypatch.setattr(server_control_routes, "control_directory", lambda: tmp_path / "missing")
    admin, csrf = admin_client(client_factory, db_session)

    assert admin.get("/api/admin/server/status").json()["control"]["available"] is False

    response = admin.post("/api/admin/server/shutdown", headers=admin_headers(csrf))
    assert response.status_code == 409
    assert "not set up" in response.json()["detail"]


def test_status_reports_the_last_result(client_factory, db_session, control_dir):
    admin, _ = admin_client(client_factory, db_session)
    (control_dir / "result.json").write_text(json.dumps({"id": "abc", "action": "restart", "state": "done"}))

    assert admin.get("/api/admin/server/status").json()["control"]["last"]["state"] == "done"


def test_maintenance_mode_locks_every_terminal_and_unlocks_them(client_factory, db_session):
    terminal = client_factory()
    token = pair_native(terminal, db_session)["session_token"]
    admin, csrf = admin_client(client_factory, db_session)

    beat = lambda: terminal.post(  # noqa: E731
        "/api/terminals/heartbeat",
        headers=bearer(token),
        json={"app_version": "1.0.0", "platform": "android", "acknowledged_commands": []},
    )

    assert beat().json()["maintenance_mode"] is False

    on = admin.put("/api/admin/server/maintenance", headers=admin_headers(csrf), json={"enabled": True})
    assert on.status_code == 200, on.text
    assert on.json()["maintenance"] == {
        "enabled": True,
        "changed_at": on.json()["maintenance"]["changed_at"],
        "changed_by": "admin",
    }

    assert beat().json()["maintenance_mode"] is True
    session = terminal.get("/api/terminals/session", headers=bearer(token))
    assert session.json()["maintenance_mode"] is True

    admin.put("/api/admin/server/maintenance", headers=admin_headers(csrf), json={"enabled": False})
    assert beat().json()["maintenance_mode"] is False

    types = db_session.scalars(
        select(ActivityEvent.event_type).where(ActivityEvent.event_type.like("server.maintenance%")).order_by(ActivityEvent.id)
    ).all()
    assert types == ["server.maintenance_enabled", "server.maintenance_disabled"]


def test_maintenance_blocks_sales_but_not_the_admin_console(pos, client_factory, db_session):
    client, headers = pos
    product = add_product(db_session, stock=5)
    admin, csrf = admin_client(client_factory, db_session)

    assert sell(client, headers, product.id, code="TXN-MNT-0001").status_code == 200

    admin.put("/api/admin/server/maintenance", headers=admin_headers(csrf), json={"enabled": True})

    blocked = sell(client, headers, product.id, code="TXN-MNT-0002")
    assert blocked.status_code == 423

    assert admin.get("/api/admin/overview/operations").status_code == 200

    admin.put("/api/admin/server/maintenance", headers=admin_headers(csrf), json={"enabled": False})
    assert sell(client, headers, product.id, code="TXN-MNT-0002").status_code == 200


def test_overview_shows_terminals_in_maintenance_and_who_did_what(pos, client_factory, db_session):
    client, headers = pos
    product = add_product(db_session, stock=5)
    admin, csrf = admin_client(client_factory, db_session)

    assert sell(client, headers, product.id, code="TXN-MNT-0010").status_code == 200
    admin.put("/api/admin/server/maintenance", headers=admin_headers(csrf), json={"enabled": True})

    overview = admin.get("/api/admin/overview/operations").json()
    assert overview["terminal_summary"]["maintenance"] == 1
    assert overview["terminals"][0]["status"] == "maintenance"

    by_type = {event["event_type"]: event for event in overview["activity"]}
    assert by_type["sale.completed"]["actor_type"] == "cashier"
    assert by_type["sale.completed"]["actor_name"]
    assert by_type["sale.completed"]["terminal_id"] is not None
    assert by_type["server.maintenance_enabled"]["actor_type"] == "admin"
    assert by_type["server.maintenance_enabled"]["actor_name"] == "admin"


def test_admin_changes_are_attributed_to_the_admin(client_factory, db_session):
    admin, csrf = admin_client(client_factory, db_session)

    created = admin.post(
        "/api/admin/services",
        headers=admin_headers(csrf),
        json={"name": "Oil change", "description": "", "price": "250.00", "estimated_cost": None},
    )
    assert created.status_code == 201, created.text

    events = db_session.scalars(select(ActivityEvent).where(ActivityEvent.event_type.like("service.%"))).all()
    assert events, "service creation should be recorded"
    assert {(event.actor_type, event.actor_name) for event in events} == {("admin", "admin")}


def test_notifications_list_what_needs_attention(client_factory, db_session):
    admin, csrf = admin_client(client_factory, db_session)
    add_product(db_session, name="Empty", stock=0, sku="EMP-001")
    add_product(db_session, name="Few", stock=2, sku="FEW-001")

    admin.put("/api/admin/server/maintenance", headers=admin_headers(csrf), json={"enabled": True})

    body = admin.get("/api/admin/notifications").json()
    titles = {item["title"] for item in body["items"]}

    assert "Maintenance mode is on" in titles
    assert "1 product out of stock" in titles
    assert "1 product running low" in titles
    assert {item["severity"] for item in body["items"]} <= {"critical", "warning", "info"}
    # Most urgent first.
    assert body["items"][0]["severity"] == "critical"

    ids = [item["id"] for item in body["items"]]
    assert len(ids) == len(set(ids))
