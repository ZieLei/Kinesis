"""add terminal credential lifecycle

Adds credential rotation, reuse detection and revocation support:
- session_token_hash becomes nullable (NULL = revoked, re-pair required)
- pending/previous token hashes for rotation with a grace period
- token_rotated_at and paired_at timestamps

Revision ID: a7c3e91f4b20
Revises: d64f21b8a903
Create Date: 2026-11-07 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a7c3e91f4b20"
down_revision: Union[str, Sequence[str], None] = "d64f21b8a903"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "terminals",
        "session_token_hash",
        existing_type=sa.String(length=64),
        nullable=True,
    )

    op.add_column(
        "terminals",
        sa.Column("pending_token_hash", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "terminals",
        sa.Column("previous_token_hash", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "terminals",
        sa.Column(
            "previous_token_valid_until",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.add_column(
        "terminals",
        sa.Column(
            "token_rotated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.add_column(
        "terminals",
        sa.Column(
            "paired_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )

    # Existing credentials were issued at pairing time.
    op.execute(
        "UPDATE terminals SET token_rotated_at = first_seen_at, "
        "paired_at = first_seen_at"
    )

    # Terminals that are currently disabled keep their old credential under
    # the previous model. Revoke them so re-enabling requires re-pairing.
    op.execute(
        "UPDATE terminals SET session_token_hash = NULL WHERE is_enabled = false"
    )

    op.create_index(
        op.f("ix_terminals_pending_token_hash"),
        "terminals",
        ["pending_token_hash"],
        unique=True,
    )
    op.create_index(
        op.f("ix_terminals_previous_token_hash"),
        "terminals",
        ["previous_token_hash"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_terminals_previous_token_hash"), table_name="terminals")
    op.drop_index(op.f("ix_terminals_pending_token_hash"), table_name="terminals")

    op.drop_column("terminals", "paired_at")
    op.drop_column("terminals", "token_rotated_at")
    op.drop_column("terminals", "previous_token_valid_until")
    op.drop_column("terminals", "previous_token_hash")
    op.drop_column("terminals", "pending_token_hash")

    # The old schema requires a credential. Give revoked terminals an
    # unusable placeholder digest (no known preimage) instead of deleting
    # rows that sales and activity history still reference.
    op.execute(
        "UPDATE terminals SET session_token_hash = "
        "md5(random()::text || clock_timestamp()::text || id::text) || "
        "md5(clock_timestamp()::text || random()::text || id::text) "
        "WHERE session_token_hash IS NULL"
    )

    op.alter_column(
        "terminals",
        "session_token_hash",
        existing_type=sa.String(length=64),
        nullable=False,
    )
