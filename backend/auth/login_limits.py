import hashlib
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from admin_models import AdminLoginAttempt
from auth.config import auth_settings


def login_attempt_keys(
    username: str,
    client_ip: str | None,
) -> list[str]:
    """
    Generate separate opaque rate-limit keys for an account and IP address.
    """

    normalized_username = username.strip().lower()
    normalized_ip = client_ip or "unknown"

    account_digest = hashlib.sha256(
        f"account:{normalized_username}".encode("utf-8")
    ).hexdigest()

    ip_digest = hashlib.sha256(f"ip:{normalized_ip}".encode("utf-8")).hexdigest()

    return [
        account_digest,
        ip_digest,
    ]


def is_login_rate_limited(
    db: Session,
    keys: list[str],
    *,
    now: datetime | None = None,
) -> tuple[bool, int]:
    """
    Return whether an account or IP is currently locked out.

    The second return value is the remaining lockout duration in seconds.
    """

    current_time = now or datetime.now(timezone.utc)

    if not keys:
        return False, 0

    attempts = db.scalars(
        select(AdminLoginAttempt).where(AdminLoginAttempt.attempt_key.in_(keys))
    ).all()

    active_locks = [
        attempt.locked_until
        for attempt in attempts
        if (attempt.locked_until is not None and attempt.locked_until > current_time)
    ]

    if not active_locks:
        return False, 0

    latest_lock = max(active_locks)

    remaining = int((latest_lock - current_time).total_seconds())

    return True, max(1, remaining)


def record_failed_login(
    db: Session,
    keys: list[str],
    *,
    now: datetime | None = None,
) -> None:
    """
    Atomically update persistent login failure counters.

    A separate bucket is maintained for the account and the source IP.
    """

    current_time = now or datetime.now(timezone.utc)

    if not keys:
        return

    window = timedelta(
        minutes=auth_settings.admin_login_attempt_window_minutes,
    )

    lockout = timedelta(
        minutes=auth_settings.admin_login_lockout_minutes,
    )

    insert_statement = (
        pg_insert(AdminLoginAttempt)
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
        .on_conflict_do_nothing(index_elements=[AdminLoginAttempt.attempt_key])
    )

    db.execute(insert_statement)

    attempts = db.scalars(
        select(AdminLoginAttempt)
        .where(AdminLoginAttempt.attempt_key.in_(keys))
        .order_by(AdminLoginAttempt.attempt_key)
        .with_for_update()
    ).all()

    for attempt in attempts:
        window_expired = attempt.window_started_at <= current_time - window

        if window_expired:
            attempt.failure_count = 1
            attempt.window_started_at = current_time
            attempt.locked_until = None
        else:
            attempt.failure_count += 1

        if attempt.failure_count >= auth_settings.admin_login_max_attempts:
            attempt.locked_until = current_time + lockout

        attempt.updated_at = current_time

    db.commit()


def reset_login_attempts(
    db: Session,
    keys: list[str],
) -> None:
    """
    Clear account and IP failure counters following successful login.
    """

    if not keys:
        return

    db.execute(delete(AdminLoginAttempt).where(AdminLoginAttempt.attempt_key.in_(keys)))
