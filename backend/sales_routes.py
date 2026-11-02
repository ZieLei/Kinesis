from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import logging
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import Date as SQLDate, cast, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session, selectinload

from cashier_routes import CashierPrincipal, require_cashier_principal
from database import get_db
from models import (
    AppSettings,
    Product,
    Sale,
    SaleItem,
    SaleServiceItem,
    Service,
    Terminal,
)
from terminal_routes import require_admin_or_terminal, require_writable_terminal


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["Sales"])

REPORT_TIMEZONE = ZoneInfo("Asia/Manila")
ZERO_MONEY = Decimal("0.00")
CENT = Decimal("0.01")
COST_PRECISION = Decimal("0.0001")
DEFAULT_CASH_ROUNDING = Decimal("0.01")

PaymentMethod = Literal["cash", "gcash"]
ReportPeriod = Literal["daily", "weekly", "monthly", "yearly"]

DEFAULT_SETTINGS = {
    "currencySymbol": "₱",
    "currencyPlacement": "before",
    "decimalPrecision": "2",
    "cashRounding": "0.01",
    "lowStockThreshold": "5",
    "allowNegativeInventory": False,
    "taxRate": "0",
    "receiptHeader": "KINESIS MOTORCYCLE PARTS",
    "receiptFooter": "Thank you for your purchase!",
    "receiptNotes": "Please keep your receipt for returns and exchanges.",
    "digitalReceipts": False,
    "receiptOutput": "bluetooth",
}


# --------------------------------------------------
# Checkout request schemas
# --------------------------------------------------


class CheckoutItem(BaseModel):
    product_id: int = Field(gt=0)
    quantity: int = Field(gt=0, le=10000)


class CheckoutService(BaseModel):
    service_id: int = Field(gt=0)
    quantity: int = Field(gt=0, le=10000)


class CheckoutCreate(BaseModel):
    transaction_code: str = Field(
        min_length=8,
        max_length=32,
        pattern=r"^[A-Za-z0-9-]+$",
    )
    payment_method: PaymentMethod

    # Defaults preserve compatibility with existing product-only clients.
    items: list[CheckoutItem] = Field(default_factory=list, max_length=100)
    services: list[CheckoutService] = Field(default_factory=list, max_length=100)

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
        if not self.items and not self.services:
            raise ValueError("Add at least one product or service to checkout.")

        product_ids = [item.product_id for item in self.items]
        service_ids = [item.service_id for item in self.services]

        if len(product_ids) != len(set(product_ids)):
            raise ValueError(
                "Each product must appear only once in the checkout items."
            )

        if len(service_ids) != len(set(service_ids)):
            raise ValueError(
                "Each service must appear only once in the checkout services."
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
# Pricing settings and receipt snapshot
# --------------------------------------------------


def get_checkout_settings(
    db: Session,
) -> tuple[Decimal, Decimal, dict, bool]:
    statement = (
        pg_insert(AppSettings)
        .values(
            id=1,
            settings=DEFAULT_SETTINGS,
            version=1,
        )
        .on_conflict_do_nothing(index_elements=[AppSettings.id])
    )

    db.execute(statement)

    row = db.scalar(
        select(AppSettings).where(AppSettings.id == 1).with_for_update(read=True)
    )

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Application settings could not be loaded for checkout.",
        )

    stored_settings = row.settings

    if not isinstance(stored_settings, dict):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The saved application settings are invalid.",
        )

    try:
        tax_rate = Decimal(str(stored_settings.get("taxRate", "0")))
        cash_rounding = Decimal(str(stored_settings.get("cashRounding", "0.01")))
    except (InvalidOperation, ValueError, TypeError) as exc:
        logger.error("Invalid checkout pricing settings in the database.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The saved checkout pricing settings are invalid.",
        ) from exc

    if not tax_rate.is_finite() or not Decimal("0") <= tax_rate <= Decimal("100"):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The saved tax rate is outside the permitted range.",
        )

    allowed_rounding = {
        Decimal("0.01"),
        Decimal("0.05"),
        Decimal("0.10"),
        Decimal("1.00"),
    }

    if cash_rounding not in allowed_rounding:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The saved cash rounding setting is invalid.",
        )

    allow_negative_inventory = stored_settings.get(
        "allowNegativeInventory",
        False,
    )

    if not isinstance(allow_negative_inventory, bool):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The saved negative-inventory setting is invalid.",
        )

    snapshot_keys = (
        "currencySymbol",
        "currencyPlacement",
        "decimalPrecision",
        "taxRate",
        "cashRounding",
        "receiptHeader",
        "receiptFooter",
        "receiptNotes",
        "digitalReceipts",
        "receiptOutput",
        "allowNegativeInventory",
    )

    snapshot = {
        key: stored_settings.get(key, DEFAULT_SETTINGS.get(key))
        for key in snapshot_keys
    }

    return tax_rate, cash_rounding, snapshot, allow_negative_inventory


def calculate_tax(subtotal: Decimal, tax_rate: Decimal) -> Decimal:
    return (subtotal * tax_rate / Decimal("100")).quantize(
        CENT,
        rounding=ROUND_HALF_UP,
    )


def round_cash_total(amount: Decimal, increment: Decimal) -> Decimal:
    if increment == CENT:
        return amount.quantize(CENT, rounding=ROUND_HALF_UP)

    units = (amount / increment).quantize(
        Decimal("1"),
        rounding=ROUND_HALF_UP,
    )
    return (units * increment).quantize(CENT, rounding=ROUND_HALF_UP)


# --------------------------------------------------
# Transaction response helpers
# --------------------------------------------------


def sale_response(sale: Sale) -> dict:
    subtotal = Decimal(sale.subtotal)
    tax_amount = Decimal(sale.tax_amount)
    total = Decimal(sale.total)

    rounding_adjustment = (total - subtotal - tax_amount).quantize(CENT)

    return {
        "id": sale.id,
        "transaction_code": sale.transaction_code,
        "payment_method": sale.payment_method,
        "reference_number": sale.reference_number,
        "status": sale.status,
        "subtotal": float(subtotal),
        "tax_amount": float(tax_amount),
        "rounding_adjustment": float(rounding_adjustment),
        "total": float(total),
        "amount_tendered": float(sale.amount_tendered),
        "change_due": float(sale.change_due),
        "settings_snapshot": sale.settings_snapshot or {},
        "created_at": sale.created_at.isoformat(),
        "cashier_id": (str(sale.cashier_id) if sale.cashier_id is not None else None),
        "cashier_username": sale.cashier_username,
        "cashier_display_name": sale.cashier_display_name,
        "terminal_id": sale.terminal_id,
        "terminal_device_id": sale.terminal_device_id,
        "items": [
            {
                "id": item.id,
                "product_id": item.product_id,
                "product_name": item.product_name,
                "sku": item.sku,
                "category": item.category,
                "unit_price": float(item.unit_price),
                "unit_cost": (
                    float(item.unit_cost) if item.unit_cost is not None else None
                ),
                "quantity": item.quantity,
                "line_total": float(item.line_total),
            }
            for item in sale.items
        ],
        "service_items": [
            {
                "id": item.id,
                "service_id": item.service_id,
                "service_name": item.service_name,
                "description": item.description,
                "unit_price": float(item.unit_price),
                "unit_cost": (
                    float(item.unit_cost) if item.unit_cost is not None else None
                ),
                "quantity": item.quantity,
                "line_total": float(item.line_total),
            }
            for item in sale.service_items
        ],
    }


def sale_list_response(sale: Sale) -> dict:
    item_count = sum(item.quantity for item in sale.items)
    service_count = sum(item.quantity for item in sale.service_items)

    return {
        "id": sale.id,
        "transaction_code": sale.transaction_code,
        "payment_method": sale.payment_method,
        "reference_number": sale.reference_number,
        "status": sale.status,
        "total": float(sale.total),
        "created_at": sale.created_at.isoformat(),
        "item_count": item_count + service_count,
        "product_count": item_count,
        "service_count": service_count,
        "cashier_id": (str(sale.cashier_id) if sale.cashier_id is not None else None),
        "cashier_username": sale.cashier_username,
        "cashier_display_name": sale.cashier_display_name,
        "terminal_id": sale.terminal_id,
        "terminal_device_id": sale.terminal_device_id,
    }


def get_sale_by_code(
    db: Session,
    transaction_code: str,
) -> Sale | None:
    return db.scalar(
        select(Sale)
        .options(
            selectinload(Sale.items),
            selectinload(Sale.service_items),
        )
        .where(Sale.transaction_code == transaction_code)
    )


def checkout_matches_sale(sale: Sale, request: CheckoutCreate) -> bool:
    if sale.payment_method != request.payment_method:
        return False

    if sale.reference_number != request.reference_number:
        return False

    stored_items = {(item.product_id, item.quantity) for item in sale.items}
    requested_items = {(item.product_id, item.quantity) for item in request.items}

    stored_services = {(item.service_id, item.quantity) for item in sale.service_items}
    requested_services = {(item.service_id, item.quantity) for item in request.services}

    if stored_items != requested_items:
        return False

    if stored_services != requested_services:
        return False

    if request.payment_method == "cash":
        return sale.amount_tendered == request.amount_tendered

    return True


def checkout_belongs_to_cashier(
    sale: Sale,
    principal: CashierPrincipal,
) -> bool:
    return (
        sale.cashier_id == principal.cashier.id
        and sale.terminal_id == principal.terminal.id
    )


# --------------------------------------------------
# List transactions
# --------------------------------------------------


@router.get("/sales", tags=["Sales"])
def list_sales(
    limit: int = Query(default=10, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    _authorized: object = Depends(require_admin_or_terminal),
    db: Session = Depends(get_db),
):
    total = db.scalar(select(func.count(Sale.id))) or 0

    sales = db.scalars(
        select(Sale)
        .options(
            selectinload(Sale.items),
            selectinload(Sale.service_items),
        )
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
    terminal: Terminal = Depends(require_writable_terminal),
    cashier: CashierPrincipal = Depends(require_cashier_principal),
    db: Session = Depends(get_db),
):
    """
    Complete a product-only, service-only, or mixed checkout.

    Product rows and service rows are locked in ascending ID order.
    Product stock validation, cost snapshots, sale lines, and stock
    deductions are committed in one database transaction.
    """

    existing = get_sale_by_code(db, checkout.transaction_code)

    if existing is not None:
        if checkout_matches_sale(existing, checkout) and checkout_belongs_to_cashier(
            existing, cashier
        ):
            return sale_response(existing)

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This transaction code has already been used.",
        )

    try:
        (
            tax_rate,
            cash_rounding,
            settings_snapshot,
            allow_negative_inventory,
        ) = get_checkout_settings(db)

        requested_product_ids = sorted(item.product_id for item in checkout.items)

        requested_service_ids = sorted(item.service_id for item in checkout.services)

        locked_products = (
            db.scalars(
                select(Product)
                .where(Product.id.in_(requested_product_ids))
                .order_by(Product.id.asc())
                .with_for_update()
            ).all()
            if requested_product_ids
            else []
        )

        locked_services = (
            db.scalars(
                select(Service)
                .where(Service.id.in_(requested_service_ids))
                .order_by(Service.id.asc())
                .with_for_update()
            ).all()
            if requested_service_ids
            else []
        )

        products_by_id = {product.id: product for product in locked_products}
        services_by_id = {service.id: service for service in locked_services}

        missing_product_ids = [
            product_id
            for product_id in requested_product_ids
            if product_id not in products_by_id
        ]

        if missing_product_ids:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Product ID {missing_product_ids[0]} does not exist.",
            )

        missing_service_ids = [
            service_id
            for service_id in requested_service_ids
            if service_id not in services_by_id
        ]

        if missing_service_ids:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Service ID {missing_service_ids[0]} does not exist.",
            )

        # Recheck after locks. This handles simultaneous requests using
        # the same transaction code.
        existing = get_sale_by_code(db, checkout.transaction_code)

        if existing is not None:
            if checkout_matches_sale(
                existing, checkout
            ) and checkout_belongs_to_cashier(existing, cashier):
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

        calculated_products = []
        calculated_services = []
        subtotal = ZERO_MONEY

        for item in checkout.items:
            product = products_by_id[item.product_id]

            if not allow_negative_inventory and product.stock < item.quantity:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        f"Insufficient stock for '{product.name}'. "
                        f"Available: {product.stock}; requested: {item.quantity}."
                    ),
                )

            unit_price = Decimal(product.price).quantize(CENT)
            line_total = (unit_price * item.quantity).quantize(CENT)

            unit_cost = (
                Decimal(product.average_cost).quantize(COST_PRECISION)
                if product.average_cost is not None
                else None
            )

            subtotal += line_total

            calculated_products.append(
                (item, product, unit_price, unit_cost, line_total)
            )

        for item in checkout.services:
            service = services_by_id[item.service_id]

            unit_price = Decimal(service.price).quantize(CENT)
            line_total = (unit_price * item.quantity).quantize(CENT)

            unit_cost = (
                Decimal(service.estimated_cost).quantize(COST_PRECISION)
                if service.estimated_cost is not None
                else None
            )

            subtotal += line_total

            calculated_services.append(
                (item, service, unit_price, unit_cost, line_total)
            )

        subtotal = subtotal.quantize(CENT)
        tax_amount = calculate_tax(subtotal, tax_rate)
        unrounded_total = (subtotal + tax_amount).quantize(CENT)

        if checkout.payment_method == "cash":
            total = round_cash_total(unrounded_total, cash_rounding)
            amount_tendered = checkout.amount_tendered

            if amount_tendered is None or amount_tendered < total:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="The amount received is less than the amount due.",
                )

            amount_tendered = amount_tendered.quantize(CENT)
            change_due = (amount_tendered - total).quantize(CENT)
        else:
            total = unrounded_total
            amount_tendered = total
            change_due = ZERO_MONEY

        sale = Sale(
            transaction_code=checkout.transaction_code,
            payment_method=checkout.payment_method,
            reference_number=checkout.reference_number,
            status="completed",
            subtotal=subtotal,
            tax_amount=tax_amount,
            total=total,
            amount_tendered=amount_tendered,
            change_due=change_due,
            settings_snapshot=settings_snapshot,
            cashier_id=cashier.cashier.id,
            terminal_id=terminal.id,
            cashier_username=cashier.cashier.username,
            cashier_display_name=cashier.cashier.display_name,
            terminal_device_id=terminal.device_id,
        )

        db.add(sale)
        db.flush()

        for item, product, unit_price, unit_cost, line_total in calculated_products:
            db.add(
                SaleItem(
                    sale_id=sale.id,
                    product_id=product.id,
                    product_name=product.name,
                    sku=product.sku,
                    category=product.category,
                    unit_price=unit_price,
                    unit_cost=unit_cost,
                    quantity=item.quantity,
                    line_total=line_total,
                )
            )

            product.stock -= item.quantity
            product.how_much_sold += item.quantity

        for item, service, unit_price, unit_cost, line_total in calculated_services:
            db.add(
                SaleServiceItem(
                    sale_id=sale.id,
                    service_id=service.id,
                    service_name=service.name,
                    description=service.description,
                    unit_price=unit_price,
                    unit_cost=unit_cost,
                    quantity=item.quantity,
                    line_total=line_total,
                )
            )

        sale_id = sale.id
        db.commit()

        saved_sale = db.scalar(
            select(Sale)
            .options(
                selectinload(Sale.items),
                selectinload(Sale.service_items),
            )
            .where(Sale.id == sale_id)
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

        if (
            existing is not None
            and checkout_matches_sale(existing, checkout)
            and checkout_belongs_to_cashier(existing, cashier)
        ):
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
        logger.exception("Could not complete checkout.")

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
    _authorized: object = Depends(require_admin_or_terminal),
    db: Session = Depends(get_db),
):
    sale = get_sale_by_code(
        db,
        transaction_code.strip().upper(),
    )

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

    product_quantity = (
        db.scalar(
            select(func.coalesce(func.sum(SaleItem.quantity), 0))
            .join(Sale, Sale.id == SaleItem.sale_id)
            .where(*conditions)
        )
        or 0
    )

    service_quantity = (
        db.scalar(
            select(func.coalesce(func.sum(SaleServiceItem.quantity), 0))
            .join(Sale, Sale.id == SaleServiceItem.sale_id)
            .where(*conditions)
        )
        or 0
    )

    return {
        "sales": float(revenue or ZERO_MONEY),
        "transactions": int(transaction_count or 0),
        "items": int(product_quantity) + int(service_quantity),
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

    product_quantities = dict(
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

    service_quantities = dict(
        db.execute(
            select(
                SaleServiceItem.sale_id,
                func.sum(SaleServiceItem.quantity),
            )
            .join(Sale, Sale.id == SaleServiceItem.sale_id)
            .where(*conditions)
            .group_by(SaleServiceItem.sale_id)
        ).all()
    )

    quantities = {
        sale_id: int(product_quantities.get(sale_id, 0) or 0)
        + int(service_quantities.get(sale_id, 0) or 0)
        for sale_id in {row.id for row in sales}
    }

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
                "label": (
                    cursor.strftime("%a") if period == "weekly" else str(cursor.day)
                ),
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
    _authorized: object = Depends(require_admin_or_terminal),
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

    trailing_series = []

    if period == "weekly":
        trailing_start = selected_date - timedelta(days=6)
        trailing_end = selected_date + timedelta(days=1)

        trailing_rows, trailing_quantities = load_period_rows(
            db,
            trailing_start,
            trailing_end,
        )

        trailing_series = build_series(
            "weekly",
            trailing_start,
            trailing_end,
            trailing_rows,
            trailing_quantities,
        )

    return {
        "period": period,
        "date": selected_date.isoformat(),
        "timezone": REPORT_TIMEZONE.key,
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
        "trailing_series": trailing_series,
    }


# --------------------------------------------------
# Product and category sales reports
# --------------------------------------------------


def normalize_category(value: str | None) -> str:
    if value is None or not value.strip():
        return "Uncategorized"
    return value.strip()


def build_category_series(
    db: Session,
    period: ReportPeriod,
    start_date: date,
    end_date: date,
    selected_categories: list[str],
) -> list[dict]:
    if not selected_categories:
        return []

    conditions = sale_conditions(start_date, end_date)

    local_created_at = func.timezone(
        REPORT_TIMEZONE.key,
        Sale.created_at,
    )

    if period == "daily":
        bucket_expression = func.extract("hour", local_created_at)
    elif period == "yearly":
        bucket_expression = func.extract("month", local_created_at)
    else:
        bucket_expression = cast(local_created_at, SQLDate)

    rows = db.execute(
        select(
            SaleItem.category,
            bucket_expression.label("bucket"),
            func.coalesce(
                func.sum(SaleItem.line_total),
                ZERO_MONEY,
            ).label("revenue"),
        )
        .join(Sale, Sale.id == SaleItem.sale_id)
        .where(*conditions)
        .group_by(SaleItem.category, bucket_expression)
    ).all()

    selected_category_set = set(selected_categories)
    revenue_by_bucket: dict[object, dict[str, Decimal]] = {}

    for row in rows:
        category = normalize_category(row.category)

        if category not in selected_category_set:
            continue

        bucket_key = int(row.bucket) if period in ("daily", "yearly") else row.bucket

        bucket_categories = revenue_by_bucket.setdefault(bucket_key, {})
        bucket_categories[category] = bucket_categories.get(
            category, ZERO_MONEY
        ) + Decimal(row.revenue or ZERO_MONEY)

    buckets: list[dict] = []
    bucket_keys: list[object] = []

    if period == "daily":
        for hour in range(24):
            bucket_keys.append(hour)
            buckets.append({"label": f"{hour:02d}:00"})

    elif period == "yearly":
        for month in range(1, 13):
            bucket_keys.append(month)
            buckets.append({"label": date(start_date.year, month, 1).strftime("%b")})

    else:
        cursor = start_date

        while cursor < end_date:
            bucket_keys.append(cursor)
            buckets.append(
                {
                    "label": (
                        cursor.strftime("%a") if period == "weekly" else str(cursor.day)
                    ),
                    "date": cursor.isoformat(),
                }
            )
            cursor += timedelta(days=1)

    return [
        {
            **bucket,
            "categories": {
                category: float(
                    revenue_by_bucket.get(bucket_key, {}).get(
                        category,
                        ZERO_MONEY,
                    )
                )
                for category in selected_categories
            },
        }
        for bucket_key, bucket in zip(bucket_keys, buckets)
    ]


@router.get("/reports/products", tags=["Reports"])
def get_product_report(
    limit: int = Query(default=5, ge=1, le=100),
    period: ReportPeriod | None = Query(default=None),
    report_date: date | None = Query(default=None, alias="date"),
    _authorized: object = Depends(require_admin_or_terminal),
    db: Session = Depends(get_db),
):
    selected_date = report_date or datetime.now(REPORT_TIMEZONE).date()

    if period is not None:
        current_start, current_end = period_dates(period, selected_date)
        conditions = sale_conditions(current_start, current_end)
    else:
        current_start = None
        current_end = None
        conditions = [Sale.status == "completed"]

    category_rows = db.execute(
        select(
            SaleItem.category,
            func.sum(SaleItem.quantity).label("units_sold"),
            func.sum(SaleItem.line_total).label("revenue"),
        )
        .join(Sale, Sale.id == SaleItem.sale_id)
        .where(*conditions)
        .group_by(SaleItem.category)
    ).all()

    category_totals: dict[str, dict] = {}

    for row in category_rows:
        category = normalize_category(row.category)

        total = category_totals.setdefault(
            category,
            {
                "category": category,
                "units_sold": 0,
                "revenue": ZERO_MONEY,
            },
        )

        total["units_sold"] += int(row.units_sold or 0)
        total["revenue"] += Decimal(row.revenue or ZERO_MONEY)

    sorted_categories = sorted(
        category_totals.values(),
        key=lambda item: (
            -item["revenue"],
            item["category"].casefold(),
        ),
    )

    visible_categories = (
        sorted_categories[:limit] if period is not None else sorted_categories
    )

    categories = [
        {
            "category": item["category"],
            "units_sold": item["units_sold"],
            "revenue": float(item["revenue"]),
        }
        for item in visible_categories
    ]

    top_category_names = [item["category"] for item in visible_categories[:limit]]

    category_series = (
        build_category_series(
            db,
            period,
            current_start,
            current_end,
            top_category_names,
        )
        if period is not None
        else []
    )

    product_rows = db.execute(
        select(
            SaleItem.product_id,
            SaleItem.product_name,
            SaleItem.category,
            func.sum(SaleItem.quantity).label("units_sold"),
            func.sum(SaleItem.line_total).label("revenue"),
        )
        .join(Sale, Sale.id == SaleItem.sale_id)
        .where(*conditions)
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
        "period": period,
        "date": selected_date.isoformat() if period is not None else None,
        "timezone": REPORT_TIMEZONE.key,
        "period_start": current_start.isoformat() if current_start else None,
        "period_end_exclusive": current_end.isoformat() if current_end else None,
        "categories": categories,
        "category_series": category_series,
        "top_products": [
            {
                "product_id": row.product_id,
                "name": row.product_name,
                "category": normalize_category(row.category),
                "units_sold": int(row.units_sold or 0),
                "revenue": float(row.revenue or ZERO_MONEY),
            }
            for row in product_rows
        ],
    }
