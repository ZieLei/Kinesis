"""Add persistent activity events.

Revision ID: f3b7e6c2a910
Revises: e520dc4a497d
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "f3b7e6c2a910"
down_revision = "e520dc4a497d"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "activity_events",
        sa.Column(
            "id",
            sa.Integer(),
            primary_key=True,
            nullable=False,
        ),
        sa.Column(
            "event_type",
            sa.String(length=64),
            nullable=False,
        ),
        sa.Column(
            "severity",
            sa.String(length=16),
            server_default="info",
            nullable=False,
        ),
        sa.Column(
            "actor_type",
            sa.String(length=24),
            server_default="system",
            nullable=False,
        ),
        sa.Column(
            "actor_id",
            sa.String(length=64),
            nullable=True,
        ),
        sa.Column(
            "actor_name",
            sa.String(length=100),
            nullable=True,
        ),
        sa.Column(
            "cashier_id",
            sa.String(length=64),
            nullable=True,
        ),
        sa.Column(
            "terminal_id",
            sa.Integer(),
            nullable=True,
        ),
        sa.Column(
            "summary",
            sa.String(length=250),
            nullable=False,
        ),
        sa.Column(
            "details",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
    )

    op.create_index(
        "ix_activity_events_created_at_id",
        "activity_events",
        ["created_at", "id"],
    )

    op.create_index(
        "ix_activity_events_event_type",
        "activity_events",
        ["event_type"],
    )

    op.create_index(
        "ix_activity_events_terminal_id",
        "activity_events",
        ["terminal_id"],
    )


def downgrade():
    op.drop_index(
        "ix_activity_events_terminal_id",
        table_name="activity_events",
    )

    op.drop_index(
        "ix_activity_events_event_type",
        table_name="activity_events",
    )

    op.drop_index(
        "ix_activity_events_created_at_id",
        table_name="activity_events",
    )

    op.drop_table("activity_events")
