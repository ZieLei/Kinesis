"""Custom date ranges on the sales, product and analytics reports."""

from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from models import Sale
from sales_routes import bucket_granularity, resolve_report_range
from tests.conftest import requires_database
from tests.test_product_archiving import add_product, pos, sell  # noqa: F401


MANILA = ZoneInfo("Asia/Manila")


# --- Range resolution (no database) ----------------------------------------


def test_custom_range_is_inclusive_and_compares_with_the_equal_window_before():
    window = resolve_report_range("custom", date(2026, 11, 14), date(2026, 11, 21), date(2026, 12, 20))

    assert (window.start, window.end) == (date(2026, 11, 21), date(2026, 12, 21))
    # 30 days -> the 30 days before, ending the day before the range starts.
    assert (window.previous_start, window.previous_end) == (date(2026, 10, 22), date(2026, 11, 21))
    assert window.granularity == "day"


def test_single_day_custom_range_is_charted_by_hour():
    window = resolve_report_range("custom", date(2026, 11, 14), date(2026, 11, 5), date(2026, 11, 5))

    assert (window.start, window.end) == (date(2026, 11, 5), date(2026, 11, 6))
    assert window.granularity == "hour"
    assert window.previous_start == date(2026, 11, 4)


def test_long_custom_ranges_are_charted_by_month():
    assert bucket_granularity("custom", date(2026, 1, 1), date(2026, 4, 3)) == "day"  # 92 days
    assert bucket_granularity("custom", date(2026, 1, 1), date(2026, 4, 4)) == "month"  # 93 days


@pytest.mark.parametrize(
    "start,end",
    [
        (None, date(2026, 1, 2)),
        (date(2026, 1, 2), None),
        (date(2026, 1, 3), date(2026, 1, 2)),
        (date(2024, 1, 1), date(2026, 1, 1)),  # longer than two years
    ],
)
def test_invalid_custom_ranges_are_rejected(start, end):
    with pytest.raises(HTTPException) as caught:
        resolve_report_range("custom", date(2026, 11, 14), start, end)

    assert caught.value.status_code == 422


def test_start_and_end_need_period_custom():
    with pytest.raises(HTTPException) as caught:
        resolve_report_range("monthly", date(2026, 11, 14), date(2026, 11, 1), date(2026, 11, 5))

    assert caught.value.status_code == 422


def test_fixed_periods_are_unchanged():
    window = resolve_report_range("monthly", date(2026, 11, 14))

    assert (window.start, window.end) == (date(2026, 11, 1), date(2026, 12, 1))
    assert (window.previous_start, window.previous_end) == (date(2026, 10, 1), date(2026, 11, 1))
    assert resolve_report_range("yearly", date(2026, 3, 3)).granularity == "month"
    assert resolve_report_range("daily", date(2026, 3, 3)).granularity == "hour"


# --- Endpoints ---------------------------------------------------------------


def place_sale(db, code, local_day, hour=10):
    sale = db.scalar(select(Sale).where(Sale.transaction_code == code))
    sale.created_at = datetime(
        local_day.year, local_day.month, local_day.day, hour, tzinfo=MANILA
    ).astimezone(timezone.utc)
    db.commit()


@requires_database
def test_custom_range_endpoints(pos, db_session):
    client, headers = pos
    product = add_product(db_session, stock=50)

    for code, day in [
        ("TXN-RNG-0001", date(2026, 11, 20)),  # before the range
        ("TXN-RNG-0002", date(2026, 11, 21)),  # first day, inclusive
        ("TXN-RNG-0003", date(2026, 12, 20)),  # last day, inclusive
        ("TXN-RNG-0004", date(2026, 12, 21)),  # after the range
    ]:
        assert sell(client, headers, product.id, code=code).status_code == 200
        place_sale(db_session, code, day)

    params = {"period": "custom", "start": "2026-11-21", "end": "2026-12-20"}

    sales = client.get("/api/reports/sales", headers=headers, params=params).json()
    assert sales["current"]["transactions"] == 2
    assert sales["previous"]["transactions"] == 1  # Oct 22 - Nov 20 holds the Nov 20 sale
    assert (sales["period_start"], sales["period_end_exclusive"]) == ("2026-11-21", "2026-12-21")
    assert sales["granularity"] == "day"
    assert [point["label"] for point in sales["series"][:2]] == ["Nov 21", "Nov 22"]
    assert len(sales["series"]) == 30
    assert sum(point["transactions"] for point in sales["series"]) == 2

    products = client.get("/api/reports/products", headers=headers, params=params).json()
    assert products["period"] == "custom"
    assert products["categories"][0]["units_sold"] == 2
    assert len(products["category_series"]) == 30

    analytics = client.get("/api/reports/analytics", headers=headers, params=params).json()
    assert analytics["transaction_count"] == 2
    assert len(analytics["revenue_profit_series"]) == 30


@requires_database
def test_long_custom_range_is_grouped_by_month(pos, db_session):
    client, headers = pos
    product = add_product(db_session, stock=50)

    for code, day in [("TXN-RNG-0010", date(2025, 12, 31)), ("TXN-RNG-0011", date(2026, 2, 3))]:
        assert sell(client, headers, product.id, code=code).status_code == 200
        place_sale(db_session, code, day)

    params = {"period": "custom", "start": "2025-12-01", "end": "2026-05-31"}
    sales = client.get("/api/reports/sales", headers=headers, params=params).json()

    assert sales["granularity"] == "month"
    assert [point["label"] for point in sales["series"]] == [
        "Dec '25", "Jan '26", "Feb '26", "Mar '26", "Apr '26", "May '26",
    ]
    assert [point["transactions"] for point in sales["series"]] == [1, 0, 1, 0, 0, 0]

    products = client.get("/api/reports/products", headers=headers, params=params).json()
    assert [point["label"] for point in products["category_series"]][0] == "Dec '25"


@requires_database
def test_invalid_range_returns_422(pos):
    client, headers = pos

    for path in ("sales", "products", "analytics"):
        response = client.get(
            f"/api/reports/{path}",
            headers=headers,
            params={"period": "custom", "start": "2026-12-20", "end": "2026-11-21"},
        )
        assert response.status_code == 422, path

    response = client.get("/api/reports/sales", headers=headers, params={"period": "custom"})
    assert response.status_code == 422
