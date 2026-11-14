"""Backup CLI, retention, and a real dump -> wipe -> restore round trip."""

import json
import os
import time
from decimal import Decimal

import pytest
from sqlalchemy import func, select, text

import backup_cli
import database_routes
from models import Product, Sale
from tests.conftest import ADMIN_ORIGIN, requires_database
from tests.test_pos_auth import admin_client
from tests.test_product_archiving import add_product, pos, sell  # noqa: F401


pytestmark = requires_database


@pytest.fixture()
def backups(tmp_path, monkeypatch):
    """Point backups at a throwaway folder: never the real backup directory."""

    directory = tmp_path / "backups"
    monkeypatch.setattr(database_routes.admin_settings, "backup_directory", str(directory))
    assert database_routes.backup_directory() == directory.resolve()
    return directory


def make_old_backup(directory, stamp, age_days):
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"kinesis_backup_{stamp}_aaaaaaaaaaaa.dump"
    path.write_bytes(b"PGDMP")
    old = time.time() - age_days * 86400
    os.utime(path, (old, old))
    return path


def test_retention_always_keeps_the_newest_backups(backups, monkeypatch):
    monkeypatch.setattr(database_routes.admin_settings, "backup_keep_minimum", 2)
    monkeypatch.setattr(database_routes.admin_settings, "backup_retention_days", 30)

    files = [make_old_backup(backups, f"2026010{n}T000000Z", 100 + n) for n in range(1, 6)]
    # An old non-backup file in the same folder is never touched.
    other = backups / "notes.txt"
    other.write_text("keep")

    database_routes.cleanup_expired_backups()

    survivors = {p.name for p in backups.iterdir()}
    assert files[0].name in survivors and files[1].name in survivors  # newest two
    assert not any(f.exists() for f in files[2:])
    assert "notes.txt" in survivors


def test_recent_backups_beyond_the_minimum_are_kept(backups, monkeypatch):
    monkeypatch.setattr(database_routes.admin_settings, "backup_keep_minimum", 1)
    recent = [make_old_backup(backups, f"2026010{n}T000000Z", n) for n in range(1, 4)]

    database_routes.cleanup_expired_backups()

    assert all(f.exists() for f in recent)


def test_backup_cli_creates_verifies_and_copies(pos, backups, tmp_path, db_session):
    client, headers = pos
    product = add_product(db_session, stock=5)
    assert sell(client, headers, product.id).status_code == 200
    db_session.rollback()

    copy_to = tmp_path / "usb"
    status = backup_cli.run_backup(copy_to)

    assert status["ok"] is True and status["dump_entries"] > 10
    assert (backups / status["dump"]).stat().st_mode & 0o077 == 0
    assert (copy_to / status["dump"]).stat().st_size == (backups / status["dump"]).stat().st_size
    assert json.loads((backups / "last-backup.json").read_text())["ok"] is True
    assert backup_cli.main(["verify", str(backups / status["dump"])]) == 0


def test_backup_cli_rejects_a_corrupt_dump(backups, tmp_path, capsys):
    bad = tmp_path / "bad.dump"
    bad.write_bytes(b"PGDMP-not-really")

    assert backup_cli.main(["verify", str(bad)]) == 1
    assert "cannot be read" in capsys.readouterr().err


def test_restore_round_trip_recovers_wiped_data(pos, backups, client_factory, db_session):
    client, headers = pos
    product = add_product(db_session, stock=5)
    assert sell(client, headers, product.id, quantity=2).status_code == 200
    db_session.rollback()

    status = backup_cli.run_backup()
    dump = backups / status["dump"]

    # Disaster: the sales are wiped and stock is wrong.
    db_session.execute(text("DELETE FROM sale_items"))
    db_session.execute(text("DELETE FROM sales"))
    db_session.get(Product, product.id).stock = 999
    db_session.commit()
    assert db_session.scalar(select(func.count(Sale.id))) == 0
    db_session.rollback()  # release locks so pg_restore can drop tables

    admin, csrf = admin_client(client_factory, db_session)
    db_session.rollback()

    response = admin.post(
        "/api/admin/database/restore",
        headers={"Origin": ADMIN_ORIGIN, "X-CSRF-Token": csrf},
        data={"database_name_confirmation": database_routes.database_settings.database_name},
        files={"backup_file": (dump.name.replace("backup", "restored"), dump.read_bytes(), "application/octet-stream")},
    )

    # Restore replaces the admin tables too, so only check the restore result
    # and then the data itself.
    assert response.status_code == 200, response.text
    assert response.json()["pre_restore_backup"]["purpose"] == "pre_restore"

    db_session.expire_all()
    restored = db_session.get(Product, product.id)
    assert restored.stock == 3
    assert db_session.scalar(select(func.count(Sale.id))) == 1
    assert db_session.scalar(select(Sale.total)) == Decimal("700.00")


def test_restore_rejects_wrong_database_name(client_factory, db_session, backups):
    admin, csrf = admin_client(client_factory, db_session)

    response = admin.post(
        "/api/admin/database/restore",
        headers={"Origin": ADMIN_ORIGIN, "X-CSRF-Token": csrf},
        data={"database_name_confirmation": "kinesis"},
        files={"backup_file": ("x.dump", b"PGDMP", "application/octet-stream")},
    )

    assert response.status_code == 400
