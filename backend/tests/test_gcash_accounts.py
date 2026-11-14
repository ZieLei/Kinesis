"""GCash number setting and account rotation."""

import pytest
from sqlalchemy import select

import gcash_routes
import settings_routes
from activity_models import ActivityEvent
from tests.conftest import ADMIN_ORIGIN, requires_database
from tests.helpers import bearer, pair_native
from tests.test_pos_auth import admin_client
from tests.test_product_archiving import add_product, pos, sell  # noqa: F401


pytestmark = requires_database

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


@pytest.fixture()
def qr_dir(tmp_path, monkeypatch):
    directory = tmp_path / "gcash"
    directory.mkdir()
    monkeypatch.setattr(settings_routes, "GCASH_QR_DIRECTORY", directory)
    monkeypatch.setattr(gcash_routes, "GCASH_QR_DIRECTORY", directory)
    return directory


def headers(csrf):
    return {"Origin": ADMIN_ORIGIN, "X-CSRF-Token": csrf}


def current(admin):
    return admin.get("/api/admin/settings").json()


def add(admin, csrf, version, number="0918 765 4321", name="Backup Owner", file=True):
    return admin.post(
        "/api/admin/settings/gcash/accounts",
        headers=headers(csrf),
        data={"expected_version": version, "number": number, "account_name": name},
        files={"file": ("qr.png", PNG, "image/png")} if file else None,
    )


def save_active(admin, csrf, **fields):
    body = current(admin)
    body["settings"].update(fields)
    return admin.put(
        "/api/admin/settings",
        headers=headers(csrf),
        json={"expected_version": body["version"], "settings": body["settings"]},
    )


def test_all_routes_need_an_administrator(client_factory):
    client = client_factory()

    assert client.get("/api/admin/settings/gcash/usage").status_code == 401
    assert client.post("/api/admin/settings/gcash/accounts", data={"expected_version": 1, "number": "09171234567"}).status_code == 401


def test_the_number_is_normalised_and_bad_numbers_are_refused(client_factory, db_session):
    admin, csrf = admin_client(client_factory, db_session)

    saved = save_active(admin, csrf, gcashNumber="+63 917-123-4567", gcashAccountName="Shop Owner")
    assert saved.status_code == 200, saved.text
    assert saved.json()["settings"]["gcashNumber"] == "09171234567"

    assert save_active(admin, csrf, gcashNumber="12345").status_code == 422
    assert save_active(admin, csrf, gcashNumber="").status_code == 200  # clearing is allowed


def test_terminals_get_the_active_account_but_never_the_backups(client_factory, db_session, qr_dir):
    terminal = client_factory()
    token = pair_native(terminal, db_session)["session_token"]
    admin, csrf = admin_client(client_factory, db_session)

    save_active(admin, csrf, gcashNumber="09171234567", gcashAccountName="Shop Owner")
    assert add(admin, csrf, current(admin)["version"]).status_code == 201

    body = terminal.get("/api/terminals/settings", headers=bearer(token)).json()["settings"]

    assert body["gcashNumber"] == "09171234567"
    assert body["gcashAccountName"] == "Shop Owner"
    assert "gcashBackupAccounts" not in body
    assert "gcashActiveSince" not in body


def test_add_validates_and_limits_backups(client_factory, db_session, qr_dir):
    admin, csrf = admin_client(client_factory, db_session)
    save_active(admin, csrf, gcashNumber="09171234567")

    assert add(admin, csrf, current(admin)["version"], number="nope").status_code == 422
    assert add(admin, csrf, current(admin)["version"], number="09171234567").status_code == 409  # the active number

    for index in range(5):
        response = add(admin, csrf, current(admin)["version"], number=f"09180000{index:03d}")
        assert response.status_code == 201, response.text

    assert add(admin, csrf, current(admin)["version"], number="09189999999").status_code == 409  # limit
    assert add(admin, csrf, current(admin)["version"], number="09180000000").status_code == 409  # duplicate


def test_rotating_swaps_the_accounts_and_keeps_the_old_one(client_factory, db_session, qr_dir):
    terminal = client_factory()
    token = pair_native(terminal, db_session)["session_token"]
    admin, csrf = admin_client(client_factory, db_session)

    save_active(admin, csrf, gcashNumber="09171234567", gcashAccountName="First Owner")
    admin.post(
        "/api/admin/settings/gcash-qr",
        headers=headers(csrf),
        data={"expected_version": current(admin)["version"]},
        files={"file": ("active.png", PNG, "image/png")},
    )
    first_qr = current(admin)["settings"]["gcashQrImagePath"]
    assert first_qr

    added = add(admin, csrf, current(admin)["version"], number="09189876543", name="Second Owner")
    backup = added.json()["settings"]["gcashBackupAccounts"][0]
    second_qr = backup["qrImagePath"]

    result = admin.post(
        f"/api/admin/settings/gcash/accounts/{backup['id']}/activate",
        headers=headers(csrf),
        json={"expected_version": added.json()["version"]},
    )
    assert result.status_code == 200, result.text
    settings = result.json()["settings"]

    assert (settings["gcashNumber"], settings["gcashAccountName"], settings["gcashQrImagePath"]) == (
        "09189876543", "Second Owner", second_qr,
    )
    assert settings["gcashActiveSince"]

    # The account that was active is kept, in the slot of the one chosen.
    [kept] = settings["gcashBackupAccounts"]
    assert (kept["number"], kept["accountName"], kept["qrImagePath"]) == ("09171234567", "First Owner", first_qr)
    assert kept["id"] != backup["id"]

    # Both images are still on disk and terminals see the new account.
    assert {path.name for path in qr_dir.iterdir()} == {first_qr, second_qr}
    seen = terminal.get("/api/terminals/settings", headers=bearer(token)).json()["settings"]
    assert (seen["gcashNumber"], seen["gcashQrImagePath"]) == ("09189876543", second_qr)

    event = db_session.scalars(select(ActivityEvent).where(ActivityEvent.event_type == "settings.gcash_account_switched")).one()
    assert (event.actor_type, event.actor_name) == ("admin", "admin")
    assert event.details["from"] == "0917•••4567" and event.details["to"] == "0918•••6543"

    # And back again.
    back = admin.post(
        f"/api/admin/settings/gcash/accounts/{kept['id']}/activate",
        headers=headers(csrf),
        json={"expected_version": result.json()["version"]},
    )
    assert back.json()["settings"]["gcashNumber"] == "09171234567"


def test_a_stale_version_is_refused(client_factory, db_session, qr_dir):
    admin, csrf = admin_client(client_factory, db_session)
    stale = current(admin)["version"]
    save_active(admin, csrf, gcashNumber="09171234567")

    assert add(admin, csrf, stale).status_code == 409


def test_editing_and_deleting_a_backup_manage_its_image(client_factory, db_session, qr_dir):
    admin, csrf = admin_client(client_factory, db_session)
    added = add(admin, csrf, current(admin)["version"])
    backup = added.json()["settings"]["gcashBackupAccounts"][0]
    first_image = backup["qrImagePath"]
    assert [path.name for path in qr_dir.iterdir()] == [first_image]

    preview = admin.get(f"/api/admin/settings/gcash/accounts/{backup['id']}/qr")
    assert preview.status_code == 200 and preview.headers["content-type"] == "image/png"

    edited = admin.put(
        f"/api/admin/settings/gcash/accounts/{backup['id']}",
        headers=headers(csrf),
        data={"expected_version": added.json()["version"], "number": "0919 111 2222", "account_name": "Renamed", "remove_qr": "true"},
    )
    assert edited.status_code == 200, edited.text
    updated = edited.json()["settings"]["gcashBackupAccounts"][0]
    assert (updated["number"], updated["accountName"], updated["qrImagePath"]) == ("09191112222", "Renamed", None)
    assert list(qr_dir.iterdir()) == [], "the replaced image is removed"

    deleted = admin.request(
        "DELETE",
        f"/api/admin/settings/gcash/accounts/{backup['id']}",
        headers=headers(csrf),
        json={"expected_version": edited.json()["version"]},
    )
    assert deleted.status_code == 200 and deleted.json()["settings"]["gcashBackupAccounts"] == []


def test_usage_counts_gcash_sales_since_the_switch(pos, client_factory, db_session, qr_dir):
    client, auth = pos
    product = add_product(db_session, stock=10)
    admin, csrf = admin_client(client_factory, db_session)

    gcash_sale = client.post(
        "/api/sales",
        headers=auth,
        json={
            "transaction_code": "TXN-GC-0001",
            "payment_method": "gcash",
            "reference_number": "1234567890123",
            "items": [{"product_id": product.id, "quantity": 2}],
        },
    )
    assert gcash_sale.status_code == 200, gcash_sale.text
    assert sell(client, auth, product.id, code="TXN-GC-0002", quantity=1).status_code == 200  # cash

    usage = admin.get("/api/admin/settings/gcash/usage").json()
    assert usage["since_active"] is None
    assert usage["last_7_days"]["count"] == 1
    assert usage["last_7_days"]["total"] > 0

    added = add(admin, csrf, current(admin)["version"])
    backup = added.json()["settings"]["gcashBackupAccounts"][0]
    admin.post(
        f"/api/admin/settings/gcash/accounts/{backup['id']}/activate",
        headers=headers(csrf),
        json={"expected_version": added.json()["version"]},
    )

    after = admin.get("/api/admin/settings/gcash/usage").json()
    assert after["since_active"] == {"count": 0, "total": 0.0}
    assert after["last_7_days"]["count"] == 1
