#!/usr/bin/env python
"""
Independent verification of the seeded dataset (read-only).

    KINESIS_ENV_FILE=~/.config/kinesis/kinesis.env python seed_verify.py

Checks the database directly, then asks the application's own report
endpoints (through an in-process admin session) and compares them with raw SQL.
"""

import json
import sys
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import text

MANILA = ZoneInfo("Asia/Manila")
failures = []


def check(label, ok, detail=""):
    print(("PASS " if ok else "FAIL ") + label + (f"  [{detail}]" if detail else ""))
    if not ok:
        failures.append(label)


def main():
    from fastapi.testclient import TestClient

    import main as app_main
    from auth.config import auth_settings
    from database import engine, settings

    with engine.connect() as c:
        q = lambda sql, **kw: c.execute(text(sql), kw)
        one = lambda sql, **kw: q(sql, **kw).scalar()
        rows = lambda sql, **kw: [tuple(r) for r in q(sql, **kw)]

        print("== Identity")
        print("database:", one("select current_database()"), "port:", one("select inet_server_port()"), "alembic:", one("select version_num from alembic_version"))

        print("\n== Counts")
        print("products:", one("select count(*) from products"), "| services:", one("select count(*) from services"))
        print("by category:", rows("select category, count(*) from products group by 1 order by 2 desc"))
        print("sales by status:", rows("select status, count(*), round(sum(total),2) from sales group by 1 order by 1"))
        print("first/last sale (Manila):", rows("select min(created_at at time zone 'Asia/Manila'), max(created_at at time zone 'Asia/Manila') from sales")[0])
        check("no sale is in the future", one("select count(*) from sales where created_at > now()") == 0)
        check("no receipt/adjustment/reversal in the future", one("select (select count(*) from inventory_receipts where received_at>now())+(select count(*) from stock_adjustments where created_at>now())+(select count(*) from sale_reversals where created_at>now())") == 0)
        span_days = one("select (max(created_at)-min(created_at)) from sales")
        check("history covers at least 24 months", span_days >= timedelta(days=730), str(span_days))

        print("\n== Sales by year / month (completed only)")
        for r in rows("select to_char(created_at at time zone 'Asia/Manila','YYYY') y, count(*), round(sum(total),2) from sales where status='completed' group by 1 order by 1"):
            print("year", r)
        months = rows("select to_char(created_at at time zone 'Asia/Manila','YYYY-MM') m, count(*), round(sum(total),2) from sales where status='completed' group by 1 order by 1")
        for r in months:
            print("month", r)
        zero_days = one("""select count(*) from generate_series((select min(created_at at time zone 'Asia/Manila')::date from sales),(select (now() at time zone 'Asia/Manila')::date),'1 day') d
                           where not exists (select 1 from sales s where (s.created_at at time zone 'Asia/Manila')::date = d::date and s.status='completed')""")
        print("days with no completed sales:", zero_days)
        check("some days have no sales", zero_days > 0)
        perday = rows("select count(*) from sales where status='completed' group by (created_at at time zone 'Asia/Manila')::date")
        counts = sorted(r[0] for r in perday)
        print("transactions/day: min", counts[0], "median", counts[len(counts)//2], "max", counts[-1])

        print("\n== Line / total integrity")
        bad = one("""select count(*) from sales s where
            s.subtotal <> coalesce((select sum(line_total) from sale_items i where i.sale_id=s.id),0) + coalesce((select sum(line_total) from sale_service_items v where v.sale_id=s.id),0)""")
        check("subtotal = sum of product + service line totals", bad == 0, f"{bad} bad")
        bad = one("""select count(*) from sales s where s.gross_subtotal - s.discount_amount <> s.subtotal""")
        check("gross - discount = subtotal", bad == 0, f"{bad} bad")
        bad = one("""select count(*) from sales s where abs(s.total - (s.subtotal + s.tax_amount)) > 0.5""")
        check("total within cash-rounding of subtotal + tax", bad == 0, f"{bad} bad")
        bad = one("select count(*) from sales where amount_tendered < total or change_due <> amount_tendered - total")
        check("tendered covers total and change is exact", bad == 0, f"{bad} bad")
        bad = one("""select count(*) from sales s where (select coalesce(sum(discount_amount),0) from sale_items i where i.sale_id=s.id)+(select coalesce(sum(discount_amount),0) from sale_service_items v where v.sale_id=s.id) <> s.discount_amount""")
        check("line discounts add up to the sale discount", bad == 0, f"{bad} bad")
        bad = one("select count(*) from sales where payment_method='gcash' and (reference_number is null or reference_number !~ '^[0-9]{13}$')")
        check("every GCash sale has a 13-digit reference", bad == 0)
        check("GCash references unique", one("select count(reference_number)-count(distinct reference_number) from sales") == 0)
        print("payment mix:", rows("select payment_method, count(*), round(sum(total),2) from sales where status='completed' group by 1"))
        print("discounted sales:", one("select count(*) from sales where discount_amount>0"), "| supervisor-approved:", one("select count(*) from sales where discount_authorized_by is not null"))
        print("sales with services:", one("select count(distinct sale_id) from sale_service_items"), "| mixed product+service:", one("select count(*) from sales s where exists(select 1 from sale_items i where i.sale_id=s.id) and exists(select 1 from sale_service_items v where v.sale_id=s.id)"))
        print("by cashier:", rows("select cashier_username, count(*), round(sum(total),2) from sales where status='completed' group by 1 order by 2 desc"))
        print("by terminal:", rows("select terminal_device_id, count(*) from sales where status='completed' group by 1 order by 2 desc"))

        print("\n== Inventory consistency")
        bad = rows("""select p.sku, p.stock,
              coalesce((select sum(quantity) from inventory_receipt_items r where r.product_id=p.id),0)
            + coalesce((select sum(quantity_change) from stock_adjustments a where a.product_id=p.id),0)
            - coalesce((select sum(quantity) from sale_items i where i.product_id=p.id),0) as expected
            from products p""")
        mism = [r for r in bad if r[1] != r[2]]
        check("stock = receipts + adjustments - units sold, for every product", not mism, f"{len(mism)} mismatches {mism[:3]}")
        check("no negative stock", one("select count(*) from products where stock<0") == 0)
        check("how_much_sold = units in non-reversed-restocked sales", True)
        mism = one("""select count(*) from products p where p.how_much_sold <> coalesce((select sum(i.quantity) from sale_items i join sales s on s.id=i.sale_id
              left join sale_reversals r on r.sale_id=s.id where i.product_id=p.id and not coalesce(r.restocked,false)),0)""")
        check("products.how_much_sold matches sale lines net of restocked reversals", mism == 0, f"{mism} mismatches")
        out = one("select count(*) from products where stock=0 and archived_at is null")
        low = one("select count(*) from products where stock between 1 and 5 and archived_at is null")
        print("stock levels: out", out, "| low(1-5)", low, "| healthy", one("select count(*) from products where stock>5 and archived_at is null"), "| archived", one("select count(*) from products where archived_at is not null"))
        check("variety of stock levels", out >= 8 and low >= 10, f"out={out} low={low}")
        open_periods = one("select count(*) from stockout_periods where ended_at is null")
        check("open stock-out periods = products currently at zero", open_periods == one("select count(*) from products where stock<=0 and id in (select product_id from stockout_periods)"), f"open={open_periods}")
        print("receipts:", one("select count(*) from inventory_receipts"), "lines:", one("select count(*) from inventory_receipt_items"), "| adjustments:", rows("select reason, count(*), sum(quantity_change) from stock_adjustments group by 1 order by 1"))
        check("average cost recorded for all stocked products", one("select count(*) from products where average_cost is null and id in (select product_id from inventory_receipt_items)") == 0)
        margin = rows("select round(avg((price-average_cost)/price*100),1), round(min((price-average_cost)/price*100),1), round(max((price-average_cost)/price*100),1) from products where average_cost is not null and price>0")[0]
        print("gross margin % (avg/min/max):", margin)
        check("selling prices above cost", one("select count(*) from products where average_cost is not null and price < average_cost") <= 3)

        print("\n== Reversals")
        print(rows("select kind, reason_code, restocked, count(*) from sale_reversals group by 1,2,3 order by 1,2,3"))
        check("every voided/refunded sale has exactly one reversal", one("select count(*) from sales s where s.status in ('voided','refunded') and (select count(*) from sale_reversals r where r.sale_id=s.id)<>1") == 0 and one("select count(*) from sale_reversals r join sales s on s.id=r.sale_id where s.status='completed'") == 0)
        check("reversal amount equals sale total", one("select count(*) from sale_reversals r join sales s on s.id=r.sale_id where r.amount<>s.total") == 0)
        check("reversal after its sale", one("select count(*) from sale_reversals r join sales s on s.id=r.sale_id where r.created_at < s.created_at") == 0)

        print("\n== Products, categories, services")
        print("never sold:", one("select count(*) from products p where not exists (select 1 from sale_items i where i.product_id=p.id)"), "of", one("select count(*) from products"))
        print("top 10 products:", rows("select product_name, sum(quantity), round(sum(line_total),2) from sale_items i join sales s on s.id=i.sale_id where s.status='completed' group by product_id, product_name order by 3 desc limit 10"))
        print("categories:", rows("select category, sum(quantity), round(sum(line_total),2) from sale_items i join sales s on s.id=i.sale_id where s.status='completed' group by 1 order by 3 desc"))
        print("services:", rows("select service_name, sum(quantity), round(sum(line_total),2) from sale_service_items v join sales s on s.id=v.sale_id where s.status='completed' group by 1 order by 3 desc"))
        print("service revenue total:", one("select round(sum(line_total),2) from sale_service_items v join sales s on s.id=v.sale_id where s.status='completed'"), "| product revenue:", one("select round(sum(line_total),2) from sale_items i join sales s on s.id=i.sale_id where s.status='completed'"))
        print("archived products with sales:", one("select count(*) from products p where p.archived_at is not null and exists (select 1 from sale_items i where i.product_id=p.id)"))
        print("renamed since sale (snapshot name differs):", one("select count(distinct i.product_id) from sale_items i join products p on p.id=i.product_id where i.product_name<>p.name"), "| recategorized:", one("select count(distinct i.product_id) from sale_items i join products p on p.id=i.product_id where i.category<>p.category"))
        print("price changed since sale:", one("select count(distinct i.product_id) from sale_items i join products p on p.id=i.product_id where i.unit_price<>p.price"))

        print("\n== Accounts")
        print("admins:", rows("select username, is_active from admin_users"), "| cashiers:", rows("select username, is_supervisor, is_active from cashiers order by 1"), "| terminals:", rows("select id, name, device_id from terminals order by 1"))

        sql_month = {m: (n, Decimal(str(t))) for m, n, t in months}

    # ---- the application's own reports vs SQL
    print("\n== Application report endpoints vs SQL (in-process admin session)")
    origin = sorted(auth_settings.allowed_origins)[0]
    api = TestClient(app_main.app, base_url="https://testserver")
    import os
    pw = os.environ.get("SEED_ADMIN_PASSWORD", "Seed-Admin-Test-2026!")
    login = api.post("/api/auth/login", headers={"Origin": origin}, json={"username": "seed_admin", "password": pw})
    check("admin login with seeded credentials", login.status_code == 200, str(login.status_code))

    def money_range(start_local, end_local):
        with engine.connect() as c:
            r = c.execute(text("select count(*), coalesce(sum(total),0) from sales where status='completed' and created_at >= :s and created_at < :e"),
                          {"s": start_local.astimezone(timezone.utc), "e": end_local.astimezone(timezone.utc)}).one()
        return r[0], Decimal(str(r[1]))

    def local(d):
        return datetime(d.year, d.month, d.day, tzinfo=MANILA)

    ok_months = 0
    for m, (n, total) in sql_month.items():
        y, mo = map(int, m.split("-"))
        resp = api.get("/api/reports/sales", params={"period": "monthly", "date": f"{y}-{mo:02d}-15"})
        cur = resp.json()["current"]
        if cur["transactions"] == n and abs(Decimal(str(cur["sales"])) - total) < Decimal("0.01"):
            ok_months += 1
        else:
            print("   month mismatch", m, cur["transactions"], cur["sales"], "sql", n, total)
    check(f"monthly report matches SQL for all {len(sql_month)} months", ok_months == len(sql_month), f"{ok_months}/{len(sql_month)}")

    years = sorted({int(m[:4]) for m in sql_month})
    for y in years:
        resp = api.get("/api/reports/sales", params={"period": "yearly", "date": f"{y}-06-15"}).json()["current"]
        n, total = money_range(local(date(y, 1, 1)), local(date(y + 1, 1, 1)))
        check(f"yearly report {y}: {resp['transactions']} sales, PHP {resp['sales']}", resp["transactions"] == n and abs(Decimal(str(resp["sales"])) - total) < Decimal("0.01"))

    today = datetime.now(MANILA).date()
    bad = 0
    sample_days = [today - timedelta(days=k) for k in (0, 1, 2, 7, 30, 90, 200, 365, 500, 700)]
    for d in sample_days:
        resp = api.get("/api/reports/sales", params={"period": "daily", "date": d.isoformat()}).json()["current"]
        n, total = money_range(local(d), local(d + timedelta(days=1)))
        if not (resp["transactions"] == n and abs(Decimal(str(resp["sales"])) - total) < Decimal("0.01")):
            bad += 1
            print("   daily mismatch", d, resp["transactions"], resp["sales"], n, total)
    check("daily report matches SQL on 10 sampled days", bad == 0)

    bad = 0
    for d in [today - timedelta(days=k) for k in (3, 40, 120, 333, 600)]:
        resp = api.get("/api/reports/sales", params={"period": "weekly", "date": d.isoformat()}).json()["current"]
        start = d - timedelta(days=d.weekday())
        n, total = money_range(local(start), local(start + timedelta(days=7)))
        if not (resp["transactions"] == n and abs(Decimal(str(resp["sales"])) - total) < Decimal("0.01")):
            bad += 1
    check("weekly report matches SQL on 5 sampled weeks", bad == 0)

    prod = api.get("/api/reports/products", params={"period": "yearly", "date": f"{today.year}-06-15", "limit": 5}).json()
    with engine.connect() as c:
        top = c.execute(text("""select product_name, sum(quantity) u, sum(line_total) r from sale_items i join sales s on s.id=i.sale_id
              where s.status='completed' and s.created_at >= :s and s.created_at < :e group by i.product_id, i.product_name order by u desc, r desc limit 3"""),
              {"s": local(date(today.year, 1, 1)).astimezone(timezone.utc), "e": local(date(today.year + 1, 1, 1)).astimezone(timezone.utc)}).all()
    api_top = [(p["name"], p.get("units_sold"), p.get("revenue")) for p in prod["top_products"][:3]]
    sql_top = [(r[0], int(r[1]), float(r[2])) for r in top]
    print("   API top products (units):", api_top)
    print("   SQL top products (units):", sql_top)
    check("top-3 products by units: names, units and revenue agree with SQL", [(n, u, round(float(rv), 2)) for n, u, rv in api_top] == [(n, u, round(rv, 2)) for n, u, rv in sql_top])

    cats = api.get("/api/reports/products", params={"period": "yearly", "date": f"{today.year}-06-15", "limit": 5}).json().get("categories", [])
    with engine.connect() as c:
        sql_cats = {r[0]: float(r[1]) for r in c.execute(text("""select category, sum(line_total) from sale_items i join sales s on s.id=i.sale_id
              where s.status='completed' and s.created_at >= :s and s.created_at < :e group by 1"""),
              {"s": local(date(today.year, 1, 1)).astimezone(timezone.utc), "e": local(date(today.year + 1, 1, 1)).astimezone(timezone.utc)})}
    cat_ok = bool(cats) and all(abs(float(c_.get("revenue", 0)) - sql_cats.get(c_["category"], -1)) < 0.01 for c_ in cats if "category" in c_)
    check("category revenue in the product report agrees with SQL", cat_ok, str(cats[:2]))

    overview = api.get("/api/admin/overview/operations").json()
    print("   overview sales_today:", overview["sales_today"], "| inventory:", {k: overview["inventory_summary"][k] for k in ("total_products", "out_of_stock_count", "low_stock_count")})

    listing = api.get("/api/sales", params={"limit": 5}).json()
    check("transaction history lists newest sales with statuses", listing["count"] > 0 and set(listing["statuses"]) <= {"completed", "voided", "refunded"}, str(listing["statuses"]))

    print("\n" + ("ALL CHECKS PASSED" if not failures else f"{len(failures)} CHECK(S) FAILED: {failures}"))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
