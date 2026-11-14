"""add service archiving and unique active names

Adds archived_at and updated_at to services and a partial unique index so no
two active services share a name (case- and edge-space-insensitive).
Existing services stay active and unchanged.

The index creation fails, leaving the database untouched, if two active
services already share a name; rename one and run the migration again.

Downgrade refuses while archived services exist, because dropping archived_at
would silently put retired services back on sale.

Revision ID: f6b8d0e2a435
Revises: e5a7c9d1f324
Create Date: 2026-11-10 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f6b8d0e2a435"
down_revision: Union[str, Sequence[str], None] = "e5a7c9d1f324"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("services", sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "services",
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index(
        "uq_services_active_name",
        "services",
        [sa.text("lower(btrim(name))")],
        unique=True,
        postgresql_where=sa.text("archived_at IS NULL"),
    )


def downgrade() -> None:
    connection = op.get_bind()

    if connection.execute(sa.text("SELECT 1 FROM services WHERE archived_at IS NOT NULL LIMIT 1")).first():
        raise RuntimeError("Refusing to downgrade: archived services exist and would return to sale.")

    op.drop_index("uq_services_active_name", table_name="services")
    op.drop_column("services", "updated_at")
    op.drop_column("services", "archived_at")
