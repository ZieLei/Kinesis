#!/usr/bin/env python
"""
Deterministic realistic test dataset for Kinesis: wipes the application data
of ONE designated test database and rebuilds 24 months of shop history.

    KINESIS_ENV_FILE=~/.config/kinesis/kinesis.env \
    KINESIS_SEED_CONFIRM=kinesis_arch_test \
    python seed_test_data.py run [--seed 20261110] [--target-sales 3200]
    python seed_test_data.py verify

Safety: refuses unless the configured database is exactly the one named in
KINESIS_SEED_CONFIRM, that name ends in "_test", and the live connection
reports the same name and the expected port. Schema and migrations are never
touched: tables are TRUNCATEd (app_settings and alembic_version are kept).

How it works: products/services/accounts are created, terminals are paired
through the real pairing endpoint, sales go through the real POST /api/sales
(server-side pricing, discounts, tax, cash rounding, stock locking,
idempotency) and stock arrives through the real inventory-receipt function.
Everything is applied in chronological order, then timestamps are moved to
the simulated time (sales, receipts) or written directly with simulated
times (reversals, write-offs, activity events, stock-out periods), because
those tables are append-only and cannot be edited afterwards.
"""

from __future__ import annotations

import argparse
import heapq
import json
import math
import os
import random
import sys
import time
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, time as dtime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path
from zoneinfo import ZoneInfo

MANILA = ZoneInfo("Asia/Manila")
UTC = timezone.utc
EXPECTED_PORT = 5433

ADMIN = ("seed_admin", "Seed-Admin-Test-2026!")
SUPERVISOR = ("supervisor_dan", "Dan Villanueva", "384720")
CASHIERS = [
    ("cashier_ana", "Ana Reyes", "482916"),
    ("cashier_ben", "Ben Santos", "735194"),
    ("cashier_carla", "Carla Mendoza", "906251"),
]
TERMINALS = [
    ("KNS-seed-front-0001", "Front Counter", "Android phone", "android"),
    ("KNS-seed-parts-0002", "Parts Counter", "Android phone", "android"),
    ("KNS-seed-mobile-0003", "Mobile Cashier (iPhone)", "iPhone", "ios"),
]
# Which terminals each cashier uses.
TERMINAL_USE = {
    "cashier_ana": [0, 1],
    "cashier_ben": [0],
    "cashier_carla": [1, 2],
    "supervisor_dan": [0, 1, 2],
}

REVERSAL_REASONS = [
    ("customer_changed_mind", 0.30),
    ("wrong_item", 0.22),
    ("cashier_error", 0.18),
    ("defective_item", 0.14),
    ("duplicate_sale", 0.06),
    ("pricing_dispute", 0.06),
    ("other", 0.04),
]


# ----------------------------------------------------------------------
# Guard rails
# ----------------------------------------------------------------------


def guard() -> str:
    from sqlalchemy import text

    from database import engine, settings

    confirm = os.environ.get("KINESIS_SEED_CONFIRM", "")
    name = settings.database_name

    if not confirm or confirm != name:
        sys.exit(f"Refusing: KINESIS_SEED_CONFIRM={confirm!r} does not equal the configured database {name!r}.")

    if not name.endswith("_test"):
        sys.exit(f"Refusing: {name!r} does not end in '_test'.")

    if name in ("kinesis", "postgres") or settings.database_port != EXPECTED_PORT:
        sys.exit("Refusing: not the designated test database / cluster.")

    with engine.connect() as c:
        actual, port = c.execute(text("select current_database(), inet_server_port()")).one()

    if actual != name or port != EXPECTED_PORT:
        sys.exit(f"Refusing: connected to {actual!r} on {port}, expected {name!r} on {EXPECTED_PORT}.")

    return name


def wipe() -> list[str]:
    from sqlalchemy import text

    from database import engine

    with engine.begin() as c:
        tables = [
            r[0]
            for r in c.execute(
                text(
                    "select tablename from pg_tables where schemaname='public' "
                    "and tablename not in ('alembic_version','app_settings') order by 1"
                )
            )
        ]
        c.execute(text("TRUNCATE TABLE " + ", ".join(f'"{t}"' for t in tables) + " RESTART IDENTITY CASCADE"))

    return tables


# ----------------------------------------------------------------------
# Catalog expansion
# ----------------------------------------------------------------------


@dataclass
class P:
    id: int = 0
    sku: str = ""
    name: str = ""
    cat_code: str = ""
    category: str = ""
    tag: str = ""
    price: Decimal = Decimal(0)
    base_cost: float = 0.0
    pop: float = 0.0
    stock: int = 0
    intro: datetime | None = None  # first stock arrives
    archived_at: datetime | None = None
    stop_restock_after: datetime | None = None
    stocked: bool = True
    rp: int = 3
    target: tuple = (10, 20)
    supplier: str = ""


def price_point(cost: float, markup: float, rng: random.Random) -> Decimal:
    raw = cost * markup * rng.uniform(0.96, 1.06)

    if raw < 100:
        step = 5
    elif raw < 1000:
        step = 5
    elif raw < 5000:
        step = 10
    else:
        step = 50

    price = max(step, round(raw / step) * step)

    return Decimal(price).quantize(Decimal("0.01"))


def build_catalog(rng: random.Random, start: datetime, now: datetime, target: int = 340) -> list[P]:
    import seed_catalog as sc

    combos = []

    for fam in sc.FAMILIES:
        for brand, cost in fam.brands:
            for label, mult in fam.variants:
                combos.append((fam, brand, cost, label, mult))

    # Keep each family's most useful rows, sampling the rest to reach the target.
    by_family = defaultdict(list)
    for item in combos:
        by_family[id(item[0])].append(item)

    keep = []
    ratio = target / len(combos)
    for items in by_family.values():
        n = max(1, round(len(items) * ratio))
        keep.extend(rng.sample(items, min(n, len(items))))

    keep.sort(key=lambda it: (list(sc.CATEGORIES).index(it[0].cat), sc.FAMILIES.index(it[0]), it[1], it[3]))

    counters = Counter()
    products: list[P] = []
    names = set()
    days = (now - start).days

    for fam, brand, cost, label, mult in keep:
        counters[fam.cat] += 1
        name = " ".join(part for part in (brand, fam.name, label) if part).strip()
        assert name not in names, name
        names.add(name)

        base_cost = round(cost * mult * rng.uniform(0.97, 1.03), 2)
        brand_weight = math.exp(rng.gauss(0, 0.45)) * (1.25 if base_cost < cost * 0.95 or brand in ("Generic", "Rapide", "Petron Sprint") else 1.0)
        pop = fam.pop * brand_weight

        p = P(
            sku=f"KNS-{fam.cat}-{counters[fam.cat]:04d}",
            name=name,
            cat_code=fam.cat,
            category=sc.CATEGORIES[fam.cat],
            tag=fam.tag,
            base_cost=base_cost,
            price=price_point(base_cost, fam.markup, rng),
            pop=pop,
            supplier=sc.SUPPLIERS[fam.cat],
        )
        products.append(p)

    # Introduction dates: most exist from the start, ~22% are new lines.
    for p in products:
        if rng.random() < 0.22:
            p.intro = start + timedelta(days=rng.randint(40, max(41, days - 60)), hours=9)
        else:
            p.intro = start - timedelta(days=1) + timedelta(hours=9)

    # Never-sold items: biased to rare/expensive lines; some never stocked at all.
    order = sorted(products, key=lambda p: p.pop)
    for p in order[: int(len(products) * 0.10)]:
        p.pop = 0.0
    for p in rng.sample([p for p in products if p.pop == 0.0], k=min(8, sum(1 for p in products if p.pop == 0.0))):
        p.stocked = False

    for p in products:
        price = float(p.price)
        if price > 2500:
            p.rp, p.target = 0, (2, 3)
        elif p.pop >= 1.8:
            p.rp, p.target = 10, (35, 60)
        elif p.pop >= 0.5:
            p.rp, p.target = 4, (12, 25)
        else:
            p.rp, p.target = 1, (3, 8)

        if p.tag in ("battery", "tire", "shock", "helmet", "mirror"):
            p.rp, p.target = min(p.rp, 3), (4, 10)

    # Restock stops for ~14% of lines in the last five months (they run down).
    candidates = [p for p in products if p.pop > 0 and p.stocked]
    for p in rng.sample(candidates, k=int(len(candidates) * 0.14)):
        p.stop_restock_after = now - timedelta(days=rng.randint(12, 150))

    # A handful of lines are archived (discontinued) part-way through.
    for p in rng.sample([p for p in candidates if p.stop_restock_after is None and 0.2 < p.pop < 1.6], k=6):
        p.archived_at = now - timedelta(days=rng.randint(20, 420))

    return products


# ----------------------------------------------------------------------
# Demand model
# ----------------------------------------------------------------------

MONTH_FACTOR = [0.86, 0.90, 0.95, 0.90, 0.97, 1.06, 1.10, 1.10, 1.05, 1.06, 1.00, 1.22]
HOUR_WEIGHTS = {8: 0.6, 9: 1.0, 10: 1.4, 11: 1.5, 12: 1.0, 13: 0.8, 14: 1.0, 15: 1.3, 16: 1.5, 17: 1.2, 18: 0.8, 19: 0.3}


def closed_days(start: date, end: date, rng: random.Random) -> set[date]:
    closed = set()
    for year in range(start.year, end.year + 1):
        closed.update({date(year, 12, 25), date(year, 1, 1)})
    closed.update({date(2025, 4, 17), date(2025, 4, 18), date(2026, 4, 2), date(2026, 4, 3)})
    span = (end - start).days
    while len(closed) < 14 + 6:
        closed.add(start + timedelta(days=rng.randint(0, span - 3)))  # typhoon / power cut
    return {d for d in closed if start <= d <= end}


def daily_lambdas(days: list[date], closed: set[date], rng: random.Random) -> list[float]:
    # A few unusually busy windows (promos, long weekends).
    rush = {}
    for _ in range(9):
        s = rng.choice(days)
        for k in range(rng.randint(3, 6)):
            rush[s + timedelta(days=k)] = rng.uniform(1.5, 2.3)

    n = len(days)
    lambdas = []
    for i, d in enumerate(days):
        if d in closed:
            lambdas.append(0.0)
            continue
        growth = 1.0 + 0.2 * i / n
        dow = [0.95, 0.95, 1.0, 1.05, 1.15, 1.45, 0.6][d.weekday()]
        payday = 1.45 if d.day in (14, 15, 16, 29, 30, 31, 1) else 1.0
        noise = math.exp(rng.gauss(0, 0.32))
        lambdas.append(MONTH_FACTOR[d.month - 1] * growth * dow * payday * noise * rush.get(d, 1.0))
    return lambdas


def poisson(lam: float, rng: random.Random) -> int:
    if lam <= 0:
        return 0
    if lam > 40:
        return max(0, int(rng.gauss(lam, math.sqrt(lam))))
    limit, k, p = math.exp(-lam), 0, 1.0
    while True:
        p *= rng.random()
        if p <= limit:
            return k
        k += 1


def pick_time(d: date, rng: random.Random) -> datetime:
    hour = rng.choices(list(HOUR_WEIGHTS), weights=list(HOUR_WEIGHTS.values()))[0]
    local = datetime.combine(d, dtime(hour, rng.randint(0, 59), rng.randint(0, 59)), tzinfo=MANILA)
    return local.astimezone(UTC)


# ----------------------------------------------------------------------
# The simulation
# ----------------------------------------------------------------------


class Sim:
    def __init__(self, args, now: datetime):
        self.args = args
        self.rng = random.Random(args.seed)
        self.now = now
        self.today = now.astimezone(MANILA).date()
        self.start_date = date(self.today.year - 2, self.today.month, 1)  # ~24-25 months
        self.start = datetime.combine(self.start_date, dtime(0, 0), tzinfo=MANILA).astimezone(UTC)
        self.heap: list = []
        self.seq = 0
        self.stats = Counter()
        self.sale_log: list[dict] = []  # {id, code, ts, total, cashier, payment}
        self.receipt_log: list[tuple] = []  # (receipt_id, ts)
        self.stockouts: list[dict] = []
        self.activity: list[dict] = []
        self.reversal_log: list[dict] = []
        self.refs = set()
        self.sessions: dict = {}

    # ---- event queue
    def push(self, ts: datetime, kind: str, payload=None):
        self.seq += 1
        heapq.heappush(self.heap, (ts, self.seq, kind, payload))

    # ---- stock bookkeeping (mirrors the app's stock-out tracking)
    def change_stock(self, p: P, delta: int, ts: datetime):
        old = p.stock
        p.stock += delta
        if old > 0 and p.stock <= 0:
            self.stockouts.append({"product_id": p.id, "product_name": p.name, "started_at": ts, "ended_at": None, "_p": p})
        elif old <= 0 and p.stock > 0:
            for period in reversed(self.stockouts):
                if period["_p"] is p and period["ended_at"] is None:
                    period["ended_at"] = ts
                    break

    def active(self, p: P, ts: datetime) -> bool:
        return p.intro is not None and p.intro <= ts and (p.archived_at is None or ts < p.archived_at)


def weighted_pick(rng, items, weight=lambda p: p.pop):
    weights = [max(weight(p), 0.0) for p in items]
    if not items or sum(weights) <= 0:
        return None
    return rng.choices(items, weights=weights)[0]


def run(args):
    import seed_catalog as sc
    from fastapi.testclient import TestClient
    from sqlalchemy import select, text

    import main as app_main
    from admin_models import AdminUser
    from activity_models import ActivityEvent
    from auth.password import hash_password
    from cashier_models import Cashier
    from cashier_routes import validate_new_pin
    from database import SessionLocal, engine
    from inventory_routes import InventoryReceiptCreate, ReceiptItemInput, save_inventory_receipt
    from models import (
        AppSettings,
        InventoryReceipt,
        Product,
        Sale,
        SaleReversal,
        Service,
        StockAdjustment,
        StockoutPeriod,
        Terminal,
    )
    from pydantic import SecretStr
    from sales_routes import calculate_discount, calculate_tax, round_cash_total
    from tests.helpers import create_pairing_token

    db_name = guard()
    t0 = time.time()
    now = datetime.now(UTC)
    sim = Sim(args, now)
    rng = sim.rng
    print(f"Target database: {db_name} (port {EXPECTED_PORT}); simulated 'now' = {now.astimezone(MANILA):%Y-%m-%d %H:%M} Manila")

    tables = wipe()
    print(f"Wiped {len(tables)} tables (kept alembic_version, app_settings).")

    db = SessionLocal()

    # ---- settings
    row = db.scalar(select(AppSettings).where(AppSettings.id == 1))
    cfg = row.settings if row else {}
    tax_rate = Decimal(str(cfg.get("taxRate", "0")))
    cash_rounding = Decimal(str(cfg.get("cashRounding", "0.01")))
    discount_limit = Decimal(str(cfg.get("discountLimit", "10")))
    print(f"Settings kept: tax {tax_rate}%, cash rounding {cash_rounding}, discount limit {discount_limit}%, negative stock {cfg.get('allowNegativeInventory')}")
    db.rollback()

    # ---- accounts
    for _, pin in [(c[0], c[2]) for c in CASHIERS] + [(SUPERVISOR[0], SUPERVISOR[2])]:
        validate_new_pin(SecretStr(pin))

    admin = AdminUser(username=ADMIN[0], password_hash=hash_password(ADMIN[1]), is_active=True)
    db.add(admin)
    cashier_rows = {}
    for username, display, pin in CASHIERS:
        cashier_rows[username] = Cashier(username=username, display_name=display, pin_hash=hash_password(pin), is_active=True, is_supervisor=False)
    cashier_rows[SUPERVISOR[0]] = Cashier(username=SUPERVISOR[0], display_name=SUPERVISOR[1], pin_hash=hash_password(SUPERVISOR[2]), is_active=True, is_supervisor=True)
    db.add_all(cashier_rows.values())
    db.commit()
    pins = {c[0]: c[2] for c in CASHIERS}
    pins[SUPERVISOR[0]] = SUPERVISOR[2]

    # ---- terminals through the real pairing flow
    client = TestClient(app_main.app, base_url="https://testserver")
    term_tokens = []
    for device_id, name, device_type, platform in TERMINALS:
        resp = client.post(
            "/api/terminals/pair",
            json={
                "pairing_token": create_pairing_token(db),
                "registration": {"device_id": device_id, "name": name, "device_type": device_type, "platform": platform, "app_version": "1.0.0"},
            },
        )
        assert resp.status_code == 201, resp.text
        term_tokens.append(resp.json()["session_token"])
    terminals = db.scalars(select(Terminal).order_by(Terminal.id)).all()
    term_ids = [t.id for t in terminals]
    db.rollback()

    # ---- catalog
    catalog = build_catalog(rng, sim.start, now, target=args.products)
    rows = []
    for p in catalog:
        rows.append(Product(sku=p.sku, name=p.name, category=p.category, price=p.price, stock=0, how_much_sold=0, average_cost=None))
    db.add_all(rows)
    db.flush()
    for p, r in zip(catalog, rows):
        p.id = r.id
    by_id = {p.id: p for p in catalog}
    services = []
    svc_rows = []
    for name, desc, price, est, pop in sc.SERVICES:
        svc_rows.append(Service(name=name, description=desc, price=Decimal(price), estimated_cost=Decimal(est)))
    db.add_all(svc_rows)
    db.flush()
    for r, (_, _, _, _, pop) in zip(svc_rows, sc.SERVICES):
        services.append({"id": r.id, "name": r.name, "price": Decimal(r.price), "pop": pop})
    svc_by_name = {s["name"]: s for s in services}
    db.commit()
    print(f"Created {len(catalog)} products in {len(set(p.category for p in catalog))} categories and {len(services)} services.")

    pools = defaultdict(list)
    for p in catalog:
        pools[p.tag].append(p)
        pools["cat:" + p.cat_code].append(p)

    # ---- demand calendar
    days = [sim.start_date + timedelta(days=i) for i in range((sim.today - sim.start_date).days + 1)]
    closed = closed_days(sim.start_date, sim.today, rng)
    lam = daily_lambdas(days, closed, rng)
    scale = args.target_sales / max(sum(lam), 1e-9)
    n_planned = 0
    for d, l in zip(days, lam):
        count = poisson(l * scale, rng)
        for _ in range(count):
            ts = pick_time(d, rng)
            if ts <= now - timedelta(minutes=5):
                sim.push(ts, "sale", {"progress": (d - sim.start_date).days / max(1, len(days) - 1)})
                n_planned += 1
    print(f"Planned {n_planned} sale events over {len(days)} days ({len(closed)} closed days).")

    # ---- supply: initial stocking and twice-weekly deliveries
    sim.push(sim.start - timedelta(days=1) + timedelta(hours=10), "delivery", {"initial": True})
    for d in days:
        if d.weekday() in (0, 3):
            ts = datetime.combine(d, dtime(10, 0), tzinfo=MANILA).astimezone(UTC)
            if ts < now:
                sim.push(ts, "delivery", {})

    # ---- one-off catalog events
    for k, month_offset in enumerate((8, 20)):
        d = sim.start_date + timedelta(days=int(month_offset * 30.4))
        if d < sim.today:
            sim.push(datetime.combine(d, dtime(8, 0), tzinfo=MANILA).astimezone(UTC), "price_change", {"round": k})
    for p in catalog:
        if p.archived_at:
            sim.push(p.archived_at, "archive", p)
    renames = [p for p in catalog if p.pop > 0.8 and p.archived_at is None]
    for p in rng.sample(renames, k=5):
        sim.push(now - timedelta(days=rng.randint(30, 500)), "rename", p)
    for cat_code, fam_name, new_cat in (("FLT", "Fuel Injector Cleaner", "Cleaning & Maintenance"), ("ELE", "Battery Terminal Cleaner", "Cleaning & Maintenance"), ("FST", "Gasket Maker (RTV)", "Shop Consumables")):
        for p in catalog:
            if fam_name in p.name and p.cat_code == cat_code:
                sim.push(now - timedelta(days=rng.randint(60, 400)), "recategorize", (p, new_cat))
    for _ in range(args.adjustments):
        sim.push(pick_time(rng.choice(days), rng), "writeoff", None)

    # ---- sale machinery
    cashier_ids = {u: str(r.id) for u, r in cashier_rows.items()}

    def login(username, ti):
        resp = client.post("/api/cashier-auth/login", headers={"Authorization": f"Bearer {term_tokens[ti]}"}, json={"username": username, "pin": pins[username]})
        assert resp.status_code == 200, resp.text
        sim.sessions[(username, ti)] = resp.json()["session_token"]
        return sim.sessions[(username, ti)]

    def choose_cashier(ts):
        local = ts.astimezone(MANILA)
        morning = local.hour < 13
        if morning:
            names, weights = ["cashier_ana", "cashier_carla", SUPERVISOR[0], "cashier_ben"], [0.45, 0.25, 0.10, 0.20]
        else:
            names, weights = ["cashier_ben", "cashier_carla", "cashier_ana", SUPERVISOR[0]], [0.42, 0.30, 0.17, 0.11]
        if local.weekday() >= 5:
            names, weights = ["cashier_carla", "cashier_ana", SUPERVISOR[0], "cashier_ben"], [0.5, 0.3, 0.12, 0.08]
        u = rng.choices(names, weights=weights)[0]
        return u, rng.choice(TERMINAL_USE[u])

    def season_weight(p: P, ts: datetime) -> float:
        m = ts.astimezone(MANILA).month
        w = 1.0
        if p.tag in ("tire", "tube", "battery", "rain", "brakepad", "brakeshoe") and 6 <= m <= 10:
            w *= 1.35
        if p.tag in ("coolant",) and 3 <= m <= 5:
            w *= 1.6
        if p.tag in ("helmet", "gearoil") and m in (11, 12):
            w *= 1.25
        return w

    def avail(tag_or_cat, ts, need=1, maxprice=None):
        out = [p for p in pools[tag_or_cat] if p.stock >= need and sim.active(p, ts) and p.pop > 0 and (maxprice is None or p.price <= maxprice)]
        return out

    def take(items, p, qty):
        qty = min(qty, p.stock)
        if qty <= 0 or p.id in {i[0] for i in items}:
            return
        items.append((p.id, qty))

    def qty_for(p: P) -> int:
        if float(p.price) < 100:
            return rng.choice([1, 1, 2, 3, 5])
        if p.tag in ("bolt",):
            return rng.choice([1, 2, 3, 4])
        if p.tag == "oil":
            return rng.choices([1, 2, 3, 4], weights=[60, 28, 8, 4])[0]
        if float(p.price) < 400:
            return rng.choice([1, 1, 1, 2])
        return 1

    def add_service(svcs, name, qty=1):
        s = svc_by_name.get(name)
        if s and s["id"] not in {x[0] for x in svcs}:
            svcs.append((s["id"], qty))

    def build_basket(ts):
        items, svcs = [], []
        r = rng.random()

        def pick(tag, need=1, maxprice=None):
            cands = avail(tag, ts, need, maxprice)
            return weighted_pick(rng, cands, lambda p: p.pop * season_weight(p, ts))

        if r < 0.28:  # single consumable / small part
            pool = [p for p in catalog if p.pop > 0 and p.stock > 0 and sim.active(p, ts) and p.price <= 450]
            p = weighted_pick(rng, pool, lambda p: p.pop * season_weight(p, ts))
            if p:
                take(items, p, qty_for(p))
        elif r < 0.46:  # oil change
            for p in (pick("oil"),):
                if p:
                    take(items, p, qty_for(p))
            if rng.random() < 0.45 and (g := pick("gearoil")):
                take(items, g, 1)
            if rng.random() < 0.55:
                add_service(svcs, "Engine Oil Change (Labor)")
            if rng.random() < 0.15 and (s := pick("sparkplug")):
                take(items, s, 1)
            if rng.random() < 0.14 and (f := pick("airfilter")):
                take(items, f, 1)
            if rng.random() < 0.04 and (o := pick("oil")):  # mechanic buying in bulk
                items[:] = [(o.id, min(o.stock, rng.randint(5, 12)))]
        elif r < 0.54:  # brake job
            for tag in rng.choice([["brakepad"], ["brakeshoe"], ["brakepad", "brakeshoe"]]):
                if p := pick(tag):
                    take(items, p, rng.choice([1, 1, 2]))
            if rng.random() < 0.20 and (p := pick("brakefluid")):
                take(items, p, 1)
            if rng.random() < 0.55:
                add_service(svcs, rng.choice(["Brake Pad Replacement", "Brake Shoe Replacement"]))
        elif r < 0.61:  # tires
            if p := pick("tire"):
                take(items, p, rng.choice([1, 1, 1, 2]))
            if rng.random() < 0.5 and (p := pick("tube")):
                take(items, p, 1)
            if rng.random() < 0.7:
                add_service(svcs, "Tire Replacement (per tire)", rng.choice([1, 1, 2]))
            if rng.random() < 0.25:
                add_service(svcs, "Wheel Balancing")
        elif r < 0.66:  # drivetrain
            if p := pick("chainset") or pick("chain"):
                take(items, p, 1)
            if rng.random() < 0.3 and (p := pick("chainlube")):
                take(items, p, 1)
            if rng.random() < 0.65:
                add_service(svcs, "Chain and Sprocket Replacement")
        elif r < 0.72:  # electrical
            if rng.random() < 0.4 and (p := pick("battery")):
                take(items, p, 1)
                if rng.random() < 0.5:
                    add_service(svcs, "Battery Replacement")
            else:
                for _ in range(rng.choice([1, 1, 2])):
                    if p := pick("bulb"):
                        take(items, p, rng.choice([1, 1, 2]))
                if rng.random() < 0.3:
                    add_service(svcs, "Headlight / Bulb Installation")
        elif r < 0.79:  # accessories & body
            cat = rng.choice(["cat:ACC", "cat:ACC", "cat:BDY", "cat:CTL"])
            for _ in range(rng.choice([1, 1, 2, 3])):
                if p := weighted_pick(rng, avail(cat, ts), lambda p: p.pop):
                    take(items, p, 1)
        elif r < 0.87:  # services only
            for _ in range(rng.choice([1, 1, 1, 2])):
                s = rng.choices(services, weights=[x["pop"] for x in services])[0]
                svcs.append((s["id"], 1)) if s["id"] not in {x[0] for x in svcs} else None
        elif r < 0.91:  # tune-up
            add_service(svcs, "General Maintenance and Tune-Up")
            for tag in ("oil", "sparkplug", "airfilter", "chainlube"):
                if rng.random() < 0.7 and (p := pick(tag)):
                    take(items, p, 1)
        else:  # mixed shopping
            pool = [p for p in catalog if p.pop > 0 and p.stock > 0 and sim.active(p, ts)]
            for _ in range(rng.choice([2, 2, 3, 4])):
                if p := weighted_pick(rng, pool, lambda p: p.pop * season_weight(p, ts)):
                    take(items, p, qty_for(p))
            if rng.random() < 0.2:
                s = rng.choices(services, weights=[x["pop"] for x in services])[0]
                svcs.append((s["id"], 1))

        return items, svcs

    def new_code(ts):
        n = int(ts.timestamp() * 1000)
        digits = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
        b = ""
        while n:
            n, r = divmod(n, 36)
            b = digits[r] + b
        return f"KNS-{b}-" + "".join(rng.choice(digits) for _ in range(12))

    def new_reference():
        while True:
            ref = "".join(rng.choice("0123456789") for _ in range(13))
            if ref not in sim.refs and ref[0] != "0":
                sim.refs.add(ref)
                return ref

    def do_sale(ts, payload):
        items, svcs = build_basket(ts)
        if not items and not svcs:
            sim.stats["sale_skipped_empty"] += 1
            return

        username, ti = choose_cashier(ts)

        gross = Decimal(0)
        for pid, qty in items:
            gross += by_id[pid].price * qty
        for sid, qty in svcs:
            gross += next(s["price"] for s in services if s["id"] == sid) * qty

        discount = Decimal(0)
        r = rng.random()
        if r < 0.115:
            discount = Decimal(rng.choices(["5", "10", "15", "20"], weights=[50, 35, 12, 3])[0])
        if gross < 200 and discount > 5:
            discount = Decimal(5)

        discount_amount = calculate_discount(gross, discount)
        subtotal = gross - discount_amount
        total_est = subtotal + calculate_tax(subtotal, tax_rate)

        p_gcash = 0.20 + 0.20 * payload["progress"]
        if total_est < 150:
            p_gcash *= 0.4
        payment = "gcash" if rng.random() < p_gcash else "cash"

        body = {
            "transaction_code": new_code(ts),
            "payment_method": payment,
            "items": [{"product_id": pid, "quantity": q} for pid, q in items],
            "services": [{"service_id": sid, "quantity": q} for sid, q in svcs],
            "discount_percent": str(discount),
        }
        if discount > discount_limit:
            body["supervisor_username"] = SUPERVISOR[0]
            body["supervisor_pin"] = SUPERVISOR[2]
        if payment == "cash":
            total_cash = round_cash_total(total_est, cash_rounding)
            bills = [Decimal(10), Decimal(50), Decimal(100), Decimal(500), Decimal(1000)]
            roll = rng.random()
            if roll < 0.12:
                tendered = total_cash
            else:
                step = rng.choices(bills, weights=[10, 22, 35, 20, 13])[0]
                tendered = (total_cash / step).to_integral_value(rounding="ROUND_CEILING") * step
                if tendered == total_cash and rng.random() < 0.6:
                    tendered += step
            body["amount_tendered"] = str(tendered)
        else:
            body["reference_number"] = new_reference()

        for attempt in range(2):
            session = sim.sessions.get((username, ti)) or login(username, ti)
            resp = client.post("/api/sales", headers={"Authorization": f"Bearer {term_tokens[ti]}", "X-Cashier-Session": session}, json=body)
            if resp.status_code == 401 and attempt == 0:
                sim.sessions.pop((username, ti), None)
                continue
            break

        if resp.status_code != 200:
            raise RuntimeError(f"Sale rejected ({resp.status_code}) at {ts}: {resp.text[:300]} body={body}")

        sale = resp.json()
        for pid, qty in items:
            sim.change_stock(by_id[pid], -qty, ts)
        sim.stats["sales"] += 1
        sim.stats[f"payment_{payment}"] += 1
        record = {"id": sale["id"], "code": sale["transaction_code"], "ts": ts, "total": Decimal(str(sale["total"])), "cashier": username, "ti": ti, "payment": payment}
        sim.sale_log.append(record)
        sim.activity.append(
            {
                "event_type": "sale.completed",
                "severity": "info",
                "actor_type": "cashier",
                "actor_id": cashier_ids[username],
                "actor_name": cashier_rows[username].display_name,
                "cashier_id": cashier_ids[username],
                "terminal_id": term_ids[ti],
                "summary": f"Sale {sale['transaction_code']} completed",
                "details": {"sale_id": sale["id"], "transaction_code": sale["transaction_code"], "payment_method": payment, "total": str(sale["total"]), "status": "completed"},
                "created_at": ts,
            }
        )

        if rng.random() < args.reversal_rate:
            delay = timedelta(minutes=rng.randint(3, 240)) if rng.random() < 0.8 else timedelta(days=rng.randint(1, 3), minutes=rng.randint(0, 600))
            if ts + delay < now - timedelta(minutes=1):
                sim.push(ts + delay, "reverse", record)

    def do_reverse(ts, rec):
        sale = db.get(Sale, rec["id"])
        assert sale.status == "completed"
        kind = rng.choice(["void", "refund"])
        reason = rng.choices([r for r, _ in REVERSAL_REASONS], weights=[w for _, w in REVERSAL_REASONS])[0]
        if kind == "void" and reason == "defective_item":
            reason = "cashier_error"
        note = "Customer waiting at counter; confirmed with supervisor." if reason == "other" else (None if rng.random() < 0.7 else "Verified at the counter.")
        restock = True if kind == "void" else (reason != "defective_item" and rng.random() < 0.8)
        requester = rec["cashier"]
        quantities = defaultdict(int)
        for it in sale.items:
            if it.product_id is not None:
                quantities[it.product_id] += it.quantity
        if restock:
            for pid, qty in sorted(quantities.items()):
                product = db.scalar(select(Product).where(Product.id == pid).with_for_update())
                before = product.stock
                product.stock = before + qty
                product.how_much_sold = max(0, product.how_much_sold - qty)
                db.add(
                    StockAdjustment(
                        product_id=pid, product_name=product.name, sku=product.sku, quantity_change=qty, stock_before=before, stock_after=product.stock,
                        reason="sale_reversal", note=f"{kind.capitalize()} of {sale.transaction_code}", actor_type="cashier", actor_id=cashier_ids[requester],
                        actor_name=cashier_rows[requester].display_name, created_at=ts,
                    )
                )
                sim.change_stock(by_id[pid], qty, ts)
        sale.status = "voided" if kind == "void" else "refunded"
        db.add(
            SaleReversal(
                sale_id=sale.id, transaction_code=sale.transaction_code, kind=kind, reason_code=reason, note=note, amount=sale.total, restocked=restock,
                requested_by=cashier_rows[requester].id, requested_by_username=requester, authorized_by=cashier_rows[SUPERVISOR[0]].id,
                authorized_by_username=SUPERVISOR[0], terminal_id=term_ids[rec["ti"]], created_at=ts,
            )
        )
        sim.activity.append(
            {
                "event_type": f"sale.{sale.status}", "severity": "warning", "actor_type": "cashier", "actor_id": cashier_ids[requester],
                "actor_name": cashier_rows[requester].display_name, "cashier_id": cashier_ids[requester], "terminal_id": term_ids[rec["ti"]],
                "summary": f"Sale {sale.transaction_code} {sale.status}",
                "details": {"transaction_code": sale.transaction_code, "kind": kind, "reason_code": reason, "amount": str(sale.total), "restocked": restock, "authorized_by": SUPERVISOR[0]},
                "created_at": ts,
            }
        )
        db.commit()
        db.expire_all()
        rec["reversed"] = sale.status
        sim.stats[f"reversal_{kind}"] += 1
        sim.reversal_log.append(rec)

    def do_delivery(ts, payload):
        months = (ts - sim.start).days / 30.4
        orders = defaultdict(list)
        for p in catalog:
            if not p.stocked or p.intro > ts:
                continue
            if p.archived_at is not None and ts >= p.archived_at:
                continue
            if p.stop_restock_after and ts >= p.stop_restock_after:
                continue
            received = getattr(p, "_received", False)
            lo, hi = p.target
            if p.pop == 0:
                if received:
                    continue
                qty = rng.randint(1, 5)  # a unit or two on the shelf, never sells
            elif not received:
                qty = rng.randint(lo, hi)
            elif p.stock <= p.rp:
                qty = max(1, rng.randint(lo, hi) - p.stock)
            else:
                continue
            if p.price > 2500:
                qty = rng.randint(1, 3)
            cost = round(p.base_cost * (1 + 0.0035 * months) * rng.uniform(0.97, 1.03), 2)
            orders[p.supplier].append((p, qty, cost))
        for supplier, lines in sorted(orders.items()):
            for chunk_start in range(0, len(lines), 60):
                chunk = lines[chunk_start : chunk_start + 60]
                data = InventoryReceiptCreate(
                    supplier_name=supplier,
                    reference_number=f"DR-{ts.astimezone(MANILA):%Y%m%d}-{rng.randint(1000, 9999)}",
                    notes="Scheduled delivery" if not payload.get("initial") else "Opening stock",
                    items=[ReceiptItemInput(product_id=p.id, quantity=q, unit_cost=Decimal(str(c))) for p, q, c in chunk],
                )
                result = save_inventory_receipt(db, data)
                db.commit()
                sim.receipt_log.append((result["id"], ts))
                for p, q, _ in chunk:
                    p._received = True
                    sim.change_stock(p, q, ts)
                sim.stats["receipts"] += 1
                sim.stats["receipt_lines"] += len(chunk)

    def do_price_change(ts, payload):
        changed = 0
        for p in catalog:
            if rng.random() < 0.45:
                new = price_point(float(p.price) * rng.uniform(1.04, 1.09), 1.0, rng)
                if new > p.price:
                    row = db.get(Product, p.id)
                    row.price = new
                    p.price = new
                    changed += 1
        db.commit()
        sim.stats["price_changes"] += changed

    def do_archive(ts, p):
        row = db.get(Product, p.id)
        row.archived_at = ts
        db.commit()
        sim.stats["archived"] += 1

    def do_rename(ts, p):
        suffix = rng.choice([" (New Packaging)", " - New Formula", " (Upgraded)"])
        row = db.get(Product, p.id)
        row.name = (p.name + suffix)[:150]
        p.name = row.name
        db.commit()
        sim.stats["renamed"] += 1

    def do_recategorize(ts, payload):
        p, new_cat = payload
        row = db.get(Product, p.id)
        row.category = new_cat
        p.category = new_cat
        db.commit()
        sim.stats["recategorized"] += 1

    def do_writeoff(ts, payload):
        pool = [p for p in catalog if p.stock > 0 and p.intro <= ts and (p.archived_at is None or ts < p.archived_at)]
        p = rng.choice(pool) if pool else None
        if p is None:
            return
        reason = rng.choices(["damaged", "lost", "expired", "count_correction", "other"], weights=[35, 15, 8, 32, 10])[0]
        if reason == "expired" and p.cat_code not in ("LUB", "CLN", "FLT"):
            reason = "damaged"
        change = -min(p.stock, rng.choice([1, 1, 1, 2, 3]))
        if reason == "count_correction":
            change = rng.choice([-2, -1, -1, 1, 1, 2]) if p.stock > 2 else 1
            if p.stock + change < 0:
                change = -p.stock
            if change == 0:
                change = 1
        note = {"other": "Water-damaged box, returned to supplier", "count_correction": "Monthly stock count", "damaged": "Dropped during stocking", "lost": "Missing after inventory check", "expired": "Past shelf life"}[reason]
        actor = rng.choice(["admin", "supervisor"])
        before = p.stock
        row = db.scalar(select(Product).where(Product.id == p.id).with_for_update())
        row.stock = before + change
        db.add(
            StockAdjustment(
                product_id=p.id, product_name=p.name, sku=p.sku, quantity_change=change, stock_before=before, stock_after=before + change, reason=reason,
                note=note if (reason == "other" or rng.random() < 0.6) else None,
                actor_type="admin" if actor == "admin" else "cashier",
                actor_id=str(admin.id) if actor == "admin" else cashier_ids[SUPERVISOR[0]],
                actor_name=ADMIN[0] if actor == "admin" else SUPERVISOR[1], created_at=ts,
            )
        )
        db.commit()
        sim.change_stock(p, change, ts)
        sim.stats["writeoffs"] += 1

    handlers = {"sale": do_sale, "reverse": do_reverse, "delivery": do_delivery, "price_change": do_price_change, "archive": do_archive, "rename": do_rename, "recategorize": do_recategorize, "writeoff": do_writeoff}

    total_events = len(sim.heap)
    done = 0
    while sim.heap:
        ts, _, kind, payload = heapq.heappop(sim.heap)
        db.expire_all()
        handlers[kind](ts, payload)
        done += 1
        if kind == "sale" and sim.stats["sales"] % 250 == 0 and sim.stats["sales"]:
            print(f"  ... {sim.stats['sales']} sales, {sim.stats['reversal_void'] + sim.stats['reversal_refund']} reversals, {time.time() - t0:0.0f}s")

    # ---- move simulated times into place
    print("Backdating sales and receipts, writing stock-out periods and activity events...")
    with engine.begin() as c:
        c.execute(text("UPDATE sales SET created_at = :ts WHERE id = :id"), [{"ts": r["ts"], "id": r["id"]} for r in sim.sale_log])
        c.execute(text("UPDATE inventory_receipts SET received_at = :ts, created_at = :ts WHERE id = :id"), [{"ts": ts, "id": rid} for rid, ts in sim.receipt_log])
        c.execute(text("UPDATE terminals SET paired_at = :ts, first_seen_at = :ts, token_rotated_at = :ts"), {"ts": sim.start - timedelta(days=1)})
    db.add_all(StockoutPeriod(product_id=s["product_id"], product_name=s["product_name"], started_at=s["started_at"], ended_at=s["ended_at"]) for s in sim.stockouts)
    sim.activity.sort(key=lambda e: e["created_at"])
    db.add_all(ActivityEvent(**e) for e in sim.activity)
    db.commit()

    # ---- sim vs database
    db.expire_all()
    mismatched = [(p.sku, p.stock, db.get(Product, p.id).stock) for p in catalog if db.get(Product, p.id).stock != p.stock]
    if mismatched:
        raise RuntimeError(f"Simulated stock differs from the database for {len(mismatched)} products: {mismatched[:5]}")
    print(f"Simulated stock matches the database for all {len(catalog)} products.")

    out_dir = Path.home() / "kinesis-seed-output"
    out_dir.mkdir(mode=0o700, exist_ok=True)
    summary = {
        "database": db_name,
        "as_of": now.isoformat(),
        "seed": args.seed,
        "products": len(catalog),
        "services": len(services),
        "stats": dict(sim.stats),
        "first_sale": min(r["ts"] for r in sim.sale_log).isoformat(),
        "last_sale": max(r["ts"] for r in sim.sale_log).isoformat(),
        "elapsed_seconds": round(time.time() - t0),
        "credentials": {
            "admin": {"username": ADMIN[0], "password": ADMIN[1]},
            "supervisor": {"username": SUPERVISOR[0], "pin": SUPERVISOR[2]},
            "cashiers": [{"username": u, "pin": pin} for u, _, pin in CASHIERS],
        },
        "terminals": [{"name": t[1], "device_id": t[0]} for t in TERMINALS],
    }
    path = out_dir / f"seed-summary-{now.astimezone(MANILA):%Y%m%d-%H%M}.json"
    path.write_text(json.dumps(summary, indent=2))
    os.chmod(path, 0o600)
    print(json.dumps({k: v for k, v in summary.items() if k not in ("credentials",)}, indent=2))
    print("Summary written to", path)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("run")
    r.add_argument("--seed", type=int, default=20261110)
    r.add_argument("--target-sales", type=int, default=3200)
    r.add_argument("--products", type=int, default=340)
    r.add_argument("--adjustments", type=int, default=55)
    r.add_argument("--reversal-rate", type=float, default=0.022)
    args = parser.parse_args()
    if args.cmd == "run":
        run(args)
