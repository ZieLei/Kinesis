from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    Uuid,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Product(Base):
    __tablename__ = "products"

    __table_args__ = (
        CheckConstraint(
            "average_cost IS NULL OR average_cost >= 0",
            name="ck_products_average_cost_nonnegative",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    sku: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    category: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    stock: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    how_much_sold: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    image_path: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Moving weighted-average acquisition cost.
    # NULL means the existing inventory has not been costed yet.
    average_cost: Mapped[Decimal | None] = mapped_column(
        Numeric(12, 4),
        nullable=True,
    )


class Service(Base):
    __tablename__ = "services"

    __table_args__ = (
        CheckConstraint("price >= 0", name="ck_services_price_nonnegative"),
        CheckConstraint(
            "estimated_cost IS NULL OR estimated_cost >= 0",
            name="ck_services_estimated_cost_nonnegative",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    description: Mapped[str] = mapped_column(
        String(300),
        nullable=False,
        default="",
        server_default="",
    )
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)

    # Estimated labor and materials cost per service.
    # NULL means the service has not been costed.
    estimated_cost: Mapped[Decimal | None] = mapped_column(
        Numeric(12, 4),
        nullable=True,
    )


class Sale(Base):
    __tablename__ = "sales"

    __table_args__ = (
        CheckConstraint("subtotal >= 0", name="ck_sales_subtotal_nonnegative"),
        CheckConstraint(
            "gross_subtotal >= 0",
            name="ck_sales_gross_subtotal_nonnegative",
        ),
        CheckConstraint(
            "discount_amount >= 0",
            name="ck_sales_discount_amount_nonnegative",
        ),
        CheckConstraint(
            "discount_amount <= gross_subtotal",
            name="ck_sales_discount_not_above_gross_subtotal",
        ),
        CheckConstraint(
            "discount_percent >= 0 AND discount_percent <= 100",
            name="ck_sales_discount_percent_range",
        ),
        CheckConstraint(
            "tax_amount >= 0",
            name="ck_sales_tax_amount_nonnegative",
        ),
        CheckConstraint("total >= 0", name="ck_sales_total_nonnegative"),
        CheckConstraint(
            "amount_tendered >= total",
            name="ck_sales_amount_tendered_covers_total",
        ),
        CheckConstraint("change_due >= 0", name="ck_sales_change_nonnegative"),
        UniqueConstraint("reference_number", name="sales_reference_number_key"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    transaction_code: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        unique=True,
        index=True,
    )

    payment_method: Mapped[str] = mapped_column(String(32), nullable=False)

    reference_number: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
    )

    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="completed",
        server_default="completed",
        index=True,
    )

    # Subtotal after discount, before tax.
    subtotal: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        nullable=False,
    )

    # Original subtotal before discount, before tax.
    gross_subtotal: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        nullable=False,
        default=Decimal("0.00"),
        server_default=text("0.00"),
    )

    discount_amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        nullable=False,
        default=Decimal("0.00"),
        server_default=text("0.00"),
    )

    discount_percent: Mapped[Decimal] = mapped_column(
        Numeric(5, 2),
        nullable=False,
        default=Decimal("0.00"),
        server_default=text("0.00"),
    )

    # Supervisor identity is captured for audit purposes.
    # Username remains available even if the account is later deleted.
    discount_authorized_by: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey(
            "cashiers.id",
            ondelete="SET NULL",
            name="fk_sales_discount_authorized_by_cashiers",
        ),
        nullable=True,
        index=True,
    )

    discount_authorized_username: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
    )

    tax_amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        nullable=False,
        default=Decimal("0.00"),
        server_default=text("0.00"),
    )

    total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)

    amount_tendered: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        nullable=False,
    )

    change_due: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        nullable=False,
        default=Decimal("0.00"),
    )

    cashier_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey(
            "cashiers.id",
            ondelete="SET NULL",
            name="fk_sales_cashier_id_cashiers",
        ),
        nullable=True,
        index=True,
    )

    terminal_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey(
            "terminals.id",
            ondelete="SET NULL",
            name="fk_sales_terminal_id_terminals",
        ),
        nullable=True,
        index=True,
    )

    cashier_username: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
    )

    cashier_display_name: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    terminal_device_id: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
    )

    settings_snapshot: Mapped[dict[str, object]] = mapped_column(
        JSONB,
        nullable=False,
        default=dict,
        server_default=text("'{}'::jsonb"),
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        index=True,
    )

    items: Mapped[list["SaleItem"]] = relationship(
        back_populates="sale",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="SaleItem.id",
    )

    service_items: Mapped[list["SaleServiceItem"]] = relationship(
        back_populates="sale",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="SaleServiceItem.id",
    )


class SaleItem(Base):
    __tablename__ = "sale_items"

    __table_args__ = (
        CheckConstraint("quantity > 0", name="ck_sale_items_quantity_positive"),
        CheckConstraint(
            "unit_price >= 0",
            name="ck_sale_items_unit_price_nonnegative",
        ),
        CheckConstraint(
            "line_total >= 0",
            name="ck_sale_items_line_total_nonnegative",
        ),
        CheckConstraint(
            "discount_amount >= 0",
            name="ck_sale_items_discount_amount_nonnegative",
        ),
        CheckConstraint(
            "unit_cost IS NULL OR unit_cost >= 0",
            name="ck_sale_items_unit_cost_nonnegative",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    sale_id: Mapped[int] = mapped_column(
        ForeignKey("sales.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    product_id: Mapped[int | None] = mapped_column(
        ForeignKey("products.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    product_name: Mapped[str] = mapped_column(String(150), nullable=False)
    sku: Mapped[str | None] = mapped_column(String(64), nullable=True)
    category: Mapped[str] = mapped_column(String(100), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)

    # Cost captured when the sale is completed.
    # Existing sales remain NULL because their historical cost is unknown.
    unit_cost: Mapped[Decimal | None] = mapped_column(
        Numeric(12, 4),
        nullable=True,
    )

    quantity: Mapped[int] = mapped_column(Integer, nullable=False)

    # Discount allocated to this line.
    # line_total is the final line revenue after discount.
    discount_amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        nullable=False,
        default=Decimal("0.00"),
        server_default=text("0.00"),
    )

    line_total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)

    sale: Mapped["Sale"] = relationship(back_populates="items")


class SaleServiceItem(Base):
    __tablename__ = "sale_service_items"

    __table_args__ = (
        CheckConstraint(
            "quantity > 0",
            name="ck_sale_service_items_quantity_positive",
        ),
        CheckConstraint(
            "unit_price >= 0",
            name="ck_sale_service_items_unit_price_nonnegative",
        ),
        CheckConstraint(
            "line_total >= 0",
            name="ck_sale_service_items_line_total_nonnegative",
        ),
        CheckConstraint(
            "discount_amount >= 0",
            name="ck_sale_service_items_discount_amount_nonnegative",
        ),
        CheckConstraint(
            "unit_cost IS NULL OR unit_cost >= 0",
            name="ck_sale_service_items_unit_cost_nonnegative",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    sale_id: Mapped[int] = mapped_column(
        ForeignKey("sales.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    service_id: Mapped[int | None] = mapped_column(
        ForeignKey("services.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    service_name: Mapped[str] = mapped_column(String(80), nullable=False)
    description: Mapped[str] = mapped_column(
        String(300),
        nullable=False,
        default="",
        server_default="",
    )

    unit_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    unit_cost: Mapped[Decimal | None] = mapped_column(
        Numeric(12, 4),
        nullable=True,
    )
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)

    # Discount allocated to this service line.
    discount_amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        nullable=False,
        default=Decimal("0.00"),
        server_default=text("0.00"),
    )

    line_total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)

    sale: Mapped["Sale"] = relationship(back_populates="service_items")


class InventoryReceipt(Base):
    __tablename__ = "inventory_receipts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    reference_number: Mapped[str | None] = mapped_column(
        String(80),
        nullable=True,
        index=True,
    )

    supplier_name: Mapped[str | None] = mapped_column(
        String(150),
        nullable=True,
    )

    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)

    total_cost: Mapped[Decimal] = mapped_column(
        Numeric(14, 2),
        nullable=False,
        default=Decimal("0.00"),
        server_default=text("0.00"),
    )

    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        index=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        server_default=func.now(),
    )

    items: Mapped[list["InventoryReceiptItem"]] = relationship(
        back_populates="receipt",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="InventoryReceiptItem.id",
    )


class InventoryReceiptItem(Base):
    __tablename__ = "inventory_receipt_items"

    __table_args__ = (
        CheckConstraint(
            "quantity > 0",
            name="ck_inventory_receipt_items_quantity_positive",
        ),
        CheckConstraint(
            "unit_cost >= 0",
            name="ck_inventory_receipt_items_unit_cost_nonnegative",
        ),
        CheckConstraint(
            "line_total >= 0",
            name="ck_inventory_receipt_items_line_total_nonnegative",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    receipt_id: Mapped[int] = mapped_column(
        ForeignKey("inventory_receipts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    product_id: Mapped[int | None] = mapped_column(
        ForeignKey("products.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    product_name: Mapped[str] = mapped_column(String(150), nullable=False)
    sku: Mapped[str | None] = mapped_column(String(64), nullable=True)

    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_cost: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
    line_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)

    receipt: Mapped["InventoryReceipt"] = relationship(
        back_populates="items",
    )


class StockoutPeriod(Base):
    __tablename__ = "stockout_periods"

    __table_args__ = (
        CheckConstraint(
            "ended_at IS NULL OR ended_at >= started_at",
            name="ck_stockout_periods_valid_dates",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    product_id: Mapped[int | None] = mapped_column(
        ForeignKey("products.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    product_name: Mapped[str] = mapped_column(String(150), nullable=False)

    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        index=True,
    )

    ended_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        index=True,
    )


class Terminal(Base):
    __tablename__ = "terminals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    device_id: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        unique=True,
        index=True,
    )

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    device_type: Mapped[str] = mapped_column(String(60), nullable=False)
    platform: Mapped[str] = mapped_column(String(32), nullable=False)
    app_version: Mapped[str | None] = mapped_column(String(50), nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)

    session_token_hash: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        unique=True,
        index=True,
    )

    is_enabled: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=text("true"),
    )

    maintenance_mode: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("false"),
    )

    first_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        server_default=func.now(),
    )

    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        server_default=func.now(),
        index=True,
    )

    last_sync_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        server_default=func.now(),
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        onupdate=utc_now,
        server_default=func.now(),
    )


class TerminalPairingChallenge(Base):
    """
    Temporary, one-time credentials created by an administrator
    to pair a new or existing physical terminal.

    Only the SHA-256 digest of the pairing token is persisted.
    """

    __tablename__ = "terminal_pairing_challenges"

    __table_args__ = (
        CheckConstraint(
            "expires_at > created_at",
            name="ck_terminal_pairing_challenges_expiry",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    token_hash: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        unique=True,
        index=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        server_default=func.now(),
    )

    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        index=True,
    )

    consumed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )


class TerminalCommand(Base):
    __tablename__ = "terminal_commands"

    __table_args__ = (
        CheckConstraint(
            "command_type IN ('sync', 'broadcast')",
            name="ck_terminal_commands_type",
        ),
        CheckConstraint(
            "status IN ('pending', 'acknowledged', 'failed')",
            name="ck_terminal_commands_status",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    terminal_id: Mapped[int] = mapped_column(
        ForeignKey("terminals.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    command_type: Mapped[str] = mapped_column(String(20), nullable=False)
    payload: Mapped[str | None] = mapped_column(String(250), nullable=True)

    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="pending",
        server_default=text("'pending'"),
        index=True,
    )

    result_message: Mapped[str | None] = mapped_column(
        String(300),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        server_default=func.now(),
        index=True,
    )

    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )


class AppSettings(Base):
    """
    Stores the single global Kinesis application settings document.

    The database constraint enforces one permitted record with ID 1.
    """

    __tablename__ = "app_settings"

    __table_args__ = (
        CheckConstraint("id = 1", name="ck_app_settings_singleton"),
        CheckConstraint(
            "version >= 1",
            name="ck_app_settings_version_positive",
        ),
    )

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        default=1,
        server_default=text("1"),
    )

    settings: Mapped[dict[str, object]] = mapped_column(
        JSONB,
        nullable=False,
        default=dict,
        server_default=text("'{}'::jsonb"),
    )

    version: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
        server_default=text("1"),
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        onupdate=utc_now,
        server_default=func.now(),
    )
