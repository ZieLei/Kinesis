"""
Operational health checks for the administrator console: is the database
reachable, are migrations current, did the last backup succeed and is it
recent, and is there disk space left for backups.
"""

import json
import logging
import shutil
from datetime import datetime, timezone
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from cashier_routes import require_admin_session
from database import get_db


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/health", tags=["Admin health"])

BACKUP_WARN_AFTER_HOURS = 36
BACKUP_CRITICAL_AFTER_HOURS = 72
DISK_WARN_FREE_PERCENT = 15
DISK_CRITICAL_FREE_PERCENT = 5

ALEMBIC_INI = Path(__file__).resolve().parent / "alembic.ini"


def check(check_id: str, label: str, status: str, detail: str) -> dict:
    return {"id": check_id, "label": label, "status": status, "detail": detail}


def database_check(db: Session) -> dict:
    try:
        db.execute(text("SELECT 1"))
    except Exception:  # noqa: BLE001
        logger.exception("Health check: database unreachable.")
        return check("database", "Database", "critical", "The database does not answer.")

    return check("database", "Database", "ok", "Reachable.")


def migration_check(db: Session) -> dict:
    try:
        head = ScriptDirectory.from_config(Config(str(ALEMBIC_INI))).get_current_head()
        current = db.execute(text("SELECT version_num FROM alembic_version")).scalar()
    except Exception:  # noqa: BLE001
        logger.exception("Health check: could not read the migration version.")
        return check("migrations", "Database version", "warning", "Could not be determined.")

    if current != head:
        return check(
            "migrations",
            "Database version",
            "critical",
            f"Database is at {current}, the software expects {head}. Run the migrations.",
        )

    return check("migrations", "Database version", "ok", "Up to date.")


def backup_check(now: datetime | None = None) -> dict:
    from database_routes import backup_directory

    now = now or datetime.now(timezone.utc)
    status_file = backup_directory() / "last-backup.json"

    if not status_file.is_file():
        return check(
            "backup",
            "Backups",
            "critical",
            "No scheduled backup has ever run. Enable the nightly backup timer.",
        )

    try:
        data = json.loads(status_file.read_text(encoding="utf-8"))
        finished = datetime.fromisoformat(data["finished_at"])
    except (OSError, ValueError, KeyError):
        return check("backup", "Backups", "warning", "The backup status file is unreadable.")

    age_hours = (now - finished).total_seconds() / 3600

    if not data.get("ok"):
        return check(
            "backup",
            "Backups",
            "critical",
            f"The last backup attempt failed: {data.get('error', 'unknown error')}",
        )

    detail = f"Last good backup {age_hours:.0f} hour(s) ago."

    if age_hours > BACKUP_CRITICAL_AFTER_HOURS:
        return check("backup", "Backups", "critical", detail + " That is too old.")

    if age_hours > BACKUP_WARN_AFTER_HOURS:
        return check("backup", "Backups", "warning", detail)

    if not data.get("copied_to"):
        return check(
            "backup",
            "Backups",
            "warning",
            detail + " No copy is kept on another device.",
        )

    return check("backup", "Backups", "ok", detail)


def disk_check() -> dict:
    from database_routes import backup_directory

    target = backup_directory()

    while not target.exists() and target != target.parent:
        target = target.parent

    usage = shutil.disk_usage(target)
    free_percent = usage.free / usage.total * 100
    detail = f"{free_percent:.0f}% free ({usage.free // 2**30} GiB)."

    if free_percent < DISK_CRITICAL_FREE_PERCENT:
        return check("disk", "Disk space", "critical", detail)

    if free_percent < DISK_WARN_FREE_PERCENT:
        return check("disk", "Disk space", "warning", detail)

    return check("disk", "Disk space", "ok", detail)


def collect(db: Session) -> dict:
    checks = [database_check(db), migration_check(db), backup_check(), disk_check()]
    order = {"ok": 0, "warning": 1, "critical": 2}
    overall = max((item["status"] for item in checks), key=order.__getitem__)

    return {
        "overall": overall,
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "checks": checks,
    }


@router.get("")
def get_system_health(
    _admin: object = Depends(require_admin_session),
    db: Session = Depends(get_db),
):
    return collect(db)
