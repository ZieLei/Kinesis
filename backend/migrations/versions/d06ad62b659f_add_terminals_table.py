"""add terminals table

Revision ID: d06ad62b659f
Revises: ef71510766e0
Create Date: 2026-10-27 15:31:29.108841
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# Revision identifiers used by Alembic.
revision: str = "d06ad62b659f"
down_revision: Union[str, Sequence[str], None] = "ef71510766e0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create the terminals table."""
    op.create_table(
        "terminals",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("device_id", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("device_type", sa.String(length=60), nullable=False),
        sa.Column("platform", sa.String(length=32), nullable=False),
        sa.Column("app_version", sa.String(length=50), nullable=True),
        sa.Column("ip_address", sa.String(length=45), nullable=True),
        sa.Column("session_token_hash", sa.String(length=64), nullable=False),
        sa.Column(
            "is_enabled",
            sa.Boolean(),
            server_default=sa.text("true"),
            nullable=False,
        ),
        sa.Column(
            "maintenance_mode",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
        sa.Column(
            "first_seen_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "last_seen_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "last_sync_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index(
        op.f("ix_terminals_device_id"),
        "terminals",
        ["device_id"],
        unique=True,
    )
    op.create_index(
        op.f("ix_terminals_last_seen_at"),
        "terminals",
        ["last_seen_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_terminals_session_token_hash"),
        "terminals",
        ["session_token_hash"],
        unique=True,
    )


def downgrade() -> None:
    """Drop the terminals table."""
    op.drop_index(
        op.f("ix_terminals_session_token_hash"),
        table_name="terminals",
    )
    op.drop_index(
        op.f("ix_terminals_last_seen_at"),
        table_name="terminals",
    )
    op.drop_index(
        op.f("ix_terminals_device_id"),
        table_name="terminals",
    )
    op.drop_table("terminals")
