import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field, SecretStr, field_validator
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from auth.pos_auth import (
    derive_pos_csrf_token,
    issue_terminal_credential,
    require_pos_origin,
    set_terminal_cookie,
    wants_browser_credentials,
)
from database import get_db
from models import Terminal, TerminalPairingChallenge
from terminal_routes import (
    get_request_ip,
    require_admin_token,
    settings as terminal_settings,
)


logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api",
    tags=["Terminal Pairing"],
)

PAIRING_TOKEN_PREFIX = "KINESIS-PAIRING:v1:"
PAIRING_TOKEN_TTL_SECONDS = 300


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
    def normalize_app_version(
        cls,
        value: str | None,
    ) -> str | None:
        if value is None:
            return None

        return value.strip() or None


class TerminalPairingRequest(BaseModel):
    pairing_token: SecretStr
    registration: TerminalRegistrationRequest


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def hash_pairing_token(token: str) -> str:
    return hashlib.sha256(
        token.encode("utf-8"),
    ).hexdigest()


def terminal_pairing_response(
    terminal: Terminal,
    raw_session_token: str | None,
    csrf_token: str | None = None,
) -> dict:
    # Browser terminals receive the credential as an HttpOnly cookie and
    # never see the raw token; native apps receive it for the keystore.
    credential = (
        {"session_token": raw_session_token}
        if raw_session_token is not None
        else {"csrf_token": csrf_token}
    )

    return {
        **credential,
        "terminal_id": terminal.id,
        "device_id": terminal.device_id,
        "is_enabled": terminal.is_enabled,
        "maintenance_mode": terminal.maintenance_mode,
        "heartbeat_interval_seconds": max(
            5,
            min(
                30,
                terminal_settings.terminal_heartbeat_timeout_seconds // 3,
            ),
        ),
    }


# --------------------------------------------------
# Admin: create a one-time pairing challenge
# --------------------------------------------------


@router.post(
    "/admin/terminals/pairing-challenges",
    status_code=status.HTTP_201_CREATED,
)
def create_terminal_pairing_challenge(
    _authorized: None = Depends(require_admin_token),
    db: Session = Depends(get_db),
):
    now = utc_now()

    raw_token = secrets.token_urlsafe(32)
    token_hash = hash_pairing_token(raw_token)

    challenge = TerminalPairingChallenge(
        token_hash=token_hash,
        created_at=now,
        expires_at=now
        + timedelta(
            seconds=PAIRING_TOKEN_TTL_SECONDS,
        ),
    )

    try:
        db.execute(
            delete(TerminalPairingChallenge).where(
                TerminalPairingChallenge.expires_at < now - timedelta(days=7),
            )
        )

        db.add(challenge)
        db.commit()
        db.refresh(challenge)

    except IntegrityError as exc:
        db.rollback()
        logger.exception("Could not create a terminal pairing challenge.")

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A pairing challenge could not be created. Please try again.",
        ) from exc

    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Terminal pairing challenge creation failed.")

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="A pairing challenge could not be created.",
        ) from exc

    return {
        "id": challenge.id,
        "pairing_payload": f"{PAIRING_TOKEN_PREFIX}{raw_token}",
        "created_at": challenge.created_at.isoformat(),
        "expires_at": challenge.expires_at.isoformat(),
        "expires_in_seconds": PAIRING_TOKEN_TTL_SECONDS,
    }


# --------------------------------------------------
# Admin: revoke an unused pairing challenge
# --------------------------------------------------


@router.post(
    "/admin/terminals/pairing-challenges/{challenge_id}/revoke",
)
def revoke_terminal_pairing_challenge(
    challenge_id: int,
    _authorized: None = Depends(require_admin_token),
    db: Session = Depends(get_db),
):
    challenge = db.scalar(
        select(TerminalPairingChallenge)
        .where(TerminalPairingChallenge.id == challenge_id)
        .with_for_update()
    )

    if challenge is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pairing challenge not found.",
        )

    # Revocation is idempotent. A successfully redeemed challenge
    # is already unusable, so there is nothing left to revoke.
    if challenge.consumed_at is not None:
        return {
            "id": challenge.id,
            "revoked": False,
            "message": "This pairing challenge has already been used.",
        }

    if challenge.revoked_at is not None:
        return {
            "id": challenge.id,
            "revoked": True,
            "message": "This pairing challenge was already revoked.",
        }

    challenge.revoked_at = utc_now()

    try:
        db.commit()

    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Could not revoke pairing challenge.")

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The pairing challenge could not be revoked.",
        ) from exc

    return {
        "id": challenge.id,
        "revoked": True,
        "message": "The pairing challenge has been revoked.",
    }


# --------------------------------------------------
# Admin: check pairing challenge status
# --------------------------------------------------


@router.get(
    "/admin/terminals/pairing-challenges/{challenge_id}",
)
def get_terminal_pairing_challenge_status(
    challenge_id: int,
    _authorized: None = Depends(require_admin_token),
    db: Session = Depends(get_db),
):
    challenge = db.get(
        TerminalPairingChallenge,
        challenge_id,
    )

    if challenge is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pairing challenge not found.",
        )

    now = utc_now()

    if challenge.consumed_at is not None:
        challenge_status = "paired"
    elif challenge.revoked_at is not None:
        challenge_status = "revoked"
    elif challenge.expires_at <= now:
        challenge_status = "expired"
    else:
        challenge_status = "pending"

    return {
        "id": challenge.id,
        "status": challenge_status,
        "created_at": challenge.created_at.isoformat(),
        "expires_at": challenge.expires_at.isoformat(),
        "consumed_at": (
            challenge.consumed_at.isoformat()
            if challenge.consumed_at is not None
            else None
        ),
        "revoked_at": (
            challenge.revoked_at.isoformat()
            if challenge.revoked_at is not None
            else None
        ),
    }


# --------------------------------------------------
# Terminal: redeem a pairing challenge
# --------------------------------------------------


@router.post(
    "/terminals/pair",
    status_code=status.HTTP_201_CREATED,
)
def pair_terminal(
    pairing: TerminalPairingRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    response.headers["Cache-Control"] = "no-store, private"

    browser_client = wants_browser_credentials(request)

    if browser_client:
        require_pos_origin(request)

    raw_pairing_token = pairing.pairing_token.get_secret_value().strip()

    if not raw_pairing_token or len(raw_pairing_token) > 128:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="This pairing code is invalid or has expired.",
        )

    token_hash = hash_pairing_token(raw_pairing_token)

    challenge = db.scalar(
        select(TerminalPairingChallenge)
        .where(
            TerminalPairingChallenge.token_hash == token_hash,
        )
        .with_for_update()
    )

    # Check expiration after obtaining the row lock.
    now = utc_now()

    if (
        challenge is None
        or challenge.consumed_at is not None
        or challenge.revoked_at is not None
        or challenge.expires_at <= now
    ):
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="This pairing code is invalid, expired, or already used.",
        )

    registration = pairing.registration

    existing_terminal = db.scalar(
        select(Terminal)
        .where(
            Terminal.device_id == registration.device_id,
        )
        .with_for_update()
    )

    if (
        existing_terminal is not None
        and existing_terminal.session_token_hash is not None
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This device is already registered. "
                "Use its existing terminal credentials, or disconnect it in "
                "Terminal Management before pairing it again."
            ),
        )

    if existing_terminal is not None:
        # Re-pair a terminal whose credential was revoked (disconnected by
        # an administrator, expired, or revoked after credential reuse).
        # A fresh administrator-issued QR code authorizes it again.
        terminal = existing_terminal
        terminal.name = registration.name
        terminal.device_type = registration.device_type
        terminal.platform = registration.platform
        terminal.app_version = registration.app_version
        terminal.ip_address = get_request_ip(request)
        terminal.is_enabled = True
        terminal.maintenance_mode = False
        terminal.last_seen_at = now
        terminal.updated_at = now
    else:
        terminal = Terminal(
            device_id=registration.device_id,
            name=registration.name,
            device_type=registration.device_type,
            platform=registration.platform,
            app_version=registration.app_version,
            ip_address=get_request_ip(request),
            is_enabled=True,
            maintenance_mode=False,
            first_seen_at=now,
            last_seen_at=now,
            created_at=now,
            updated_at=now,
        )

    raw_session_token = issue_terminal_credential(terminal, now)

    challenge.consumed_at = now

    try:
        if existing_terminal is None:
            db.add(terminal)

        db.commit()
        db.refresh(terminal)

    except IntegrityError as exc:
        db.rollback()
        logger.warning(
            "Terminal pairing conflicted with an existing device.",
        )

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This device is already registered or another pairing "
                "request claimed its identity. Generate a new QR code."
            ),
        ) from exc

    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Terminal pairing failed.")

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The terminal could not be paired.",
        ) from exc

    if browser_client:
        set_terminal_cookie(response, raw_session_token)

        return terminal_pairing_response(
            terminal,
            None,
            csrf_token=derive_pos_csrf_token(terminal),
        )

    return terminal_pairing_response(
        terminal,
        raw_session_token,
    )
