from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import uuid4
import hashlib

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session, joinedload

from auth.config import auth_settings
from auth.security import generate_secret, hash_secret
from cashier_models import Cashier, CashierLoginAttempt, CashierSession
from models import AppSettings


DEFAULT_INACTIVITY_LOCK = "5"
UNLOCK_RECOVERY_MARGIN_MINUTES = 5


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def get_cashier_idle_timeout_minutes(db: Session) -> int:
    """
    Return the server-side session idle timeout.

    The server session must remain valid long enough for the cashier
    to unlock the local terminal with their PIN.

    The five-minute recovery margin gives the cashier time to enter
    their PIN after the local inactivity lock appears.

    When the terminal lock is disabled, the existing authentication
    configuration remains authoritative.
    """

    configured_timeout = int(auth_settings.cashier_session_idle_minutes)

    row = db.scalar(select(AppSettings).where(AppSettings.id == 1))

    if row is None or not isinstance(row.settings, dict):
        return configured_timeout

    value = row.settings.get(
        "inactivityLock",
        DEFAULT_INACTIVITY_LOCK,
    )

    if value == "disabled":
        return configured_timeout

    try:
        lock_minutes = int(value)
    except (TypeError, ValueError):
        lock_minutes = int(DEFAULT_INACTIVITY_LOCK)

    if lock_minutes not in {5, 10, 15, 30, 60}:
        lock_minutes = int(DEFAULT_INACTIVITY_LOCK)

    return max(
        configured_timeout,
        lock_minutes + UNLOCK_RECOVERY_MARGIN_MINUTES,
    )


def calculate_idle_expiration(
    last_seen_at: datetime,
    absolute_expires_at: datetime,
    idle_timeout_minutes: int,
) -> datetime:
    return min(
        last_seen_at + timedelta(minutes=idle_timeout_minutes),
        absolute_expires_at,
    )


@dataclass(frozen=True, slots=True)
class CreatedCashierSession:
    record: CashierSession
    session_token: str


def cashier_account_attempt_key(username: str) -> str:
    """
    Generate an opaque account-specific login rate-limit key.
    """

    normalized_username = username.strip().lower()

    return hashlib.sha256(
        f"cashier-account:{normalized_username}".encode("utf-8")
    ).hexdigest()


def cashier_login_attempt_keys(
    username: str,
    client_ip: str | None,
) -> list[str]:
    """
    Generate separate account and source-IP rate-limit keys.

    The account bucket prevents an attacker from bypassing
    rate limits by switching between terminals or IP addresses.
    """

    account_key = cashier_account_attempt_key(username)

    normalized_ip = client_ip or "unknown"

    ip_key = hashlib.sha256(f"cashier-ip:{normalized_ip}".encode("utf-8")).hexdigest()

    return [
        account_key,
        ip_key,
    ]


def lock_cashier_login_attempts(
    db: Session,
    keys: list[str],
    *,
    now: datetime | None = None,
) -> tuple[list[CashierLoginAttempt], int]:
    """
    Atomically initialize and lock login attempt buckets.

    Holding these row locks during PIN verification prevents
    parallel requests from bypassing the account rate limit.
    """

    current_time = now or utc_now()

    if not keys:
        return [], 0

    insert_statement = (
        pg_insert(CashierLoginAttempt)
        .values(
            [
                {
                    "attempt_key": key,
                    "failure_count": 0,
                    "window_started_at": current_time,
                    "updated_at": current_time,
                }
                for key in keys
            ]
        )
        .on_conflict_do_nothing(
            index_elements=[CashierLoginAttempt.attempt_key],
        )
    )

    db.execute(insert_statement)

    attempts = db.scalars(
        select(CashierLoginAttempt)
        .where(CashierLoginAttempt.attempt_key.in_(keys))
        .order_by(CashierLoginAttempt.attempt_key)
        .with_for_update()
    ).all()

    active_locks = [
        attempt.locked_until
        for attempt in attempts
        if (attempt.locked_until is not None and attempt.locked_until > current_time)
    ]

    if not active_locks:
        return attempts, 0

    remaining = int((max(active_locks) - current_time).total_seconds())

    return attempts, max(1, remaining)


def record_failed_cashier_login(
    attempts: list[CashierLoginAttempt],
    *,
    now: datetime | None = None,
) -> None:
    """
    Increment all locked rate-limit buckets after a failed PIN attempt.

    The caller must commit the transaction.
    """

    current_time = now or utc_now()

    window = timedelta(
        minutes=auth_settings.cashier_login_attempt_window_minutes,
    )

    lockout = timedelta(
        minutes=auth_settings.cashier_login_lockout_minutes,
    )

    for attempt in attempts:
        window_expired = attempt.window_started_at <= current_time - window

        if window_expired:
            attempt.failure_count = 1
            attempt.window_started_at = current_time
            attempt.locked_until = None
        else:
            attempt.failure_count += 1

        if attempt.failure_count >= auth_settings.cashier_login_max_attempts:
            attempt.locked_until = current_time + lockout

        attempt.updated_at = current_time


def reset_cashier_login_attempts(
    db: Session,
    keys: list[str],
) -> None:
    """
    Remove login rate-limit buckets after successful authentication.

    The caller must commit the transaction.
    """

    if not keys:
        return

    db.execute(
        delete(CashierLoginAttempt).where(CashierLoginAttempt.attempt_key.in_(keys))
    )


def create_cashier_session(
    db: Session,
    cashier: Cashier,
    terminal_id: int,
) -> CreatedCashierSession:
    """
    Create a new cashier session.

    The caller must lock the associated terminal row before calling
    this function. That serializes session replacement on one terminal.

    Only the SHA-256 token digest is stored in PostgreSQL.
    """

    now = utc_now()

    session_id = uuid4()
    raw_token = generate_secret()

    absolute_expiration = now + timedelta(
        hours=auth_settings.cashier_session_absolute_hours,
    )

    idle_timeout = get_cashier_idle_timeout_minutes(db)

    idle_expiration = calculate_idle_expiration(
        now,
        absolute_expiration,
        idle_timeout,
    )

    record = CashierSession(
        id=session_id,
        cashier_id=cashier.id,
        terminal_id=terminal_id,
        session_token_hash=hash_secret(raw_token),
        created_at=now,
        last_seen_at=now,
        idle_expires_at=idle_expiration,
        absolute_expires_at=absolute_expiration,
    )

    db.add(record)

    return CreatedCashierSession(
        record=record,
        session_token=raw_token,
    )


def resolve_cashier_session(
    db: Session,
    raw_token: str | None,
    terminal_id: int,
    *,
    now: datetime | None = None,
) -> CashierSession | None:
    """
    Resolve a cashier session for one specific terminal.

    Sessions belonging to another terminal are never accepted.

    Expired or disabled-cashier sessions are revoked.

    The inactivity setting controls how long the server session
    remains valid without activity, with a recovery margin for
    locally locked terminals.
    """

    if not raw_token or len(raw_token) > 256:
        return None

    current_time = now or utc_now()

    session_record = db.scalar(
        select(CashierSession)
        .options(
            joinedload(CashierSession.cashier),
        )
        .where(
            CashierSession.session_token_hash == hash_secret(raw_token),
            CashierSession.terminal_id == terminal_id,
            CashierSession.revoked_at.is_(None),
        )
    )

    if session_record is None:
        return None

    idle_timeout = get_cashier_idle_timeout_minutes(db)

    expected_idle_expiration = calculate_idle_expiration(
        session_record.last_seen_at,
        session_record.absolute_expires_at,
        idle_timeout,
    )

    expired = (
        expected_idle_expiration <= current_time
        or session_record.absolute_expires_at <= current_time
    )

    inactive = not session_record.cashier.is_active

    if expired or inactive:
        session_record.revoked_at = current_time
        db.commit()
        return None

    touch_interval = timedelta(
        seconds=auth_settings.cashier_session_touch_interval_seconds,
    )

    if current_time - session_record.last_seen_at >= touch_interval:
        session_record.last_seen_at = current_time

        session_record.idle_expires_at = calculate_idle_expiration(
            current_time,
            session_record.absolute_expires_at,
            idle_timeout,
        )

        db.commit()

    elif session_record.idle_expires_at != expected_idle_expiration:
        # Apply a changed inactivity policy to an existing session.
        session_record.idle_expires_at = expected_idle_expiration
        db.commit()

    return session_record
