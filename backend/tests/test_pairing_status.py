"""A pairing QR/code works for exactly one device, and the admin can see it was used."""

import pytest

from tests.conftest import ADMIN_ORIGIN, requires_database
from tests.helpers import registration
from tests.test_pos_auth import admin_client


pytestmark = requires_database


def test_challenge_pairs_one_device_then_reports_paired(client_factory, db_session):
    admin, csrf = admin_client(client_factory, db_session)
    headers = {"Origin": ADMIN_ORIGIN, "X-CSRF-Token": csrf}

    created = admin.post("/api/admin/terminals/pairing-challenges", headers=headers).json()
    challenge_id = created["id"]
    token = created["pairing_payload"].rsplit(":", 1)[1]
    status_url = f"/api/admin/terminals/pairing-challenges/{challenge_id}"

    assert admin.get(status_url).json()["status"] == "pending"

    first = client_factory().post(
        "/api/terminals/pair",
        json={"pairing_token": token, "registration": registration("KNS-first-device-0001")},
    )
    second = client_factory().post(
        "/api/terminals/pair",
        json={"pairing_token": token, "registration": registration("KNS-second-device-002")},
    )

    assert first.status_code == 201
    assert second.status_code == 410  # the same code cannot pair another device
    assert admin.get(status_url).json()["status"] == "paired"


def test_status_endpoint_requires_admin(client_factory):
    assert client_factory().get("/api/admin/terminals/pairing-challenges/1").status_code in (401, 403)
