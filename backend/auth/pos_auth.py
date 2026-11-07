"""
Credential handling for POS terminals and cashiers.

Two transports are supported for the same server-side credentials:

Native apps (iOS/Android)
    Credentials are returned in JSON and kept in the platform keystore
    (Keychain / Android Keystore). They are sent as
    ``Authorization: Bearer <terminal token>`` and ``X-Cashier-Session``.
    Headers cannot be attached by another web origin, so CSRF does not apply.

Browsers (Expo web / home-screen PWA)
    Credentials never reach JavaScript. They are issued as
    ``Secure; HttpOnly; SameSite=Strict`` cookies, and state-changing
    requests must carry an allowed ``Origin`` plus an ``X-CSRF-Token``
    derived from the terminal pairing (HMAC-SHA256, server-side key).

Terminal credential lifecycle
    * Pairing issues a 256-bit random token; only its SHA-256 is stored.
    * After ``terminal_token_rotation_days`` the heartbeat offers a new token
      ("pending"). It becomes current the first time the device uses it.
    * The replaced token keeps working for ``terminal_token_grace_seconds``
      so that in-flight requests succeed. Any later use means two parties
      hold the credential: the terminal is revoked and disabled.
    * A terminal unseen for ``terminal_credential_idle_days`` is revoked.
    * Revocation clears every stored hash; the device must be re-paired.
"""

import hmac
import hashlib
import logging
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import HTTPException, Response, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session
from starlette.requests import HTTPConnection

from activity_models import ActivityEvent
from auth.config import auth_settings
from auth.security import generate_secret, hash_secret
from cashier_models import CashierSession
from models import Terminal


logger = logging.getLogger(__name__)

TOKEN_MAX_LENGTH = 256

CLIENT_MODE_HEADER = "X-Kinesis-Client"
CSRF_HEADER = "X-CSRF-Token"
CASHIER_HEADER = "X-Cashier-Session"

SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})

CredentialKind = Literal["current", "pending", "previous"]


@dataclass(frozen=True, slots=True)
class TerminalAuthentication:
    terminal: Terminal
    via_cookie: bool
    kind: CredentialKind


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


# --------------------------------------------------
# Browser origin and CSRF
# --------------------------------------------------


def is_pos_origin(origin: str | None) -> bool:
    return bool(origin) and origin.rstrip("/") in auth_settings.pos_origins


def require_pos_origin(connection: HTTPConnection) -> None:
    if not is_pos_origin(connection.headers.get("origin")):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This browser origin is not permitted.",
        )


def derive_pos_csrf_token(terminal: Terminal) -> str:
    """
    CSRF token for a paired browser terminal.

    Bound to the terminal and its pairing time, so it survives credential
    rotation but changes whenever the terminal is re-paired.
    """

    message = (
        b"kinesis-pos-csrf-v1:"
        + str(terminal.id).encode("ascii")
        + b":"
        + terminal.paired_at.isoformat().encode("ascii")
    )

    return hmac.new(
        auth_settings.effective_secret_key,
        message,
        hashlib.sha256,
    ).hexdigest()


def verify_pos_csrf_token(
    supplied: str | None,
    terminal: Terminal,
) -> bool:
    if not supplied or len(supplied) > 128:
        return False

    return secrets.compare_digest(
        supplied,
        derive_pos_csrf_token(terminal),
    )


def wants_browser_credentials(connection: HTTPConnection) -> bool:
    return connection.headers.get(CLIENT_MODE_HEADER, "").strip().lower() == "web"


# --------------------------------------------------
# Cookies
# --------------------------------------------------


def _set_cookie(
    response: Response,
    name: str,
    value: str,
    max_age: int,
) -> None:
    response.set_cookie(
        key=name,
        value=value,
        max_age=max_age,
        path="/",
        secure=auth_settings.pos_cookie_secure,
        httponly=True,
        samesite="strict",
    )


def _clear_cookie(response: Response, name: str) -> None:
    response.delete_cookie(
        key=name,
        path="/",
        secure=auth_settings.pos_cookie_secure,
        httponly=True,
        samesite="strict",
    )


def set_terminal_cookie(response: Response, raw_token: str) -> None:
    _set_cookie(
        response,
        auth_settings.terminal_cookie_name,
        raw_token,
        auth_settings.terminal_credential_idle_days * 86400,
    )


def clear_terminal_cookie(response: Response) -> None:
    _clear_cookie(response, auth_settings.terminal_cookie_name)


def set_cashier_cookie(response: Response, raw_token: str) -> None:
    _set_cookie(
        response,
        auth_settings.cashier_cookie_name,
        raw_token,
        auth_settings.cashier_session_absolute_hours * 3600,
    )


def clear_cashier_cookie(response: Response) -> None:
    _clear_cookie(response, auth_settings.cashier_cookie_name)


# --------------------------------------------------
# Terminal credential state
# --------------------------------------------------


def issue_terminal_credential(terminal: Terminal, now: datetime) -> str:
    """Issue a fresh credential at pairing time. The caller commits."""

    raw_token = generate_secret()

    terminal.session_token_hash = hash_secret(raw_token)
    terminal.pending_token_hash = None
    terminal.previous_token_hash = None
    terminal.previous_token_valid_until = None
    terminal.token_rotated_at = now
    terminal.paired_at = now

    return raw_token


def revoke_terminal_credentials(
    db: Session,
    terminal: Terminal,
    now: datetime,
) -> None:
    """
    Invalidate every credential of a terminal and its cashier sessions.
    The caller commits.
    """

    terminal.session_token_hash = None
    terminal.pending_token_hash = None
    terminal.previous_token_hash = None
    terminal.previous_token_valid_until = None

    db.execute(
        update(CashierSession)
        .where(
            CashierSession.terminal_id == terminal.id,
            CashierSession.revoked_at.is_(None),
        )
        .values(revoked_at=now)
        .execution_options(synchronize_session=False)
    )


def offer_rotation(terminal: Terminal, now: datetime) -> str | None:
    """
    Return a new raw credential when the current one is due for rotation.

    The new credential is stored as pending; the current one stays valid
    until the device presents the new one. Called from the heartbeat only.
    The caller commits.
    """

    due_at = terminal.token_rotated_at + timedelta(
        days=auth_settings.terminal_token_rotation_days,
    )

    if now < due_at:
        return None

    raw_token = generate_secret()
    terminal.pending_token_hash = hash_secret(raw_token)

    return raw_token


def _credential_is_idle(terminal: Terminal, now: datetime) -> bool:
    return terminal.last_seen_at < now - timedelta(
        days=auth_settings.terminal_credential_idle_days,
    )


def resolve_terminal_credential(
    db: Session,
    raw_token: str,
) -> tuple[Terminal, CredentialKind] | None:
    """
    Find the terminal for a raw credential and apply rotation transitions.

    Commits when the stored state changes (promotion, revocation).
    """

    now = utc_now()
    token_hash = hash_secret(raw_token)

    def find_current() -> Terminal | None:
        return db.scalar(
            select(Terminal).where(Terminal.session_token_hash == token_hash)
        )

    terminal = find_current()

    if terminal is None:
        pending = db.scalar(
            select(Terminal)
            .where(Terminal.pending_token_hash == token_hash)
            .with_for_update()
        )

        if pending is not None:
            pending.previous_token_hash = pending.session_token_hash
            pending.previous_token_valid_until = now + timedelta(
                seconds=auth_settings.terminal_token_grace_seconds,
            )
            pending.session_token_hash = token_hash
            pending.pending_token_hash = None
            pending.token_rotated_at = now
            db.commit()

            logger.info("Terminal %s rotated its credential.", pending.id)

            return pending, "pending"

        # A concurrent request may have just promoted this credential.
        terminal = find_current()

    if terminal is not None:
        if _credential_is_idle(terminal, now):
            logger.warning(
                "Terminal %s credential expired after inactivity; revoking.",
                terminal.id,
            )
            revoke_terminal_credentials(db, terminal, now)
            db.commit()
            return None

        return terminal, "current"

    previous = db.scalar(
        select(Terminal)
        .where(Terminal.previous_token_hash == token_hash)
        .with_for_update()
    )

    if previous is None:
        return None

    if (
        previous.previous_token_valid_until is not None
        and now <= previous.previous_token_valid_until
    ):
        return previous, "previous"

    # A replaced credential was used after its grace period. Either the
    # device malfunctioned or a copy of the credential exists elsewhere.
    # Fail safe: revoke everything and require administrator re-pairing.
    logger.warning(
        "Replaced credential reused for terminal %s; revoking and disabling.",
        previous.id,
    )

    revoke_terminal_credentials(db, previous, now)
    previous.is_enabled = False

    db.add(
        ActivityEvent(
            event_type="terminal.credential_reuse",
            severity="error",
            actor_type="system",
            terminal_id=previous.id,
            summary=(
                f"Terminal {previous.device_id} disabled: a replaced "
                "credential was reused"
            ),
            details={"terminal_id": previous.id},
        )
    )

    db.commit()

    return None


# --------------------------------------------------
# Request authentication
# --------------------------------------------------


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def read_terminal_credential(
    connection: HTTPConnection,
) -> tuple[str, bool]:
    """Return (raw token, via_cookie) or raise 401."""

    authorization = connection.headers.get("authorization")
    cookie_token = connection.cookies.get(auth_settings.terminal_cookie_name)

    if authorization and cookie_token:
        raise _unauthorized(
            "Send terminal credentials as a cookie or a Bearer token, not both."
        )

    if cookie_token:
        raw_token = cookie_token.strip()
        via_cookie = True
    elif authorization:
        scheme, separator, raw_token = authorization.partition(" ")
        raw_token = raw_token.strip()

        if not separator or scheme.lower() != "bearer":
            raise _unauthorized("Use a valid Bearer token.")

        via_cookie = False
    else:
        raise _unauthorized("Terminal authentication is required.")

    if not raw_token or len(raw_token) > TOKEN_MAX_LENGTH:
        raise _unauthorized("Terminal credentials are invalid.")

    return raw_token, via_cookie


def has_terminal_credential(connection: HTTPConnection) -> bool:
    return bool(
        connection.headers.get("authorization")
        or connection.cookies.get(auth_settings.terminal_cookie_name)
    )


def authenticate_terminal(
    connection: HTTPConnection,
    db: Session,
) -> TerminalAuthentication:
    raw_token, via_cookie = read_terminal_credential(connection)

    resolved = resolve_terminal_credential(db, raw_token)

    if resolved is None:
        raise _unauthorized("Terminal credentials are invalid.")

    terminal, kind = resolved

    if via_cookie and connection.scope.get("type") == "http":
        method = connection.scope.get("method", "GET").upper()

        if method not in SAFE_METHODS:
            require_pos_origin(connection)

            if not verify_pos_csrf_token(
                connection.headers.get(CSRF_HEADER),
                terminal,
            ):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="The CSRF token is missing or invalid.",
                )

    if not terminal.is_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This terminal has been disabled by an administrator.",
        )

    authentication = TerminalAuthentication(
        terminal=terminal,
        via_cookie=via_cookie,
        kind=kind,
    )

    connection.state.terminal_auth = authentication

    return authentication


def current_terminal_auth(connection: HTTPConnection) -> TerminalAuthentication:
    authentication = getattr(connection.state, "terminal_auth", None)

    if authentication is None:
        raise RuntimeError("Terminal authentication has not run for this request.")

    return authentication


def read_cashier_credential(connection: HTTPConnection) -> str | None:
    """
    Cashier credentials use the same transport as the terminal credential:
    a cookie for browser terminals, the X-Cashier-Session header for native.
    """

    authentication = current_terminal_auth(connection)

    header_token = connection.headers.get(CASHIER_HEADER)
    cookie_token = connection.cookies.get(auth_settings.cashier_cookie_name)

    raw_token = cookie_token if authentication.via_cookie else header_token

    if authentication.via_cookie and header_token:
        # Browser clients never see the cashier token. A header here means
        # a script is trying to substitute its own credential.
        return None

    if not raw_token or len(raw_token) > TOKEN_MAX_LENGTH:
        return None

    return raw_token.strip() or None
