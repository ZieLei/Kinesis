from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
import logging
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session, selectinload

from database import get_db
from models import Product, Sale, SaleItem


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["Sales"])

REPORT_TIMEZONE = ZoneInfo("Asia/Manila")
ZERO_MONEY = Decimal("0.00")
CENT = Decimal("0.01")

PaymentMethod = Literal["cash", "gcash"]
ReportPeriod = Literal["daily", "weekly", "monthly", "yearly"]


# --------------------------------------------------
# Checkout request schemas
# --------------------------------------------------


class CheckoutItem(BaseModel):
    product_id: int = Field(gt=0)
    quantity: int = Field(gt=0, le=10000)


class CheckoutCreate(BaseModel):
    transaction_code: str = Field(
        min_length=8,
        max_length=32,
        pattern=r"^[A-Za-z0-9-]+$",
    )
    payment_method: PaymentMethod
    items: list[CheckoutItem] = Field(min_length=1, max_length=100)
    amount_tendered: Decimal | None = Field(
        default=None,
        ge=0,
        max_digits=12,
        decimal_places=2,
    )
    reference_number: str | None = Field(default=None, max_length=64)

    @field_validator("transaction_code")
    @classmethod
    def normalize_transaction_code(cls, value: str) -> str:
        return value.strip().upper()

    @field_validator("reference_number")
    @classmethod
    def normalize_reference_number(
        cls,
        value: str | None,
    ) -> str | None:
        if value is None:
            return None

        return value.strip() or None

    @model_validator(mode="after")
    def validate_checkout(self):
        product_ids = [item.product_id for item in self.items]

        if len(product_ids) != len(set(product_ids)):
            raise ValueError(
                "Each product must appear only once in the checkout items."
            )

        if self.payment_method == "cash":
            if self.amount_tendered is None:
                raise ValueError("Cash payments require an amount tendered.")

            if self.reference_number is not None:
                raise ValueError("Cash payments must not include a GCash reference.")

        if self.payment_method == "gcash" and not self.reference_number:
            raise ValueError("GCash payments require a reference number.")

        return self


# --------------------------------------------------
# Transaction response helpers
# --------------------------------------------------


def sale_response(sale: Sale) -> dict:
    return {
        "id": sale.id,
        "transaction_code": sale.transaction_code,
        "payment_method": sale.payment_method,
        "reference_number": sale.reference_number,
        "status": sale.status,
        "subtotal": float(sale.subtotal),
        "total": float(sale.total),
        "amount_tendered": float(sale.amount_tendered),
        "change_due": float(sale.change_due),
        "created_at": sale.created_at.isoformat(),
        "items": [
            {
                "id": item.id,
                "product_id": item.product_id,
                "product_name": item.product_name,
                "sku": item.sku,
                "category": item.category,
                "unit_price": float(item.unit_price),
                "quantity": item.quantity,
                "line_total": float(item.line_total),
            }
            for item in sale.items
        ],
    }


def sale_list_response(sale: Sale) -> dict:
    return {
        "id": sale.id,
        "transaction_code": sale.transaction_code,
        "payment_method": sale.payment_method,
        "reference_number": sale.reference_number,
        "status": sale.status,
        "total": float(sale.total),
        "created_at": sale.created_at.isoformat(),
        "item_count": sum(item.quantity for item in sale.items),
    }


def get_sale_by_code(db: Session, transaction_code: str) -> Sale | None:
    return db.scalar(
        select(Sale)
        .options(selectinload(Sale.items))
        .where(Sale.transaction_code == transaction_code)
    )


def checkout_matches_sale(
    sale: Sale,
    request: CheckoutCreate,
) -> bool:
    """Determine whether an existing transaction is a safe idempotent retry."""
    if sale.payment_method != request.payment_method:
        return False

    if sale.reference_number != request.reference_number:
        return False

    stored_items = {(item.product_id, item.quantity) for item in sale.items}
    requested_items = {(item.product_id, item.quantity) for item in request.items}

    if stored_items != requested_items:
        return False

    if request.payment_method == "cash":
        return sale.amount_tendered == request.amount_tendered

    return True


# --------------------------------------------------
# List transactions
# --------------------------------------------------


@router.get("/sales", tags=["Sales"])
def list_sales(
    limit: int = Query(default=10, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    total = db.scalar(select(func.count(Sale.id))) or 0

    sales = db.scalars(
        select(Sale)
        .options(selectinload(Sale.items))
        .order_by(Sale.created_at.desc(), Sale.id.desc())
        .offset(offset)
        .limit(limit)
    ).all()

    status_rows = db.execute(
        select(Sale.status, func.count(Sale.id)).group_by(Sale.status)
    ).all()

    return {
        "items": [sale_list_response(sale) for sale in sales],
        "limit": limit,
        "offset": offset,
        "count": int(total),
        "statuses": {
            str(sale_status).lower(): int(count) for sale_status, count in status_rows
        },
    }


# --------------------------------------------------
# Complete checkout
# --------------------------------------------------


@router.post("/sales", tags=["Sales"])
def create_sale(
    checkout: CheckoutCreate,
    db: Session = Depends(get_db),
):
    existing = get_sale_by_code(db, checkout.transaction_code)

    if existing is not None:
        if checkout_matches_sale(existing, checkout):
            return sale_response(existing)

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This transaction code has already been used.",
        )

    try:
        products_by_id: dict[int, Product] = {}

        for item in sorted(
            checkout.items,
            key=lambda entry: entry.product_id,
        ):
            product = db.scalar(
                select(Product).where(Product.id == item.product_id).with_for_update()
            )

            if product is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Product ID {item.product_id} does not exist.",
                )

            products_by_id[product.id] = product

        existing = get_sale_by_code(db, checkout.transaction_code)

        if existing is not None:
            if checkout_matches_sale(existing, checkout):
                result = sale_response(existing)
                db.rollback()
                return result

            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This transaction code has already been used.",
            )

        if checkout.reference_number:
            duplicate_reference = db.scalar(
                select(Sale.id).where(
                    Sale.reference_number == checkout.reference_number
                )
            )

            if duplicate_reference is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="This GCash reference number has already been recorded.",
                )

        calculated_items: list[tuple[CheckoutItem, Product, Decimal, Decimal]] = []
        subtotal = ZERO_MONEY

        for item in checkout.items:
            product = products_by_id[item.product_id]

            if product.stock < item.quantity:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        f"Insufficient stock for '{product.name}'. "
                        f"Available: {product.stock}; "
                        f"requested: {item.quantity}."
                    ),
                )

            unit_price = Decimal(product.price).quantize(CENT)
            line_total = (unit_price * item.quantity).quantize(CENT)
            subtotal += line_total

            calculated_items.append((item, product, unit_price, line_total))

        total = subtotal.quantize(CENT)

        if checkout.payment_method == "cash":
            amount_tendered = checkout.amount_tendered

            if amount_tendered is None or amount_tendered < total:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="The amount received is less than the amount due.",
                )

            amount_tendered = amount_tendered.quantize(CENT)
            change_due = (amount_tendered - total).quantize(CENT)
        else:
            amount_tendered = total
            change_due = ZERO_MONEY

        sale = Sale(
            transaction_code=checkout.transaction_code,
            payment_method=checkout.payment_method,
            reference_number=checkout.reference_number,
            status="completed",
            subtotal=subtotal,
            total=total,
            amount_tendered=amount_tendered,
            change_due=change_due,
        )

        db.add(sale)
        db.flush()

        for item, product, unit_price, line_total in calculated_items:
            db.add(
                SaleItem(
                    sale_id=sale.id,
                    product_id=product.id,
                    product_name=product.name,
                    sku=product.sku,
                    category=product.category,
                    unit_price=unit_price,
                    quantity=item.quantity,
                    line_total=line_total,
                )
            )

            product.stock -= item.quantity
            product.how_much_sold += item.quantity

        sale_id = sale.id
        db.commit()

        saved_sale = db.scalar(
            select(Sale).options(selectinload(Sale.items)).where(Sale.id == sale_id)
        )

        if saved_sale is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Sale was committed but could not be reloaded.",
            )

        return sale_response(saved_sale)

    except HTTPException:
        db.rollback()
        raise

    except IntegrityError as exc:
        db.rollback()

        existing = get_sale_by_code(db, checkout.transaction_code)

        if existing is not None and checkout_matches_sale(existing, checkout):
            return sale_response(existing)

        if checkout.reference_number:
            duplicate_reference = db.scalar(
                select(Sale.id).where(
                    Sale.reference_number == checkout.reference_number
                )
            )

            if duplicate_reference is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="This GCash reference number has already been recorded.",
                ) from exc

        logger.warning("Checkout failed due to a database constraint.")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The checkout conflicts with an existing transaction.",
        ) from exc

    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Could not complete checkout")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                "The sale could not be saved. No inventory changes were committed."
            ),
        ) from exc


# --------------------------------------------------
# Retrieve one saved transaction for the receipt
# --------------------------------------------------


@router.get("/sales/{transaction_code}", tags=["Sales"])
def get_sale(
    transaction_code: str,
    db: Session = Depends(get_db),
):
    sale = get_sale_by_code(db, transaction_code.strip().upper())

    if sale is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sale not found.",
        )

    return sale_response(sale)


# --------------------------------------------------
# Sales report helpers
# --------------------------------------------------


def period_dates(
    period: ReportPeriod,
    reference_date: date,
) -> tuple[date, date]:
    if period == "daily":
        return reference_date, reference_date + timedelta(days=1)

    if period == "weekly":
        start = reference_date - timedelta(days=reference_date.weekday())
        return start, start + timedelta(days=7)

    if period == "monthly":
        start = date(reference_date.year, reference_date.month, 1)

        if reference_date.month == 12:
            end = date(reference_date.year + 1, 1, 1)
        else:
            end = date(reference_date.year, reference_date.month + 1, 1)

        return start, end

    start = date(reference_date.year, 1, 1)
    return start, date(reference_date.year + 1, 1, 1)


def utc_midnight(local_date: date) -> datetime:
    return datetime.combine(
        local_date,
        time.min,
        tzinfo=REPORT_TIMEZONE,
    ).astimezone(timezone.utc)


def sale_conditions(
    start_date: date | None = None,
    end_date: date | None = None,
) -> list:
    conditions = [Sale.status == "completed"]

    if start_date is not None:
        conditions.append(Sale.created_at >= utc_midnight(start_date))

    if end_date is not None:
        conditions.append(Sale.created_at < utc_midnight(end_date))

    return conditions


def sales_summary(
    db: Session,
    start_date: date | None = None,
    end_date: date | None = None,
) -> dict:
    conditions = sale_conditions(start_date, end_date)

    transaction_count, revenue = db.execute(
        select(
            func.count(Sale.id),
            func.coalesce(func.sum(Sale.total), ZERO_MONEY),
        ).where(*conditions)
    ).one()

    items_sold = db.scalar(
        select(func.coalesce(func.sum(SaleItem.quantity), 0))
        .join(Sale, Sale.id == SaleItem.sale_id)
        .where(*conditions)
    )

    return {
        "sales": float(revenue or ZERO_MONEY),
        "transactions": int(transaction_count or 0),
        "items": int(items_sold or 0),
    }


def load_period_rows(
    db: Session,
    start_date: date,
    end_date: date,
):
    conditions = sale_conditions(start_date, end_date)

    sales = db.execute(
        select(Sale.id, Sale.total, Sale.created_at)
        .where(*conditions)
        .order_by(Sale.created_at)
    ).all()

    if not sales:
        return sales, {}

    quantities = dict(
        db.execute(
            select(
                SaleItem.sale_id,
                func.sum(SaleItem.quantity),
            )
            .join(Sale, Sale.id == SaleItem.sale_id)
            .where(*conditions)
            .group_by(SaleItem.sale_id)
        ).all()
    )

    return sales, quantities


def local_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)

    return value.astimezone(REPORT_TIMEZONE)


def build_series(
    period: ReportPeriod,
    start_date: date,
    end_date: date,
    sales,
    quantities: dict[int, int],
) -> list[dict]:
    buckets: list[dict] = []
    bucket_by_key: dict[object, dict] = {}

    if period == "daily":
        for hour in range(24):
            bucket = {
                "label": f"{hour:02d}:00",
                "sales": ZERO_MONEY,
                "transactions": 0,
                "items": 0,
            }
            buckets.append(bucket)
            bucket_by_key[hour] = bucket

    elif period == "yearly":
        for month in range(1, 13):
            bucket = {
                "label": date(start_date.year, month, 1).strftime("%b"),
                "month": month,
                "sales": ZERO_MONEY,
                "transactions": 0,
                "items": 0,
            }
            buckets.append(bucket)
            bucket_by_key[month] = bucket

    else:
        cursor = start_date

        while cursor < end_date:
            bucket = {
                "label": cursor.strftime("%a")
                if period == "weekly"
                else str(cursor.day),
                "date": cursor.isoformat(),
                "sales": ZERO_MONEY,
                "transactions": 0,
                "items": 0,
            }

            buckets.append(bucket)
            bucket_by_key[cursor] = bucket
            cursor += timedelta(days=1)

    for row in sales:
        created_at = local_datetime(row.created_at)

        if period == "daily":
            key = created_at.hour
        elif period == "yearly":
            key = created_at.month
        else:
            key = created_at.date()

        bucket = bucket_by_key.get(key)

        if bucket is None:
            continue

        bucket["sales"] += Decimal(row.total or ZERO_MONEY)
        bucket["transactions"] += 1
        bucket["items"] += int(quantities.get(row.id, 0) or 0)

    for bucket in buckets:
        bucket["sales"] = float(bucket["sales"])

    return buckets


# --------------------------------------------------
# Sales reports
# --------------------------------------------------


@router.get("/reports/sales", tags=["Reports"])
def get_sales_report(
    period: ReportPeriod = Query(default="monthly"),
    report_date: date | None = Query(default=None, alias="date"),
    db: Session = Depends(get_db),
):
    selected_date = report_date or datetime.now(REPORT_TIMEZONE).date()

    current_start, current_end = period_dates(period, selected_date)
    previous_start, _ = period_dates(
        period,
        current_start - timedelta(days=1),
    )
    previous_end = current_start

    current_rows, current_quantities = load_period_rows(
        db,
        current_start,
        current_end,
    )

    return {
        "period": period,
        "date": selected_date.isoformat(),
        "timezone": "Asia/Manila",
        "period_start": current_start.isoformat(),
        "period_end_exclusive": current_end.isoformat(),
        "previous_period_start": previous_start.isoformat(),
        "previous_period_end_exclusive": previous_end.isoformat(),
        "current": sales_summary(db, current_start, current_end),
        "previous": sales_summary(db, previous_start, previous_end),
        "lifetime": sales_summary(db),
        "series": build_series(
            period,
            current_start,
            current_end,
            current_rows,
            current_quantities,
        ),
    }


# --------------------------------------------------
# Product and category sales reports
# --------------------------------------------------


@router.get("/reports/products", tags=["Reports"])
def get_product_report(
    limit: int = Query(default=5, ge=1, le=100),
    db: Session = Depends(get_db),
):
    completed_sale = Sale.status == "completed"

    category_rows = db.execute(
        select(
            SaleItem.category,
            func.sum(SaleItem.quantity).label("units_sold"),
            func.sum(SaleItem.line_total).label("revenue"),
        )
        .join(Sale, Sale.id == SaleItem.sale_id)
        .where(completed_sale)
        .group_by(SaleItem.category)
        .order_by(
            func.sum(SaleItem.quantity).desc(),
            func.sum(SaleItem.line_total).desc(),
        )
    ).all()

    product_rows = db.execute(
        select(
            SaleItem.product_id,
            SaleItem.product_name,
            SaleItem.category,
            func.sum(SaleItem.quantity).label("units_sold"),
            func.sum(SaleItem.line_total).label("revenue"),
        )
        .join(Sale, Sale.id == SaleItem.sale_id)
        .where(completed_sale)
        .group_by(
            SaleItem.product_id,
            SaleItem.product_name,
            SaleItem.category,
        )
        .order_by(
            func.sum(SaleItem.quantity).desc(),
            func.sum(SaleItem.line_total).desc(),
            SaleItem.product_name.asc(),
        )
        .limit(limit)
    ).all()

    return {
        "categories": [
            {
                "category": row.category,
                "units_sold": int(row.units_sold or 0),
                "revenue": float(row.revenue or ZERO_MONEY),
            }
            for row in category_rows
        ],
        "top_products": [
            {
                "product_id": row.product_id,
                "name": row.product_name,
                "category": row.category,
                "units_sold": int(row.units_sold or 0),
                "revenue": float(row.revenue or ZERO_MONEY),
            }
            for row in product_rows
        ],
    }
