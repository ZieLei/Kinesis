#!/usr/bin/env python3
"""
kinesis-migrate: move a Kinesis database and uploads to another host, and
prove that nothing was lost on the way.

Run it with the backend's virtual environment (it needs SQLAlchemy, psycopg
and python-dotenv from backend/requirements.lock) and point it at a backend
environment file for the database settings (DATABASE_*, KINESIS_PG_BIN_DIR).

Commands
--------
  baseline         read-only snapshot of counts, totals and sequences (JSON)
  compare          compare two snapshots; exit 1 on any difference
  dump             pg_dump -Fc, validate with pg_restore --list, write SHA-256
  restore          restore a dump into an EMPTY database (refuses otherwise)
  manifest         SHA-256 manifest of a directory (uploads)
  verify-manifest  check a directory against a manifest; exit 1 on mismatch

Safety
------
* baseline and dump never write to the database (read-only transaction /
  pg_dump).
* restore refuses unless the target database has no tables, the checksum
  matches, and --confirm-database names the target database.
* Any database whose name does not end in "_test" also requires
  --allow-production, so a mistyped env file cannot touch a real shop
  database by accident.
* No secret is printed. The database password is passed to PostgreSQL
  tools through a temporary password file (mode 0600) that is deleted.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from decimal import Decimal
from pathlib import Path


TEST_SUFFIX = "_test"
ARCHIVE_SIGNATURE = b"PGDMP"


class MigrateError(Exception):
    pass


# --------------------------------------------------
# Settings
# --------------------------------------------------


class Settings:
    def __init__(self, env_file: Path):
        try:
            from dotenv import dotenv_values
        except ImportError as exc:  # pragma: no cover - environment problem
            raise MigrateError(
                "python-dotenv is missing; run this with the backend's venv."
            ) from exc

        if not env_file.is_file():
            raise MigrateError(f"Environment file not found: {env_file}")

        values = {**dotenv_values(env_file)}

        # Same precedence as the backend (pydantic-settings): real
        # environment variables override the file.
        for key in list(values) + [
            "DATABASE_USER",
            "DATABASE_PASSWORD",
            "DATABASE_HOST",
            "DATABASE_PORT",
            "DATABASE_NAME",
            "KINESIS_PG_BIN_DIR",
        ]:
            if key in os.environ:
                values[key] = os.environ[key]

        def required(name: str) -> str:
            value = (values.get(name) or "").strip()

            if not value:
                raise MigrateError(f"{name} is not set in {env_file}")

            return value

        self.user = required("DATABASE_USER")
        self.password = required("DATABASE_PASSWORD")
        self.host = (values.get("DATABASE_HOST") or "127.0.0.1").strip()
        self.port = int((values.get("DATABASE_PORT") or "5432").strip())
        self.name = (values.get("DATABASE_NAME") or "kinesis").strip()
        self.pg_bin_dir = (values.get("KINESIS_PG_BIN_DIR") or "").strip()

    def engine(self):
        from sqlalchemy import URL, create_engine

        return create_engine(
            URL.create(
                "postgresql+psycopg",
                username=self.user,
                password=self.password,
                host=self.host,
                port=self.port,
                database=self.name,
            ),
            pool_pre_ping=True,
        )

    def tool(self, name: str) -> str:
        if self.pg_bin_dir:
            found = shutil.which(name, path=str(Path(self.pg_bin_dir).expanduser()))

            if found:
                return found

        found = shutil.which(name)

        if not found:
            raise MigrateError(
                f"{name} was not found. Install the PostgreSQL client tools or "
                "set KINESIS_PG_BIN_DIR."
            )

        return found


def guard(settings: Settings, allow_production: bool) -> None:
    if settings.name.endswith(TEST_SUFFIX):
        return

    if not allow_production:
        raise MigrateError(
            f"Database {settings.name!r} is not a test database. "
            "Pass --allow-production if this is intended."
        )


# --------------------------------------------------
# PostgreSQL client tools
# --------------------------------------------------


def pgpass_escape(value: str) -> str:
    if "\n" in value or "\r" in value:
        raise MigrateError("A database setting contains a newline.")

    return value.replace("\\", "\\\\").replace(":", "\\:")


def run_pg_tool(settings: Settings, command: list[str]) -> subprocess.CompletedProcess:
    fd, password_file = tempfile.mkstemp(prefix=".kinesis-pgpass-")

    try:
        if os.name != "nt":
            os.chmod(password_file, 0o600)

        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(
                ":".join(
                    (
                        pgpass_escape(settings.host),
                        str(settings.port),
                        pgpass_escape(settings.name),
                        pgpass_escape(settings.user),
                        pgpass_escape(settings.password),
                    )
                )
                + "\n"
            )

        environment = os.environ.copy()
        environment["PGPASSFILE"] = password_file
        environment["PGCONNECT_TIMEOUT"] = "10"
        environment.pop("PGPASSWORD", None)

        return subprocess.run(
            command,
            env=environment,
            stdin=subprocess.DEVNULL,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )

    finally:
        Path(password_file).unlink(missing_ok=True)


def connection_arguments(settings: Settings) -> list[str]:
    return [
        "--host", settings.host,
        "--port", str(settings.port),
        "--username", settings.user,
        "--dbname", settings.name,
        "--no-password",
    ]


def tool_major_version(path: str) -> int:
    output = subprocess.run(
        [path, "--version"], capture_output=True, text=True, check=False
    ).stdout
    match = re.search(r"(\d+)(?:\.\d+)?", output)

    if not match:
        raise MigrateError(f"Could not read the version of {path}.")

    return int(match.group(1))


def server_major_version(settings: Settings) -> int:
    from sqlalchemy import text

    engine = settings.engine()

    try:
        with engine.connect() as connection:
            return int(connection.execute(text("SHOW server_version_num")).scalar()) // 10000
    finally:
        engine.dispose()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()

    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)

    return digest.hexdigest()


# --------------------------------------------------
# baseline / compare
# --------------------------------------------------


def collect_baseline(settings: Settings) -> dict:
    from sqlalchemy import text

    engine = settings.engine()

    def scalar(connection, sql: str, **params):
        return connection.execute(text(sql), params).scalar()

    snapshot: dict = {}

    try:
        with engine.connect() as connection:
            with connection.begin():
                connection.exec_driver_sql("SET TRANSACTION READ ONLY")
                connection.exec_driver_sql("SET LOCAL statement_timeout = '60s'")

                snapshot["server_major_version"] = int(
                    scalar(connection, "SHOW server_version_num")
                ) // 10000

                tables = [
                    row[0]
                    for row in connection.execute(
                        text(
                            "SELECT tablename FROM pg_tables "
                            "WHERE schemaname = 'public' ORDER BY tablename"
                        )
                    )
                ]

                snapshot["alembic_version"] = (
                    scalar(connection, "SELECT string_agg(version_num, ',') FROM alembic_version")
                    if "alembic_version" in tables
                    else None
                )

                id_tables = {
                    row[0]
                    for row in connection.execute(
                        text(
                            "SELECT table_name FROM information_schema.columns "
                            "WHERE table_schema = 'public' AND column_name = 'id' "
                            "AND data_type IN ('integer', 'bigint', 'smallint')"
                        )
                    )
                }

                counts = {}

                for table in tables:
                    quoted = '"' + table.replace('"', '""') + '"'
                    entry = {"rows": scalar(connection, f"SELECT count(*) FROM {quoted}")}

                    if table in id_tables:
                        entry["max_id"] = scalar(connection, f"SELECT max(id) FROM {quoted}")

                    counts[table] = entry

                snapshot["tables"] = counts

                snapshot["sequences"] = {
                    row[0]: row[1]
                    for row in connection.execute(
                        text(
                            "SELECT sequencename, last_value FROM pg_sequences "
                            "WHERE schemaname = 'public' ORDER BY sequencename"
                        )
                    )
                }

                checks = {
                    "sales": (
                        "SELECT count(*), sum(total), sum(subtotal), sum(tax_amount), "
                        "sum(discount_amount), sum(amount_tendered) FROM sales"
                    ),
                    "sales_by_payment": (
                        "SELECT payment_method, count(*), sum(total) FROM sales "
                        "GROUP BY payment_method ORDER BY payment_method"
                    ),
                    "sale_items": "SELECT count(*), sum(quantity), sum(line_total) FROM sale_items",
                    "sale_service_items": (
                        "SELECT count(*), sum(quantity), sum(line_total) FROM sale_service_items"
                    ),
                    "products": (
                        "SELECT count(*), count(*) FILTER (WHERE archived_at IS NULL), "
                        "sum(stock), sum(how_much_sold), sum(price), "
                        "sum(average_cost), count(image_path) FROM products"
                    ),
                    "inventory_receipts": "SELECT count(*), sum(total_cost) FROM inventory_receipts",
                    "stock_adjustments": "SELECT count(*), sum(quantity_change) FROM stock_adjustments",
                    "terminals": (
                        "SELECT count(*), count(*) FILTER (WHERE is_enabled), "
                        "count(*) FILTER (WHERE maintenance_mode), "
                        "count(session_token_hash) FROM terminals"
                    ),
                    "cashiers": "SELECT count(*), count(*) FILTER (WHERE is_active) FROM cashiers",
                    "admin_users": "SELECT count(*) FROM admin_users",
                    "app_settings": "SELECT version, settings->>'gcashQrImagePath' FROM app_settings",
                }

                aggregates = {}

                for name, sql in checks.items():
                    table = re.search(r"FROM (\w+)", sql).group(1)

                    if table not in tables:
                        continue

                    # Decimal sums become strings so JSON keeps every digit.
                    aggregates[name] = [
                        [str(value) if isinstance(value, Decimal) else value for value in row]
                        for row in connection.execute(text(sql))
                    ]

                snapshot["aggregates"] = aggregates

                snapshot["product_image_paths"] = (
                    sorted(
                        row[0]
                        for row in connection.execute(
                            text("SELECT image_path FROM products WHERE image_path IS NOT NULL")
                        )
                    )
                    if "products" in tables
                    else []
                )

                snapshot["terminals_in_maintenance"] = (
                    [
                        row[0]
                        for row in connection.execute(
                            text("SELECT id FROM terminals WHERE maintenance_mode ORDER BY id")
                        )
                    ]
                    if "terminals" in tables
                    else []
                )

                snapshot["last_sale_at"] = (
                    str(scalar(connection, "SELECT max(created_at) FROM sales"))
                    if "sales" in tables
                    else None
                )

    finally:
        engine.dispose()

    return snapshot


def command_baseline(args) -> None:
    settings = Settings(Path(args.env_file))
    guard(settings, args.allow_production)

    snapshot = {
        "kinesis_baseline": 1,
        "database": settings.name,
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        **collect_baseline(settings),
    }

    output = json.dumps(snapshot, indent=2, sort_keys=True, default=str)

    if args.out:
        Path(args.out).write_text(output + "\n", encoding="utf-8")
        print(f"Baseline written to {args.out}")
    else:
        print(output)

    tables = snapshot.get("tables", {})
    print(
        f"{len(tables)} tables, "
        f"{tables.get('sales', {}).get('rows', 0)} sales, "
        f"last sale {snapshot.get('last_sale_at')}, "
        f"migration {snapshot.get('alembic_version')}",
        file=sys.stderr,
    )


IGNORED_KEYS = {"generated_at", "database"}


def diff(prefix: str, left, right, out: list[str]) -> None:
    if isinstance(left, dict) and isinstance(right, dict):
        for key in sorted(set(left) | set(right)):
            if not prefix and key in IGNORED_KEYS:
                continue

            diff(f"{prefix}.{key}" if prefix else key, left.get(key), right.get(key), out)
    elif left != right:
        out.append(f"{prefix}: {left!r} != {right!r}")


def command_compare(args) -> None:
    left = json.loads(Path(args.source).read_text(encoding="utf-8"))
    right = json.loads(Path(args.target).read_text(encoding="utf-8"))
    differences: list[str] = []
    diff("", left, right, differences)

    if differences:
        print("Differences:")

        for line in differences:
            print(f"  {line}")

        raise MigrateError(f"{len(differences)} difference(s) between the snapshots.")

    print("Snapshots match: every table count, maximum ID, sequence and total is identical.")


# --------------------------------------------------
# dump / restore
# --------------------------------------------------


def command_dump(args) -> None:
    settings = Settings(Path(args.env_file))
    guard(settings, args.allow_production)

    pg_dump = settings.tool("pg_dump")
    pg_restore = settings.tool("pg_restore")
    server = server_major_version(settings)
    client = tool_major_version(pg_dump)

    if client < server:
        raise MigrateError(
            f"pg_dump {client} is older than the server ({server}). "
            "Use the client tools of the same major version."
        )

    out_dir = Path(args.out_dir).expanduser().resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    dump_path = out_dir / f"{settings.name}_{stamp}.dump"

    fd = os.open(dump_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    os.close(fd)

    result = run_pg_tool(
        settings,
        [pg_dump, *connection_arguments(settings), "--format", "custom",
         "--no-owner", "--no-privileges", "--file", str(dump_path)],
    )

    if result.returncode != 0:
        dump_path.unlink(missing_ok=True)
        raise MigrateError(f"pg_dump failed: {result.stderr.strip()[-1500:]}")

    listing = subprocess.run(
        [pg_restore, "--list", str(dump_path)],
        capture_output=True, text=True, check=False,
    )

    if listing.returncode != 0:
        raise MigrateError(f"pg_restore --list rejected the dump: {listing.stderr.strip()[-800:]}")

    digest = sha256_file(dump_path)
    Path(f"{dump_path}.sha256").write_text(f"{digest}  {dump_path.name}\n", encoding="utf-8")

    entries = sum(1 for line in listing.stdout.splitlines() if line and not line.startswith(";"))
    print(f"Dump:      {dump_path}")
    print(f"Size:      {dump_path.stat().st_size} bytes, {entries} archive entries")
    print(f"SHA-256:   {digest}")
    print(f"pg_dump:   {client} (server {server})")


def read_expected_digest(dump_path: Path, given: str | None) -> str:
    if given:
        return given.strip().lower()

    checksum_file = Path(f"{dump_path}.sha256")

    if not checksum_file.is_file():
        raise MigrateError(f"No checksum given and {checksum_file.name} not found.")

    return checksum_file.read_text(encoding="utf-8").split()[0].lower()


def command_restore(args) -> None:
    from sqlalchemy import text

    settings = Settings(Path(args.env_file))
    guard(settings, args.allow_production)

    if args.confirm_database != settings.name:
        raise MigrateError(
            f"--confirm-database must be {settings.name!r} (the target database)."
        )

    dump_path = Path(args.dump).expanduser().resolve()

    with dump_path.open("rb") as handle:
        if handle.read(len(ARCHIVE_SIGNATURE)) != ARCHIVE_SIGNATURE:
            raise MigrateError("The file is not a PostgreSQL custom-format archive.")

    expected = read_expected_digest(dump_path, args.sha256)
    actual = sha256_file(dump_path)

    if actual != expected:
        raise MigrateError(f"Checksum mismatch: expected {expected}, got {actual}.")

    print(f"Checksum OK ({actual}).")

    engine = settings.engine()

    try:
        with engine.connect() as connection:
            existing = connection.execute(
                text("SELECT count(*) FROM pg_tables WHERE schemaname = 'public'")
            ).scalar()
    finally:
        engine.dispose()

    if existing:
        raise MigrateError(
            f"Database {settings.name!r} already has {existing} table(s). "
            "Restore only into a newly created, empty database."
        )

    pg_restore = settings.tool("pg_restore")
    server = server_major_version(settings)

    if tool_major_version(pg_restore) < server:
        raise MigrateError("pg_restore is older than the server; use matching client tools.")

    result = run_pg_tool(
        settings,
        [pg_restore, *connection_arguments(settings), "--no-owner", "--no-privileges",
         "--exit-on-error", "--single-transaction", str(dump_path)],
    )

    if result.returncode != 0:
        raise MigrateError(
            "pg_restore failed; the single transaction was rolled back and the "
            f"database is still empty: {result.stderr.strip()[-1500:]}"
        )

    print(f"Restored {dump_path.name} into {settings.name}.")


# --------------------------------------------------
# manifest / verify-manifest
# --------------------------------------------------


def build_manifest(directory: Path) -> dict[str, dict]:
    files = {}

    for path in sorted(directory.rglob("*")):
        if path.is_file() and not path.is_symlink():
            relative = path.relative_to(directory).as_posix()

            if relative.endswith(".gitkeep"):
                continue

            files[relative] = {"sha256": sha256_file(path), "size": path.stat().st_size}

    return files


def command_manifest(args) -> None:
    directory = Path(args.directory).expanduser().resolve()

    if not directory.is_dir():
        raise MigrateError(f"Not a directory: {directory}")

    files = build_manifest(directory)
    Path(args.out).write_text(
        json.dumps({"kinesis_manifest": 1, "files": files}, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(f"{len(files)} file(s) recorded in {args.out}")


def command_verify_manifest(args) -> None:
    directory = Path(args.directory).expanduser().resolve()
    expected = json.loads(Path(args.manifest).read_text(encoding="utf-8"))["files"]
    actual = build_manifest(directory)
    problems = []

    for name, entry in expected.items():
        found = actual.get(name)

        if found is None:
            problems.append(f"missing: {name}")
        elif found["sha256"] != entry["sha256"]:
            problems.append(f"changed: {name}")

    extra = sorted(set(actual) - set(expected))

    for name in extra:
        print(f"note: extra file not in manifest: {name}")

    if problems:
        for line in problems:
            print(f"  {line}")

        raise MigrateError(f"{len(problems)} file(s) missing or changed.")

    print(f"All {len(expected)} file(s) present and identical.")


# --------------------------------------------------
# CLI
# --------------------------------------------------


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="kinesis-migrate", description=__doc__.split("\n\n")[0])
    commands = parser.add_subparsers(dest="command", required=True)

    def database_command(name: str, help_text: str):
        sub = commands.add_parser(name, help=help_text)
        sub.add_argument("--env-file", required=True, help="Backend environment file (DATABASE_*).")
        sub.add_argument("--allow-production", action="store_true",
                         help="Required for databases whose name does not end in _test.")
        return sub

    baseline = database_command("baseline", "Read-only snapshot of counts, totals and sequences.")
    baseline.add_argument("--out", help="Write the JSON snapshot here (default: stdout).")
    baseline.set_defaults(handler=command_baseline)

    compare = commands.add_parser("compare", help="Compare two baseline snapshots.")
    compare.add_argument("source")
    compare.add_argument("target")
    compare.set_defaults(handler=command_compare)

    dump = database_command("dump", "pg_dump -Fc with validation and SHA-256.")
    dump.add_argument("--out-dir", required=True)
    dump.set_defaults(handler=command_dump)

    restore = database_command("restore", "Restore a dump into an empty database.")
    restore.add_argument("--dump", required=True)
    restore.add_argument("--sha256", help="Expected checksum (default: read <dump>.sha256).")
    restore.add_argument("--confirm-database", required=True, help="Must equal the target database name.")
    restore.set_defaults(handler=command_restore)

    manifest = commands.add_parser("manifest", help="SHA-256 manifest of a directory.")
    manifest.add_argument("directory")
    manifest.add_argument("--out", required=True)
    manifest.set_defaults(handler=command_manifest)

    verify = commands.add_parser("verify-manifest", help="Check a directory against a manifest.")
    verify.add_argument("directory")
    verify.add_argument("manifest")
    verify.set_defaults(handler=command_verify_manifest)

    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    try:
        args.handler(args)
    except MigrateError as exc:
        print(f"kinesis-migrate: {exc}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
