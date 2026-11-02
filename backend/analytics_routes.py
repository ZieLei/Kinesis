from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query
from sqlalchemy import extract, func, select
from sqlalchemy.orm import Session

from database import get_db
from models import Sale, SaleItem, SaleServiceItem
from sales_routes import period_dates, utc_midnight
from terminal_routes import require_admin_or_terminal


router = APIRouter(prefix="/api/reports", tags=["Reports"])

TIMEZONE = ZoneInfo("Asia/Manila")
ZERO = Decimal("0.00")

WEEKDAYS = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
]


def conditions_for(start: date, end: date):
    return [
        Sale.status == "completed",
        Sale.created_at >= utc_midnight(start),
        Sale.created_at < utc_midnight(end),
    ]


def local_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)

    return value.astimezone(TIMEZONE)


def bucket_key(value: datetime, period: str):
    local = local_datetime(value)

    if period == "daily":
        return local.hour

    if period == "yearly":
        return local.month

    return local.date()


def build_buckets(period: str, start: date, end: date):
    buckets = []
    lookup = {}

    if period == "daily":
        for hour in range(24):
            bucket = {
                "label": f"{hour:02d}:00",
                "revenue": ZERO,
                "gross_profit": ZERO,
                "covered_revenue": ZERO,
                "total_revenue": ZERO,
                "parts_revenue": ZERO,
                "services_revenue": ZERO,
            }
            buckets.append(bucket)
            lookup[hour] = bucket

    elif period == "yearly":
        for month in range(1, 13):
            bucket = {
                "label": date(start.year, month, 1).strftime("%b"),
                "revenue": ZERO,
                "gross_profit": ZERO,
                "covered_revenue": ZERO,
                "total_revenue": ZERO,
                "parts_revenue": ZERO,
                "services_revenue": ZERO,
            }
            buckets.append(bucket)
            lookup[month] = bucket

    else:
        cursor = start

        while cursor < end:
            bucket = {
                "label": (
                    cursor.strftime("%a") if period == "weekly" else str(cursor.day)
                ),
                "date": cursor.isoformat(),
                "revenue": ZERO,
                "gross_profit": ZERO,
                "covered_revenue": ZERO,
                "total_revenue": ZERO,
                "parts_revenue": ZERO,
                "services_revenue": ZERO,
            }
            buckets.append(bucket)
            lookup[cursor] = bucket
            cursor += timedelta(days=1)

    return buckets, lookup


def finish_financial_bucket(bucket: dict):
    revenue = bucket["revenue"]
    covered = bucket["covered_revenue"]

    bucket["cost_coverage"] = (
        round(float(covered / revenue * 100), 1) if revenue > 0 else 0
    )

    # The value is the profit on costed lines only. It is not presented
    # as a complete profit figure when some lines have unknown costs.
    bucket["gross_profit"] = float(bucket["gross_profit"]) if covered > 0 else None

    for key in (
        "revenue",
        "parts_revenue",
        "services_revenue",
    ):
        bucket[key] = float(bucket[key])


@router.get("/analytics", summary="Business analytics report")
def get_business_analytics(
    period: str = Query(
        default="monthly",
        pattern="^(daily|weekly|monthly|yearly)$",
    ),
    report_date: date | None = Query(default=None, alias="date"),
    _authorized: object = Depends(require_admin_or_terminal),
    db: Session = Depends(get_db),
):
    selected_date = report_date or datetime.now(TIMEZONE).date()
    start, end = period_dates(period, selected_date)
    conditions = conditions_for(start, end)

    buckets, bucket_lookup = build_buckets(period, start, end)

    payment_totals = {
        "cash": {"revenue": ZERO, "transactions": 0},
        "gcash": {"revenue": ZERO, "transactions": 0},
    }

    hourly = [{"hour": hour, "transactions": 0, "revenue": 0.0} for hour in range(24)]

    heatmap_counts = [[0 for _ in range(24)] for _ in range(7)]

    sales = db.execute(
        select(
            Sale.id,
            Sale.payment_method,
            Sale.total,
            Sale.created_at,
        )
        .where(*conditions)
        .order_by(Sale.created_at.asc())
    ).all()

    for sale in sales:
        method = str(sale.payment_method).lower()

        if method not in payment_totals:
            payment_totals[method] = {
                "revenue": ZERO,
                "transactions": 0,
            }

        payment_totals[method]["revenue"] += Decimal(sale.total or ZERO)
        payment_totals[method]["transactions"] += 1

        local = local_datetime(sale.created_at)

        hourly[local.hour]["transactions"] += 1
        hourly[local.hour]["revenue"] += float(sale.total or ZERO)

        # Python weekday: Monday = 0, Sunday = 6.
        heatmap_counts[local.weekday()][local.hour] += 1

    total_payment_revenue = sum(
        (item["revenue"] for item in payment_totals.values()),
        ZERO,
    )

    payment_breakdown = []

    for method in ("cash", "gcash"):
        item = payment_totals.get(
            method,
            {"revenue": ZERO, "transactions": 0},
        )

        revenue = item["revenue"]

        payment_breakdown.append(
            {
                "method": method,
                "revenue": float(revenue),
                "transactions": item["transactions"],
                "percentage": (
                    round(float(revenue / total_payment_revenue * 100), 1)
                    if total_payment_revenue > 0
                    else 0
                ),
            }
        )

    # Aggregate product/parts sale lines.
    product_lines = db.execute(
        select(
            Sale.created_at,
            SaleItem.line_total,
            SaleItem.quantity,
            SaleItem.unit_cost,
        )
        .join(Sale, Sale.id == SaleItem.sale_id)
        .where(*conditions)
    ).all()

    # Aggregate service sale lines.
    service_lines = db.execute(
        select(
            Sale.created_at,
            SaleServiceItem.line_total,
            SaleServiceItem.quantity,
            SaleServiceItem.unit_cost,
        )
        .join(Sale, Sale.id == SaleServiceItem.sale_id)
        .where(*conditions)
    ).all()

    total_revenue = ZERO
    known_gross_profit = ZERO
    known_cost_revenue = ZERO

    parts_revenue = ZERO
    services_revenue = ZERO

    uncosted_line_count = 0
    total_line_count = len(product_lines) + len(service_lines)

    def process_lines(lines, line_type: str):
        nonlocal total_revenue
        nonlocal known_gross_profit
        nonlocal known_cost_revenue
        nonlocal parts_revenue
        nonlocal services_revenue
        nonlocal uncosted_line_count

        for line in lines:
            line_revenue = Decimal(line.line_total or ZERO)
            line_quantity = int(line.quantity or 0)

            total_revenue += line_revenue

            if line_type == "parts":
                parts_revenue += line_revenue
            else:
                services_revenue += line_revenue

            key = bucket_key(line.created_at, period)
            bucket = bucket_lookup.get(key)

            if bucket is None:
                continue

            bucket["revenue"] += line_revenue
            bucket["total_revenue"] += line_revenue

            if line_type == "parts":
                bucket["parts_revenue"] += line_revenue
            else:
                bucket["services_revenue"] += line_revenue

            if line.unit_cost is None:
                uncosted_line_count += 1
                continue

            line_cost = Decimal(line.unit_cost) * line_quantity
            line_profit = line_revenue - line_cost

            known_gross_profit += line_profit
            known_cost_revenue += line_revenue

            bucket["covered_revenue"] += line_revenue
            bucket["gross_profit"] += line_profit

    process_lines(product_lines, "parts")
    process_lines(service_lines, "services")

    for bucket in buckets:
        finish_financial_bucket(bucket)

    overall_coverage = (
        round(
            float(known_cost_revenue / total_revenue * 100),
            1,
        )
        if total_revenue > 0
        else 0
    )

    revenue_profit_series = [
        {
            "label": bucket["label"],
            **({"date": bucket["date"]} if "date" in bucket else {}),
            "revenue": bucket["revenue"],
            "gross_profit": bucket["gross_profit"],
            "cost_coverage": bucket["cost_coverage"],
        }
        for bucket in buckets
    ]

    revenue_breakdown_series = [
        {
            "label": bucket["label"],
            **({"date": bucket["date"]} if "date" in bucket else {}),
            "parts": bucket["parts_revenue"],
            "services": bucket["services_revenue"],
        }
        for bucket in buckets
    ]

    # Peak hours are ordered by transaction count, then revenue.
    peak_hours = sorted(
        hourly,
        key=lambda item: (
            -item["transactions"],
            -item["revenue"],
            item["hour"],
        ),
    )[:5]

    heatmap = [
        {
            "weekday": weekday,
            "weekday_index": index,
            "hours": heatmap_counts[index],
        }
        for index, weekday in enumerate(WEEKDAYS)
    ]

    return {
        "period": period,
        "date": selected_date.isoformat(),
        "timezone": TIMEZONE.key,
        "period_start": start.isoformat(),
        "period_end_exclusive": end.isoformat(),
        "transaction_count": len(sales),
        "payment_methods": payment_breakdown,
        "revenue_profit": {
            "revenue": float(total_revenue),
            "known_gross_profit": (
                float(known_gross_profit) if known_cost_revenue > 0 else None
            ),
            "cost_coverage": overall_coverage,
            "uncosted_line_count": uncosted_line_count,
            "total_line_count": total_line_count,
            "gross_profit_definition": (
                "Known gross profit includes only lines with a saved "
                "unit cost. Cost coverage is the percentage of revenue "
                "represented by those costed lines."
            ),
        },
        "revenue_breakdown": [
            {
                "type": "parts",
                "revenue": float(parts_revenue),
            },
            {
                "type": "services",
                "revenue": float(services_revenue),
            },
        ],
        "revenue_profit_series": revenue_profit_series,
        "revenue_breakdown_series": revenue_breakdown_series,
        "hourly_sales": hourly,
        "peak_hours": peak_hours,
        "heatmap": heatmap,
        "heatmap_max": max(
            (max(row) for row in heatmap_counts),
            default=0,
        ),
    }
