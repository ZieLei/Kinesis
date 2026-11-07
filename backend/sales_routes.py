from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import logging
import re
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    Request,
    status,
)
from pydantic import (
    BaseModel,
    Field,
    SecretStr,
    field_validator,
    model_validator,
)
from sqlalchemy import Date as SQLDate, String, case, cast, func, literal, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session, selectinload

from auth.password import DUMMY_PASSWORD_HASH, verify_password
from cashier_models import Cashier
from cashier_routes import CashierPrincipal, require_cashier_principal
from cashier_sessions import (
    cashier_login_attempt_keys,
    lock_cashier_login_attempts,
    record_failed_cashier_login,
    reset_cashier_login_attempts,
)
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

USERNAME_PATTERN = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9._-]{2,63}$")
PIN_PATTERN = re.compile(r"^\d{6}$")

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
    "supervisorPinForDiscounts": True,
    "allowCustomLineItems": False,
    "discountLimit": "10",
    "inactivityLock": "5",
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

    items: list[CheckoutItem] = Field(
        default_factory=list,
        max_length=100,
    )

    services: list[CheckoutService] = Field(
        default_factory=list,
        max_length=100,
    )

    # Percentage discount applied to the original subtotal.
    # The server always calculates the actual monetary discount.
    discount_percent: Decimal = Field(
        default=Decimal("0.00"),
        ge=0,
        le=100,
        max_digits=5,
        decimal_places=2,
    )

    # Required only when the discount exceeds the cashier limit
    # and supervisor authorization is enabled.
    supervisor_username: str | None = Field(
        default=None,
        min_length=3,
        max_length=64,
    )

    supervisor_pin: SecretStr | None = None

    amount_tendered: Decimal | None = Field(
        default=None,
        ge=0,
        max_digits=12,
        decimal_places=2,
    )

    reference_number: str | None = Field(
        default=None,
        max_length=64,
    )

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

    @field_validator("supervisor_username")
    @classmethod
    def normalize_supervisor_username(
        cls,
        value: str | None,
    ) -> str | None:
        if value is None:
            return None

        value = value.strip().lower()

        if not USERNAME_PATTERN.fullmatch(value):
            raise ValueError("Enter a valid supervisor username.")

        return value

    @field_validator("supervisor_pin")
    @classmethod
    def validate_supervisor_pin(
        cls,
        value: SecretStr | None,
    ) -> SecretStr | None:
        if value is not None and not PIN_PATTERN.fullmatch(value.get_secret_value()):
            raise ValueError("Supervisor PIN must contain exactly six digits.")

        return value

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

        has_supervisor_username = self.supervisor_username is not None
        has_supervisor_pin = self.supervisor_pin is not None

        if has_supervisor_username != has_supervisor_pin:
            raise ValueError("Supervisor username and PIN must be provided together.")

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
) -> tuple[Decimal, Decimal, dict, bool, Decimal, bool]:
    statement = (
        pg_insert(AppSettings)
        .values(
            id=1,
            settings=DEFAULT_SETTINGS,
            version=1,
        )
        .on_conflict_do_nothing(
            index_elements=[AppSettings.id],
        )
    )

    db.execute(statement)

    row = db.scalar(
        select(AppSettings).where(AppSettings.id == 1).with_for_update(read=True)
    )

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=("Application settings could not be loaded for checkout."),
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

        discount_limit = Decimal(str(stored_settings.get("discountLimit", "10")))

    except (InvalidOperation, ValueError, TypeError) as exc:
        logger.error("Invalid pricing or discount settings in the database.")

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The saved checkout settings are invalid.",
        ) from exc

    if not tax_rate.is_finite() or not Decimal("0") <= tax_rate <= Decimal("100"):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The saved tax rate is outside the permitted range.",
        )

    if not discount_limit.is_finite() or not Decimal("0") <= discount_limit <= Decimal(
        "100"
    ):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=("The saved discount limit is outside the permitted range."),
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

    supervisor_pin_required = stored_settings.get(
        "supervisorPinForDiscounts",
        True,
    )

    if not isinstance(allow_negative_inventory, bool):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=("The saved negative-inventory setting is invalid."),
        )

    if not isinstance(supervisor_pin_required, bool):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=("The saved supervisor authorization setting is invalid."),
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
        "supervisorPinForDiscounts",
        "discountLimit",
        "inactivityLock",
    )

    snapshot = {
        key: stored_settings.get(
            key,
            DEFAULT_SETTINGS.get(key),
        )
        for key in snapshot_keys
    }

    return (
        tax_rate,
        cash_rounding,
        snapshot,
        allow_negative_inventory,
        discount_limit,
        supervisor_pin_required,
    )


def calculate_tax(
    subtotal: Decimal,
    tax_rate: Decimal,
) -> Decimal:
    return (subtotal * tax_rate / Decimal("100")).quantize(
        CENT,
        rounding=ROUND_HALF_UP,
    )


def round_cash_total(
    amount: Decimal,
    increment: Decimal,
) -> Decimal:
    if increment == CENT:
        return amount.quantize(
            CENT,
            rounding=ROUND_HALF_UP,
        )

    units = (amount / increment).quantize(
        Decimal("1"),
        rounding=ROUND_HALF_UP,
    )

    return (units * increment).quantize(
        CENT,
        rounding=ROUND_HALF_UP,
    )


def money_to_cents(amount: Decimal) -> int:
    return int((amount.quantize(CENT) * 100).to_integral_value())


def cents_to_money(amount: int) -> Decimal:
    return (Decimal(amount) / 100).quantize(CENT)


def calculate_discount(
    gross_subtotal: Decimal,
    discount_percent: Decimal,
) -> Decimal:
    """
    Calculate the monetary discount from the original subtotal.

    All monetary calculations are performed with Decimal.
    """

    return (gross_subtotal * discount_percent / Decimal("100")).quantize(
        CENT,
        rounding=ROUND_HALF_UP,
    )


def allocate_discount(
    discount_amount: Decimal,
    line_gross_totals: list[Decimal],
) -> list[Decimal]:
    """
    Allocate a sale-wide discount proportionally across its lines.

    Uses integer cents and largest-remainder allocation. This ensures
    the sum of line discounts always equals the sale discount exactly.
    """

    if not line_gross_totals:
        return []

    gross_cents = [money_to_cents(amount) for amount in line_gross_totals]

    total_gross_cents = sum(gross_cents)
    total_discount_cents = money_to_cents(discount_amount)

    if total_discount_cents == 0:
        return [ZERO_MONEY for _ in line_gross_totals]

    if total_gross_cents <= 0:
        raise ValueError("A discount cannot be allocated to a zero-value sale.")

    if total_discount_cents > total_gross_cents:
        raise ValueError("The discount cannot exceed the original sale amount.")

    allocations: list[int] = []
    remainders: list[tuple[int, int]] = []

    for index, line_cents in enumerate(gross_cents):
        base_amount, remainder = divmod(
            total_discount_cents * line_cents,
            total_gross_cents,
        )

        allocations.append(base_amount)
        remainders.append((remainder, index))

    remaining_cents = total_discount_cents - sum(allocations)

    # Deterministic largest-remainder distribution.
    remainders.sort(key=lambda entry: (-entry[0], entry[1]))

    for _, index in remainders[:remaining_cents]:
        allocations[index] += 1

    return [cents_to_money(amount) for amount in allocations]


# --------------------------------------------------
# Supervisor authorization
# --------------------------------------------------


def get_request_ip(request: Request) -> str | None:
    if request.client is None:
        return None

    return request.client.host[:45]


def authorize_supervisor_discount(
    db: Session,
    request: Request,
    username: str,
    pin: SecretStr,
) -> Cashier:
    """
    Verify an active supervisor account and PIN.

    The supervisor row remains locked until the checkout transaction
    commits, preventing a simultaneous role change or PIN reset from
    racing with the authorization.
    """

    attempt_keys = cashier_login_attempt_keys(
        username,
        get_request_ip(request),
    )

    attempts, retry_after = lock_cashier_login_attempts(
        db,
        attempt_keys,
    )

    if retry_after:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                "Too many unsuccessful supervisor PIN attempts. Please try again later."
            ),
            headers={
                "Retry-After": str(retry_after),
                "Cache-Control": "no-store",
            },
        )

    supervisor = db.scalar(
        select(Cashier)
        .where(Cashier.username == username)
        .with_for_update()
        .execution_options(populate_existing=True)
    )

    stored_hash = supervisor.pin_hash if supervisor is not None else DUMMY_PASSWORD_HASH

    pin_valid = verify_password(
        pin.get_secret_value(),
        stored_hash,
    )

    if (
        supervisor is None
        or not supervisor.is_active
        or not supervisor.is_supervisor
        or not pin_valid
    ):
        record_failed_cashier_login(attempts)
        db.commit()

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Supervisor authorization failed. Check the credentials.",
        )

    reset_cashier_login_attempts(
        db,
        attempt_keys,
    )

    return supervisor


# --------------------------------------------------
# Transaction response helpers
# --------------------------------------------------


def sale_response(sale: Sale) -> dict:
    subtotal = Decimal(sale.subtotal)
    gross_subtotal = Decimal(sale.gross_subtotal)
    discount_amount = Decimal(sale.discount_amount)
    discount_percent = Decimal(sale.discount_percent)

    tax_amount = Decimal(sale.tax_amount)
    total = Decimal(sale.total)

    rounding_adjustment = (total - subtotal - tax_amount).quantize(CENT)

    return {
        "id": sale.id,
        "transaction_code": sale.transaction_code,
        "payment_method": sale.payment_method,
        "reference_number": sale.reference_number,
        "status": sale.status,
        "gross_subtotal": float(gross_subtotal),
        "discount_amount": float(discount_amount),
        "discount_percent": float(discount_percent),
        "discount_authorized_by": (
            str(sale.discount_authorized_by)
            if sale.discount_authorized_by is not None
            else None
        ),
        "discount_authorized_username": (sale.discount_authorized_username),
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
                "discount_amount": float(item.discount_amount),
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
                "discount_amount": float(item.discount_amount),
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
        "gross_subtotal": float(sale.gross_subtotal),
        "discount_amount": float(sale.discount_amount),
        "discount_percent": float(sale.discount_percent),
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


def checkout_matches_sale(
    sale: Sale,
    request: CheckoutCreate,
) -> bool:
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

    if Decimal(sale.discount_percent).quantize(
        CENT
    ) != request.discount_percent.quantize(CENT):
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
        .order_by(
            Sale.created_at.desc(),
            Sale.id.desc(),
        )
        .offset(offset)
        .limit(limit)
    ).all()

    status_rows = db.execute(
        select(
            Sale.status,
            func.count(Sale.id),
        ).group_by(Sale.status)
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
    request: Request,
    terminal: Terminal = Depends(require_writable_terminal),
    cashier: CashierPrincipal = Depends(require_cashier_principal),
    db: Session = Depends(get_db),
):
    """
    Complete a product-only, service-only, or mixed checkout.

    Prices always come from the server database.

    Discounts are calculated by the server and allocated proportionally
    across all sale lines. A supervisor PIN is verified when required.

    Product rows and service rows are locked in ascending ID order.
    Product stock validation, cost snapshots, discounted sale lines,
    and stock deductions are committed in one database transaction.
    """

    # Idempotency recovery must happen before supervisor verification.
    # A previously committed sale can safely be returned even if the
    # original response was interrupted.
    existing = get_sale_by_code(
        db,
        checkout.transaction_code,
    )

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
            discount_limit,
            supervisor_pin_required,
        ) = get_checkout_settings(db)

        requested_discount = checkout.discount_percent.quantize(CENT)

        supervisor: Cashier | None = None

        # --------------------------------------------------
        # Discount authorization
        # --------------------------------------------------

        if requested_discount > discount_limit:
            if not supervisor_pin_required:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=(
                        "The requested discount exceeds the configured "
                        f"cashier limit of {discount_limit}%."
                    ),
                )

            if checkout.supervisor_username is None or checkout.supervisor_pin is None:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=(
                        "This discount requires supervisor authorization. "
                        "Enter a supervisor username and PIN."
                    ),
                )

            supervisor = authorize_supervisor_discount(
                db,
                request,
                checkout.supervisor_username,
                checkout.supervisor_pin,
            )

        # --------------------------------------------------
        # Acquire inventory and service locks
        # --------------------------------------------------

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
                detail=(f"Product ID {missing_product_ids[0]} does not exist."),
            )

        missing_service_ids = [
            service_id
            for service_id in requested_service_ids
            if service_id not in services_by_id
        ]

        if missing_service_ids:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=(f"Service ID {missing_service_ids[0]} does not exist."),
            )

        # Recheck after locks. This handles simultaneous requests
        # using the same transaction code.
        existing = get_sale_by_code(
            db,
            checkout.transaction_code,
        )

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

        # Checked under the row locks and after the idempotent replay above,
        # so a retried sale that already completed is still returned even if
        # the product was archived in between.
        archived_products = [
            product for product in locked_products if product.archived_at is not None
        ]

        if archived_products:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"'{archived_products[0].name}' is archived and can no "
                    "longer be sold."
                ),
            )

        # --------------------------------------------------
        # Duplicate GCash reference protection
        # --------------------------------------------------

        if checkout.reference_number:
            duplicate_reference = db.scalar(
                select(Sale.id).where(
                    Sale.reference_number == checkout.reference_number
                )
            )

            if duplicate_reference is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=("This GCash reference number has already been recorded."),
                )

        # --------------------------------------------------
        # Calculate original line prices and acquisition costs
        # --------------------------------------------------

        calculated_products = []
        calculated_services = []
        line_gross_totals: list[Decimal] = []

        for item in checkout.items:
            product = products_by_id[item.product_id]

            if not allow_negative_inventory and product.stock < item.quantity:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        f"Insufficient stock for '{product.name}'. "
                        f"Available: {product.stock}; "
                        f"requested: {item.quantity}."
                    ),
                )

            unit_price = Decimal(product.price).quantize(CENT)

            gross_line_total = (unit_price * item.quantity).quantize(CENT)

            unit_cost = (
                Decimal(product.average_cost).quantize(COST_PRECISION)
                if product.average_cost is not None
                else None
            )

            calculated_products.append(
                (
                    item,
                    product,
                    unit_price,
                    unit_cost,
                    gross_line_total,
                )
            )

            line_gross_totals.append(gross_line_total)

        for item in checkout.services:
            service = services_by_id[item.service_id]

            unit_price = Decimal(service.price).quantize(CENT)

            gross_line_total = (unit_price * item.quantity).quantize(CENT)

            unit_cost = (
                Decimal(service.estimated_cost).quantize(COST_PRECISION)
                if service.estimated_cost is not None
                else None
            )

            calculated_services.append(
                (
                    item,
                    service,
                    unit_price,
                    unit_cost,
                    gross_line_total,
                )
            )

            line_gross_totals.append(gross_line_total)

        # --------------------------------------------------
        # Calculate and allocate discount
        # --------------------------------------------------

        gross_subtotal = sum(
            line_gross_totals,
            ZERO_MONEY,
        ).quantize(CENT)

        discount_amount = calculate_discount(
            gross_subtotal,
            requested_discount,
        )

        allocations = allocate_discount(
            discount_amount,
            line_gross_totals,
        )

        subtotal = (gross_subtotal - discount_amount).quantize(CENT)

        # --------------------------------------------------
        # Tax and payment calculations
        # --------------------------------------------------

        tax_amount = calculate_tax(
            subtotal,
            tax_rate,
        )

        unrounded_total = (subtotal + tax_amount).quantize(CENT)

        if checkout.payment_method == "cash":
            total = round_cash_total(
                unrounded_total,
                cash_rounding,
            )

            amount_tendered = checkout.amount_tendered

            if amount_tendered is None or amount_tendered < total:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=("The amount received is less than the amount due."),
                )

            amount_tendered = amount_tendered.quantize(CENT)

            change_due = (amount_tendered - total).quantize(CENT)

        else:
            total = unrounded_total
            amount_tendered = total
            change_due = ZERO_MONEY

        # --------------------------------------------------
        # Persist sale
        # --------------------------------------------------

        sale = Sale(
            transaction_code=checkout.transaction_code,
            payment_method=checkout.payment_method,
            reference_number=checkout.reference_number,
            status="completed",
            gross_subtotal=gross_subtotal,
            discount_amount=discount_amount,
            discount_percent=requested_discount,
            discount_authorized_by=(supervisor.id if supervisor is not None else None),
            discount_authorized_username=(
                supervisor.username if supervisor is not None else None
            ),
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

        # --------------------------------------------------
        # Persist discounted product lines and deduct stock
        # --------------------------------------------------

        product_count = len(calculated_products)

        for index, (
            item,
            product,
            unit_price,
            unit_cost,
            gross_line_total,
        ) in enumerate(calculated_products):
            line_discount = allocations[index]

            discounted_line_total = (gross_line_total - line_discount).quantize(CENT)

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
                    discount_amount=line_discount,
                    line_total=discounted_line_total,
                )
            )

            product.stock -= item.quantity
            product.how_much_sold += item.quantity

        # --------------------------------------------------
        # Persist discounted service lines
        # --------------------------------------------------

        for service_index, (
            item,
            service,
            unit_price,
            unit_cost,
            gross_line_total,
        ) in enumerate(calculated_services):
            allocation_index = product_count + service_index

            line_discount = allocations[allocation_index]

            discounted_line_total = (gross_line_total - line_discount).quantize(CENT)

            db.add(
                SaleServiceItem(
                    sale_id=sale.id,
                    service_id=service.id,
                    service_name=service.name,
                    description=service.description,
                    unit_price=unit_price,
                    unit_cost=unit_cost,
                    quantity=item.quantity,
                    discount_amount=line_discount,
                    line_total=discounted_line_total,
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
                detail=("Sale was committed but could not be reloaded."),
            )

        return sale_response(saved_sale)

    except HTTPException:
        db.rollback()
        raise

    except IntegrityError as exc:
        db.rollback()

        existing = get_sale_by_code(
            db,
            checkout.transaction_code,
        )

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
                    detail=("This GCash reference number has already been recorded."),
                ) from exc

        logger.warning("Checkout failed due to a database constraint.")

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=("The checkout conflicts with an existing transaction."),
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
        start = date(
            reference_date.year,
            reference_date.month,
            1,
        )

        if reference_date.month == 12:
            end = date(reference_date.year + 1, 1, 1)
        else:
            end = date(
                reference_date.year,
                reference_date.month + 1,
                1,
            )

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
    conditions = sale_conditions(
        start_date,
        end_date,
    )

    transaction_count, revenue = db.execute(
        select(
            func.count(Sale.id),
            func.coalesce(
                func.sum(Sale.total),
                ZERO_MONEY,
            ),
        ).where(*conditions)
    ).one()

    product_quantity = (
        db.scalar(
            select(
                func.coalesce(
                    func.sum(SaleItem.quantity),
                    0,
                )
            )
            .join(
                Sale,
                Sale.id == SaleItem.sale_id,
            )
            .where(*conditions)
        )
        or 0
    )

    service_quantity = (
        db.scalar(
            select(
                func.coalesce(
                    func.sum(SaleServiceItem.quantity),
                    0,
                )
            )
            .join(
                Sale,
                Sale.id == SaleServiceItem.sale_id,
            )
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
    conditions = sale_conditions(
        start_date,
        end_date,
    )

    sales = db.execute(
        select(
            Sale.id,
            Sale.total,
            Sale.created_at,
        )
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
            .join(
                Sale,
                Sale.id == SaleItem.sale_id,
            )
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
            .join(
                Sale,
                Sale.id == SaleServiceItem.sale_id,
            )
            .where(*conditions)
            .group_by(SaleServiceItem.sale_id)
        ).all()
    )

    quantities = {
        sale_id: (
            int(product_quantities.get(sale_id, 0) or 0)
            + int(service_quantities.get(sale_id, 0) or 0)
        )
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
                "label": date(
                    start_date.year,
                    month,
                    1,
                ).strftime("%b"),
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
    report_date: date | None = Query(
        default=None,
        alias="date",
    ),
    _authorized: object = Depends(require_admin_or_terminal),
    db: Session = Depends(get_db),
):
    selected_date = report_date or datetime.now(REPORT_TIMEZONE).date()

    current_start, current_end = period_dates(
        period,
        selected_date,
    )

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
        "current": sales_summary(
            db,
            current_start,
            current_end,
        ),
        "previous": sales_summary(
            db,
            previous_start,
            previous_end,
        ),
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

    conditions = sale_conditions(
        start_date,
        end_date,
    )

    local_created_at = func.timezone(
        REPORT_TIMEZONE.key,
        Sale.created_at,
    )

    if period == "daily":
        bucket_expression = func.extract(
            "hour",
            local_created_at,
        )
    elif period == "yearly":
        bucket_expression = func.extract(
            "month",
            local_created_at,
        )
    else:
        bucket_expression = cast(
            local_created_at,
            SQLDate,
        )

    rows = db.execute(
        select(
            SaleItem.category,
            bucket_expression.label("bucket"),
            func.coalesce(
                func.sum(SaleItem.line_total),
                ZERO_MONEY,
            ).label("revenue"),
        )
        .join(
            Sale,
            Sale.id == SaleItem.sale_id,
        )
        .where(*conditions)
        .group_by(
            SaleItem.category,
            bucket_expression,
        )
    ).all()

    selected_category_set = set(selected_categories)

    revenue_by_bucket: dict[
        object,
        dict[str, Decimal],
    ] = {}

    for row in rows:
        category = normalize_category(row.category)

        if category not in selected_category_set:
            continue

        bucket_key = int(row.bucket) if period in ("daily", "yearly") else row.bucket

        bucket_categories = revenue_by_bucket.setdefault(
            bucket_key,
            {},
        )

        bucket_categories[category] = bucket_categories.get(
            category,
            ZERO_MONEY,
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

            buckets.append(
                {
                    "label": date(
                        start_date.year,
                        month,
                        1,
                    ).strftime("%b")
                }
            )

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
                    revenue_by_bucket.get(
                        bucket_key,
                        {},
                    ).get(
                        category,
                        ZERO_MONEY,
                    )
                )
                for category in selected_categories
            },
        }
        for bucket_key, bucket in zip(
            bucket_keys,
            buckets,
        )
    ]


@router.get("/reports/products", tags=["Reports"])
def get_product_report(
    limit: int = Query(default=5, ge=1, le=100),
    period: ReportPeriod | None = Query(default=None),
    report_date: date | None = Query(
        default=None,
        alias="date",
    ),
    offset: int = Query(default=0, ge=0),
    search: str | None = Query(default=None, max_length=150),
    # Not named `category`: the function body reuses that name in a loop.
    category_filter: list[str] | None = Query(default=None, alias="category"),
    min_units: int | None = Query(default=None, ge=0),
    max_units: int | None = Query(default=None, ge=0),
    include_unsold: bool = Query(default=False),
    _authorized: object = Depends(require_admin_or_terminal),
    db: Session = Depends(get_db),
):
    selected_date = report_date or datetime.now(REPORT_TIMEZONE).date()

    if period is not None:
        current_start, current_end = period_dates(
            period,
            selected_date,
        )

        conditions = sale_conditions(
            current_start,
            current_end,
        )

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
        .join(
            Sale,
            Sale.id == SaleItem.sale_id,
        )
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

    ranked_products = product_sales_rows(db, conditions, include_unsold)

    search_term = (search or "").strip().casefold()
    selected_categories = {
        normalize_category(value).casefold() for value in (category_filter or [])
    }

    filtered_products = [
        row
        for row in ranked_products
        if (
            not search_term
            or search_term in row["name"].casefold()
            or search_term in (row["sku"] or "").casefold()
        )
        and (
            not selected_categories
            or row["category"].casefold() in selected_categories
        )
        and (min_units is None or row["units_sold"] >= min_units)
        and (max_units is None or row["units_sold"] <= max_units)
    ]

    return {
        "period": period,
        "date": (selected_date.isoformat() if period is not None else None),
        "timezone": REPORT_TIMEZONE.key,
        "period_start": (current_start.isoformat() if current_start else None),
        "period_end_exclusive": (current_end.isoformat() if current_end else None),
        "categories": categories,
        "category_series": category_series,
        "top_products": filtered_products[offset : offset + limit],
        "total_products": len(filtered_products),
        "offset": offset,
        "limit": limit,
    }


def product_group_key():
    """
    Identity of a product in sales history.

    Lines linked to a product group by product ID, so renames and
    recategorization never split a product. Lines whose product was
    hard-deleted before archiving existed (product_id NULL) group by their
    saved SKU, or by their saved name when they have no SKU.
    """

    saved_sku = func.nullif(func.btrim(SaleItem.sku), "")

    return case(
        (
            SaleItem.product_id.is_not(None),
            literal("p:") + cast(SaleItem.product_id, String),
        ),
        (saved_sku.is_not(None), literal("s:") + saved_sku),
        else_=literal("n:") + func.lower(func.btrim(SaleItem.product_name)),
    )


def product_sales_rows(
    db: Session,
    conditions: list,
    include_unsold: bool,
) -> list[dict]:
    """
    Completed product sales per product, ranked by units then revenue.

    Totals come only from sale lines (never products.how_much_sold), so
    archived and previously deleted products keep their history. Sale
    lines are read, never modified.
    """

    group_key = product_group_key().label("group_key")

    totals = db.execute(
        select(
            group_key,
            func.max(SaleItem.product_id).label("product_id"),
            func.sum(SaleItem.quantity).label("units_sold"),
            func.sum(SaleItem.line_total).label("revenue"),
        )
        .join(Sale, Sale.id == SaleItem.sale_id)
        .where(*conditions)
        .group_by(group_key)
    ).all()

    # Most recent saved name/SKU/category per group, used for products that
    # no longer exist.
    recency = (
        func.row_number()
        .over(
            partition_by=product_group_key(),
            order_by=(Sale.created_at.desc(), SaleItem.id.desc()),
        )
        .label("recency")
    )

    latest = (
        select(
            product_group_key().label("group_key"),
            SaleItem.product_name,
            SaleItem.sku,
            SaleItem.category,
            recency,
        )
        .join(Sale, Sale.id == SaleItem.sale_id)
        .where(*conditions)
        .subquery()
    )

    snapshots = {
        row.group_key: row
        for row in db.execute(select(latest).where(latest.c.recency == 1))
    }

    product_ids = [row.product_id for row in totals if row.product_id is not None]

    products = {
        product.id: product
        for product in (
            db.scalars(select(Product).where(Product.id.in_(product_ids)))
            if product_ids
            else []
        )
    }

    rows = []

    for total in totals:
        product = products.get(total.product_id)
        snapshot = snapshots[total.group_key]

        rows.append(
            {
                "product_id": total.product_id,
                "sku": product.sku if product else snapshot.sku,
                "name": product.name if product else snapshot.product_name,
                "category": normalize_category(
                    product.category if product else snapshot.category
                ),
                "units_sold": int(total.units_sold or 0),
                "revenue": float(total.revenue or ZERO_MONEY),
                "archived": product is not None and product.archived_at is not None,
                # The product row no longer exists; only its sales remain.
                "deleted": product is None,
            }
        )

    if include_unsold:
        unsold_statement = select(Product).where(Product.archived_at.is_(None))

        if product_ids:
            unsold_statement = unsold_statement.where(Product.id.not_in(product_ids))

        unsold = db.scalars(unsold_statement)

        rows.extend(
            {
                "product_id": product.id,
                "sku": product.sku,
                "name": product.name,
                "category": normalize_category(product.category),
                "units_sold": 0,
                "revenue": 0.0,
                "archived": False,
                "deleted": False,
            }
            for product in unsold
        )

    rows.sort(
        key=lambda row: (
            -row["units_sold"],
            -row["revenue"],
            row["name"].casefold(),
            row["product_id"] or 0,
            row["sku"] or "",
        )
    )

    return rows
