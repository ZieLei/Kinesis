"""
Scheduled backup entry point (run by the kinesis-backup systemd timer, or by
hand):

    python backup_cli.py backup [--copy-to DIR]
    python backup_cli.py verify FILE

``backup`` writes a PostgreSQL custom-format dump plus a tarball of the
uploaded images, checks that the dump can be read back (``pg_restore
--list`` and the presence of the core tables), optionally copies both files
to a second location (a USB drive or another computer's share), applies the
retention rules, and records the outcome in ``last-backup.json`` in the
backup folder. It exits non-zero on any failure so the service shows as
failed.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tarfile
import time
from datetime import datetime, timezone
from pathlib import Path

REQUIRED_TABLES = ("products", "sales", "sale_items", "alembic_version")
FILES_PATTERN = "kinesis_files_*.tar.gz"
STATUS_FILE = "last-backup.json"


def verify_archive(path: Path) -> list[str]:
    """Raise RuntimeError unless the dump is readable and has the core tables."""

    from database_routes import require_backup_tools, run_postgres_command

    tools = require_backup_tools()
    result = run_postgres_command(
        [tools["pg_restore"], "--list", str(path)], timeout_seconds=120
    )

    if result.returncode != 0:
        raise RuntimeError(
            f"{path.name} cannot be read by pg_restore: "
            f"{(result.stderr or '').strip()[-300:]}"
        )

    listing = result.stdout or ""
    missing = [
        table
        for table in REQUIRED_TABLES
        if f" TABLE public {table} " not in listing
    ]

    if missing:
        raise RuntimeError(f"{path.name} is missing tables: {', '.join(missing)}")

    return [line for line in listing.splitlines() if line and not line.startswith(";")]


def archive_uploads(directory: Path) -> Path | None:
    from config_paths import path_settings, resolve_data_path

    sources = {
        "products": resolve_data_path(path_settings.image_directory, "uploads/products"),
        "gcash": resolve_data_path(path_settings.gcash_qr_directory, "uploads/gcash"),
    }
    existing = {name: path for name, path in sources.items() if Path(path).is_dir()}

    if not existing:
        return None

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    target = directory / f"kinesis_files_{stamp}.tar.gz"
    fd = os.open(target, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)

    with os.fdopen(fd, "wb") as handle, tarfile.open(fileobj=handle, mode="w:gz") as tar:
        for name, path in existing.items():
            tar.add(path, arcname=name, recursive=True)

    return target


def prune_file_archives(directory: Path, keep: int, retention_days: int) -> None:
    files = sorted(directory.glob(FILES_PATTERN), key=lambda p: p.stat().st_mtime, reverse=True)
    cutoff = time.time() - retention_days * 86400

    for path in files[keep:]:
        if path.stat().st_mtime < cutoff:
            path.unlink(missing_ok=True)


def copy_off_host(files: list[Path], destination: Path) -> list[str]:
    destination.mkdir(parents=True, exist_ok=True)
    copied = []

    for source in files:
        target = destination / source.name
        shutil.copy2(source, target)

        if target.stat().st_size != source.stat().st_size:
            raise RuntimeError(f"Copy of {source.name} to {destination} is incomplete.")

        os.chmod(target, 0o600)
        copied.append(str(target))

    return copied


def write_status(directory: Path, payload: dict) -> None:
    tmp = directory / (STATUS_FILE + ".tmp")
    tmp.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    os.chmod(tmp, 0o600)
    tmp.replace(directory / STATUS_FILE)


def run_backup(copy_to: Path | None = None) -> dict:
    from database_routes import (
        admin_settings,
        create_backup_file,
        ensure_backup_directory,
    )

    directory = ensure_backup_directory()
    started = datetime.now(timezone.utc)

    try:
        dump = create_backup_file("custom")
        entries = verify_archive(dump)
        files_archive = archive_uploads(directory)
        prune_file_archives(
            directory,
            admin_settings.backup_keep_minimum,
            admin_settings.backup_retention_days,
        )

        produced = [dump] + ([files_archive] if files_archive else [])
        copies = copy_off_host(produced, copy_to) if copy_to else []

        status = {
            "ok": True,
            "started_at": started.isoformat(),
            "finished_at": datetime.now(timezone.utc).isoformat(),
            "dump": dump.name,
            "dump_bytes": dump.stat().st_size,
            "dump_entries": len(entries),
            "files_archive": files_archive.name if files_archive else None,
            "copied_to": copies,
        }

    except Exception as exc:  # noqa: BLE001 - recorded, then re-raised below
        write_status(
            directory,
            {
                "ok": False,
                "started_at": started.isoformat(),
                "finished_at": datetime.now(timezone.utc).isoformat(),
                "error": str(exc)[:500],
            },
        )
        raise

    write_status(directory, status)
    return status


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = parser.add_subparsers(dest="command", required=True)

    backup = sub.add_parser("backup", help="create, verify and copy a backup")
    backup.add_argument("--copy-to", type=Path, help="second location for the files")

    verify = sub.add_parser("verify", help="check that a dump can be restored")
    verify.add_argument("file", type=Path)

    args = parser.parse_args(argv)

    try:
        if args.command == "backup":
            print(json.dumps(run_backup(args.copy_to)))
        else:
            entries = verify_archive(args.file)
            print(json.dumps({"ok": True, "entries": len(entries)}))
    except Exception as exc:  # noqa: BLE001
        print(f"backup failed: {exc}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
