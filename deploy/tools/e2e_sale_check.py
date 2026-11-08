#!/usr/bin/env python3
"""
kinesis-e2e: drive a running Kinesis host end to end over its real HTTPS
origins, with synthetic data, and check that a sale moves inventory.

    KINESIS_ENV_FILE=<config>/kinesis.env <CODE>/venv/bin/python \
        deploy/tools/e2e_sale_check.py --caddy-env <config>/caddy.env \
        --ca <data>/onboarding/kinesis-root.crt [--connect-ip 192.168.254.199]

REFUSES TO RUN unless the configured database name ends in "_test": it
creates an administrator, a cashier, a product, a paired terminal and a
sale. Run from <CODE>/backend (or with --backend-dir) so it can create the
first administrator directly; everything else goes through HTTPS exactly as
the admin console and a browser POS terminal do:

  admin  : login (Origin + cookie), session/CSRF, create product with
           opening stock, create cashier, create pairing challenge
  POS    : pair as a browser terminal (HttpOnly cookie), CSRF token,
           cashier login, settings WebSocket (wss://), product list,
           checkout, idempotent retry of the same transaction code
  check  : stock decreased by the quantity sold, sale readable by code

Prints a JSON summary (ids, codes, stock before/after) and exits non-zero
on the first failure. With --verify-only it just re-reads a previous run's
product and sale (for checking persistence across a restart).
"""

from __future__ import annotations

import argparse
import base64
import http.client
import json
import os
import secrets
import socket
import ssl
import sys
from http.cookies import SimpleCookie
from pathlib import Path
from urllib.parse import urlsplit


def read_env(path: Path) -> dict[str, str]:
    values = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip()
    return values


class Client:
    """Tiny HTTPS client: fixed connect address, real SNI/hostname check, cookies."""

    def __init__(self, origin: str, context: ssl.SSLContext, connect_ip: str | None):
        parts = urlsplit(origin)
        self.origin = origin.rstrip("/")
        self.host = parts.hostname
        self.port = parts.port or 443
        self.context = context
        self.connect_ip = connect_ip or self.host
        self.cookies: dict[str, str] = {}

    def _connection(self) -> http.client.HTTPSConnection:
        connection = http.client.HTTPSConnection(self.host, self.port, context=self.context, timeout=15)
        ip, port, context, host = self.connect_ip, self.port, self.context, self.host

        def connect():
            raw = socket.create_connection((ip, port), timeout=15)
            # IP-address origins are sent without SNI, like browsers do.
            server_hostname = host
            connection.sock = context.wrap_socket(raw, server_hostname=server_hostname)

        connection.connect = connect
        return connection

    def request(self, method: str, path: str, body=None, headers=None) -> tuple[int, dict | str, dict]:
        connection = self._connection()
        all_headers = {"Origin": self.origin, "Accept": "application/json"}
        if self.cookies:
            all_headers["Cookie"] = "; ".join(f"{k}={v}" for k, v in self.cookies.items())
        data = None
        if body is not None:
            data = json.dumps(body).encode()
            all_headers["Content-Type"] = "application/json"
        all_headers.update(headers or {})
        connection.request(method, path, body=data, headers=all_headers)
        response = connection.getresponse()
        raw = response.read().decode("utf-8", "replace")
        for header, value in response.getheaders():
            if header.lower() == "set-cookie":
                cookie = SimpleCookie()
                cookie.load(value)
                for key, morsel in cookie.items():
                    if morsel.value:
                        self.cookies[key] = morsel.value
                    else:
                        self.cookies.pop(key, None)
        connection.close()
        try:
            payload = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            payload = raw
        return response.status, payload, dict(response.getheaders())

    def websocket_upgrade(self, path: str, extra_headers=None) -> tuple[int, str]:
        """Open a wss:// connection, return (status, first text frame or '')."""
        raw = socket.create_connection((self.connect_ip, self.port), timeout=15)
        sock = self.context.wrap_socket(raw, server_hostname=self.host)
        key = base64.b64encode(secrets.token_bytes(16)).decode()
        lines = [
            f"GET {path} HTTP/1.1",
            f"Host: {self.host}:{self.port}",
            "Upgrade: websocket",
            "Connection: Upgrade",
            f"Sec-WebSocket-Key: {key}",
            "Sec-WebSocket-Version: 13",
            f"Origin: {self.origin}",
        ]
        if self.cookies:
            lines.append("Cookie: " + "; ".join(f"{k}={v}" for k, v in self.cookies.items()))
        lines.extend(f"{k}: {v}" for k, v in (extra_headers or {}).items())
        sock.sendall(("\r\n".join(lines) + "\r\n\r\n").encode())
        head = b""
        while b"\r\n\r\n" not in head:
            chunk = sock.recv(4096)
            if not chunk:
                break
            head += chunk
        status_line = head.split(b"\r\n", 1)[0].decode()
        status = int(status_line.split()[1]) if len(status_line.split()) > 1 else 0
        text = ""
        if status == 101:
            rest = head.split(b"\r\n\r\n", 1)[1]
            sock.settimeout(5)
            try:
                while len(rest) < 2:
                    rest += sock.recv(4096)
                length = rest[1] & 0x7F
                offset = 2
                if length == 126:
                    while len(rest) < 4:
                        rest += sock.recv(4096)
                    length = int.from_bytes(rest[2:4], "big")
                    offset = 4
                while len(rest) < offset + length:
                    rest += sock.recv(65536)
                if rest[0] & 0x0F == 0x1:
                    text = rest[offset:offset + length].decode("utf-8", "replace")
            except (socket.timeout, TimeoutError):
                text = ""
            # Close frame (masked, as clients must).
            sock.sendall(bytes([0x88, 0x80]) + secrets.token_bytes(4))
        sock.close()
        return status, text


def expect(condition: bool, message: str, detail=None) -> None:
    if not condition:
        print(f"FAIL  {message}" + (f": {detail}" if detail is not None else ""), file=sys.stderr)
        sys.exit(1)
    print(f"OK    {message}")


def main() -> int:
    parser = argparse.ArgumentParser(prog="kinesis-e2e")
    parser.add_argument("--caddy-env", required=True, type=Path)
    parser.add_argument("--ca", required=True, type=Path)
    parser.add_argument("--connect-ip", help="Connect here (default: resolve each site's host name).")
    parser.add_argument("--backend-dir", type=Path, default=Path.cwd())
    parser.add_argument("--state", type=Path, help="Write/read the run summary here.")
    parser.add_argument("--verify-only", action="store_true")
    args = parser.parse_args()

    env_file = Path(os.environ.get("KINESIS_ENV_FILE", ""))
    expect(env_file.is_file(), "KINESIS_ENV_FILE points at the backend settings", str(env_file))
    backend_env = read_env(env_file)
    database = backend_env.get("DATABASE_NAME", "")
    expect(database.endswith("_test") and database != "kinesis",
           f"database {database!r} is a disposable test database (name ends in _test)")

    caddy = read_env(args.caddy_env)
    pos_sites = [s.strip() for s in caddy["KINESIS_POS_SITES"].split(",") if s.strip()]
    admin_site = [s.strip() for s in caddy["KINESIS_ADMIN_SITES"].split(",") if s.strip()][0]
    pos_site = next((s for s in pos_sites if not s.split("//")[1][0].isdigit()), pos_sites[0])

    context = ssl.create_default_context(cafile=str(args.ca))
    admin = Client(admin_site, context, args.connect_ip)
    pos = Client(pos_site, context, args.connect_ip)

    if args.verify_only:
        state = json.loads(args.state.read_text())
        admin_status, payload, _ = admin.request("POST", "/api/auth/login",
                                                 {"username": state["admin"], "password": state["admin_password"]})
        expect(admin_status == 200, "admin login after restart", payload)
        status, product, _ = admin.request("GET", f"/api/products/{state['product_id']}")
        expect(status == 200, "product still present", product)
        stock = product.get("stock")
        expect(stock == state["stock_after"], f"stock persisted ({stock} == {state['stock_after']})")
        status, sales, _ = admin.request("GET", "/api/sales?limit=50")
        codes = json.dumps(sales)
        expect(state["transaction_code"] in codes, f"sale {state['transaction_code']} persisted")
        return 0

    # ---------------------------------------------------------------- admin
    sys.path.insert(0, str(args.backend_dir.resolve()))
    from create_admin import provision_admin  # noqa: E402  (backend module)

    run = secrets.token_hex(3)
    admin_user = f"e2e_admin_{run}"
    admin_password = secrets.token_urlsafe(18)
    provision_admin(admin_user, admin_password, reset_password=False)
    print(f"OK    synthetic administrator {admin_user} created in {database}")

    status, payload, _ = admin.request("POST", "/api/auth/login",
                                       {"username": admin_user, "password": admin_password})
    expect(status == 200, f"admin login over {admin_site}", payload)
    expect(any(name.startswith("__Host-") for name in admin.cookies), "admin session cookie uses __Host- prefix",
           list(admin.cookies))
    status, session, _ = admin.request("GET", "/api/auth/session")
    expect(status == 200 and session.get("csrf_token"), "admin session and CSRF token", session)
    admin_csrf = {"X-CSRF-Token": session["csrf_token"]}

    status, payload, _ = admin.request("POST", "/api/admin/products", headers={}, body={
        "name": f"E2E Brake Pad {run}", "category": "E2E Test", "price": "250.00",
        "initial_stock": 10, "initial_unit_cost": "120.00",
    })
    expect(status == 403, "admin write without CSRF token is refused", status)
    status, product, _ = admin.request("POST", "/api/admin/products", headers=admin_csrf, body={
        "name": f"E2E Brake Pad {run}", "category": "E2E Test", "price": "250.00",
        "initial_stock": 10, "initial_unit_cost": "120.00",
    })
    expect(status == 201, "admin creates product with opening stock 10", product)
    product_id = product.get("id") or product.get("product", {}).get("id")
    expect(isinstance(product_id, int), "product id returned", product)

    cashier_user = f"e2e_cashier_{run}"
    cashier_pin = "".join(secrets.choice("0123456789") for _ in range(6))
    status, cashier, _ = admin.request("POST", "/api/admin/cashiers", headers=admin_csrf, body={
        "username": cashier_user, "display_name": "E2E Cashier", "pin": cashier_pin,
    })
    expect(status in (200, 201), "admin creates cashier", cashier)

    status, challenge, _ = admin.request("POST", "/api/admin/terminals/pairing-challenges", headers=admin_csrf)
    expect(status == 201, "admin creates pairing challenge", challenge)
    raw_token = challenge["pairing_payload"].split("KINESIS-PAIRING:v1:", 1)[-1]

    # ------------------------------------------------------------------ POS
    web = {"X-Kinesis-Client": "web"}
    status, paired, _ = pos.request("POST", "/api/terminals/pair", headers=web, body={
        "pairing_token": raw_token,
        "registration": {"device_id": f"KNS-e2e-{run}-0001", "name": "E2E browser terminal",
                         "device_type": "E2E", "platform": "web", "app_version": "e2e"},
    })
    expect(status == 201, f"browser terminal pairs over {pos_site}", paired)
    expect(bool(pos.cookies), "terminal credential set as cookie", list(pos.cookies))
    expect("session_token" not in json.dumps(paired), "terminal token not exposed to JavaScript")

    status, terminal_session, _ = pos.request("GET", "/api/terminals/session", headers=web)
    expect(status == 200 and terminal_session.get("csrf_token"), "terminal session and CSRF token", terminal_session)
    pos_headers = {**web, "X-CSRF-Token": terminal_session["csrf_token"]}

    status, payload, _ = pos.request("POST", "/api/cashier-auth/login", headers=pos_headers,
                                     body={"username": cashier_user, "pin": cashier_pin})
    expect(status == 200, "cashier logs in on the terminal", payload)

    ws_status, ws_text = pos.websocket_upgrade("/api/terminals/ws")
    expect(ws_status == 101, f"settings WebSocket upgrades over wss://{pos.host}:{pos.port}", ws_status)
    print(f"      first WebSocket message: {ws_text[:120] or '(none within 5 s)'}")

    status, products, _ = pos.request("GET", "/api/products?search=E2E", headers=web)
    listing = products if isinstance(products, list) else products.get("items", products.get("products", []))
    before = next((p for p in listing if p.get("id") == product_id), None)
    expect(before is not None and before.get("stock") == 10, "POS sees the product with stock 10", before)

    code = f"E2E-{run}-{secrets.token_hex(3)}".upper()
    sale_body = {"transaction_code": code, "payment_method": "cash",
                 "items": [{"product_id": product_id, "quantity": 3}], "amount_tendered": "1000.00"}
    status, sale, _ = pos.request("POST", "/api/sales", headers=pos_headers, body=sale_body)
    expect(status in (200, 201), "cash sale of 3 units completes", sale)
    status, retry, _ = pos.request("POST", "/api/sales", headers=pos_headers, body=sale_body)
    expect(status in (200, 201), "retry with the same transaction code is accepted (idempotent)", retry)

    status, after, _ = admin.request("GET", f"/api/products/{product_id}")
    expect(status == 200 and after.get("stock") == 7, "stock is 7 after the sale (not 4: no double deduction)",
           after.get("stock") if isinstance(after, dict) else after)
    status, receipt, _ = pos.request("GET", f"/api/sales/{code}", headers=web)
    expect(status == 200, f"sale {code} readable by the terminal", receipt)

    summary = {"database": database, "admin": admin_user, "cashier": cashier_user, "product_id": product_id,
               "transaction_code": code, "stock_before": 10, "stock_after": 7, "pos_origin": pos_site,
               "admin_origin": admin_site}
    if args.state:
        args.state.parent.mkdir(parents=True, exist_ok=True)
        fd = os.open(args.state, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w") as handle:
            # Synthetic test credentials only, kept for --verify-only.
            json.dump({**summary, "admin_password": admin_password}, handle)
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
