from datetime import timedelta

import pytest
from sqlalchemy import select

from activity_models import ActivityEvent
from auth.config import auth_settings
from tests.conftest import ADMIN_ORIGIN, POS_ORIGIN, requires_database
from tests.helpers import (
    bearer,
    create_cashier,
    create_pairing_token,
    load_terminal,
    pair_browser,
    pair_native,
    registration,
    utc_now,
)


pytestmark = requires_database

TERMINAL_COOKIE = auth_settings.terminal_cookie_name
CASHIER_COOKIE = auth_settings.cashier_cookie_name


def set_cookie_headers(response) -> list[str]:
    return response.headers.get_list("set-cookie")


# --------------------------------------------------
# Pairing
# --------------------------------------------------


def test_native_pairing_returns_token_and_sets_no_cookie(client_factory, db_session):
    client = client_factory()

    body = pair_native(client, db_session)

    assert len(body["session_token"]) >= 43
    assert "csrf_token" not in body
    assert TERMINAL_COOKIE not in client.cookies


def test_browser_pairing_uses_httponly_cookie(client_factory, db_session):
    client = client_factory()

    response = pair_browser(client, db_session, POS_ORIGIN)

    assert response.status_code == 201, response.text
    body = response.json()

    assert "session_token" not in body
    assert body["csrf_token"]

    cookie = next(
        value for value in set_cookie_headers(response)
        if value.startswith(f"{TERMINAL_COOKIE}=")
    )
    lowered = cookie.lower()

    assert "httponly" in lowered
    assert "samesite=strict" in lowered
    assert "path=/" in lowered
    assert "domain=" not in lowered


@pytest.mark.parametrize("origin", [None, "https://evil.example", ADMIN_ORIGIN])
def test_browser_pairing_requires_pos_origin(client_factory, db_session, origin):
    client = client_factory()
    headers = {"X-Kinesis-Client": "web"}

    if origin:
        headers["Origin"] = origin

    response = client.post(
        "/api/terminals/pair",
        headers=headers,
        json={
            "pairing_token": create_pairing_token(db_session),
            "registration": registration(),
        },
    )

    assert response.status_code == 403


def test_pairing_token_is_single_use(client_factory, db_session):
    client = client_factory()
    token = create_pairing_token(db_session)

    first = client.post(
        "/api/terminals/pair",
        json={"pairing_token": token, "registration": registration("KNS-a-0000001")},
    )
    second = client.post(
        "/api/terminals/pair",
        json={"pairing_token": token, "registration": registration("KNS-b-0000002")},
    )

    assert first.status_code == 201
    assert second.status_code == 410


# --------------------------------------------------
# Browser cookie authentication and CSRF
# --------------------------------------------------


def test_cookie_session_endpoint_returns_csrf(client_factory, db_session):
    client = client_factory()
    pairing = pair_browser(client, db_session, POS_ORIGIN).json()

    response = client.get("/api/terminals/session")

    assert response.status_code == 200
    assert response.json()["csrf_token"] == pairing["csrf_token"]
    assert response.headers["cache-control"].startswith("no-store")


def test_bearer_session_endpoint_returns_no_csrf(client_factory, db_session):
    client = client_factory()
    token = pair_native(client, db_session)["session_token"]

    response = client.get("/api/terminals/session", headers=bearer(token))

    assert response.status_code == 200
    assert response.json()["csrf_token"] is None


def test_cookie_post_requires_csrf_and_origin(client_factory, db_session):
    client = client_factory()
    csrf = pair_browser(client, db_session, POS_ORIGIN).json()["csrf_token"]

    no_csrf = client.post(
        "/api/terminals/heartbeat",
        headers={"Origin": POS_ORIGIN},
        json={},
    )
    wrong_origin = client.post(
        "/api/terminals/heartbeat",
        headers={"Origin": "https://evil.example", "X-CSRF-Token": csrf},
        json={},
    )
    no_origin = client.post(
        "/api/terminals/heartbeat",
        headers={"X-CSRF-Token": csrf},
        json={},
    )
    wrong_csrf = client.post(
        "/api/terminals/heartbeat",
        headers={"Origin": POS_ORIGIN, "X-CSRF-Token": "0" * 64},
        json={},
    )
    ok = client.post(
        "/api/terminals/heartbeat",
        headers={"Origin": POS_ORIGIN, "X-CSRF-Token": csrf},
        json={},
    )

    assert no_csrf.status_code == 403
    assert wrong_origin.status_code == 403
    assert no_origin.status_code == 403
    assert wrong_csrf.status_code == 403
    assert ok.status_code == 200


def test_cookie_and_bearer_together_are_rejected(client_factory, db_session):
    client = client_factory()
    pair_browser(client, db_session, POS_ORIGIN)
    other = pair_native(client_factory(), db_session, "KNS-native-000009")

    response = client.get(
        "/api/terminals/session",
        headers=bearer(other["session_token"]),
    )

    assert response.status_code == 401


# --------------------------------------------------
# Rotation, reuse detection, idle expiry
# --------------------------------------------------


def make_rotation_due(db, terminal_id: int) -> None:
    terminal = load_terminal(db, terminal_id)
    terminal.token_rotated_at = utc_now() - timedelta(
        days=auth_settings.terminal_token_rotation_days + 1,
    )
    db.commit()


def test_native_rotation_and_reuse_detection(client_factory, db_session):
    client = client_factory()
    pairing = pair_native(client, db_session)
    old_token = pairing["session_token"]
    terminal_id = pairing["terminal_id"]

    not_due = client.post("/api/terminals/heartbeat", headers=bearer(old_token), json={})
    assert "session_token" not in not_due.json()

    make_rotation_due(db_session, terminal_id)

    offered = client.post("/api/terminals/heartbeat", headers=bearer(old_token), json={})
    new_token = offered.json()["session_token"]
    assert new_token != old_token

    # Until the device uses the new token, the old one stays current.
    assert client.get("/api/terminals/session", headers=bearer(old_token)).status_code == 200

    # First use of the new token promotes it.
    assert client.get("/api/terminals/session", headers=bearer(new_token)).status_code == 200

    # The replaced token works during the grace period only.
    assert client.get("/api/terminals/session", headers=bearer(old_token)).status_code == 200

    terminal = load_terminal(db_session, terminal_id)
    terminal.previous_token_valid_until = utc_now() - timedelta(seconds=1)
    db_session.commit()

    reused = client.get("/api/terminals/session", headers=bearer(old_token))
    assert reused.status_code == 401

    # Reuse revokes everything, including the legitimate new token.
    assert client.get("/api/terminals/session", headers=bearer(new_token)).status_code == 401

    terminal = load_terminal(db_session, terminal_id)
    assert terminal.session_token_hash is None
    assert terminal.is_enabled is False

    events = db_session.scalars(
        select(ActivityEvent).where(ActivityEvent.event_type == "terminal.credential_reuse")
    ).all()
    assert len(events) == 1


def test_browser_rotation_sets_new_cookie(client_factory, db_session):
    client = client_factory()
    pairing = pair_browser(client, db_session, POS_ORIGIN).json()
    make_rotation_due(db_session, pairing["terminal_id"])

    old_cookie = client.cookies.get(TERMINAL_COOKIE)

    response = client.post(
        "/api/terminals/heartbeat",
        headers={"Origin": POS_ORIGIN, "X-CSRF-Token": pairing["csrf_token"]},
        json={},
    )

    assert response.status_code == 200
    assert "session_token" not in response.json()
    assert client.cookies.get(TERMINAL_COOKIE) != old_cookie

    # CSRF tokens survive rotation.
    after = client.get("/api/terminals/session")
    assert after.json()["csrf_token"] == pairing["csrf_token"]


def test_idle_credential_expires(client_factory, db_session):
    client = client_factory()
    pairing = pair_native(client, db_session)

    terminal = load_terminal(db_session, pairing["terminal_id"])
    terminal.last_seen_at = utc_now() - timedelta(
        days=auth_settings.terminal_credential_idle_days + 1,
    )
    db_session.commit()

    response = client.get("/api/terminals/session", headers=bearer(pairing["session_token"]))

    assert response.status_code == 401
    assert load_terminal(db_session, pairing["terminal_id"]).session_token_hash is None


# --------------------------------------------------
# Admin disconnect revokes; re-pairing restores
# --------------------------------------------------


def admin_client(client_factory, db_session):
    from admin_models import AdminUser
    from auth.password import hash_password

    db_session.add(
        AdminUser(
            username="admin",
            password_hash=hash_password("correct horse battery staple"),
            is_active=True,
        )
    )
    db_session.commit()

    client = client_factory()
    response = client.post(
        "/api/auth/login",
        headers={"Origin": ADMIN_ORIGIN},
        json={"username": "admin", "password": "correct horse battery staple"},
    )
    assert response.status_code == 200, response.text

    return client, response.json()["csrf_token"]


def test_disconnect_revokes_and_repair_restores(client_factory, db_session):
    terminal_client = client_factory()
    pairing = pair_native(terminal_client, db_session)
    token = pairing["session_token"]

    admin, csrf = admin_client(client_factory, db_session)

    disconnected = admin.post(
        f"/api/admin/terminals/{pairing['terminal_id']}/disconnect",
        headers={"Origin": ADMIN_ORIGIN, "X-CSRF-Token": csrf},
    )
    assert disconnected.status_code == 200, disconnected.text

    enabled = admin.post(
        f"/api/admin/terminals/{pairing['terminal_id']}/enable",
        headers={"Origin": ADMIN_ORIGIN, "X-CSRF-Token": csrf},
    )
    assert enabled.json()["requires_pairing"] is True

    # Re-enabling does not bring the old credential back.
    assert terminal_client.get(
        "/api/terminals/session", headers=bearer(token)
    ).status_code == 401

    repaired = pair_native(terminal_client, db_session)
    assert repaired["terminal_id"] == pairing["terminal_id"]
    assert terminal_client.get(
        "/api/terminals/session", headers=bearer(repaired["session_token"])
    ).status_code == 200


def test_active_device_cannot_be_paired_twice(client_factory, db_session):
    client = client_factory()
    pair_native(client, db_session)

    response = client.post(
        "/api/terminals/pair",
        json={
            "pairing_token": create_pairing_token(db_session),
            "registration": registration(),
        },
    )

    assert response.status_code == 409


def test_terminal_credential_takes_precedence_over_admin_cookie(client_factory, db_session):
    admin, _csrf = admin_client(client_factory, db_session)
    token = pair_native(client_factory(), db_session)["session_token"]

    # A stale admin cookie alongside a valid terminal credential.
    admin.cookies.set(auth_settings.admin_cookie_name, "stale-session")

    response = admin.get("/api/products", headers=bearer(token))

    assert response.status_code == 200


# --------------------------------------------------
# Cashiers
# --------------------------------------------------


def cashier_login_native(client, token, username="cashier1", pin="123456"):
    response = client.post(
        "/api/cashier-auth/login",
        headers=bearer(token),
        json={"username": username, "pin": pin},
    )
    assert response.status_code == 200, response.text
    return response.json()["session_token"]


PRODUCT = {"name": "Brake pad", "category": "Brakes", "price": "350.00", "stock": 5}


def test_catalog_writes_require_cashier(client_factory, db_session):
    client = client_factory()
    token = pair_native(client, db_session)["session_token"]
    cashier = create_cashier(db_session)

    without_cashier = client.post("/api/products", headers=bearer(token), json=PRODUCT)
    assert without_cashier.status_code == 401

    cashier_token = cashier_login_native(client, token)

    with_cashier = client.post(
        "/api/products",
        headers={**bearer(token), "X-Cashier-Session": cashier_token},
        json=PRODUCT,
    )
    assert with_cashier.status_code in (200, 201), with_cashier.text

    event = db_session.scalars(
        select(ActivityEvent).where(ActivityEvent.event_type == "inventory.product_created")
    ).one()

    assert event.actor_type == "cashier"
    assert event.cashier_id == str(cashier.id)


def test_verify_pin_rotates_cashier_session(client_factory, db_session):
    client = client_factory()
    token = pair_native(client, db_session)["session_token"]
    create_cashier(db_session)
    old_cashier_token = cashier_login_native(client, token)

    verified = client.post(
        "/api/cashier-auth/verify-pin",
        headers={**bearer(token), "X-Cashier-Session": old_cashier_token},
        json={"pin": "123456"},
    )
    assert verified.status_code == 200, verified.text
    new_cashier_token = verified.json()["session_token"]
    assert new_cashier_token != old_cashier_token

    old = client.get(
        "/api/cashier-auth/session",
        headers={**bearer(token), "X-Cashier-Session": old_cashier_token},
    )
    new = client.get(
        "/api/cashier-auth/session",
        headers={**bearer(token), "X-Cashier-Session": new_cashier_token},
    )

    assert old.status_code == 401
    assert new.status_code == 200


def test_browser_cashier_session_uses_cookie(client_factory, db_session):
    client = client_factory()
    csrf = pair_browser(client, db_session, POS_ORIGIN).json()["csrf_token"]
    create_cashier(db_session)
    unsafe = {"Origin": POS_ORIGIN, "X-CSRF-Token": csrf}

    login = client.post(
        "/api/cashier-auth/login",
        headers=unsafe,
        json={"username": "cashier1", "pin": "123456"},
    )
    assert login.status_code == 200, login.text
    assert "session_token" not in login.json()
    assert client.cookies.get(CASHIER_COOKIE)

    assert client.get("/api/cashier-auth/session").status_code == 200

    # A script-supplied header must not replace the cookie credential.
    assert client.get(
        "/api/cashier-auth/session",
        headers={"X-Cashier-Session": "attacker-chosen"},
    ).status_code == 401

    logout = client.post("/api/cashier-auth/logout", headers=unsafe)
    assert logout.status_code == 200
    assert any(
        value.startswith(f"{CASHIER_COOKIE}=") and "max-age=0" in value.lower()
        for value in set_cookie_headers(logout)
    )

    # Server-side revocation, not just cookie removal.
    assert client.get("/api/cashier-auth/session").status_code == 401


# --------------------------------------------------
# WebSocket
# --------------------------------------------------


def test_websocket_cookie_requires_pos_origin(client_factory, db_session):
    from starlette.websockets import WebSocketDisconnect

    client = client_factory()
    pair_browser(client, db_session, POS_ORIGIN)

    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(
            "/api/terminals/ws",
            headers={"Origin": "https://evil.example"},
        ) as socket:
            socket.receive_json()

    with client.websocket_connect(
        "/api/terminals/ws",
        headers={"Origin": POS_ORIGIN},
    ) as socket:
        assert socket.receive_json()["type"] == "authenticated"


def test_websocket_native_message_auth(client_factory, db_session):
    client = client_factory()
    token = pair_native(client, db_session)["session_token"]

    with client.websocket_connect("/api/terminals/ws") as socket:
        socket.send_json({"type": "authenticate", "session_token": token})
        assert socket.receive_json()["type"] == "authenticated"
