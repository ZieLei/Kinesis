"""add administrator two-factor authentication

Adds the encrypted TOTP secret columns to admin_users and the single-use
admin_recovery_codes table. Existing administrators are unaffected until
they enrol.

Revision ID: e5a7c9d1f324
Revises: d4f6b8c0e213
Create Date: 2026-11-10 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e5a7c9d1f324"
down_revision: Union[str, Sequence[str], None] = "d4f6b8c0e213"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("admin_users", sa.Column("totp_secret_enc", sa.String(255), nullable=True))
    op.add_column(
        "admin_users",
        sa.Column("totp_enabled_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column("admin_users", sa.Column("totp_last_step", sa.BigInteger(), nullable=True))

    op.create_table(
        "admin_recovery_codes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "admin_user_id",
            sa.Uuid(),
            sa.ForeignKey("admin_users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("code_hash", sa.String(64), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_admin_recovery_codes_admin_user_id", "admin_recovery_codes", ["admin_user_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_admin_recovery_codes_admin_user_id", table_name="admin_recovery_codes")
    op.drop_table("admin_recovery_codes")
    op.drop_column("admin_users", "totp_last_step")
    op.drop_column("admin_users", "totp_enabled_at")
    op.drop_column("admin_users", "totp_secret_enc")
