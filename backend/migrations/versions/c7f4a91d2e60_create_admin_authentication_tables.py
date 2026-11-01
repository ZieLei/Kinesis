"""Create administrator authentication tables.

Revision ID: c7f4a91d2e60
Revises: 1fa8e89e2c8e
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c7f4a91d2e60"

down_revision: Union[str, Sequence[str], None] = "1fa8e89e2c8e"

branch_labels: Union[str, Sequence[str], None] = None

depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --------------------------------------------------
    # Administrator accounts
    # --------------------------------------------------

    op.create_table(
        "admin_users",
        sa.Column(
            "id",
            sa.Uuid(as_uuid=True),
            nullable=False,
        ),
        sa.Column(
            "username",
            sa.String(length=64),
            nullable=False,
        ),
        sa.Column(
            "password_hash",
            sa.String(length=255),
            nullable=False,
        ),
        sa.Column(
            "is_active",
            sa.Boolean(),
            server_default=sa.text("true"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "last_login_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "username",
            name="uq_admin_users_username",
        ),
    )

    # --------------------------------------------------
    # Administrator browser sessions
    # --------------------------------------------------

    op.create_table(
        "admin_sessions",
        sa.Column(
            "id",
            sa.Uuid(as_uuid=True),
            nullable=False,
        ),
        sa.Column(
            "admin_user_id",
            sa.Uuid(as_uuid=True),
            nullable=False,
        ),
        sa.Column(
            "session_token_hash",
            sa.String(length=64),
            nullable=False,
        ),
        sa.Column(
            "ip_address",
            sa.String(length=45),
            nullable=True,
        ),
        sa.Column(
            "user_agent",
            sa.String(length=512),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "last_seen_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "idle_expires_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column(
            "absolute_expires_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column(
            "revoked_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.CheckConstraint(
            "idle_expires_at <= absolute_expires_at",
            name="ck_admin_sessions_idle_not_after_absolute",
        ),
        sa.ForeignKeyConstraint(
            ["admin_user_id"],
            ["admin_users.id"],
            name="fk_admin_sessions_admin_user_id_admin_users",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "session_token_hash",
            name="uq_admin_sessions_token_hash",
        ),
    )

    op.create_index(
        "ix_admin_sessions_admin_user_id",
        "admin_sessions",
        ["admin_user_id"],
        unique=False,
    )

    op.create_index(
        "ix_admin_sessions_absolute_expires_at",
        "admin_sessions",
        ["absolute_expires_at"],
        unique=False,
    )

    # --------------------------------------------------
    # Persistent login rate limiting
    # --------------------------------------------------

    op.create_table(
        "admin_login_attempts",
        sa.Column(
            "attempt_key",
            sa.String(length=64),
            nullable=False,
        ),
        sa.Column(
            "failure_count",
            sa.Integer(),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column(
            "window_started_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "locked_until",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "failure_count >= 0",
            name="ck_admin_login_attempts_failure_count",
        ),
        sa.PrimaryKeyConstraint("attempt_key"),
    )


def downgrade() -> None:
    op.drop_table("admin_login_attempts")

    op.drop_index(
        "ix_admin_sessions_absolute_expires_at",
        table_name="admin_sessions",
    )

    op.drop_index(
        "ix_admin_sessions_admin_user_id",
        table_name="admin_sessions",
    )

    op.drop_table("admin_sessions")
    op.drop_table("admin_users")
