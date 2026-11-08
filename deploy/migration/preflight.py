#!/usr/bin/env python3
"""
kinesis-preflight: check a host's Kinesis configuration before starting it.

Offline and read-only. Reads kinesis.env, caddy.env and the PKI directory,
and reports every inconsistency that would break HTTPS, browser origins,
cookies or terminal pairing. Secret values are never printed.

    python preflight.py --kinesis-env /etc/kinesis/kinesis.env \\
        --caddy-env /etc/kinesis/caddy.env

Run it with the backend's virtual environment: certificate names are read
with the "cryptography" package (deploy/pki/requirements.lock).
Exit status 1 when any check fails.
"""

from __future__ import annotations

import argparse
import ipaddress
import os
import stat
import sys
from pathlib import Path
from urllib.parse import urlsplit


RETIRED_KEYS = {"KINESIS_TERMINAL_ENROLLMENT_KEY"}


def read_env(path: Path) -> dict[str, str]:
    """KEY=VALUE lines, as read by Caddy --envfile and python-dotenv."""

    values: dict[str, str] = {}

    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()

        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        value = value.strip()

        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]

        values[key.strip()] = value

    return values


def split_list(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


def normalize_origin(value: str) -> str:
    parts = urlsplit(value.strip())
    port = parts.port or (443 if parts.scheme == "https" else 80)
    return f"{parts.scheme.lower()}://{(parts.hostname or '').lower()}:{port}"


class Report:
    def __init__(self):
        self.failures = 0
        self.warnings = 0

    def ok(self, message: str) -> None:
        print(f"OK    {message}")

    def fail(self, message: str) -> None:
        self.failures += 1
        print(f"FAIL  {message}")

    def warn(self, message: str) -> None:
        self.warnings += 1
        print(f"WARN  {message}")

    def check(self, condition: bool, ok: str, fail: str) -> None:
        self.ok(ok) if condition else self.fail(fail)


def check_permissions(report: Report, path: Path, label: str) -> None:
    if os.name == "nt":
        report.warn(f"{label}: check the ACL manually (icacls); POSIX modes do not apply")
        return

    mode = stat.S_IMODE(path.stat().st_mode)
    report.check(
        not mode & stat.S_IROTH and not mode & stat.S_IWOTH,
        f"{label} is not world-readable (mode {mode:o})",
        f"{label} is readable by every local user (mode {mode:o}); use 0640",
    )


def certificate_names(path: Path) -> tuple[set[str], set[str]]:
    from cryptography import x509

    certificate = x509.load_pem_x509_certificates(path.read_bytes())[0]
    san = certificate.extensions.get_extension_for_class(x509.SubjectAlternativeName).value
    return (
        {name.lower() for name in san.get_values_for_type(x509.DNSName)},
        {str(ip) for ip in san.get_values_for_type(x509.IPAddress)},
    )


def is_ip(host: str) -> bool:
    try:
        ipaddress.ip_address(host)
        return True
    except ValueError:
        return False


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--kinesis-env", required=True, type=Path)
    parser.add_argument("--caddy-env", required=True, type=Path)
    parser.add_argument("--pki-dir", type=Path, help="Default: <KINESIS_DATA_DIR>/pki from caddy.env.")
    parser.add_argument("--expect-ip", help="LAN address the host will serve on (must be in every site list).")
    parser.add_argument("--skip-filesystem", action="store_true",
                        help="Only compare the files (for checking configs prepared on another machine).")
    args = parser.parse_args(argv)

    report = Report()
    backend = read_env(args.kinesis_env)
    caddy = read_env(args.caddy_env)

    print(f"Backend config: {args.kinesis_env}")
    print(f"Caddy config:   {args.caddy_env}\n")

    # --- backend production settings -------------------------------------
    report.check(backend.get("KINESIS_ENVIRONMENT") == "production",
                 "KINESIS_ENVIRONMENT=production",
                 "KINESIS_ENVIRONMENT must be production (enables the startup safety checks)")

    secret = backend.get("KINESIS_ADMIN_AUTH_SECRET_KEY", "")
    report.check(len(secret) >= 32,
                 "admin auth secret is set (>= 32 characters)",
                 "KINESIS_ADMIN_AUTH_SECRET_KEY must be at least 32 characters")

    for key in ("KINESIS_ADMIN_COOKIE_SECURE", "KINESIS_POS_COOKIE_SECURE"):
        report.check(backend.get(key, "").lower() == "true", f"{key}=true", f"{key} must be true")

    report.check(backend.get("KINESIS_ADMIN_COOKIE_NAME", "").startswith("__Host-"),
                 "admin cookie uses the __Host- prefix",
                 "KINESIS_ADMIN_COOKIE_NAME must start with __Host-")

    for key in ("DATABASE_USER", "DATABASE_PASSWORD", "DATABASE_NAME"):
        report.check(bool(backend.get(key)), f"{key} is set", f"{key} is missing")

    report.check(backend.get("DATABASE_HOST", "127.0.0.1") in {"127.0.0.1", "localhost", "::1"},
                 "database is on this host (loopback)",
                 "DATABASE_HOST should be 127.0.0.1; PostgreSQL must not listen on the LAN")

    for key in RETIRED_KEYS & set(backend):
        report.fail(f"{key} is retired; remove it from the file")

    for source, values in (("kinesis.env", backend), ("caddy.env", caddy)):
        for key, value in values.items():
            if value.startswith("__") and value.endswith("__"):
                report.fail(f"{key} in {source} is still a template placeholder")

    # --- origins vs. Caddy sites ------------------------------------------
    pos_sites = {normalize_origin(s) for s in split_list(caddy.get("KINESIS_POS_SITES", ""))}
    admin_sites = {normalize_origin(s) for s in split_list(caddy.get("KINESIS_ADMIN_SITES", ""))}
    pos_origins = {normalize_origin(s) for s in split_list(backend.get("KINESIS_POS_ALLOWED_ORIGINS", ""))}
    admin_origins = {normalize_origin(s) for s in split_list(backend.get("KINESIS_ADMIN_ALLOWED_ORIGINS", ""))}

    report.check(pos_sites == pos_origins,
                 f"POS origins match the Caddy POS sites: {sorted(pos_sites)}",
                 f"POS origins {sorted(pos_origins)} != Caddy POS sites {sorted(pos_sites)}")
    report.check(admin_sites == admin_origins,
                 f"admin origins match the Caddy admin sites: {sorted(admin_sites)}",
                 f"admin origins {sorted(admin_origins)} != Caddy admin sites {sorted(admin_sites)}")
    report.check(not pos_sites & admin_sites,
                 "POS and admin use different origins",
                 "POS and admin sites overlap; they must use different ports")
    report.check(all(s.startswith("https://") for s in pos_sites | admin_sites),
                 "all POS and admin sites use HTTPS",
                 "every POS and admin site must use https://")

    https_port = int(caddy.get("KINESIS_HTTPS_PORT") or 443)
    pos_ports = {urlsplit(s).port for s in pos_sites}
    report.check(pos_ports == {https_port},
                 f"POS sites use KINESIS_HTTPS_PORT ({https_port})",
                 f"POS site ports {sorted(pos_ports)} differ from KINESIS_HTTPS_PORT={https_port}")

    hosts = {urlsplit(s).hostname for s in pos_sites | admin_sites}

    if args.expect_ip:
        for label, sites in (("POS", pos_sites), ("admin", admin_sites)):
            report.check(any(urlsplit(s).hostname == args.expect_ip for s in sites),
                         f"{label} sites include {args.expect_ip}",
                         f"{label} sites do not include {args.expect_ip}")

    onboarding = caddy.get("KINESIS_ONBOARDING_SITE", "")
    report.check(onboarding.startswith("http://") and is_ip(urlsplit(onboarding).hostname or ""),
                 f"onboarding site is plain HTTP on an IP address ({onboarding})",
                 "KINESIS_ONBOARDING_SITE must be http://<LAN-IP>:<port> (devices cannot use HTTPS before trusting the CA)")

    backend_address = caddy.get("KINESIS_BACKEND", "")
    report.check(backend_address.startswith(("127.0.0.1:", "localhost:", "[::1]:")),
                 f"Caddy proxies to a loopback backend ({backend_address})",
                 f"KINESIS_BACKEND must be a loopback address, got {backend_address!r}")

    default_sni = caddy.get("KINESIS_DEFAULT_SNI", "")
    report.check(default_sni in hosts,
                 f"KINESIS_DEFAULT_SNI ({default_sni}) is one of the site names",
                 f"KINESIS_DEFAULT_SNI {default_sni!r} is not a site host name")

    # --- shared paths -------------------------------------------------------
    data_backend = backend.get("KINESIS_DATA_DIR", "")
    data_caddy = caddy.get("KINESIS_DATA_DIR", "")
    report.check(bool(data_backend) and Path(data_backend) == Path(data_caddy),
                 f"KINESIS_DATA_DIR is the same in both files ({data_caddy})",
                 f"KINESIS_DATA_DIR differs: backend {data_backend!r}, Caddy {data_caddy!r}")

    pos_root = caddy.get("KINESIS_POS_WEB_ROOT", "")
    admin_root = caddy.get("KINESIS_ADMIN_WEB_ROOT", "")
    report.check(bool(pos_root) and bool(admin_root) and Path(pos_root) != Path(admin_root),
                 "POS and admin web roots are separate directories",
                 "KINESIS_POS_WEB_ROOT and KINESIS_ADMIN_WEB_ROOT must be different builds")

    # --- certificate --------------------------------------------------------
    pki_dir = args.pki_dir or (Path(data_caddy) / "pki" if data_caddy else None)
    server_cert = pki_dir / "server.crt" if pki_dir else None

    if args.skip_filesystem:
        print("\n(filesystem checks skipped)")
    elif server_cert is None or not server_cert.is_file():
        report.fail(f"server certificate not found at {server_cert}")
    else:
        try:
            dns, ips = certificate_names(server_cert)
        except ImportError:
            report.fail("the cryptography package is missing; run with the Kinesis venv")
        else:
            for host in sorted(hosts | {default_sni}):
                covered = host in ips if is_ip(host) else host in dns
                report.check(covered,
                             f"certificate covers {host}",
                             f"certificate does not cover {host} (names: {sorted(dns | ips)}); "
                             "run kinesis_pki.py renew --ip/--hostname")

    # --- filesystem ---------------------------------------------------------
    if not args.skip_filesystem:
        check_permissions(report, args.kinesis_env, args.kinesis_env.name)
        check_permissions(report, args.caddy_env, args.caddy_env.name)

        for label, root in (("POS", pos_root), ("admin", admin_root)):
            index = Path(root) / "index.html"
            report.check(index.is_file(), f"{label} web build present ({index})",
                         f"{label} web build missing: {index}")

        if data_caddy:
            onboarding_dir = Path(data_caddy) / "onboarding"
            report.check((onboarding_dir / "kinesis-root.crt").is_file(),
                         "onboarding files present",
                         f"onboarding files missing in {onboarding_dir} (kinesis_pki.py export-ca)")

    print(f"\n{report.failures} failure(s), {report.warnings} warning(s).")
    return 1 if report.failures else 0


if __name__ == "__main__":
    sys.exit(main())
