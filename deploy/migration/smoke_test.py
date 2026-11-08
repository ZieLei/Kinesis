#!/usr/bin/env python3
"""
kinesis-smoke: read-only HTTPS checks against a running Kinesis host.

Standard library only; runs from the host itself or any LAN computer.
Nothing is written: only GET requests and TCP connection attempts.

    python smoke_test.py --caddy-env /etc/kinesis/caddy.env \\
        --ca /var/lib/kinesis/pki/root-ca.crt --lan-ip 192.168.254.199

Site addresses come from caddy.env. --connect-ip sends every connection to
another address while keeping the original Host/SNI, so a host can be
tested before it takes over the shop's IP address (rehearsal).
Exit status 1 when any check fails.
"""

from __future__ import annotations

import argparse
import http.client
import ipaddress
import json
import socket
import ssl
import sys
from pathlib import Path
from urllib.parse import urlsplit


def read_env(path: Path) -> dict[str, str]:
    values = {}

    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()

        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip().strip("\"'")

    return values


def split_list(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


def is_ip(host: str) -> bool:
    try:
        ipaddress.ip_address(host)
        return True
    except ValueError:
        return False


class Checker:
    def __init__(self, ca: Path | None, connect_ip: str | None, timeout: float):
        self.connect_ip = connect_ip
        self.timeout = timeout
        self.failures = 0
        self.context = ssl.create_default_context(cafile=str(ca) if ca else None)

    def result(self, ok: bool, message: str) -> None:
        print(("OK    " if ok else "FAIL  ") + message)
        self.failures += 0 if ok else 1

    def request(self, base: str, path: str) -> tuple[int, dict, bytes]:
        parts = urlsplit(base)
        host = parts.hostname or ""
        port = parts.port or (443 if parts.scheme == "https" else 80)
        target = self.connect_ip or host

        raw = socket.create_connection((target, port), timeout=self.timeout)

        if parts.scheme == "https":
            # Browsers send no SNI for IP addresses; Python behaves the same
            # when server_hostname is an IP literal.
            sock = self.context.wrap_socket(raw, server_hostname=host)
        else:
            sock = raw

        connection = http.client.HTTPConnection(host, port, timeout=self.timeout)
        connection.sock = sock
        host_header = host if port in (80, 443) else f"{host}:{port}"
        connection.request("GET", path, headers={"Host": host_header, "Accept": "*/*"})
        response = connection.getresponse()
        body = response.read(256 * 1024)
        headers = {k.lower(): v for k, v in response.getheaders()}
        connection.close()
        return response.status, headers, body

    def get(self, base: str, path: str):
        try:
            return self.request(base, path)
        except ssl.SSLCertVerificationError as exc:
            self.result(False, f"{base}{path}: certificate not trusted ({exc.verify_message})")
        except (OSError, http.client.HTTPException) as exc:
            self.result(False, f"{base}{path}: {exc}")

        return None

    def port_closed(self, ip: str, port: int, label: str) -> None:
        try:
            with socket.create_connection((ip, port), timeout=self.timeout):
                self.result(False, f"{label} port {ip}:{port} is reachable from here; it must not be")
        except OSError:
            self.result(True, f"{label} port {ip}:{port} is closed to the network")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--caddy-env", required=True, type=Path)
    parser.add_argument("--ca", type=Path, help="Kinesis root-ca.crt (trust anchor).")
    parser.add_argument("--connect-ip", help="Connect here instead of resolving the site names (rehearsal).")
    parser.add_argument("--lan-ip", help="Host LAN address; checks that backend, PostgreSQL and the Caddy admin API are not exposed.")
    parser.add_argument("--backend-port", type=int, default=8000)
    parser.add_argument("--timeout", type=float, default=5.0)
    args = parser.parse_args(argv)

    env = read_env(args.caddy_env)
    checker = Checker(args.ca, args.connect_ip, args.timeout)
    pos_sites = split_list(env.get("KINESIS_POS_SITES", ""))
    admin_sites = split_list(env.get("KINESIS_ADMIN_SITES", ""))
    onboarding = env.get("KINESIS_ONBOARDING_SITE", "")
    pos_index = admin_index = None

    for site in pos_sites:
        label = f"POS {site}" + (" (no SNI)" if is_ip(urlsplit(site).hostname or "") else "")
        response = checker.get(site, "/")

        if response:
            status, headers, body = response
            pos_index = pos_index or body
            checker.result(status == 200, f"{label}: TLS trusted, app served (HTTP {status})")
            checker.result("content-security-policy" in headers and "strict-transport-security" in headers,
                           f"{label}: CSP and HSTS headers present")

        response = checker.get(site, "/api/admin/settings")
        if response:
            checker.result(response[0] == 404, f"{label}: admin API blocked on the POS origin (HTTP {response[0]})")

        response = checker.get(site, "/api/terminals/session")
        if response:
            checker.result(response[0] == 401,
                           f"{label}: POS API reaches the backend and requires a terminal (HTTP {response[0]})")

    for site in admin_sites:
        response = checker.get(site, "/")

        if response:
            admin_index = admin_index or response[2]
            checker.result(response[0] == 200, f"admin {site}: TLS trusted, app served (HTTP {response[0]})")

        response = checker.get(site, "/api/health")

        if response:
            status, _, body = response

            try:
                health = json.loads(body)
            except ValueError:
                health = {}

            checker.result(status == 200 and health.get("database") == "online",
                           f"admin {site}: /api/health -> HTTP {status}, database {health.get('database')}")

    if pos_index is not None and admin_index is not None:
        checker.result(pos_index != admin_index, "POS and admin origins serve different applications")

    if onboarding:
        response = checker.get(onboarding, "/kinesis-root.crt")
        if response:
            checker.result(response[0] == 200 and b"BEGIN CERTIFICATE" in response[2],
                           f"onboarding {onboarding}: root certificate available (HTTP {response[0]})")

        response = checker.get(onboarding, "/api/health")
        if response:
            checker.result(response[0] == 404, f"onboarding {onboarding}: no API exposed (HTTP {response[0]})")

    if args.lan_ip:
        checker.port_closed(args.lan_ip, args.backend_port, "backend")
        checker.port_closed(args.lan_ip, 5432, "PostgreSQL")
        checker.port_closed(args.lan_ip, 2019, "Caddy admin API")

    print(f"\n{checker.failures} failure(s).")
    return 1 if checker.failures else 0


if __name__ == "__main__":
    sys.exit(main())
