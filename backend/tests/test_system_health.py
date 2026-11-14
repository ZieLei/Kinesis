"""Administrator health checks: database, migrations, backups, disk."""

import json
from datetime import datetime, timedelta, timezone

import pytest

import backup_cli
import database_routes
import system_health
from tests.conftest import requires_database
from tests.test_pos_auth import admin_client


pytestmark = requires_database


@pytest.fixture()
def backups(tmp_path, monkeypatch):
    directory = tmp_path / "backups"
    directory.mkdir()
    monkeypatch.setattr(database_routes.admin_settings, "backup_directory", str(directory))
    return directory


def write_status(directory, **fields):
    (directory / "last-backup.json").write_text(json.dumps(fields))


def hours_ago(hours):
    return (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()


def test_no_backup_ever_is_critical(backups):
    assert system_health.backup_check()["status"] == "critical"


def test_fresh_backup_with_copy_is_ok(backups):
    write_status(backups, ok=True, finished_at=hours_ago(2), copied_to=["/mnt/usb/x.dump"])
    assert system_health.backup_check()["status"] == "ok"


def test_fresh_backup_without_offsite_copy_warns(backups):
    write_status(backups, ok=True, finished_at=hours_ago(2), copied_to=[])
    assert system_health.backup_check()["status"] == "warning"


@pytest.mark.parametrize("age, expected", [(40, "warning"), (100, "critical")])
def test_stale_backups(backups, age, expected):
    write_status(backups, ok=True, finished_at=hours_ago(age), copied_to=["x"])
    assert system_health.backup_check()["status"] == expected


def test_failed_backup_is_critical_and_shows_the_error(backups):
    write_status(backups, ok=False, finished_at=hours_ago(1), error="disk full")
    result = system_health.backup_check()
    assert result["status"] == "critical" and "disk full" in result["detail"]


def test_unreadable_status_file_warns(backups):
    (backups / "last-backup.json").write_text("{not json")
    assert system_health.backup_check()["status"] == "warning"


def test_endpoint_reports_overall_worst_status(client_factory, db_session, backups):
    admin, _csrf = admin_client(client_factory, db_session)

    body = admin.get("/api/admin/health").json()
    by_id = {item["id"]: item for item in body["checks"]}

    assert by_id["database"]["status"] == "ok"
    assert by_id["migrations"]["status"] == "ok", by_id["migrations"]
    assert by_id["backup"]["status"] == "critical"
    assert body["overall"] == "critical"


def test_endpoint_requires_admin(client_factory):
    assert client_factory().get("/api/admin/health").status_code in (401, 403)


def test_a_real_backup_makes_the_backup_check_pass(backups, tmp_path, db_session):
    db_session.rollback()
    backup_cli.run_backup(tmp_path / "usb")

    assert system_health.backup_check()["status"] == "ok"
