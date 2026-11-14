"""
Administrator stock management: inventory listing, receiving stock and
manual stock adjustments (write-offs and stock-count corrections).

All routes require an administrator browser session (CSRF and Origin are
enforced by the admin session dependency for unsafe methods). Every stock
change locks the product row, so it is serialized with POS checkout and
POS inventory receipts, which lock the same rows.
"""

from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import func, or_, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from database import get_db
from inventory_routes import (
    InventoryReceiptCreate,
    ReceiptItemInput,
    save_inventory_receipt,
)
from models import (
    InventoryReceipt,
    InventoryReceiptItem,
    Product,
    Sale,
    SaleItem,
    STOCK_ADJUSTMENT_REASONS,
    StockAdjustment,
)
from overview_routes import _low_stock_threshold
from terminal_routes import require_admin_token


router = APIRouter(prefix="/api/admin/inventory", tags=["Admin inventory"])

StockStatus = Literal["in_stock", "low", "out"]
SortField = Literal["name", "sku", "category", "price", "stock"]
AdjustmentReason = Literal["damaged", "lost", "expired", "count_correction", "other"]

assert set(AdjustmentReason.__args__) == set(STOCK_ADJUSTMENT_REASONS)

SORT_COLUMNS = {
    "name": func.lower(Product.name),
    "sku": func.lower(Product.sku),
    "category": func.lower(Product.category),
    "price": Product.price,
    "stock": Product.stock,
}


def require_admin_actor(
    admin: object = Depends(require_admin_token),
    db: Session = Depends(get_db),
) -> object:
    # Attribute activity events and adjustment records to the administrator
    # (see activity_tracking._record).
    db.info["kinesis_actor"] = {
        "actor_type": "admin",
        "actor_id": str(getattr(admin, "id", "")) or None,
        "actor_name": getattr(admin, "username", None),
        "cashier_id": None,
        "terminal_id": None,
    }

    return admin


def stock_status(stock: int, threshold: int) -> StockStatus:
    if stock <= 0:
        return "out"

    if stock <= threshold:
        return "low"

    return "in_stock"


def inventory_item(product: Product, threshold: int) -> dict:
    return {
        "id": product.id,
        "sku": product.sku,
        "name": product.name,
        "category": product.category,
        "price": float(product.price),
        "stock": product.stock,
        "average_cost": (
            float(product.average_cost) if product.average_cost is not None else None
        ),
        "image_url": (
            f"/api/products/{product.id}/image" if product.image_path else None
        ),
        "stock_status": stock_status(product.stock, threshold),
        "archived_at": (
            product.archived_at.isoformat() if product.archived_at else None
        ),
    }


def escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


# --------------------------------------------------
# Inventory listing
# --------------------------------------------------


@router.get("/products", summary="List active inventory for stock management")
def list_inventory(
    search: str | None = Query(default=None, max_length=150),
    category: str | None = Query(default=None, max_length=100),
    status_filter: StockStatus | None = Query(default=None, alias="status"),
    sort: SortField = Query(default="name"),
    direction: Literal["asc", "desc"] = Query(default="asc"),
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    archived: bool = Query(
        default=False,
        description="List archived products instead of active inventory.",
    ),
    _admin: object = Depends(require_admin_actor),
    db: Session = Depends(get_db),
):
    threshold = _low_stock_threshold(db)

    # Archived products keep their stock but are not active inventory; the
    # Archived view lists them separately so they can be restored.
    conditions = [
        Product.archived_at.is_not(None) if archived else Product.archived_at.is_(None)
    ]

    if search and search.strip():
        pattern = f"%{escape_like(search.strip())}%"
        conditions.append(
            or_(
                Product.name.ilike(pattern, escape="\\"),
                Product.sku.ilike(pattern, escape="\\"),
            )
        )

    if category and category.strip():
        conditions.append(func.lower(Product.category) == category.strip().lower())

    if status_filter == "out":
        conditions.append(Product.stock <= 0)
    elif status_filter == "low":
        conditions.append(Product.stock > 0)
        conditions.append(Product.stock <= threshold)
    elif status_filter == "in_stock":
        conditions.append(Product.stock > threshold)

    total = db.scalar(select(func.count(Product.id)).where(*conditions)) or 0

    column = SORT_COLUMNS[sort]
    ordering = column.asc() if direction == "asc" else column.desc()

    products = db.scalars(
        select(Product)
        .where(*conditions)
        .order_by(ordering.nulls_last(), Product.id.asc())
        .offset(offset)
        .limit(limit)
    ).all()

    categories = db.scalars(
        select(Product.category)
        .where(Product.archived_at.is_(None))
        .distinct()
        .order_by(Product.category.asc())
    ).all()

    return {
        "items": [inventory_item(product, threshold) for product in products],
        "total": int(total),
        "limit": limit,
        "offset": offset,
        "low_stock_threshold": threshold,
        "categories": categories,
    }


# --------------------------------------------------
# Add stock
# --------------------------------------------------


def optional_text(value: str | None) -> str | None:
    if value is None:
        return None

    return value.strip() or None


class AdminStockReceipt(BaseModel):
    product_id: int = Field(gt=0)
    quantity: int = Field(gt=0, le=100000)
    unit_cost: Decimal = Field(ge=0, max_digits=12, decimal_places=4)
    opening_stock_unit_cost: Decimal | None = Field(
        default=None, ge=0, max_digits=12, decimal_places=4
    )
    # The stock shown when the owner reviewed the change.
    expected_stock: int
    note: str | None = Field(default=None, max_length=500)
    supplier_name: str | None = Field(default=None, max_length=150)
    reference_number: str | None = Field(default=None, max_length=80)

    @field_validator("note", "supplier_name", "reference_number")
    @classmethod
    def normalize_text(cls, value: str | None) -> str | None:
        return optional_text(value)


@router.post(
    "/receipts",
    status_code=status.HTTP_201_CREATED,
    summary="Add stock to a product",
)
def add_stock(
    data: AdminStockReceipt,
    _admin: object = Depends(require_admin_actor),
    db: Session = Depends(get_db),
):
    receipt = save_inventory_receipt(
        db,
        InventoryReceiptCreate(
            supplier_name=data.supplier_name,
            reference_number=data.reference_number,
            notes=data.note,
            items=[
                ReceiptItemInput(
                    product_id=data.product_id,
                    quantity=data.quantity,
                    unit_cost=data.unit_cost,
                    opening_stock_unit_cost=data.opening_stock_unit_cost,
                )
            ],
        ),
        expected_stock={data.product_id: data.expected_stock},
    )

    product = db.get(Product, data.product_id)

    return {
        "receipt": receipt,
        "product": inventory_item(product, _low_stock_threshold(db)),
    }


# --------------------------------------------------
# Adjust stock (write-offs and count corrections)
# --------------------------------------------------


class AdminStockAdjustment(BaseModel):
    product_id: int = Field(gt=0)
    # Negative removes units; positive is only allowed for count corrections
    # (received stock goes through "Add stock" so it is costed).
    quantity_change: int = Field(ge=-100000, le=100000)
    reason: AdjustmentReason
    note: str | None = Field(default=None, max_length=500)
    expected_stock: int

    @field_validator("note")
    @classmethod
    def normalize_note(cls, value: str | None) -> str | None:
        return optional_text(value)

    @model_validator(mode="after")
    def validate_change(self):
        if self.quantity_change == 0:
            raise ValueError("The adjustment must change the stock.")

        if self.quantity_change > 0 and self.reason != "count_correction":
            raise ValueError(
                "Only stock-count corrections can increase stock. "
                "Use Add stock for received inventory."
            )

        if self.reason == "other" and self.note is None:
            raise ValueError("Describe the reason when choosing 'Other'.")

        return self


@router.post(
    "/adjustments",
    status_code=status.HTTP_201_CREATED,
    summary="Write off or correct a product's stock",
)
def adjust_stock(
    data: AdminStockAdjustment,
    _admin: object = Depends(require_admin_actor),
    db: Session = Depends(get_db),
):
    try:
        product = db.scalar(
            select(Product).where(Product.id == data.product_id).with_for_update()
        )

        if product is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found.")

        if product.archived_at is not None:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"'{product.name}' is archived. Restore it before adjusting stock.",
            )

        if product.stock != data.expected_stock:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"Stock for '{product.name}' changed from {data.expected_stock} "
                f"to {product.stock} while you were editing. Review it and try again.",
            )

        stock_before = product.stock
        stock_after = stock_before + data.quantity_change

        if stock_after < 0:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"Only {stock_before} unit(s) of '{product.name}' are in stock; "
                f"cannot remove {-data.quantity_change}.",
            )

        actor = db.info.get("kinesis_actor") or {}

        adjustment = StockAdjustment(
            product_id=product.id,
            product_name=product.name,
            sku=product.sku,
            quantity_change=data.quantity_change,
            stock_before=stock_before,
            stock_after=stock_after,
            reason=data.reason,
            note=data.note,
            actor_type=actor.get("actor_type", "admin"),
            actor_id=actor.get("actor_id"),
            actor_name=actor.get("actor_name"),
        )

        # Average cost is unchanged: removing or recounting units does not
        # change what the remaining units cost.
        product.stock = stock_after
        db.add(adjustment)
        db.commit()
        db.refresh(adjustment)
        db.refresh(product)

    except HTTPException:
        db.rollback()
        raise

    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "The stock adjustment could not be saved.",
        ) from exc

    return {
        "adjustment": adjustment_entry(adjustment),
        "product": inventory_item(product, _low_stock_threshold(db)),
    }


# --------------------------------------------------
# Stock history for one product
# --------------------------------------------------


def adjustment_entry(adjustment: StockAdjustment) -> dict:
    return {
        "type": "adjustment",
        "id": adjustment.id,
        "at": adjustment.created_at.isoformat(),
        "quantity_change": adjustment.quantity_change,
        "stock_before": adjustment.stock_before,
        "stock_after": adjustment.stock_after,
        "reason": adjustment.reason,
        "note": adjustment.note,
        "actor_name": adjustment.actor_name,
        "unit_cost": None,
    }


@router.get(
    "/products/{product_id}/history",
    summary="Recent stock receipts and adjustments for a product",
)
def stock_history(
    product_id: int,
    limit: int = Query(default=20, ge=1, le=100),
    _admin: object = Depends(require_admin_actor),
    db: Session = Depends(get_db),
):
    product = db.get(Product, product_id)

    if product is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found.")

    receipts = db.execute(
        select(InventoryReceiptItem, InventoryReceipt)
        .join(InventoryReceipt, InventoryReceipt.id == InventoryReceiptItem.receipt_id)
        .where(InventoryReceiptItem.product_id == product_id)
        .order_by(InventoryReceipt.received_at.desc(), InventoryReceiptItem.id.desc())
        .limit(limit)
    ).all()

    adjustments = db.scalars(
        select(StockAdjustment)
        .where(StockAdjustment.product_id == product_id)
        .order_by(StockAdjustment.created_at.desc(), StockAdjustment.id.desc())
        .limit(limit)
    ).all()

    # Units sold (including sales later voided or refunded, whose restock
    # appears above as a separate adjustment) so the history explains every
    # change to the stock figure.
    sales = db.execute(
        select(
            SaleItem.id,
            SaleItem.quantity,
            Sale.transaction_code,
            Sale.status,
            Sale.created_at,
            Sale.cashier_display_name,
        )
        .join(Sale, Sale.id == SaleItem.sale_id)
        .where(SaleItem.product_id == product_id)
        .order_by(Sale.created_at.desc(), SaleItem.id.desc())
        .limit(limit)
    ).all()

    entries = [
        {
            "type": "sale",
            "id": row.id,
            "at": row.created_at.isoformat(),
            "quantity_change": -row.quantity,
            "stock_before": None,
            "stock_after": None,
            "reason": None,
            "note": row.transaction_code
            + ("" if row.status == "completed" else f" ({row.status})"),
            "actor_name": row.cashier_display_name,
            "unit_cost": None,
        }
        for row in sales
    ] + [
        {
            "type": "receipt",
            "id": item.id,
            "at": receipt.received_at.isoformat(),
            "quantity_change": item.quantity,
            "stock_before": None,
            "stock_after": None,
            "reason": None,
            "note": receipt.notes,
            "actor_name": None,
            "unit_cost": float(item.unit_cost),
        }
        for item, receipt in receipts
    ] + [adjustment_entry(adjustment) for adjustment in adjustments]

    entries.sort(key=lambda entry: entry["at"], reverse=True)

    return {
        "product_id": product_id,
        "items": entries[:limit],
    }
