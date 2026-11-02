"""Add service sales, inventory costing, receipts, and stockout history.

Revision ID: b91d5e7a4c20
Revises: f3b7e6c2a910
"""

from alembic import op
import sqlalchemy as sa


revision = "b91d5e7a4c20"
down_revision = "f3b7e6c2a910"
branch_labels = None
depends_on = None


def upgrade():
    # Current weighted-average product cost.
    op.add_column(
        "products",
        sa.Column("average_cost", sa.Numeric(12, 4), nullable=True),
    )

    op.create_check_constraint(
        "ck_products_average_cost_nonnegative",
        "products",
        "average_cost IS NULL OR average_cost >= 0",
    )

    # Estimated cost for labor and materials per service.
    op.add_column(
        "services",
        sa.Column("estimated_cost", sa.Numeric(12, 4), nullable=True),
    )

    op.create_check_constraint(
        "ck_services_estimated_cost_nonnegative",
        "services",
        "estimated_cost IS NULL OR estimated_cost >= 0",
    )

    # Historical product cost snapshot.
    op.add_column(
        "sale_items",
        sa.Column("unit_cost", sa.Numeric(12, 4), nullable=True),
    )

    op.create_check_constraint(
        "ck_sale_items_unit_cost_nonnegative",
        "sale_items",
        "unit_cost IS NULL OR unit_cost >= 0",
    )

    # Services sold as part of a normal sale.
    op.create_table(
        "sale_service_items",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column(
            "sale_id",
            sa.Integer(),
            sa.ForeignKey("sales.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "service_id",
            sa.Integer(),
            sa.ForeignKey("services.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("service_name", sa.String(length=80), nullable=False),
        sa.Column(
            "description",
            sa.String(length=300),
            server_default="",
            nullable=False,
        ),
        sa.Column("unit_price", sa.Numeric(10, 2), nullable=False),
        sa.Column("unit_cost", sa.Numeric(12, 4), nullable=True),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("line_total", sa.Numeric(12, 2), nullable=False),
        sa.CheckConstraint(
            "quantity > 0",
            name="ck_sale_service_items_quantity_positive",
        ),
        sa.CheckConstraint(
            "unit_price >= 0",
            name="ck_sale_service_items_unit_price_nonnegative",
        ),
        sa.CheckConstraint(
            "unit_cost IS NULL OR unit_cost >= 0",
            name="ck_sale_service_items_unit_cost_nonnegative",
        ),
        sa.CheckConstraint(
            "line_total >= 0",
            name="ck_sale_service_items_line_total_nonnegative",
        ),
    )

    op.create_index(
        "ix_sale_service_items_sale_id",
        "sale_service_items",
        ["sale_id"],
    )

    op.create_index(
        "ix_sale_service_items_service_id",
        "sale_service_items",
        ["service_id"],
    )

    # Inventory receipt header.
    op.create_table(
        "inventory_receipts",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("reference_number", sa.String(length=80), nullable=True),
        sa.Column("supplier_name", sa.String(length=150), nullable=True),
        sa.Column("notes", sa.String(length=500), nullable=True),
        sa.Column(
            "total_cost",
            sa.Numeric(14, 2),
            server_default="0.00",
            nullable=False,
        ),
        sa.Column(
            "received_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
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
        "ix_inventory_receipts_reference_number",
        "inventory_receipts",
        ["reference_number"],
    )

    op.create_index(
        "ix_inventory_receipts_received_at",
        "inventory_receipts",
        ["received_at"],
    )

    # Receipt line items retain product names and purchase costs even
    # if the product is renamed or later deleted.
    op.create_table(
        "inventory_receipt_items",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column(
            "receipt_id",
            sa.Integer(),
            sa.ForeignKey("inventory_receipts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "product_id",
            sa.Integer(),
            sa.ForeignKey("products.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("product_name", sa.String(length=150), nullable=False),
        sa.Column("sku", sa.String(length=64), nullable=True),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("unit_cost", sa.Numeric(12, 4), nullable=False),
        sa.Column("line_total", sa.Numeric(14, 2), nullable=False),
        sa.CheckConstraint(
            "quantity > 0",
            name="ck_inventory_receipt_items_quantity_positive",
        ),
        sa.CheckConstraint(
            "unit_cost >= 0",
            name="ck_inventory_receipt_items_unit_cost_nonnegative",
        ),
        sa.CheckConstraint(
            "line_total >= 0",
            name="ck_inventory_receipt_items_line_total_nonnegative",
        ),
    )

    op.create_index(
        "ix_inventory_receipt_items_receipt_id",
        "inventory_receipt_items",
        ["receipt_id"],
    )

    op.create_index(
        "ix_inventory_receipt_items_product_id",
        "inventory_receipt_items",
        ["product_id"],
    )

    # Stockout intervals begin when stock reaches zero and end when
    # the product becomes available again.
    op.create_table(
        "stockout_periods",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column(
            "product_id",
            sa.Integer(),
            sa.ForeignKey("products.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("product_name", sa.String(length=150), nullable=False),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "ended_at IS NULL OR ended_at >= started_at",
            name="ck_stockout_periods_valid_dates",
        ),
    )

    op.create_index(
        "ix_stockout_periods_product_id",
        "stockout_periods",
        ["product_id"],
    )

    op.create_index(
        "ix_stockout_periods_started_at",
        "stockout_periods",
        ["started_at"],
    )

    op.create_index(
        "ix_stockout_periods_ended_at",
        "stockout_periods",
        ["ended_at"],
    )


def downgrade():
    op.drop_index(
        "ix_stockout_periods_ended_at",
        table_name="stockout_periods",
    )
    op.drop_index(
        "ix_stockout_periods_started_at",
        table_name="stockout_periods",
    )
    op.drop_index(
        "ix_stockout_periods_product_id",
        table_name="stockout_periods",
    )
    op.drop_table("stockout_periods")

    op.drop_index(
        "ix_inventory_receipt_items_product_id",
        table_name="inventory_receipt_items",
    )
    op.drop_index(
        "ix_inventory_receipt_items_receipt_id",
        table_name="inventory_receipt_items",
    )
    op.drop_table("inventory_receipt_items")

    op.drop_index(
        "ix_inventory_receipts_received_at",
        table_name="inventory_receipts",
    )
    op.drop_index(
        "ix_inventory_receipts_reference_number",
        table_name="inventory_receipts",
    )
    op.drop_table("inventory_receipts")

    op.drop_index(
        "ix_sale_service_items_service_id",
        table_name="sale_service_items",
    )
    op.drop_index(
        "ix_sale_service_items_sale_id",
        table_name="sale_service_items",
    )
    op.drop_table("sale_service_items")

    op.drop_constraint(
        "ck_sale_items_unit_cost_nonnegative",
        "sale_items",
        type_="check",
    )
    op.drop_column("sale_items", "unit_cost")

    op.drop_constraint(
        "ck_services_estimated_cost_nonnegative",
        "services",
        type_="check",
    )
    op.drop_column("services", "estimated_cost")

    op.drop_constraint(
        "ck_products_average_cost_nonnegative",
        "products",
        type_="check",
    )
    op.drop_column("products", "average_cost")
