"""
Restore a pg_dump backup into the disposable test database and verify it.

    venv/bin/python -m tests.db_restore \\
        --env-file .env.test --backup /path/to/backup.dump --sha256 <hex>

Safety:
- The backup is only read (pg_restore and sha256); it is never modified.
- A checksum must be given and must match before anything is touched.
- The target database is checked with tests/safety.py both from settings
  and from the live connection before its public schema is dropped.
- Credentials reach pg_restore through PGPASSWORD, never the command line.

Verification compares every table's rows in the restored database with
the rows inside the backup itself (sorted COPY text, column for column),
so it proves content equality, not just row counts.
"""

import argparse
import hashlib
import os
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path


BACKEND_DIRECTORY = Path(__file__).resolve().parents[1]

if str(BACKEND_DIRECTORY) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIRECTORY))

from tests.safety import check_connected_database, check_test_env_file  # noqa: E402


COPY_HEADER = re.compile(r'^COPY public\.("?[\w]+"?) \((.*)\) FROM stdin;$')


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()

    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)

    return digest.hexdigest()


def require_backup(path: Path, expected_sha256: str) -> Path:
    path = path.expanduser().resolve()

    if path.is_symlink() or not path.is_file():
        raise SystemExit(f"Backup {path} is missing or not a regular file.")

    actual = sha256_of(path)

    if actual != expected_sha256.strip().lower():
        raise SystemExit(
            f"Backup checksum mismatch for {path}: expected "
            f"{expected_sha256}, got {actual}. Refusing to restore."
        )

    return path


def pg_tool(name: str) -> str:
    from config_paths import postgres_tool

    found = postgres_tool(name)

    if not found:
        raise SystemExit(f"{name} was not found on PATH or KINESIS_PG_BIN_DIR.")

    return found


@dataclass
class DumpTable:
    columns: str
    rows: list[str] = field(default_factory=list)


def tables_in_backup(backup: Path) -> dict[str, DumpTable]:
    """Parse table data out of the backup without touching any database."""

    result = subprocess.run(
        [pg_tool("pg_restore"), "--data-only", "--file", "-", str(backup)],
        capture_output=True,
        text=True,
        check=True,
    )

    tables: dict[str, DumpTable] = {}
    current: DumpTable | None = None

    for line in result.stdout.splitlines():
        if current is None:
            match = COPY_HEADER.match(line)

            if match:
                current = DumpTable(columns=match.group(2))
                tables[match.group(1).strip('"')] = current

        elif line == "\\.":
            current = None
        else:
            current.rows.append(line)

    return tables


def postgres_environment(settings) -> dict[str, str]:
    return {
        **os.environ,
        "PGPASSWORD": settings.database_password,
        "PGCONNECT_TIMEOUT": "10",
    }


def restore(backup: Path, env_file: Path) -> None:
    from sqlalchemy import text

    from database import engine, settings

    database_name = check_connected_database(engine, env_file)

    with engine.begin() as connection:
        # Owned by pg_database_owner (the test database's owner), so the
        # application role can reset it without extra privileges.
        connection.execute(text("DROP SCHEMA public CASCADE"))
        connection.execute(text("CREATE SCHEMA public"))

    engine.dispose()

    result = subprocess.run(
        [
            pg_tool("pg_restore"),
            "--host", settings.database_host,
            "--port", str(settings.database_port),
            "--username", settings.database_user,
            "--dbname", database_name,
            "--no-password",
            "--no-owner",
            "--no-privileges",
            "--exit-on-error",
            "--single-transaction",
            str(backup),
        ],
        env=postgres_environment(settings),
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        raise SystemExit(f"pg_restore failed:\n{result.stderr.strip()}")


def verify(backup: Path, env_file: Path) -> list[str]:
    """Return a list of problems; empty means the restore matches exactly."""

    from database import engine

    check_connected_database(engine, env_file)

    expected = tables_in_backup(backup)
    problems: list[str] = []

    raw = engine.raw_connection()

    try:
        cursor = raw.cursor()
        cursor.execute(
            "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
        )
        actual_tables = {row[0] for row in cursor.fetchall()}

        for name in sorted(actual_tables - set(expected)):
            problems.append(f"table {name} exists in the database but not the backup")

        for name, table in sorted(expected.items()):
            if name not in actual_tables:
                problems.append(f"table {name} from the backup is missing")
                continue

            lines: list[str] = []

            with cursor.copy(
                f'COPY public."{name}" ({table.columns}) TO STDOUT'
            ) as copy:
                buffer = b"".join(bytes(chunk) for chunk in copy)

            lines = buffer.decode("utf-8").splitlines()

            if sorted(lines) != sorted(table.rows):
                problems.append(
                    f"table {name}: content differs "
                    f"(backup {len(table.rows)} rows, database {len(lines)} rows)"
                )
            else:
                print(f"  {name:30} {len(lines):>5} rows  identical")
    finally:
        raw.close()

    return problems


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--env-file", required=True, type=Path)
    parser.add_argument("--backup", required=True, type=Path)
    parser.add_argument("--sha256", required=True)
    parser.add_argument(
        "--verify-only",
        action="store_true",
        help="Compare the database with the backup without restoring.",
    )
    args = parser.parse_args()

    env_file = check_test_env_file(args.env_file)
    os.environ["KINESIS_ENV_FILE"] = str(env_file)

    backup = require_backup(args.backup, args.sha256)
    print(f"backup verified: {backup} (sha256 ok)")

    if not args.verify_only:
        restore(backup, env_file)
        print("restore: pg_restore completed in a single transaction")

    problems = verify(backup, env_file)

    if sha256_of(backup) != args.sha256.strip().lower():
        problems.append("backup file changed during the run")

    for problem in problems:
        print("PROBLEM:", problem)

    print("RESULT:", "restored database matches backup" if not problems else "MISMATCH")

    return 0 if not problems else 1


if __name__ == "__main__":
    raise SystemExit(main())
