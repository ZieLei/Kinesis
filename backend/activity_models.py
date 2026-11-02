from sqlalchemy import DateTime, Index, Integer, String, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class ActivityEvent(Base):
    __tablename__ = "activity_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    event_type: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
    )

    severity: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default="info",
        server_default="info",
    )

    actor_type: Mapped[str] = mapped_column(
        String(24),
        nullable=False,
        default="system",
        server_default="system",
    )

    actor_id: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
    )

    actor_name: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    cashier_id: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
    )

    terminal_id: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    summary: Mapped[str] = mapped_column(
        String(250),
        nullable=False,
    )

    details: Mapped[dict] = mapped_column(
        JSONB,
        nullable=False,
        default=dict,
        server_default=text("'{}'::jsonb"),
    )

    created_at: Mapped[object] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("NOW()"),
    )

    __table_args__ = (
        Index(
            "ix_activity_events_created_at_id",
            "created_at",
            "id",
        ),
        Index(
            "ix_activity_events_event_type",
            "event_type",
        ),
        Index(
            "ix_activity_events_terminal_id",
            "terminal_id",
        ),
    )
