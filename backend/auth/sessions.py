from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

from fastapi import Request
from sqlalchemy import select, update
from sqlalchemy.orm import Session, joinedload

from admin_models import AdminSession, AdminUser
from auth.config import auth_settings
from auth.security import (
    derive_csrf_token,
    generate_secret,
    hash_secret,
)


@dataclass(frozen=True, slots=True)
class CreatedAdminSession:
    record: AdminSession
    session_token: str
    csrf_token: str


def create_admin_session(
    db: Session,
    admin: AdminUser,
    request: Request,
) -> CreatedAdminSession:
    """
    Create a new administrator session.

    Only the token digest is stored in PostgreSQL.
    The raw session token is returned for the HttpOnly cookie.
    """

    now = datetime.now(timezone.utc)

    session_id = uuid4()
    raw_token = generate_secret()

    absolute_expiration = now + timedelta(
        hours=auth_settings.admin_session_absolute_hours,
    )

    idle_expiration = min(
        now
        + timedelta(
            minutes=auth_settings.admin_session_idle_minutes,
        ),
        absolute_expiration,
    )

    client_ip = request.client.host[:45] if request.client is not None else None

    user_agent = request.headers.get("user-agent")

    if user_agent is not None:
        user_agent = user_agent[:512]

    record = AdminSession(
        id=session_id,
        admin_user_id=admin.id,
        session_token_hash=hash_secret(raw_token),
        ip_address=client_ip,
        user_agent=user_agent,
        created_at=now,
        last_seen_at=now,
        idle_expires_at=idle_expiration,
        absolute_expires_at=absolute_expiration,
    )

    db.add(record)

    return CreatedAdminSession(
        record=record,
        session_token=raw_token,
        csrf_token=derive_csrf_token(session_id),
    )


def resolve_admin_session(
    db: Session,
    raw_token: str | None,
    *,
    now: datetime | None = None,
) -> AdminSession | None:
    """
    Resolve a browser session against PostgreSQL.

    Expired, revoked, and inactive-user sessions are rejected.

    Idle expiration is extended only at the configured touch interval
    to avoid writing to PostgreSQL on every request.
    """

    if not raw_token or len(raw_token) > 256:
        return None

    current_time = now or datetime.now(timezone.utc)

    session_record = db.scalar(
        select(AdminSession)
        .options(
            joinedload(AdminSession.admin_user),
        )
        .where(
            AdminSession.session_token_hash == hash_secret(raw_token),
        )
    )

    if session_record is None:
        return None

    if session_record.revoked_at is not None:
        return None

    expired = (
        session_record.idle_expires_at <= current_time
        or session_record.absolute_expires_at <= current_time
    )

    inactive = not session_record.admin_user.is_active

    if expired or inactive:
        session_record.revoked_at = current_time
        db.commit()

        return None

    touch_interval = timedelta(
        seconds=auth_settings.admin_session_touch_interval_seconds,
    )

    if current_time - session_record.last_seen_at >= touch_interval:
        session_record.last_seen_at = current_time

        session_record.idle_expires_at = min(
            current_time
            + timedelta(
                minutes=auth_settings.admin_session_idle_minutes,
            ),
            session_record.absolute_expires_at,
        )

        db.commit()

    return session_record


def revoke_admin_session(
    db: Session,
    session_record: AdminSession,
) -> None:
    """
    Mark one administrator session as revoked.

    The caller is responsible for committing the transaction.
    """

    if session_record.revoked_at is None:
        session_record.revoked_at = datetime.now(timezone.utc)


def revoke_all_admin_sessions(
    db: Session,
    admin_user_id: UUID,
    *,
    now: datetime | None = None,
) -> int:
    """
    Revoke every active browser session belonging to an administrator.

    The caller is responsible for committing the transaction.
    """

    current_time = now or datetime.now(timezone.utc)

    result = db.execute(
        update(AdminSession)
        .where(
            AdminSession.admin_user_id == admin_user_id,
            AdminSession.revoked_at.is_(None),
        )
        .values(
            revoked_at=current_time,
        )
    )

    return int(result.rowcount or 0)
