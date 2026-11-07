"""add product archiving

Products referenced by history are archived instead of deleted:
- products.archived_at (NULL = active) plus a partial index of active rows
- sale_items, inventory_receipt_items and stockout_periods now RESTRICT
  deleting a referenced product instead of silently clearing the link

Existing rows are not modified. Lines whose product was already deleted
keep product_id NULL; RESTRICT never applies to NULL references.

Downgrade refuses to run while any product is archived, because removing
archived_at would silently make those products active and sellable again.

Revision ID: e004e9b64dcb
Revises: a7c3e91f4b20
Create Date: 2026-11-07 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e004e9b64dcb"
down_revision: Union[str, Sequence[str], None] = "a7c3e91f4b20"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# (table, constraint name). Names are unchanged so the ORM models and
# existing tooling keep referring to the same constraints.
PRODUCT_FOREIGN_KEYS = (
    ("sale_items", "sale_items_product_id_fkey"),
    ("inventory_receipt_items", "inventory_receipt_items_product_id_fkey"),
    ("stockout_periods", "stockout_periods_product_id_fkey"),
)

ACTIVE_PRODUCTS_INDEX = "ix_products_active"


def _replace_product_foreign_keys(ondelete: str) -> None:
    for table, name in PRODUCT_FOREIGN_KEYS:
        op.drop_constraint(name, table, type_="foreignkey")
        op.create_foreign_key(
            name,
            table,
            "products",
            ["product_id"],
            ["id"],
            ondelete=ondelete,
        )


def upgrade() -> None:
    op.add_column(
        "products",
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_index(
        ACTIVE_PRODUCTS_INDEX,
        "products",
        ["id"],
        postgresql_where=sa.text("archived_at IS NULL"),
    )

    _replace_product_foreign_keys("RESTRICT")


def downgrade() -> None:
    archived = op.get_bind().execute(
        sa.text("SELECT count(*) FROM products WHERE archived_at IS NOT NULL")
    ).scalar_one()

    if archived:
        raise RuntimeError(
            f"Refusing to downgrade: {archived} archived product(s) would "
            "become active and sellable again. Restore or permanently "
            "remove them first."
        )

    _replace_product_foreign_keys("SET NULL")

    op.drop_index(ACTIVE_PRODUCTS_INDEX, table_name="products")
    op.drop_column("products", "archived_at")
