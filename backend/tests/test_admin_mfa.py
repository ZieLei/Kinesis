"""Administrator two-factor authentication (TOTP + recovery codes)."""

import base64
import time

import pytest
from sqlalchemy import select

from admin_models import AdminRecoveryCode, AdminUser
from auth import totp
from tests.conftest import ADMIN_ORIGIN, requires_database
from tests.test_pos_auth import admin_client


pytestmark = requires_database

PASSWORD = "correct horse battery staple"


def step_now():
    return int(time.time() // totp.STEP_SECONDS)


def code_at(secret, step):
    return totp._code_for_step(secret, step)


def login(client, **extra):
    return client.post(
        "/api/auth/login",
        headers={"Origin": ADMIN_ORIGIN},
        json={"username": "admin", "password": PASSWORD, **extra},
    )


@pytest.fixture()
def enrolled(client_factory, db_session):
    """An admin with MFA enabled; returns (secret, recovery_codes, csrf)."""

    client, csrf = admin_client(client_factory, db_session)
    headers = {"Origin": ADMIN_ORIGIN, "X-CSRF-Token": csrf}

    setup = client.post("/api/auth/mfa/setup", headers=headers)
    assert setup.status_code == 200, setup.text
    secret = setup.json()["secret"]
    assert setup.json()["otpauth_uri"].startswith("otpauth://totp/Kinesis:admin")

    enable = client.post(
        "/api/auth/mfa/enable",
        headers=headers,
        json={"code": code_at(secret, step_now() - 1)},
    )
    assert enable.status_code == 200, enable.text

    return secret, enable.json()["recovery_codes"], client, headers


def test_rfc_6238_test_vector():
    secret = base64.b32encode(b"12345678901234567890").decode()
    assert totp.verify_code(secret, "287082", now=59) == 1
    assert totp.verify_code(secret, "287082", now=59, last_used_step=1) is None
    assert totp.verify_code(secret, "000000", now=59) is None
    assert totp.verify_code(secret, "28708", now=59) is None


def test_secret_is_encrypted_and_tamper_evident(enrolled, db_session):
    secret, *_ = enrolled
    stored = db_session.scalars(select(AdminUser)).one().totp_secret_enc

    assert secret not in stored
    assert totp.decrypt_secret(stored) == secret

    flipped = stored[:-4] + ("AAAA" if not stored.endswith("AAAA") else "BBBB")
    with pytest.raises(ValueError):
        totp.decrypt_secret(flipped)


def test_login_requires_the_second_factor(enrolled, client_factory):
    secret, _codes, _client, _headers = enrolled
    fresh = client_factory()

    needs_code = login(fresh)
    wrong = login(fresh, otp="000000")
    right = login(fresh, otp=code_at(secret, step_now()))
    replay = login(fresh, otp=code_at(secret, step_now()))

    assert needs_code.status_code == 428
    assert wrong.status_code == 401
    assert right.status_code == 200 and right.json()["authenticated"] is True
    assert replay.status_code == 401  # same step cannot be used twice


def test_wrong_password_never_reveals_mfa(enrolled, client_factory):
    response = client_factory().post(
        "/api/auth/login",
        headers={"Origin": ADMIN_ORIGIN},
        json={"username": "admin", "password": "wrong password here"},
    )

    assert response.status_code == 401


def test_recovery_code_works_once(enrolled, client_factory, db_session):
    _secret, codes, _client, _headers = enrolled
    fresh = client_factory()

    first = login(fresh, otp=codes[0].lower())
    again = login(client_factory(), otp=codes[0])

    assert first.status_code == 200
    assert again.status_code == 401
    unused = db_session.scalars(
        select(AdminRecoveryCode).where(AdminRecoveryCode.used_at.is_(None))
    ).all()
    assert len(unused) == totp.RECOVERY_CODE_COUNT - 1


def test_repeated_wrong_codes_lock_the_account(enrolled, client_factory):
    fresh = client_factory()

    statuses = [login(fresh, otp="000000").status_code for _ in range(9)]

    assert statuses[:7] == [401] * 7
    assert 429 in statuses


def test_enable_rejects_a_bad_code_and_disable_needs_everything(client_factory, db_session):
    client, csrf = admin_client(client_factory, db_session)
    headers = {"Origin": ADMIN_ORIGIN, "X-CSRF-Token": csrf}

    secret = client.post("/api/auth/mfa/setup", headers=headers).json()["secret"]
    bad = client.post("/api/auth/mfa/enable", headers=headers, json={"code": "123456"})
    assert bad.status_code == 400
    assert client.get("/api/auth/mfa").json()["enabled"] is False
    # Setup alone does not force a second factor at login.
    assert login(client_factory()).status_code == 200

    ok = client.post(
        "/api/auth/mfa/enable", headers=headers, json={"code": code_at(secret, step_now())}
    )
    assert ok.status_code == 200
    assert client.get("/api/auth/mfa").json() == {
        "enabled": True,
        "recovery_codes_remaining": totp.RECOVERY_CODE_COUNT,
    }

    wrong_password = client.post(
        "/api/auth/mfa/disable",
        headers=headers,
        json={"password": "nope nope nope nope", "code": code_at(secret, step_now() + 1)},
    )
    assert wrong_password.status_code == 403

    disabled = client.post(
        "/api/auth/mfa/disable",
        headers=headers,
        json={"password": PASSWORD, "code": code_at(secret, step_now() + 1)},
    )
    assert disabled.status_code == 200
    assert login(client_factory()).status_code == 200


def test_mfa_endpoints_need_a_session_and_csrf(client_factory, db_session):
    client, _csrf = admin_client(client_factory, db_session)

    no_csrf = client.post("/api/auth/mfa/setup", headers={"Origin": ADMIN_ORIGIN})
    anonymous = client_factory().post(
        "/api/auth/mfa/setup", headers={"Origin": ADMIN_ORIGIN}
    )

    assert no_csrf.status_code == 403
    assert anonymous.status_code == 401


@pytest.mark.parametrize("pin", ["000000", "111111", "123456", "654321", "456789", "121121"])
def test_trivial_cashier_pins_are_rejected(pin):
    from pydantic import SecretStr

    from cashier_routes import validate_new_pin as validate_pin

    with pytest.raises(ValueError):
        validate_pin(SecretStr(pin))


@pytest.mark.parametrize("pin", ["482916", "907315", "135790"])
def test_ordinary_cashier_pins_are_accepted(pin):
    from pydantic import SecretStr

    from cashier_routes import validate_new_pin as validate_pin

    assert validate_pin(SecretStr(pin)).get_secret_value() == pin


def test_weak_pin_policy_does_not_block_existing_cashiers_from_signing_in():
    from pydantic import SecretStr

    from cashier_routes import CashierLoginRequest, validate_pin

    assert validate_pin(SecretStr("123456")).get_secret_value() == "123456"
    assert CashierLoginRequest(username="cashier1", pin="123456").pin.get_secret_value() == "123456"
