import logging
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    Request,
    Response,
    status,
)
from pydantic import BaseModel, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import func, or_, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from auth.pos_auth import (
    authenticate_terminal,
    current_terminal_auth,
    derive_pos_csrf_token,
    offer_rotation,
    revoke_terminal_credentials,
    set_terminal_cookie,
)
from config_paths import ENV_FILE
from database import get_db
from models import Terminal, TerminalCommand


logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api",
    tags=["Terminals"],
)

class TerminalSettings(BaseSettings):
    terminal_heartbeat_timeout_seconds: int = Field(
        default=90,
        ge=15,
        le=600,
    )

    model_config = SettingsConfigDict(
        env_file=ENV_FILE,
        env_file_encoding="utf-8",
        env_prefix="KINESIS_",
        extra="ignore",
    )


settings = TerminalSettings()


# --------------------------------------------------
# Request schemas
# --------------------------------------------------


class TerminalHeartbeatRequest(BaseModel):
    app_version: str | None = Field(
        default=None,
        max_length=50,
    )

    @field_validator("app_version")
    @classmethod
    def normalize_app_version(
        cls,
        value: str | None,
    ) -> str | None:
        if value is None:
            return None

        return value.strip() or None


class TerminalCommandAcknowledgement(BaseModel):
    status: Literal["acknowledged", "failed"]

    result_message: str | None = Field(
        default=None,
        max_length=300,
    )

    @field_validator("result_message")
    @classmethod
    def normalize_result_message(
        cls,
        value: str | None,
    ) -> str | None:
        if value is None:
            return None

        return value.strip() or None


class TerminalMaintenanceUpdate(BaseModel):
    maintenance_mode: bool


class TerminalRename(BaseModel):
    name: str = Field(min_length=1, max_length=100)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        value = " ".join(value.split())

        if not value:
            raise ValueError("The terminal name cannot be blank.")

        return value


class TerminalBroadcastRequest(BaseModel):
    message: str = Field(
        min_length=1,
        max_length=250,
    )

    @field_validator("message")
    @classmethod
    def normalize_message(cls, value: str) -> str:
        value = value.strip()

        if not value:
            raise ValueError("The broadcast message cannot be blank.")

        return value


# --------------------------------------------------
# Authentication
# --------------------------------------------------


def require_admin_token() -> None:
    """
    Compatibility dependency for existing administrator-only routes.

    The application replaces this dependency with
    require_admin_session during startup.

    This function deliberately does not accept an administrator
    API token. If the authentication integration is not installed,
    administrator-only routes fail closed.
    """

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Administrator browser authentication is required.",
    )


def require_terminal(
    request: Request,
    db: Session = Depends(get_db),
) -> Terminal:
    """
    Authenticate a registered POS terminal.

    Native apps send ``Authorization: Bearer <token>``; browser terminals
    send an HttpOnly cookie plus Origin/CSRF checks on unsafe methods.
    Tokens are stored in PostgreSQL as SHA-256 digests. See auth/pos_auth.py
    for rotation, reuse detection and revocation.
    """

    return authenticate_terminal(request, db).terminal


def require_admin_or_terminal(
    request: Request,
    db: Session = Depends(get_db),
) -> Terminal:
    """
    Compatibility dependency for routes accepting either an administrator
    or a POS terminal.

    The application replaces this dependency with
    require_admin_session_or_terminal during startup.

    Outside that integration, this fallback accepts terminal credentials
    only. It never accepts a legacy administrator API token.
    """

    return require_terminal(
        request,
        db,
    )


def require_writable_terminal(
    terminal: Terminal = Depends(require_terminal),
) -> Terminal:
    """
    Require an enabled terminal that is not in maintenance mode.

    Administrator browser sessions do not bypass the POS terminal's
    maintenance restrictions.
    """

    if terminal.maintenance_mode:
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail=(
                "This terminal is in maintenance mode. "
                "POS modifications are temporarily unavailable."
            ),
        )

    return terminal


# --------------------------------------------------
# Helpers
# --------------------------------------------------


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def heartbeat_cutoff() -> datetime:
    return utc_now() - timedelta(
        seconds=settings.terminal_heartbeat_timeout_seconds,
    )


def is_terminal_connected(
    terminal: Terminal,
    now: datetime,
) -> bool:
    cutoff = now - timedelta(
        seconds=settings.terminal_heartbeat_timeout_seconds,
    )

    return terminal.is_enabled and terminal.last_seen_at >= cutoff


def get_terminal_or_404(
    db: Session,
    terminal_id: int,
) -> Terminal:
    terminal = db.get(
        Terminal,
        terminal_id,
    )

    if terminal is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Terminal not found.",
        )

    return terminal


def get_request_ip(request: Request) -> str | None:
    # The direct peer address. Behind the TLS reverse proxy, uvicorn's
    # --proxy-headers --forwarded-allow-ips=127.0.0.1 replaces it with the
    # client address forwarded by the proxy; other clients cannot spoof it.
    if request.client is None:
        return None

    return request.client.host[:45]


def terminal_admin_response(
    terminal: Terminal,
    now: datetime,
) -> dict:
    return {
        "id": terminal.id,
        "terminal_code": f"TERM-{terminal.id:03d}",
        "device_id": terminal.device_id,
        "name": terminal.name,
        "device_type": terminal.device_type,
        "platform": terminal.platform,
        "app_version": terminal.app_version,
        "ip_address": terminal.ip_address,
        "first_seen_at": terminal.first_seen_at.isoformat(),
        "last_seen_at": terminal.last_seen_at.isoformat(),
        "last_sync_at": (
            terminal.last_sync_at.isoformat()
            if terminal.last_sync_at is not None
            else None
        ),
        "status": (
            "Connected" if is_terminal_connected(terminal, now) else "Disconnected"
        ),
        "is_enabled": terminal.is_enabled,
        "maintenance_mode": terminal.maintenance_mode,
    }


def terminal_command_response(
    command: TerminalCommand,
) -> dict:
    return {
        "id": command.id,
        "command_type": command.command_type,
        "payload": command.payload,
        "created_at": command.created_at.isoformat(),
    }


# --------------------------------------------------
# Retired legacy registration endpoint
# --------------------------------------------------


@router.post(
    "/terminals/register",
    status_code=status.HTTP_410_GONE,
    deprecated=True,
)
def register_terminal_legacy():
    """
    The shared enrollment-key registration flow has been retired.

    New terminals must use the administrator-issued, single-use
    QR pairing flow at POST /api/terminals/pair.
    """

    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail=(
            "Shared-key terminal registration has been retired. "
            "Use the QR pairing flow provided by Terminal Management."
        ),
    )


# --------------------------------------------------
# Terminal heartbeat and pending commands
# --------------------------------------------------


@router.post("/terminals/heartbeat")
def terminal_heartbeat(
    heartbeat: TerminalHeartbeatRequest,
    request: Request,
    response: Response,
    terminal: Terminal = Depends(require_terminal),
    db: Session = Depends(get_db),
):
    response.headers["Cache-Control"] = "no-store, private"

    now = utc_now()
    authentication = current_terminal_auth(request)

    # Only the holder of the current credential may receive its successor.
    rotated_token = (
        offer_rotation(terminal, now)
        if authentication.kind == "current"
        else None
    )

    terminal.last_seen_at = now
    terminal.updated_at = now
    terminal.ip_address = get_request_ip(request)

    if heartbeat.app_version is not None:
        terminal.app_version = heartbeat.app_version

    try:
        db.commit()

        pending_commands = db.scalars(
            select(TerminalCommand)
            .where(
                TerminalCommand.terminal_id == terminal.id,
                TerminalCommand.status == "pending",
            )
            .order_by(TerminalCommand.id.asc())
            .limit(25)
        ).all()

    except SQLAlchemyError as exc:
        db.rollback()

        logger.exception("Terminal heartbeat failed.")

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The terminal heartbeat could not be saved.",
        ) from exc

    rotation: dict = {}

    if rotated_token is not None:
        if authentication.via_cookie:
            set_terminal_cookie(response, rotated_token)
        else:
            # Native clients replace the keystore entry and use the new
            # token from the next request on.
            rotation["session_token"] = rotated_token

    return {
        **rotation,
        "terminal_id": terminal.id,
        "device_id": terminal.device_id,
        "server_time": now.isoformat(),
        "heartbeat_interval_seconds": max(
            5,
            min(
                30,
                settings.terminal_heartbeat_timeout_seconds // 3,
            ),
        ),
        "is_enabled": terminal.is_enabled,
        "maintenance_mode": terminal.maintenance_mode,
        "commands": [
            terminal_command_response(command) for command in pending_commands
        ],
    }


# --------------------------------------------------
# Terminal: describe the current credential
# --------------------------------------------------


@router.get("/terminals/session")
def get_terminal_session(
    request: Request,
    response: Response,
    terminal: Terminal = Depends(require_terminal),
):
    """
    Lets a browser terminal (whose credential is an HttpOnly cookie that
    JavaScript cannot read) check whether it is paired, and obtain the CSRF
    token for state-changing requests. The CSRF token is only returned to
    cookie-authenticated clients.
    """

    response.headers["Cache-Control"] = "no-store, private"

    authentication = current_terminal_auth(request)

    return {
        "terminal_id": terminal.id,
        "device_id": terminal.device_id,
        "is_enabled": terminal.is_enabled,
        "maintenance_mode": terminal.maintenance_mode,
        "heartbeat_interval_seconds": max(
            5,
            min(
                30,
                settings.terminal_heartbeat_timeout_seconds // 3,
            ),
        ),
        "csrf_token": (
            derive_pos_csrf_token(terminal)
            if authentication.via_cookie
            else None
        ),
    }


# --------------------------------------------------
# Acknowledge a command from a terminal
# --------------------------------------------------


@router.post("/terminals/commands/{command_id}/ack")
def acknowledge_terminal_command(
    command_id: int,
    acknowledgement: TerminalCommandAcknowledgement,
    terminal: Terminal = Depends(require_terminal),
    db: Session = Depends(get_db),
):
    command = db.scalar(
        select(TerminalCommand)
        .where(
            TerminalCommand.id == command_id,
            TerminalCommand.terminal_id == terminal.id,
        )
        .with_for_update()
    )

    if command is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Command not found for this terminal.",
        )

    if command.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This command has already been acknowledged or failed.",
        )

    now = utc_now()

    command.status = acknowledgement.status
    command.result_message = acknowledgement.result_message
    command.completed_at = now

    if command.command_type == "sync" and acknowledgement.status == "acknowledged":
        terminal.last_sync_at = now
        terminal.updated_at = now

    try:
        db.commit()

    except SQLAlchemyError as exc:
        db.rollback()

        logger.exception("Terminal command acknowledgement failed.")

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The command result could not be saved.",
        ) from exc

    return {
        "command_id": command.id,
        "status": command.status,
        "completed_at": now.isoformat(),
    }


# --------------------------------------------------
# Admin: list and search terminals
# --------------------------------------------------


@router.get("/admin/terminals")
def list_admin_terminals(
    search: str | None = Query(
        default=None,
        max_length=150,
    ),
    limit: int = Query(
        default=100,
        ge=1,
        le=100,
    ),
    offset: int = Query(
        default=0,
        ge=0,
    ),
    _authorized: None = Depends(require_admin_token),
    db: Session = Depends(get_db),
):
    conditions = []

    if search and search.strip():
        term = (
            search.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        )

        pattern = f"%{term}%"

        conditions.append(
            or_(
                Terminal.name.ilike(pattern, escape="\\"),
                Terminal.device_id.ilike(pattern, escape="\\"),
                Terminal.device_type.ilike(pattern, escape="\\"),
                Terminal.platform.ilike(pattern, escape="\\"),
                Terminal.ip_address.ilike(pattern, escape="\\"),
            )
        )

    filtered_count = db.scalar(select(func.count(Terminal.id)).where(*conditions)) or 0

    terminals = db.scalars(
        select(Terminal)
        .where(*conditions)
        .order_by(
            Terminal.last_seen_at.desc(),
            Terminal.id.desc(),
        )
        .offset(offset)
        .limit(limit)
    ).all()

    now = utc_now()
    cutoff = heartbeat_cutoff()

    total_count = db.scalar(select(func.count(Terminal.id))) or 0

    connected_count = (
        db.scalar(
            select(func.count(Terminal.id)).where(
                Terminal.is_enabled.is_(True),
                Terminal.last_seen_at >= cutoff,
            )
        )
        or 0
    )

    maintenance_count = (
        db.scalar(
            select(func.count(Terminal.id)).where(
                Terminal.is_enabled.is_(True),
                Terminal.maintenance_mode.is_(True),
                Terminal.last_seen_at >= cutoff,
            )
        )
        or 0
    )

    return {
        "items": [terminal_admin_response(terminal, now) for terminal in terminals],
        "limit": limit,
        "offset": offset,
        "count": int(filtered_count),
        "total_count": int(total_count),
        "connected_count": int(connected_count),
        "disconnected_count": int(total_count - connected_count),
        "maintenance_count": int(maintenance_count),
        "heartbeat_timeout_seconds": (settings.terminal_heartbeat_timeout_seconds),
    }


# --------------------------------------------------
# Admin: queue a synchronization request
# --------------------------------------------------


@router.post("/admin/terminals/{terminal_id}/sync")
def request_terminal_sync(
    terminal_id: int,
    _authorized: None = Depends(require_admin_token),
    db: Session = Depends(get_db),
):
    terminal = get_terminal_or_404(
        db,
        terminal_id,
    )

    if not is_terminal_connected(terminal, utc_now()):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This terminal is offline. Sync cannot be requested yet.",
        )

    command = TerminalCommand(
        terminal_id=terminal.id,
        command_type="sync",
        payload=None,
        status="pending",
    )

    try:
        db.add(command)
        db.commit()
        db.refresh(command)

    except SQLAlchemyError as exc:
        db.rollback()

        logger.exception("Could not queue a terminal sync command.")

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The sync request could not be queued.",
        ) from exc

    return {
        "command_id": command.id,
        "terminal_id": terminal.id,
        "status": command.status,
        "message": "Sync request queued. Waiting for the terminal to process it.",
    }


# --------------------------------------------------
# Admin: change terminal maintenance mode
# --------------------------------------------------


@router.patch("/admin/terminals/{terminal_id}/maintenance")
def set_terminal_maintenance(
    terminal_id: int,
    update: TerminalMaintenanceUpdate,
    _authorized: None = Depends(require_admin_token),
    db: Session = Depends(get_db),
):
    terminal = get_terminal_or_404(
        db,
        terminal_id,
    )

    terminal.maintenance_mode = update.maintenance_mode
    terminal.updated_at = utc_now()

    try:
        db.commit()

    except SQLAlchemyError as exc:
        db.rollback()

        logger.exception("Could not update terminal maintenance mode.")

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Maintenance mode could not be updated.",
        ) from exc

    return {
        "terminal_id": terminal.id,
        "maintenance_mode": terminal.maintenance_mode,
        "message": (
            "Maintenance mode enabled."
            if terminal.maintenance_mode
            else "Maintenance mode disabled."
        ),
    }


@router.patch("/admin/terminals/{terminal_id}/name")
def rename_terminal(
    terminal_id: int,
    update: TerminalRename,
    _authorized: None = Depends(require_admin_token),
    db: Session = Depends(get_db),
):
    terminal = get_terminal_or_404(db, terminal_id)

    terminal.name = update.name
    terminal.updated_at = utc_now()

    try:
        db.commit()

    except SQLAlchemyError as exc:
        db.rollback()

        logger.exception("Could not rename terminal.")

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The terminal could not be renamed.",
        ) from exc

    return {
        "terminal_id": terminal.id,
        "name": terminal.name,
        "message": f"Terminal renamed to {terminal.name}.",
    }


# --------------------------------------------------
# Admin: broadcast to currently connected terminals
# --------------------------------------------------


@router.post("/admin/terminals/broadcast")
def broadcast_to_terminals(
    broadcast: TerminalBroadcastRequest,
    _authorized: None = Depends(require_admin_token),
    db: Session = Depends(get_db),
):
    now = utc_now()
    cutoff = heartbeat_cutoff()

    terminals = db.scalars(
        select(Terminal).where(
            Terminal.is_enabled.is_(True),
            Terminal.last_seen_at >= cutoff,
        )
    ).all()

    if not terminals:
        return {
            "message": "No connected terminals are currently available.",
            "recipient_count": 0,
            "commands_created": 0,
        }

    commands = [
        TerminalCommand(
            terminal_id=terminal.id,
            command_type="broadcast",
            payload=broadcast.message,
            status="pending",
        )
        for terminal in terminals
    ]

    try:
        db.add_all(commands)
        db.commit()

    except SQLAlchemyError as exc:
        db.rollback()

        logger.exception("Could not queue the terminal broadcast.")

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The broadcast could not be queued.",
        ) from exc

    return {
        "message": "Broadcast queued. Delivery is pending terminal acknowledgement.",
        "recipient_count": len(terminals),
        "commands_created": len(commands),
        "created_at": now.isoformat(),
    }


# --------------------------------------------------
# Admin: disable a terminal
# --------------------------------------------------


@router.post("/admin/terminals/{terminal_id}/disconnect")
def disconnect_terminal(
    terminal_id: int,
    _authorized: None = Depends(require_admin_token),
    db: Session = Depends(get_db),
):
    terminal = get_terminal_or_404(
        db,
        terminal_id,
    )

    now = utc_now()

    terminal.is_enabled = False
    terminal.maintenance_mode = False
    terminal.updated_at = now

    # Revoke the device credential and its cashier sessions. Re-enabling
    # the terminal therefore requires a new administrator-issued QR code.
    revoke_terminal_credentials(db, terminal, now)

    pending_commands = db.scalars(
        select(TerminalCommand).where(
            TerminalCommand.terminal_id == terminal.id,
            TerminalCommand.status == "pending",
        )
    ).all()

    for command in pending_commands:
        command.status = "failed"
        command.result_message = "Terminal disabled before command completion."
        command.completed_at = now

    try:
        db.commit()

    except SQLAlchemyError as exc:
        db.rollback()

        logger.exception("Could not disable terminal.")

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The terminal could not be disabled.",
        ) from exc

    # Close live settings connections now instead of waiting for the device
    # to reconnect. Imported here to avoid a circular import.
    try:
        import anyio

        from settings_realtime import connection_manager

        anyio.from_thread.run(
            connection_manager.disconnect_terminal,
            terminal.id,
        )
    except Exception:
        logger.warning(
            "Could not close live connections for terminal %s.",
            terminal.id,
            exc_info=True,
        )

    return {
        "terminal_id": terminal.id,
        "is_enabled": terminal.is_enabled,
        "message": (
            "Terminal access revoked. The device must be re-paired with a "
            "new QR code before it can be used again."
        ),
    }


# --------------------------------------------------
# Admin: re-enable a disabled terminal
# --------------------------------------------------


@router.post("/admin/terminals/{terminal_id}/enable")
def enable_terminal(
    terminal_id: int,
    _authorized: None = Depends(require_admin_token),
    db: Session = Depends(get_db),
):
    terminal = get_terminal_or_404(
        db,
        terminal_id,
    )

    terminal.is_enabled = True
    terminal.updated_at = utc_now()

    requires_pairing = terminal.session_token_hash is None

    try:
        db.commit()

    except SQLAlchemyError as exc:
        db.rollback()

        logger.exception("Could not re-enable terminal.")

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The terminal could not be re-enabled.",
        ) from exc

    return {
        "terminal_id": terminal.id,
        "is_enabled": terminal.is_enabled,
        "requires_pairing": requires_pairing,
        "message": (
            "Terminal enabled. Its credential was revoked, so pair the device "
            "again with a new QR code."
            if requires_pairing
            else "Terminal access enabled. It will appear connected after its "
            "next successful heartbeat."
        ),
    }
