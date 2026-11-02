"""Add supervisor roles and discount accounting.

Revision ID: d64f21b8a903
Revises: b91d5e7a4c20
"""

from alembic import op
import sqlalchemy as sa


revision = "d64f21b8a903"
down_revision = "b91d5e7a4c20"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --------------------------------------------------
    # Supervisor designation
    # --------------------------------------------------

    op.add_column(
        "cashiers",
        sa.Column(
            "is_supervisor",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )

    # --------------------------------------------------
    # Sale-level discount accounting
    # --------------------------------------------------

    op.add_column(
        "sales",
        sa.Column(
            "gross_subtotal",
            sa.Numeric(12, 2),
            nullable=True,
        ),
    )

    op.execute(
        """
        UPDATE sales
        SET gross_subtotal = subtotal
        WHERE gross_subtotal IS NULL
        """
    )

    op.alter_column(
        "sales",
        "gross_subtotal",
        existing_type=sa.Numeric(12, 2),
        nullable=False,
        server_default=sa.text("0.00"),
    )

    op.add_column(
        "sales",
        sa.Column(
            "discount_amount",
            sa.Numeric(12, 2),
            nullable=False,
            server_default=sa.text("0.00"),
        ),
    )

    op.add_column(
        "sales",
        sa.Column(
            "discount_percent",
            sa.Numeric(5, 2),
            nullable=False,
            server_default=sa.text("0.00"),
        ),
    )

    op.add_column(
        "sales",
        sa.Column(
            "discount_authorized_by",
            sa.Uuid(),
            nullable=True,
        ),
    )

    op.add_column(
        "sales",
        sa.Column(
            "discount_authorized_username",
            sa.String(length=64),
            nullable=True,
        ),
    )

    op.create_foreign_key(
        "fk_sales_discount_authorized_by_cashiers",
        "sales",
        "cashiers",
        ["discount_authorized_by"],
        ["id"],
        ondelete="SET NULL",
    )

    op.create_index(
        "ix_sales_discount_authorized_by",
        "sales",
        ["discount_authorized_by"],
        unique=False,
    )

    op.create_check_constraint(
        "ck_sales_gross_subtotal_nonnegative",
        "sales",
        "gross_subtotal >= 0",
    )

    op.create_check_constraint(
        "ck_sales_discount_amount_nonnegative",
        "sales",
        "discount_amount >= 0",
    )

    op.create_check_constraint(
        "ck_sales_discount_not_above_gross_subtotal",
        "sales",
        "discount_amount <= gross_subtotal",
    )

    op.create_check_constraint(
        "ck_sales_discount_percent_range",
        "sales",
        "discount_percent >= 0 AND discount_percent <= 100",
    )

    # --------------------------------------------------
    # Per-line discount allocation
    # --------------------------------------------------

    op.add_column(
        "sale_items",
        sa.Column(
            "discount_amount",
            sa.Numeric(12, 2),
            nullable=False,
            server_default=sa.text("0.00"),
        ),
    )

    op.create_check_constraint(
        "ck_sale_items_discount_amount_nonnegative",
        "sale_items",
        "discount_amount >= 0",
    )

    op.add_column(
        "sale_service_items",
        sa.Column(
            "discount_amount",
            sa.Numeric(12, 2),
            nullable=False,
            server_default=sa.text("0.00"),
        ),
    )

    op.create_check_constraint(
        "ck_sale_service_items_discount_amount_nonnegative",
        "sale_service_items",
        "discount_amount >= 0",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_sale_service_items_discount_amount_nonnegative",
        "sale_service_items",
        type_="check",
    )

    op.drop_column(
        "sale_service_items",
        "discount_amount",
    )

    op.drop_constraint(
        "ck_sale_items_discount_amount_nonnegative",
        "sale_items",
        type_="check",
    )

    op.drop_column(
        "sale_items",
        "discount_amount",
    )

    op.drop_constraint(
        "ck_sales_discount_percent_range",
        "sales",
        type_="check",
    )

    op.drop_constraint(
        "ck_sales_discount_not_above_gross_subtotal",
        "sales",
        type_="check",
    )

    op.drop_constraint(
        "ck_sales_discount_amount_nonnegative",
        "sales",
        type_="check",
    )

    op.drop_constraint(
        "ck_sales_gross_subtotal_nonnegative",
        "sales",
        type_="check",
    )

    op.drop_index(
        "ix_sales_discount_authorized_by",
        table_name="sales",
    )

    op.drop_constraint(
        "fk_sales_discount_authorized_by_cashiers",
        "sales",
        type_="foreignkey",
    )

    op.drop_column(
        "sales",
        "discount_authorized_username",
    )

    op.drop_column(
        "sales",
        "discount_authorized_by",
    )

    op.drop_column(
        "sales",
        "discount_percent",
    )

    op.drop_column(
        "sales",
        "discount_amount",
    )

    op.drop_column(
        "sales",
        "gross_subtotal",
    )

    op.drop_column(
        "cashiers",
        "is_supervisor",
    )
