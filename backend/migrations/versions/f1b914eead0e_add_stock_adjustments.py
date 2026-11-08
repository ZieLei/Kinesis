"""add stock adjustments

Append-only record of manual stock changes that are neither purchases nor
sales (write-offs, disposal, stock-count corrections), each with a reason
and the actor who made it. Only adds a table; existing rows are untouched.

Downgrade refuses to drop the table while it holds records, because that
would erase the audit trail for stock changes already applied.

Revision ID: f1b914eead0e
Revises: e004e9b64dcb
Create Date: 2026-11-07 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f1b914eead0e"
down_revision: Union[str, Sequence[str], None] = "e004e9b64dcb"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "stock_adjustments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "product_id",
            sa.Integer(),
            sa.ForeignKey("products.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("product_name", sa.String(length=150), nullable=False),
        sa.Column("sku", sa.String(length=64), nullable=True),
        sa.Column("quantity_change", sa.Integer(), nullable=False),
        sa.Column("stock_before", sa.Integer(), nullable=False),
        sa.Column("stock_after", sa.Integer(), nullable=False),
        sa.Column("reason", sa.String(length=32), nullable=False),
        sa.Column("note", sa.String(length=500), nullable=True),
        sa.Column("actor_type", sa.String(length=24), nullable=False),
        sa.Column("actor_id", sa.String(length=64), nullable=True),
        sa.Column("actor_name", sa.String(length=100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "quantity_change <> 0",
            name="ck_stock_adjustments_quantity_nonzero",
        ),
        sa.CheckConstraint(
            "stock_after = stock_before + quantity_change",
            name="ck_stock_adjustments_arithmetic",
        ),
        sa.CheckConstraint(
            "reason IN ('damaged', 'lost', 'expired', 'count_correction', 'other')",
            name="ck_stock_adjustments_reason",
        ),
        sa.CheckConstraint(
            "reason <> 'other' OR note IS NOT NULL",
            name="ck_stock_adjustments_other_needs_note",
        ),
    )

    op.create_index(
        "ix_stock_adjustments_product_id", "stock_adjustments", ["product_id"]
    )
    op.create_index(
        "ix_stock_adjustments_created_at", "stock_adjustments", ["created_at"]
    )


def downgrade() -> None:
    recorded = op.get_bind().execute(
        sa.text("SELECT count(*) FROM stock_adjustments")
    ).scalar_one()

    if recorded:
        raise RuntimeError(
            f"Refusing to downgrade: {recorded} stock adjustment record(s) "
            "would be deleted. Back them up and remove them first."
        )

    op.drop_index("ix_stock_adjustments_created_at", table_name="stock_adjustments")
    op.drop_index("ix_stock_adjustments_product_id", table_name="stock_adjustments")
    op.drop_table("stock_adjustments")
