from datetime import datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session, selectinload

from database import get_db
from models import (
    InventoryReceipt,
    InventoryReceiptItem,
    Product,
    Sale,
    SaleItem,
    StockoutPeriod,
)
from cashier_routes import require_writable_cashier
from terminal_routes import require_admin_or_terminal


router = APIRouter(prefix="/api/inventory", tags=["Inventory"])

COST_QUANTUM = Decimal("0.0001")
MONEY_QUANTUM = Decimal("0.01")


class ReceiptItemInput(BaseModel):
    product_id: int = Field(gt=0)
    quantity: int = Field(gt=0, le=100000)
    unit_cost: Decimal = Field(
        ge=0,
        max_digits=12,
        decimal_places=4,
    )

    # Required only when existing positive stock has no recorded cost.
    opening_stock_unit_cost: Decimal | None = Field(
        default=None,
        ge=0,
        max_digits=12,
        decimal_places=4,
    )


class InventoryReceiptCreate(BaseModel):
    supplier_name: str | None = Field(default=None, max_length=150)
    reference_number: str | None = Field(default=None, max_length=80)
    notes: str | None = Field(default=None, max_length=500)
    items: list[ReceiptItemInput] = Field(min_length=1, max_length=100)

    @field_validator("supplier_name", "reference_number", "notes")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip() or None

    @model_validator(mode="after")
    def validate_unique_products(self):
        product_ids = [item.product_id for item in self.items]

        if len(product_ids) != len(set(product_ids)):
            raise ValueError("Each product must appear only once per receipt.")

        return self


def receipt_response(receipt: InventoryReceipt) -> dict:
    return {
        "id": receipt.id,
        "supplier_name": receipt.supplier_name,
        "reference_number": receipt.reference_number,
        "notes": receipt.notes,
        "total_cost": float(receipt.total_cost),
        "received_at": receipt.received_at.isoformat(),
        "items": [
            {
                "id": item.id,
                "product_id": item.product_id,
                "product_name": item.product_name,
                "sku": item.sku,
                "quantity": item.quantity,
                "unit_cost": float(item.unit_cost),
                "line_total": float(item.line_total),
            }
            for item in receipt.items
        ],
    }


def money(value: Decimal) -> float:
    return float(value.quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP))


# --------------------------------------------------
# Receive inventory
# --------------------------------------------------


@router.post(
    "/receipts",
    status_code=status.HTTP_201_CREATED,
    summary="Receive purchased inventory",
)
def create_inventory_receipt(
    receipt_data: InventoryReceiptCreate,
    _cashier: object = Depends(require_writable_cashier),
    db: Session = Depends(get_db),
):
    product_ids = sorted(item.product_id for item in receipt_data.items)

    try:
        products = db.scalars(
            select(Product)
            .where(Product.id.in_(product_ids))
            .order_by(Product.id.asc())
            .with_for_update()
        ).all()

        products_by_id = {product.id: product for product in products}

        missing_ids = [
            product_id for product_id in product_ids if product_id not in products_by_id
        ]

        if missing_ids:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Product ID {missing_ids[0]} does not exist.",
            )

        archived = [product for product in products if product.archived_at is not None]

        if archived:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"'{archived[0].name}' is archived. Restore it before "
                    "receiving stock."
                ),
            )

        receipt = InventoryReceipt(
            supplier_name=receipt_data.supplier_name,
            reference_number=receipt_data.reference_number,
            notes=receipt_data.notes,
            total_cost=Decimal("0.00"),
        )

        total_cost = Decimal("0.00")

        for line in receipt_data.items:
            product = products_by_id[line.product_id]
            old_stock = product.stock
            received_quantity = line.quantity
            purchase_cost = Decimal(line.unit_cost).quantize(COST_QUANTUM)

            new_stock = old_stock + received_quantity

            if old_stock > 0:
                if product.average_cost is not None:
                    old_unit_cost = Decimal(product.average_cost)
                elif line.opening_stock_unit_cost is not None:
                    old_unit_cost = Decimal(line.opening_stock_unit_cost).quantize(
                        COST_QUANTUM
                    )
                else:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=(
                            f"'{product.name}' already has {old_stock} units "
                            "without recorded acquisition cost. Provide "
                            "opening_stock_unit_cost to value its existing stock."
                        ),
                    )

                old_inventory_value = old_unit_cost * old_stock
                received_inventory_value = purchase_cost * received_quantity

                product.average_cost = (
                    (old_inventory_value + received_inventory_value) / new_stock
                ).quantize(COST_QUANTUM, rounding=ROUND_HALF_UP)

            else:
                # Zero or negative stock has no positive on-hand inventory
                # value to include in the weighted average. This receipt
                # establishes the cost of the newly available stock.
                product.average_cost = purchase_cost

            product.stock = new_stock

            line_total = (purchase_cost * received_quantity).quantize(
                MONEY_QUANTUM,
                rounding=ROUND_HALF_UP,
            )

            total_cost = total_cost + line_total

            receipt.items.append(
                InventoryReceiptItem(
                    product_id=product.id,
                    product_name=product.name,
                    sku=product.sku,
                    quantity=received_quantity,
                    unit_cost=purchase_cost,
                    line_total=line_total,
                )
            )

        receipt.total_cost = total_cost.quantize(MONEY_QUANTUM)
        db.add(receipt)
        db.flush()

        receipt_id = receipt.id
        db.commit()

        saved_receipt = db.scalar(
            select(InventoryReceipt)
            .options(selectinload(InventoryReceipt.items))
            .where(InventoryReceipt.id == receipt_id)
        )

        if saved_receipt is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="The receipt was saved but could not be reloaded.",
            )

        return receipt_response(saved_receipt)

    except HTTPException:
        db.rollback()
        raise

    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The inventory receipt conflicts with an existing database record.",
        ) from exc

    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The inventory receipt could not be saved.",
        ) from exc


# --------------------------------------------------
# Inventory valuation and stockout opportunity
# --------------------------------------------------


@router.get(
    "/valuation",
    summary="Get inventory valuation and stockout estimates",
)
def get_inventory_valuation(
    stockout_limit: int = Query(default=20, ge=1, le=100),
    _authorized: object = Depends(require_admin_or_terminal),
    db: Session = Depends(get_db),
):
    # Active inventory only. Archived products keep their stock, but it is
    # neither for sale nor counted here; stockout estimates for them are
    # skipped below because they are absent from product_by_id.
    products = db.scalars(
        select(Product)
        .where(Product.archived_at.is_(None))
        .order_by(Product.name.asc(), Product.id.asc())
    ).all()

    total_units = 0
    valued_units = 0
    uncosted_units = 0

    inventory_cost_value = Decimal("0.00")
    estimated_retail_value = Decimal("0.00")
    uncosted_retail_value = Decimal("0.00")
    known_gross_margin = Decimal("0.00")

    product_rows = []
    product_by_id = {product.id: product for product in products}

    for product in products:
        stock = int(product.stock)
        positive_stock = max(stock, 0)
        price = Decimal(product.price)
        average_cost = (
            Decimal(product.average_cost) if product.average_cost is not None else None
        )

        retail_value = price * positive_stock
        total_units += positive_stock
        estimated_retail_value = estimated_retail_value + retail_value

        if average_cost is not None:
            cost_value = average_cost * positive_stock

            valued_units += positive_stock
            inventory_cost_value = inventory_cost_value + cost_value
            known_gross_margin = known_gross_margin + (
                (price - average_cost) * positive_stock
            )
        else:
            cost_value = None
            uncosted_units += positive_stock
            uncosted_retail_value = uncosted_retail_value + retail_value

        product_rows.append(
            {
                "product_id": product.id,
                "sku": product.sku,
                "name": product.name,
                "category": product.category,
                "stock": stock,
                "unit_price": money(price),
                "average_cost": (
                    float(average_cost) if average_cost is not None else None
                ),
                "retail_value": money(retail_value),
                "inventory_cost_value": (
                    money(cost_value) if cost_value is not None else None
                ),
                "cost_status": (
                    "valued" if average_cost is not None else "cost_unknown"
                ),
            }
        )

    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=30)

    stockout_periods = db.scalars(
        select(StockoutPeriod)
        .where(
            or_(
                StockoutPeriod.ended_at.is_(None),
                StockoutPeriod.ended_at >= cutoff,
            )
        )
        .order_by(StockoutPeriod.started_at.desc())
        .limit(500)
    ).all()

    stockout_items = []
    estimated_lost_revenue = Decimal("0.00")
    estimated_lost_gross_profit = Decimal("0.00")
    estimated_units_total = Decimal("0")
    cost_known_units = Decimal("0")

    for period in stockout_periods:
        product = product_by_id.get(period.product_id)

        if product is None:
            continue

        started_at = period.started_at
        if started_at.tzinfo is None:
            started_at = started_at.replace(tzinfo=timezone.utc)

        ended_at = period.ended_at or now
        if ended_at.tzinfo is None:
            ended_at = ended_at.replace(tzinfo=timezone.utc)

        duration_seconds = max(
            (ended_at - started_at).total_seconds(),
            0,
        )
        duration_days = Decimal(str(duration_seconds / 86400))

        # Estimate demand from the 30 calendar days immediately before
        # the stockout began, not from days when the product was unavailable.
        demand_start = started_at - timedelta(days=30)

        units_before_stockout = (
            db.scalar(
                select(func.coalesce(func.sum(SaleItem.quantity), 0))
                .join(Sale, Sale.id == SaleItem.sale_id)
                .where(
                    SaleItem.product_id == product.id,
                    Sale.status == "completed",
                    Sale.created_at >= demand_start,
                    Sale.created_at < started_at,
                )
            )
            or 0
        )

        average_daily_demand = Decimal(units_before_stockout) / Decimal("30")
        estimated_lost_units = average_daily_demand * duration_days

        if estimated_lost_units <= 0:
            continue

        lost_revenue = estimated_lost_units * Decimal(product.price)
        estimated_lost_revenue = estimated_lost_revenue + lost_revenue
        estimated_units_total = estimated_units_total + estimated_lost_units

        lost_gross_profit = None

        if product.average_cost is not None:
            unit_margin = Decimal(product.price) - Decimal(product.average_cost)
            lost_gross_profit = estimated_lost_units * unit_margin

            estimated_lost_gross_profit = (
                estimated_lost_gross_profit + lost_gross_profit
            )
            cost_known_units = cost_known_units + estimated_lost_units

        stockout_items.append(
            {
                "product_id": product.id,
                "name": product.name,
                "sku": product.sku,
                "current_stock": product.stock,
                "started_at": period.started_at.isoformat(),
                "ended_at": (
                    period.ended_at.isoformat() if period.ended_at is not None else None
                ),
                "duration_days": round(float(duration_days), 2),
                "units_sold_before_stockout_30d": int(units_before_stockout),
                "average_daily_demand": round(
                    float(average_daily_demand),
                    3,
                ),
                "estimated_lost_units": round(
                    float(estimated_lost_units),
                    2,
                ),
                "estimated_lost_revenue": money(lost_revenue),
                "estimated_lost_gross_profit": (
                    money(lost_gross_profit) if lost_gross_profit is not None else None
                ),
            }
        )

    stockout_items.sort(
        key=lambda item: item["estimated_lost_revenue"],
        reverse=True,
    )

    return {
        "generated_at": now.isoformat(),
        "currency": "PHP",
        "summary": {
            "product_count": len(products),
            "total_units": total_units,
            "valued_units": valued_units,
            "uncosted_units": uncosted_units,
            "inventory_cost_value": money(inventory_cost_value),
            "estimated_retail_value": money(estimated_retail_value),
            "uncosted_retail_value": money(uncosted_retail_value),
            "known_inventory_gross_margin": money(known_gross_margin),
        },
        "products": product_rows,
        "stockout_opportunity": {
            "basis_days": 30,
            "estimated_lost_units": round(float(estimated_units_total), 2),
            "estimated_lost_revenue": money(estimated_lost_revenue),
            "estimated_lost_gross_profit": money(estimated_lost_gross_profit),
            "gross_profit_cost_coverage": (
                round(
                    float(cost_known_units / estimated_units_total * 100),
                    1,
                )
                if estimated_units_total > 0
                else 0
            ),
            "note": (
                "Estimates use the 30 days of completed sales immediately "
                "before each recorded stockout. They are potential demand, "
                "not confirmed lost orders. Gross-profit estimates exclude "
                "products without recorded acquisition cost."
            ),
            "items": stockout_items[:stockout_limit],
        },
    }
