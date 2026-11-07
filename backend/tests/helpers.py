from datetime import datetime, timedelta, timezone

from auth.password import hash_password
from auth.security import generate_secret, hash_secret
from cashier_models import Cashier
from models import Terminal, TerminalPairingChallenge


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def create_pairing_token(db) -> str:
    raw_token = generate_secret()
    now = utc_now()

    db.add(
        TerminalPairingChallenge(
            token_hash=hash_secret(raw_token),
            created_at=now,
            expires_at=now + timedelta(minutes=5),
        )
    )
    db.commit()

    return raw_token


def registration(device_id: str = "KNS-test-device-0001") -> dict:
    return {
        "device_id": device_id,
        "name": "Test terminal",
        "device_type": "Test POS",
        "platform": "test",
        "app_version": "1.0.0",
    }


def pair_native(client, db, device_id: str = "KNS-test-device-0001") -> dict:
    response = client.post(
        "/api/terminals/pair",
        json={
            "pairing_token": create_pairing_token(db),
            "registration": registration(device_id),
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def pair_browser(
    client,
    db,
    origin: str,
    device_id: str = "KNS-web-device-0001",
):
    response = client.post(
        "/api/terminals/pair",
        headers={"X-Kinesis-Client": "web", "Origin": origin},
        json={
            "pairing_token": create_pairing_token(db),
            "registration": registration(device_id),
        },
    )
    return response


def create_cashier(db, username: str = "cashier1", pin: str = "123456") -> Cashier:
    cashier = Cashier(
        username=username,
        display_name="Test Cashier",
        pin_hash=hash_password(pin),
        is_active=True,
    )
    db.add(cashier)
    db.commit()
    db.refresh(cashier)
    return cashier


def bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def load_terminal(db, terminal_id: int) -> Terminal:
    db.expire_all()
    return db.get(Terminal, terminal_id)
