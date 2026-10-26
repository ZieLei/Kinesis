"""add product sku

Revision ID: 84a576031f6e
Revises: 2c17d18c3203
Create Date: 2026-10-26 15:42:30.537975
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "84a576031f6e"
down_revision: Union[str, Sequence[str], None] = "2c17d18c3203"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "products",
        sa.Column("sku", sa.String(length=64), nullable=True),
    )
    op.create_unique_constraint(
        "uq_products_sku",
        "products",
        ["sku"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_products_sku",
        "products",
        type_="unique",
    )
    op.drop_column("products", "sku")
