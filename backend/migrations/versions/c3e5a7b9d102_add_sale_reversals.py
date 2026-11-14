"""add sale reversals (void / refund)

Adds sale_reversals, one row per fully voided or refunded sale, and allows
the 'sale_reversal' reason on stock_adjustments so restocked units appear in
the stock history. Original sales are untouched; existing rows are preserved.

Downgrade refuses to run while reversals exist, because dropping the table
would erase the record of why completed sales were cancelled.

Revision ID: c3e5a7b9d102
Revises: f1b914eead0e
Create Date: 2026-11-10 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c3e5a7b9d102"
down_revision: Union[str, Sequence[str], None] = "f1b914eead0e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

OLD_REASONS = "reason IN ('damaged', 'lost', 'expired', 'count_correction', 'other')"
NEW_REASONS = (
    "reason IN ('damaged', 'lost', 'expired', 'count_correction', "
    "'other', 'sale_reversal')"
)


def upgrade() -> None:
    op.create_table(
        "sale_reversals",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "sale_id",
            sa.Integer(),
            sa.ForeignKey("sales.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("transaction_code", sa.String(length=32), nullable=False),
        sa.Column("kind", sa.String(length=10), nullable=False),
        sa.Column("reason_code", sa.String(length=32), nullable=False),
        sa.Column("note", sa.String(length=500), nullable=True),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column(
            "restocked", sa.Boolean(), nullable=False, server_default=sa.text("true")
        ),
        sa.Column(
            "requested_by",
            sa.Uuid(),
            sa.ForeignKey(
                "cashiers.id",
                ondelete="SET NULL",
                name="fk_sale_reversals_requested_by_cashiers",
            ),
            nullable=True,
        ),
        sa.Column("requested_by_username", sa.String(length=64), nullable=True),
        sa.Column(
            "authorized_by",
            sa.Uuid(),
            sa.ForeignKey(
                "cashiers.id",
                ondelete="SET NULL",
                name="fk_sale_reversals_authorized_by_cashiers",
            ),
            nullable=True,
        ),
        sa.Column("authorized_by_username", sa.String(length=64), nullable=False),
        sa.Column(
            "terminal_id",
            sa.Integer(),
            sa.ForeignKey(
                "terminals.id",
                ondelete="SET NULL",
                name="fk_sale_reversals_terminal_id_terminals",
            ),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("kind IN ('void', 'refund')", name="ck_sale_reversals_kind"),
        sa.CheckConstraint(
            "reason_code IN ('customer_changed_mind', 'wrong_item', "
            "'cashier_error', 'defective_item', 'duplicate_sale', "
            "'pricing_dispute', 'other')",
            name="ck_sale_reversals_reason",
        ),
        sa.CheckConstraint(
            "reason_code <> 'other' OR note IS NOT NULL",
            name="ck_sale_reversals_other_needs_note",
        ),
        sa.CheckConstraint("amount >= 0", name="ck_sale_reversals_amount_nonnegative"),
        sa.UniqueConstraint("sale_id", name="uq_sale_reversals_sale_id"),
    )
    op.create_index("ix_sale_reversals_created_at", "sale_reversals", ["created_at"])

    op.drop_constraint("ck_stock_adjustments_reason", "stock_adjustments", type_="check")
    op.create_check_constraint(
        "ck_stock_adjustments_reason", "stock_adjustments", NEW_REASONS
    )


def downgrade() -> None:
    connection = op.get_bind()

    if connection.execute(sa.text("SELECT 1 FROM sale_reversals LIMIT 1")).first():
        raise RuntimeError(
            "Refusing to drop sale_reversals: it holds void/refund records."
        )

    if connection.execute(
        sa.text("SELECT 1 FROM stock_adjustments WHERE reason = 'sale_reversal' LIMIT 1")
    ).first():
        raise RuntimeError(
            "Refusing to downgrade: stock_adjustments holds sale_reversal rows."
        )

    op.drop_constraint("ck_stock_adjustments_reason", "stock_adjustments", type_="check")
    op.create_check_constraint(
        "ck_stock_adjustments_reason", "stock_adjustments", OLD_REASONS
    )
    op.drop_index("ix_sale_reversals_created_at", table_name="sale_reversals")
    op.drop_table("sale_reversals")
