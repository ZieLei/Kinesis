"""add cashier session lock state

The terminal's inactivity lock used to exist only in the app's memory, so
reloading the page unlocked it. The server now records when the cashier was
last active and whether the session was locked, and refuses cashier requests
while it is locked until the cashier's PIN is verified again.

Existing sessions start unlocked with "last activity" set to now.

Revision ID: b8d0f2a4c657
Revises: a7c9e1f3b546
Create Date: 2026-11-14 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b8d0f2a4c657"
down_revision: Union[str, Sequence[str], None] = "a7c9e1f3b546"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "cashier_sessions",
        sa.Column("last_activity_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.add_column(
        "cashier_sessions",
        sa.Column("locked_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("cashier_sessions", "locked_at")
    op.drop_column("cashier_sessions", "last_activity_at")
