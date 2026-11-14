from datetime import date, datetime, time, timedelta, timezone
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from activity_models import ActivityEvent
from cashier_models import Cashier, CashierSession
from cashier_routes import require_admin_session
from database import get_db
from models import AppSettings, Product, Sale, Service, Terminal


router = APIRouter(
    prefix="/api/admin/overview",
    tags=["Admin overview"],
)

BUSINESS_TIMEZONE = ZoneInfo("Asia/Manila")

TERMINAL_OFFLINE_AFTER_SECONDS = 90


def _as_iso(value):
    return value.isoformat() if value is not None else None


def _as_float(value):
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _terminal_connected(terminal, now_utc: datetime) -> bool:
    last_seen = getattr(terminal, "last_seen_at", None)

    if last_seen is None:
        return False

    if last_seen.tzinfo is None:
        last_seen = last_seen.replace(tzinfo=timezone.utc)

    age = (now_utc - last_seen).total_seconds()

    return age <= TERMINAL_OFFLINE_AFTER_SECONDS and bool(
        getattr(terminal, "is_enabled", True)
    )


def _terminal_response(terminal, now_utc: datetime) -> dict:
    terminal_id = getattr(terminal, "id", None)
    device_id = getattr(terminal, "device_id", None)

    name = (
        getattr(terminal, "name", None)
        or getattr(terminal, "terminal_name", None)
        or device_id
        or f"Terminal {terminal_id}"
    )

    enabled = bool(getattr(terminal, "is_enabled", True))
    maintenance = bool(getattr(terminal, "maintenance_mode", False))
    connected = _terminal_connected(terminal, now_utc)

    if not enabled:
        state = "disabled"
    elif maintenance:
        state = "maintenance"
    elif connected:
        state = "connected"
    else:
        state = "disconnected"

    return {
        "id": terminal_id,
        "name": name,
        "device_id": device_id,
        "ip_address": getattr(terminal, "ip_address", None),
        "is_enabled": enabled,
        "maintenance_mode": maintenance,
        "connected": connected,
        "status": state,
        "last_seen_at": _as_iso(getattr(terminal, "last_seen_at", None)),
        "last_sync_at": _as_iso(getattr(terminal, "last_sync_at", None)),
    }


def _low_stock_threshold(db: Session) -> int:
    settings_row = db.scalar(select(AppSettings).limit(1))

    settings_data = (
        getattr(settings_row, "settings", None) if settings_row is not None else None
    )

    if not isinstance(settings_data, dict):
        return 5

    value = settings_data.get("lowStockThreshold", 5)

    try:
        return max(0, int(value))
    except (TypeError, ValueError):
        return 5


def _payment_period_bounds(
    period: Literal["daily", "weekly", "monthly", "yearly"],
    now_local: datetime,
) -> tuple[datetime, datetime]:
    today = now_local.date()

    if period == "daily":
        start_date = today
        end_date = start_date + timedelta(days=1)

    elif period == "weekly":
        start_date = today - timedelta(days=today.weekday())
        end_date = start_date + timedelta(days=7)

    elif period == "monthly":
        start_date = date(today.year, today.month, 1)

        if today.month == 12:
            end_date = date(today.year + 1, 1, 1)
        else:
            end_date = date(today.year, today.month + 1, 1)

    else:
        start_date = date(today.year, 1, 1)
        end_date = date(today.year + 1, 1, 1)

    start_local = datetime.combine(
        start_date,
        time.min,
        tzinfo=BUSINESS_TIMEZONE,
    )

    end_local = datetime.combine(
        end_date,
        time.min,
        tzinfo=BUSINESS_TIMEZONE,
    )

    return (
        start_local.astimezone(timezone.utc),
        end_local.astimezone(timezone.utc),
    )


@router.get("/payment-breakdown")
def get_payment_breakdown(
    period: Literal["daily", "weekly", "monthly", "yearly"] = "daily",
    _admin: object = Depends(require_admin_session),
    db: Session = Depends(get_db),
):
    now_local = datetime.now(timezone.utc).astimezone(BUSINESS_TIMEZONE)

    start_utc, end_utc = _payment_period_bounds(period, now_local)

    payment_rows = db.execute(
        select(
            Sale.payment_method,
            func.count(Sale.id),
            func.coalesce(func.sum(Sale.total), 0),
        )
        .where(
            Sale.status == "completed",
            Sale.created_at >= start_utc,
            Sale.created_at < end_utc,
        )
        .group_by(Sale.payment_method)
        .order_by(func.sum(Sale.total).desc())
    ).all()

    payment_breakdown = [
        {
            "payment_method": method or "unknown",
            "transactions": int(count),
            "revenue": _as_float(revenue),
        }
        for method, count, revenue in payment_rows
    ]

    return {
        "period": period,
        "timezone": "Asia/Manila",
        "period_start": _as_iso(start_utc),
        "period_end_exclusive": _as_iso(end_utc),
        "payment_breakdown": payment_breakdown,
    }


@router.get("/operations")
def get_operations_overview(
    _admin: object = Depends(require_admin_session),
    db: Session = Depends(get_db),
):
    now_utc = datetime.now(timezone.utc)
    now_local = now_utc.astimezone(BUSINESS_TIMEZONE)

    start_of_day_local = datetime.combine(
        now_local.date(),
        time.min,
        tzinfo=BUSINESS_TIMEZONE,
    )

    start_of_day_utc = start_of_day_local.astimezone(timezone.utc)

    completed_sales_filter = (
        Sale.status == "completed",
        Sale.created_at >= start_of_day_utc,
    )

    today_revenue = db.scalar(
        select(func.coalesce(func.sum(Sale.total), 0)).where(*completed_sales_filter)
    )

    today_transactions = (
        db.scalar(select(func.count(Sale.id)).where(*completed_sales_filter)) or 0
    )

    today_revenue_value = _as_float(today_revenue)

    # Excluded from the figures above; shown so the owner sees them.
    reversed_today_count, reversed_today_amount = db.execute(
        select(
            func.count(Sale.id),
            func.coalesce(func.sum(Sale.total), 0),
        ).where(
            Sale.status.in_(("voided", "refunded")),
            Sale.created_at >= start_of_day_utc,
        )
    ).one()

    average_transaction_value = (
        today_revenue_value / today_transactions if today_transactions else 0
    )

    payment_rows = db.execute(
        select(
            Sale.payment_method,
            func.count(Sale.id),
            func.coalesce(func.sum(Sale.total), 0),
        )
        .where(*completed_sales_filter)
        .group_by(Sale.payment_method)
        .order_by(func.sum(Sale.total).desc())
    ).all()

    payment_breakdown = [
        {
            "payment_method": method or "unknown",
            "transactions": int(count),
            "revenue": _as_float(revenue),
        }
        for method, count, revenue in payment_rows
    ]

    terminals = db.scalars(select(Terminal).order_by(Terminal.id.asc())).all()

    terminal_items = [_terminal_response(terminal, now_utc) for terminal in terminals]

    terminal_summary = {
        "total": len(terminal_items),
        "enabled": sum(1 for terminal in terminal_items if terminal["is_enabled"]),
        "connected": sum(1 for terminal in terminal_items if terminal["connected"]),
        "disconnected": sum(
            1
            for terminal in terminal_items
            if (
                terminal["is_enabled"]
                and not terminal["connected"]
                and not terminal["maintenance_mode"]
            )
        ),
        "maintenance": sum(
            1 for terminal in terminal_items if terminal["maintenance_mode"]
        ),
        "disabled": sum(1 for terminal in terminal_items if not terminal["is_enabled"]),
    }

    terminal_by_id = {terminal["id"]: terminal for terminal in terminal_items}

    active_sessions = db.scalars(
        select(CashierSession).where(
            CashierSession.revoked_at.is_(None),
            CashierSession.idle_expires_at > now_utc,
            CashierSession.absolute_expires_at > now_utc,
        )
    ).all()

    active_cashiers = []

    for cashier_session in active_sessions:
        cashier = db.get(
            Cashier,
            cashier_session.cashier_id,
        )

        if cashier is None or not getattr(cashier, "is_active", True):
            continue

        terminal = terminal_by_id.get(getattr(cashier_session, "terminal_id", None))

        active_cashiers.append(
            {
                "cashier_id": str(cashier.id),
                "username": getattr(cashier, "username", None),
                "display_name": (
                    getattr(cashier, "display_name", None)
                    or getattr(cashier, "username", "Cashier")
                ),
                "terminal_id": getattr(cashier_session, "terminal_id", None),
                "terminal_name": terminal["name"] if terminal else "Unknown terminal",
                "terminal_connected": terminal["connected"] if terminal else False,
                "session_started_at": _as_iso(
                    getattr(cashier_session, "created_at", None)
                    or getattr(cashier_session, "started_at", None)
                ),
                "idle_expires_at": _as_iso(
                    getattr(cashier_session, "idle_expires_at", None)
                ),
            }
        )

    cashier_performance_rows = db.execute(
        select(
            Sale.cashier_id,
            Sale.cashier_display_name,
            func.count(Sale.id),
            func.coalesce(func.sum(Sale.total), 0),
        )
        .where(*completed_sales_filter)
        .group_by(
            Sale.cashier_id,
            Sale.cashier_display_name,
        )
        .order_by(func.sum(Sale.total).desc())
    ).all()

    cashier_performance = [
        {
            "cashier_id": str(cashier_id) if cashier_id is not None else None,
            "display_name": display_name or "Unassigned cashier",
            "transactions": int(count),
            "revenue": _as_float(revenue),
        }
        for cashier_id, display_name, count, revenue in cashier_performance_rows
    ]

    low_stock_threshold = _low_stock_threshold(db)

    # Archived products keep their stock but are not active inventory.
    active_product = Product.archived_at.is_(None)

    total_products = (
        db.scalar(select(func.count(Product.id)).where(active_product)) or 0
    )

    out_of_stock_count = (
        db.scalar(
            select(func.count(Product.id)).where(active_product, Product.stock <= 0)
        )
        or 0
    )

    low_stock_count = (
        db.scalar(
            select(func.count(Product.id)).where(
                active_product,
                Product.stock > 0,
                Product.stock <= low_stock_threshold,
            )
        )
        or 0
    )

    low_stock_products = db.scalars(
        select(Product)
        .where(active_product, Product.stock <= low_stock_threshold)
        .order_by(Product.stock.asc(), Product.name.asc())
        .limit(10)
    ).all()

    inventory_summary = {
        "total_products": int(total_products),
        "low_stock_threshold": low_stock_threshold,
        "low_stock_count": int(low_stock_count),
        "out_of_stock_count": int(out_of_stock_count),
        "low_stock_products": [
            {
                "id": product.id,
                "name": product.name,
                "sku": product.sku,
                "category": product.category,
                "stock": product.stock,
                "price": _as_float(product.price),
            }
            for product in low_stock_products
        ],
    }

    activity_events = db.scalars(
        select(ActivityEvent)
        .order_by(
            ActivityEvent.created_at.desc(),
            ActivityEvent.id.desc(),
        )
        .limit(30)
    ).all()

    activity = [
        {
            "id": event.id,
            "event_type": event.event_type,
            "severity": event.severity,
            "actor_type": event.actor_type,
            "actor_id": event.actor_id,
            "actor_name": event.actor_name,
            "cashier_id": event.cashier_id,
            "terminal_id": event.terminal_id,
            "summary": event.summary,
            "details": event.details or {},
            "created_at": _as_iso(event.created_at),
        }
        for event in activity_events
    ]

    service_count = db.scalar(select(func.count(Service.id))) or 0

    return {
        "as_of": _as_iso(now_utc),
        "timezone": "Asia/Manila",
        "heartbeat_timeout_seconds": TERMINAL_OFFLINE_AFTER_SECONDS,
        "sales_today": {
            "revenue": today_revenue_value,
            "transactions": int(today_transactions),
            "average_transaction_value": average_transaction_value,
            "reversed_transactions": int(reversed_today_count or 0),
            "reversed_amount": _as_float(reversed_today_amount),
        },
        "payment_breakdown": payment_breakdown,
        "terminal_summary": terminal_summary,
        "terminals": terminal_items,
        "active_cashiers": active_cashiers,
        "cashier_performance": cashier_performance,
        "inventory_summary": inventory_summary,
        "service_catalog_count": int(service_count),
        "activity": activity,
    }
