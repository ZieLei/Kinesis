from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )
    sku: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
        unique=True,
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    category: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        index=True,
    )
    price: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        nullable=False,
    )
    stock: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )
    how_much_sold: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )
    image_path: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )


class Service(Base):
    __tablename__ = "services"

    __table_args__ = (
        CheckConstraint(
            "price >= 0",
            name="ck_services_price_nonnegative",
        ),
    )

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
    )
    name: Mapped[str] = mapped_column(
        String(80),
        nullable=False,
        index=True,
    )
    description: Mapped[str] = mapped_column(
        String(300),
        nullable=False,
        default="",
        server_default="",
    )
    price: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        nullable=False,
    )


class Sale(Base):
    __tablename__ = "sales"

    __table_args__ = (
        CheckConstraint(
            "subtotal >= 0",
            name="ck_sales_subtotal_nonnegative",
        ),
        CheckConstraint(
            "total >= 0",
            name="ck_sales_total_nonnegative",
        ),
        CheckConstraint(
            "amount_tendered >= total",
            name="ck_sales_amount_tendered_covers_total",
        ),
        CheckConstraint(
            "change_due >= 0",
            name="ck_sales_change_nonnegative",
        ),
        UniqueConstraint(
            "reference_number",
            name="sales_reference_number_key",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    transaction_code: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        unique=True,
        index=True,
    )
    payment_method: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
    )
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
    subtotal: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        nullable=False,
    )
    total: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        nullable=False,
    )
    amount_tendered: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        nullable=False,
    )
    change_due: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        nullable=False,
        default=Decimal("0.00"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )

    items: Mapped[list["SaleItem"]] = relationship(
        back_populates="sale",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="SaleItem.id",
    )


class SaleItem(Base):
    __tablename__ = "sale_items"

    __table_args__ = (
        CheckConstraint(
            "quantity > 0",
            name="ck_sale_items_quantity_positive",
        ),
        CheckConstraint(
            "unit_price >= 0",
            name="ck_sale_items_unit_price_nonnegative",
        ),
        CheckConstraint(
            "line_total >= 0",
            name="ck_sale_items_line_total_nonnegative",
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
    product_name: Mapped[str] = mapped_column(
        String(150),
        nullable=False,
    )
    sku: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
    )
    category: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )
    unit_price: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        nullable=False,
    )
    quantity: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )
    line_total: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        nullable=False,
    )

    sale: Mapped["Sale"] = relationship(
        back_populates="items",
    )
