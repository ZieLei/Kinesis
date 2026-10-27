import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import (
    APIRouter,
    Depends,
    Header,
    HTTPException,
    Query,
    Request,
    status,
)
from pydantic import BaseModel, Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from database import get_db
from models import Terminal, TerminalCommand


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["Terminals"])


class TerminalSettings(BaseSettings):
    admin_api_token: SecretStr | None = None
    terminal_enrollment_key: SecretStr | None = None
    terminal_heartbeat_timeout_seconds: int = Field(
        default=90,
        ge=15,
        le=600,
    )

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_prefix="KINESIS_",
        extra="ignore",
    )


settings = TerminalSettings()


# --------------------------------------------------
# Request schemas
# --------------------------------------------------


class TerminalRegistrationRequest(BaseModel):
    device_id: str = Field(
        min_length=8,
        max_length=64,
        pattern=r"^[A-Za-z0-9._:-]+$",
    )
    name: str = Field(min_length=1, max_length=100)
    device_type: str = Field(min_length=1, max_length=60)
    platform: str = Field(min_length=1, max_length=32)
    app_version: str | None = Field(default=None, max_length=50)

    @field_validator("name", "device_type", "platform")
    @classmethod
    def normalize_required_text(cls, value: str) -> str:
        value = value.strip()

        if not value:
            raise ValueError("This field cannot be blank.")

        return value

    @field_validator("app_version")
    @classmethod
    def normalize_app_version(cls, value: str | None) -> str | None:
        if value is None:
            return None

        return value.strip() or None


class TerminalHeartbeatRequest(BaseModel):
    app_version: str | None = Field(default=None, max_length=50)

    @field_validator("app_version")
    @classmethod
    def normalize_app_version(cls, value: str | None) -> str | None:
        if value is None:
            return None

        return value.strip() or None


class TerminalCommandAcknowledgement(BaseModel):
    status: Literal["acknowledged", "failed"]
    result_message: str | None = Field(default=None, max_length=300)

    @field_validator("result_message")
    @classmethod
    def normalize_result_message(cls, value: str | None) -> str | None:
        if value is None:
            return None

        return value.strip() or None


class TerminalMaintenanceUpdate(BaseModel):
    maintenance_mode: bool


class TerminalBroadcastRequest(BaseModel):
    message: str = Field(min_length=1, max_length=250)

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


def require_admin_token(
    x_admin_token: str | None = Header(
        default=None,
        alias="X-Admin-Token",
    ),
) -> None:
    configured_token = settings.admin_api_token

    if configured_token is None or not configured_token.get_secret_value():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Admin API authentication is not configured on the server.",
        )

    if not x_admin_token or not secrets.compare_digest(
        x_admin_token,
        configured_token.get_secret_value(),
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="A valid admin token is required.",
            headers={"WWW-Authenticate": "Bearer"},
        )


def require_enrollment_key(
    x_terminal_enrollment_key: str | None = Header(
        default=None,
        alias="X-Terminal-Enrollment-Key",
    ),
) -> None:
    configured_key = settings.terminal_enrollment_key

    if configured_key is None or not configured_key.get_secret_value():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Terminal registration is not configured on the server.",
        )

    if not x_terminal_enrollment_key or not secrets.compare_digest(
        x_terminal_enrollment_key,
        configured_key.get_secret_value(),
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="A valid terminal enrollment key is required.",
        )


def require_terminal(
    authorization: str | None = Header(
        default=None,
        alias="Authorization",
    ),
    db: Session = Depends(get_db),
) -> Terminal:
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Terminal authentication is required.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    scheme, separator, raw_token = authorization.partition(" ")

    if not separator or scheme.lower() != "bearer" or not raw_token.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Use a valid Bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token_hash = hashlib.sha256(raw_token.strip().encode("utf-8")).hexdigest()

    terminal = db.scalar(
        select(Terminal).where(
            Terminal.session_token_hash == token_hash,
        )
    )

    if terminal is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Terminal credentials are invalid.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not terminal.is_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This terminal has been disabled by an administrator.",
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


def is_terminal_connected(terminal: Terminal, now: datetime) -> bool:
    cutoff = now - timedelta(
        seconds=settings.terminal_heartbeat_timeout_seconds,
    )

    return terminal.is_enabled and terminal.last_seen_at >= cutoff


def get_terminal_or_404(
    db: Session,
    terminal_id: int,
) -> Terminal:
    terminal = db.get(Terminal, terminal_id)

    if terminal is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Terminal not found.",
        )

    return terminal


def get_request_ip(request: Request) -> str | None:
    # Use the direct peer address. Do not trust arbitrary forwarded headers.
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
        # Signal strength is intentionally omitted: the backend cannot
        # accurately infer a phone's Wi-Fi signal strength.
    }


def terminal_command_response(command: TerminalCommand) -> dict:
    return {
        "id": command.id,
        "command_type": command.command_type,
        "payload": command.payload,
        "created_at": command.created_at.isoformat(),
    }


# --------------------------------------------------
# Register a new terminal
# --------------------------------------------------


@router.post(
    "/terminals/register",
    status_code=status.HTTP_201_CREATED,
)
def register_terminal(
    registration: TerminalRegistrationRequest,
    request: Request,
    _authorized: None = Depends(require_enrollment_key),
    db: Session = Depends(get_db),
):
    existing = db.scalar(
        select(Terminal).where(
            Terminal.device_id == registration.device_id,
        )
    )

    if existing is not None:
        message = (
            "This terminal is disabled. An administrator must re-enable it."
            if not existing.is_enabled
            else (
                "This device is already registered. Reuse its stored "
                "terminal credentials instead of registering it again."
            )
        )

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=message,
        )

    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(
        raw_token.encode("utf-8"),
    ).hexdigest()
    now = utc_now()

    terminal = Terminal(
        device_id=registration.device_id,
        name=registration.name,
        device_type=registration.device_type,
        platform=registration.platform,
        app_version=registration.app_version,
        ip_address=get_request_ip(request),
        session_token_hash=token_hash,
        is_enabled=True,
        maintenance_mode=False,
        first_seen_at=now,
        last_seen_at=now,
        created_at=now,
        updated_at=now,
    )

    try:
        db.add(terminal)
        db.commit()
        db.refresh(terminal)

    except IntegrityError as exc:
        db.rollback()
        logger.warning("Terminal registration conflicted with an existing record.")

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This terminal is already registered.",
        ) from exc

    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Terminal registration failed.")

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The terminal could not be registered.",
        ) from exc

    # Return the raw token only once. The database stores only its hash.
    return {
        "terminal_id": terminal.id,
        "device_id": terminal.device_id,
        "session_token": raw_token,
        "is_enabled": terminal.is_enabled,
        "maintenance_mode": terminal.maintenance_mode,
        "heartbeat_interval_seconds": max(
            5,
            min(
                30,
                settings.terminal_heartbeat_timeout_seconds // 3,
            ),
        ),
    }


# --------------------------------------------------
# Terminal heartbeat and pending commands
# --------------------------------------------------


@router.post("/terminals/heartbeat")
def terminal_heartbeat(
    heartbeat: TerminalHeartbeatRequest,
    request: Request,
    terminal: Terminal = Depends(require_terminal),
    db: Session = Depends(get_db),
):
    now = utc_now()

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

    return {
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
    search: str | None = Query(default=None, max_length=150),
    limit: int = Query(default=100, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
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
        .order_by(Terminal.last_seen_at.desc(), Terminal.id.desc())
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
    terminal = get_terminal_or_404(db, terminal_id)

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
    terminal = get_terminal_or_404(db, terminal_id)
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
        "message": ("Broadcast queued. Delivery is pending terminal acknowledgement."),
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
    terminal = get_terminal_or_404(db, terminal_id)
    now = utc_now()

    terminal.is_enabled = False
    terminal.maintenance_mode = False
    terminal.updated_at = now

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

    return {
        "terminal_id": terminal.id,
        "is_enabled": terminal.is_enabled,
        "message": (
            "Terminal access disabled. The app will be refused on its next API request."
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
    terminal = get_terminal_or_404(db, terminal_id)
    terminal.is_enabled = True
    terminal.updated_at = utc_now()

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
        "message": (
            "Terminal access enabled. It will appear connected after its "
            "next successful heartbeat."
        ),
    }
