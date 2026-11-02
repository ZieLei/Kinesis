from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    Uuid,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Cashier(Base):
    """
    Employee account used to authenticate with a PIN on a POS terminal.

    PINs are never stored in plaintext. Only an Argon2id hash is stored.
    """

    __tablename__ = "cashiers"

    __table_args__ = (
        UniqueConstraint(
            "username",
            name="uq_cashiers_username",
        ),
        CheckConstraint(
            "length(trim(display_name)) > 0",
            name="ck_cashiers_display_name_nonempty",
        ),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )

    username: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
    )

    display_name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    pin_hash: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    is_supervisor: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("false"),
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=text("true"),
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        server_default=func.now(),
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        onupdate=utc_now,
        server_default=func.now(),
    )

    last_login_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    sessions: Mapped[list["CashierSession"]] = relationship(
        back_populates="cashier",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class CashierSession(Base):
    """
    A cashier's authenticated session on one registered POS terminal.

    Only the SHA-256 digest of the high-entropy session token is stored.
    A cashier may have sessions on multiple terminals, but each terminal
    may have only one unrevoked cashier session at a time.
    """

    __tablename__ = "cashier_sessions"

    __table_args__ = (
        UniqueConstraint(
            "session_token_hash",
            name="uq_cashier_sessions_token_hash",
        ),
        CheckConstraint(
            "idle_expires_at <= absolute_expires_at",
            name="ck_cashier_sessions_idle_not_after_absolute",
        ),
        Index(
            "uq_cashier_sessions_active_terminal",
            "terminal_id",
            unique=True,
            postgresql_where=text("revoked_at IS NULL"),
        ),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )

    cashier_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey(
            "cashiers.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    terminal_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey(
            "terminals.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    session_token_hash: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        server_default=func.now(),
    )

    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        server_default=func.now(),
    )

    idle_expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    absolute_expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        index=True,
    )

    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    cashier: Mapped["Cashier"] = relationship(
        back_populates="sessions",
    )


class CashierLoginAttempt(Base):
    """
    Persistent, opaque rate-limit buckets for cashier PIN authentication.

    Raw account identifiers, terminal identifiers, and IP addresses
    must not be stored in this table.
    """

    __tablename__ = "cashier_login_attempts"

    __table_args__ = (
        CheckConstraint(
            "failure_count >= 0",
            name="ck_cashier_login_attempts_failure_count",
        ),
    )

    attempt_key: Mapped[str] = mapped_column(
        String(64),
        primary_key=True,
    )

    failure_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default=text("0"),
    )

    window_started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        server_default=func.now(),
    )

    locked_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        onupdate=utc_now,
        server_default=func.now(),
    )
