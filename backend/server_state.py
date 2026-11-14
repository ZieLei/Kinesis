"""
Server-wide state that must survive restarts: today, maintenance mode.

One row (id 1). Maintenance mode puts every POS terminal in the same
read-only state as a terminal switched to maintenance individually
(see terminal_routes.require_writable_terminal and the heartbeat), while the
administrator console keeps working.
"""

from datetime import datetime, timezone

from sqlalchemy import Boolean, CheckConstraint, DateTime, Integer, String, text
from sqlalchemy.orm import Mapped, Session, mapped_column, object_session

from database import Base


class ServerState(Base):
    __tablename__ = "server_state"

    __table_args__ = (CheckConstraint("id = 1", name="ck_server_state_singleton"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1, server_default=text("1"))

    maintenance_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )

    maintenance_changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    maintenance_changed_by: Mapped[str | None] = mapped_column(String(100), nullable=True)


def get_server_state(db: Session) -> ServerState | None:
    return db.get(ServerState, 1)


def is_global_maintenance(db: Session | None) -> bool:
    if db is None:
        return False

    state = get_server_state(db)

    return bool(state and state.maintenance_enabled)


def effective_maintenance(terminal) -> bool:
    """True when the terminal, or the whole server, is in maintenance."""

    return bool(terminal.maintenance_mode) or is_global_maintenance(object_session(terminal))


def set_global_maintenance(db: Session, enabled: bool, changed_by: str | None) -> ServerState:
    state = get_server_state(db)

    if state is None:
        state = ServerState(id=1)
        db.add(state)

    state.maintenance_enabled = enabled
    state.maintenance_changed_at = datetime.now(timezone.utc)
    state.maintenance_changed_by = changed_by

    return state
