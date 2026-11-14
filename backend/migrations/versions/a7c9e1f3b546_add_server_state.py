"""add server state (global maintenance mode)

Adds the single-row server_state table. Maintenance mode is off until an
administrator turns it on, so existing installations behave as before.

Revision ID: a7c9e1f3b546
Revises: f6b8d0e2a435
Create Date: 2026-11-14 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a7c9e1f3b546"
down_revision: Union[str, Sequence[str], None] = "f6b8d0e2a435"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "server_state",
        sa.Column("id", sa.Integer(), server_default=sa.text("1"), nullable=False),
        sa.Column("maintenance_enabled", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("maintenance_changed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("maintenance_changed_by", sa.String(length=100), nullable=True),
        sa.CheckConstraint("id = 1", name="ck_server_state_singleton"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.execute("INSERT INTO server_state (id) VALUES (1)")


def downgrade() -> None:
    op.drop_table("server_state")
