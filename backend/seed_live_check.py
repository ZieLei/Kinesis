import json, sys, httpx
from sqlalchemy import text
sys.path.insert(0, ".")
from database import SessionLocal, engine
from tests.helpers import create_pairing_token

POS, ADM = "https://kinesis.local:9443", "https://kinesis.local:9444"
res = {}
def client(origin):
    port = origin.rsplit(":", 1)[1]
    return httpx.Client(base_url=f"https://127.0.0.1:{port}", verify=False,  # nosec B501 - loopback to the local CA proxy; test script only
                         headers={"Host": origin.split('//')[1], "Origin": origin}, timeout=20)

def sql(q, **kw):
    with engine.connect() as c:
        return c.execute(text(q), kw).one()

ok = True
def check(label, cond, detail=""):
    global ok; ok &= bool(cond); print(("PASS " if cond else "FAIL ") + label + (f"  [{detail}]" if detail else ""))

# --- admin through the running server (port 9444)
a = client(ADM)
r = a.post("/api/auth/login", json={"username": "seed_admin", "password": "Seed-Admin-Test-2026!"})
check("admin login via https proxy :9444", r.status_code == 200, str(r.status_code))
bad = client(ADM).post("/api/auth/login", json={"username": "seed_admin", "password": "wrong-password-123"})
check("wrong admin password rejected", bad.status_code == 401)
rep = a.get("/api/reports/sales", params={"period": "monthly", "date": "2026-08-15"}).json()["current"]
n, t = sql("select count(*), sum(total) from sales where status='completed' and created_at >= '2026-07-31 16:00+00' and created_at < '2026-08-31 16:00+00'")
check("running server monthly report (Aug 2026) equals SQL", rep["transactions"] == n and abs(rep["sales"] - float(t)) < 0.01, f"{rep['transactions']} / {rep['sales']}")
ov = a.get("/api/admin/overview/operations").json()
check("admin overview shows the seeded inventory", ov["inventory_summary"]["total_products"] == 334, str(ov["inventory_summary"]["total_products"]))
hl = a.get("/api/admin/health").json()
print("   health:", {c["id"]: c["status"] for c in hl["checks"]})
terms = a.get("/api/admin/terminals").json()
check("admin terminal list shows 3 seeded terminals", terms["count"] >= 3, str(terms["count"]))

# --- POS side through the running server (port 9443): pair a temporary web terminal
db = SessionLocal()
tok = create_pairing_token(db); db.close()
p = client(POS)
r = p.post("/api/terminals/pair", headers={"X-Kinesis-Client": "web"}, json={"pairing_token": tok, "registration": {"device_id": "KNS-seed-verify-0099", "name": "Verification (temporary)", "device_type": "Browser", "platform": "web", "app_version": "1.0.0"}})
check("web terminal paired through proxy", r.status_code == 201, str(r.status_code))
csrf = r.json().get("csrf_token")
creds = [("cashier_ana", "482916"), ("cashier_ben", "735194"), ("cashier_carla", "906251"), ("supervisor_dan", "384720")]
for u, pin in creds:
    r = p.post("/api/cashier-auth/login", headers={"X-CSRF-Token": csrf}, json={"username": u, "pin": pin})
    check(f"cashier login {u}", r.status_code == 200, str(r.status_code))
    if u == "supervisor_dan":
        print("   login keys:", list(r.json().keys()), list(r.json().get("cashier", {}).keys()))
        lst = p.get("/api/sales", params={"limit": 3}).json()
        check("POS transaction list served", lst["count"] == 3196 and len(lst["items"]) == 3, f"count={lst['count']}")
        d = p.get(f"/api/sales/{lst['items'][0]['transaction_code']}").json()
        check("receipt detail has lines, cashier, terminal", d["items"] or d["service_items"] and d["cashier_username"] and d["terminal_device_id"], d["transaction_code"])
        voided = p.get("/api/sales", params={"limit": 1, "status": "voided"}).json()
        check("status filter shows voided sales", voided["count"] == 32)
        prods = p.get("/api/products").json()
        check("POS product list served (first page of 50)", len(prods["items"]) == 50)
    p.post("/api/cashier-auth/logout", headers={"X-CSRF-Token": csrf})
bad = p.post("/api/cashier-auth/login", headers={"X-CSRF-Token": csrf}, json={"username": "cashier_ana", "pin": "111222"})
check("wrong PIN rejected", bad.status_code == 401)
print("ALL LIVE CHECKS PASSED" if ok else "SOME LIVE CHECKS FAILED")
