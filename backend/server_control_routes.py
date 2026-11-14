"""
Server controls for the administrator console: restart, shut down, maintenance
mode and the notification feed.

Restart and shut down cannot be done by the backend itself: it runs inside a
systemd sandbox that cannot reach the service manager (and a restart would
kill it mid-request). Instead the backend writes a small request file into
<data dir>/control/. A separate, unsandboxed unit (kinesis-control.path /
kinesis-control.service, running deploy/control/kinesis_control.py) validates
the request and runs `kinesisctl restart` or `kinesisctl stop`, then writes
result.json. The backend can only ask for the two allowed actions; it never
runs a command.
"""

import json
import logging
import os
import secrets
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from activity_tracking import _record
from auth.dependencies import require_admin_session
from config_paths import data_root
from database import get_db
from models import Product, Terminal
from overview_routes import TERMINAL_OFFLINE_AFTER_SECONDS, _low_stock_threshold
from server_state import get_server_state, set_global_maintenance
from system_health import collect as collect_system_health


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["Admin server"])

STARTED_AT = datetime.now(timezone.utc)

# A request older than this is never carried out (the helper applies the same
# limit), so a request left behind cannot fire hours later.
REQUEST_VALID_SECONDS = 120

# Admin action -> kinesisctl command. Nothing else can be requested.
ACTION_COMMANDS = {"restart": "restart", "shutdown": "stop"}


def control_directory() -> Path:
    return data_root() / "control"


def control_available() -> bool:
    """True once the control helper has been installed for this host."""

    return control_directory().is_dir()


def read_json(path: Path) -> dict | None:
    try:
        with path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
    except (OSError, ValueError):
        return None

    return data if isinstance(data, dict) else None


def pending_request() -> dict | None:
    request = read_json(control_directory() / "request.json")

    if request is None:
        return None

    try:
        requested_at = datetime.fromisoformat(str(request.get("requested_at")))
    except ValueError:
        return None

    if datetime.now(timezone.utc) - requested_at > timedelta(seconds=REQUEST_VALID_SECONDS):
        return None

    return request


def last_result() -> dict | None:
    return read_json(control_directory() / "result.json")


def maintenance_payload(db: Session) -> dict:
    state = get_server_state(db)

    return {
        "enabled": bool(state and state.maintenance_enabled),
        "changed_at": (
            state.maintenance_changed_at.isoformat()
            if state and state.maintenance_changed_at
            else None
        ),
        "changed_by": state.maintenance_changed_by if state else None,
    }


def status_payload(db: Session) -> dict:
    now = datetime.now(timezone.utc)
    request = pending_request()
    result = last_result()

    return {
        "maintenance": maintenance_payload(db),
        "control": {
            "available": control_available(),
            "pending": (
                {"id": request.get("id"), "action": request.get("action"), "requested_at": request.get("requested_at")}
                if request
                else None
            ),
            "last": result,
        },
        "server": {
            "started_at": STARTED_AT.isoformat(),
            "uptime_seconds": int((now - STARTED_AT).total_seconds()),
        },
    }


@router.get("/server/status", summary="Server state: maintenance, control and uptime")
def get_server_status(
    _admin: object = Depends(require_admin_session),
    db: Session = Depends(get_db),
):
    return status_payload(db)


class MaintenanceUpdate(BaseModel):
    enabled: bool


@router.put("/server/maintenance", summary="Turn server-wide maintenance mode on or off")
def put_maintenance(
    update: MaintenanceUpdate,
    admin: object = Depends(require_admin_session),
    db: Session = Depends(get_db),
):
    username = getattr(admin, "username", None)
    previous = maintenance_payload(db)["enabled"]

    state = set_global_maintenance(db, update.enabled, username)

    if previous != update.enabled:
        _record(
            db,
            "server.maintenance_enabled" if update.enabled else "server.maintenance_disabled",
            (
                "Maintenance mode turned on for all terminals"
                if update.enabled
                else "Maintenance mode turned off"
            ),
            severity="warning" if update.enabled else "info",
        )

    db.commit()
    db.refresh(state)

    return status_payload(db)


class ServerActionResponse(BaseModel):
    id: str
    action: str
    state: str


def request_server_action(action: Literal["restart", "shutdown"], admin: object, db: Session) -> dict:
    if not control_available():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Server control is not set up on this host. Run "
                "install-kinesis.sh again to enable it, or use "
                "`kinesisctl restart` / `kinesisctl stop` on the server."
            ),
        )

    if pending_request() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A server action is already waiting to run.",
        )

    username = getattr(admin, "username", None)
    request = {
        "id": secrets.token_hex(8),
        "action": action,
        "command": ACTION_COMMANDS[action],
        "requested_by": username,
        "requested_at": datetime.now(timezone.utc).isoformat(),
    }

    directory = control_directory()

    # Write the whole file, then rename it into place: the helper (which is
    # triggered by the file appearing) never sees a half-written request.
    handle, temporary = tempfile.mkstemp(dir=directory, prefix=".request-", suffix=".tmp")

    try:
        with os.fdopen(handle, "w", encoding="utf-8") as stream:
            json.dump(request, stream)

        os.replace(temporary, directory / "request.json")
    except OSError as error:
        logger.exception("Could not write the server control request.")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The server control request could not be written.",
        ) from error

    _record(
        db,
        f"server.{action}_requested",
        "Server restart requested" if action == "restart" else "Server shutdown requested",
        severity="warning",
        details={"request_id": request["id"]},
    )
    db.commit()

    return {"id": request["id"], "action": action, "state": "requested"}


@router.post("/server/restart", status_code=status.HTTP_202_ACCEPTED, response_model=ServerActionResponse)
def post_restart(
    admin: object = Depends(require_admin_session),
    db: Session = Depends(get_db),
):
    return request_server_action("restart", admin, db)


@router.post("/server/shutdown", status_code=status.HTTP_202_ACCEPTED, response_model=ServerActionResponse)
def post_shutdown(
    admin: object = Depends(require_admin_session),
    db: Session = Depends(get_db),
):
    return request_server_action("shutdown", admin, db)


# --------------------------------------------------
# Notifications
# --------------------------------------------------


def notification(
    note_id: str,
    severity: str,
    title: str,
    detail: str,
    target: str,
) -> dict:
    return {"id": note_id, "severity": severity, "title": title, "detail": detail, "target": target}


@router.get("/notifications", summary="Things that need the administrator's attention")
def get_notifications(
    _admin: object = Depends(require_admin_session),
    db: Session = Depends(get_db),
):
    """
    The current alerts, computed from live data. An id changes when the
    situation changes (for example a different number of low-stock items), so
    a dismissed alert comes back when something new happens.
    """

    now = datetime.now(timezone.utc)
    items: list[dict] = []

    maintenance = maintenance_payload(db)

    if maintenance["enabled"]:
        who = f" by {maintenance['changed_by']}" if maintenance["changed_by"] else ""
        items.append(
            notification(
                f"maintenance:{maintenance['changed_at']}",
                "warning",
                "Maintenance mode is on",
                f"Terminals cannot record sales or change stock. Turned on{who}.",
                "Overview",
            )
        )

    result = last_result()

    if result and result.get("state") == "failed":
        items.append(
            notification(
                f"server-action:{result.get('id')}",
                "critical",
                "A server action failed",
                str(result.get("message") or "The last restart or shutdown did not complete."),
                "Overview",
            )
        )

    cutoff = now - timedelta(seconds=TERMINAL_OFFLINE_AFTER_SECONDS)
    offline = db.scalars(
        select(Terminal)
        .where(Terminal.is_enabled.is_(True), Terminal.last_seen_at < cutoff)
        .order_by(Terminal.name)
    ).all()

    if offline:
        names = ", ".join(terminal.name or terminal.device_id for terminal in offline[:3])
        more = f" and {len(offline) - 3} more" if len(offline) > 3 else ""
        items.append(
            notification(
                "terminals.offline:" + ",".join(str(terminal.id) for terminal in offline),
                "warning",
                f"{len(offline)} terminal{'s' if len(offline) != 1 else ''} offline",
                f"{names}{more} stopped checking in.",
                "Terminals",
            )
        )

    active = Product.archived_at.is_(None)
    threshold = _low_stock_threshold(db)
    out_count = db.scalar(select(func.count(Product.id)).where(active, Product.stock <= 0)) or 0
    low_count = (
        db.scalar(
            select(func.count(Product.id)).where(active, Product.stock > 0, Product.stock <= threshold)
        )
        or 0
    )

    if out_count:
        items.append(
            notification(
                f"stock.out:{out_count}",
                "critical",
                f"{out_count} product{'s' if out_count != 1 else ''} out of stock",
                "Restock to keep selling them.",
                "Stock",
            )
        )

    if low_count:
        items.append(
            notification(
                f"stock.low:{low_count}",
                "warning",
                f"{low_count} product{'s' if low_count != 1 else ''} running low",
                f"{threshold} units or fewer left.",
                "Stock",
            )
        )

    for check in collect_system_health(db)["checks"]:
        if check["status"] == "ok":
            continue

        items.append(
            notification(
                f"health:{check['id']}:{check['status']}",
                "critical" if check["status"] == "critical" else "warning",
                check["label"],
                check["detail"],
                "Database" if check["id"] in {"backup", "database", "migrations"} else "Overview",
            )
        )

    order = {"critical": 0, "warning": 1, "info": 2}
    items.sort(key=lambda item: order.get(item["severity"], 3))

    return {"as_of": now.isoformat(), "items": items}
