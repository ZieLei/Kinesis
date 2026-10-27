import asyncio
import json
import logging
import os
import re
import secrets
import shutil
import stat
import subprocess
import tempfile
import threading
import time
from datetime import date, datetime, time as datetime_time, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any, Literal
from uuid import uuid4

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import inspect, text
from sqlalchemy.exc import SQLAlchemyError

from database import engine, settings as database_settings
from terminal_routes import require_admin_token


logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/admin/database",
    tags=["Database Management"],
)

MAX_SQL_LENGTH = 10_000
DEFAULT_QUERY_MAX_ROWS = 200
DEFAULT_QUERY_TIMEOUT_MS = 5_000
MAX_RESTORE_UPLOAD_BYTES = 1_073_741_824

BACKUP_FILENAME_PATTERN = re.compile(
    r"^kinesis_(backup|pre_restore)_"
    r"\d{8}T\d{6}Z_[a-f0-9]{12}\.(dump|sql)$"
)

UNSAFE_FUNCTION_PATTERN = re.compile(
    r"\b(?:"
    r"pg_sleep(?:_for|_until)?|"
    r"pg_read_file|pg_read_binary_file|pg_ls_dir|pg_stat_file|"
    r"pg_terminate_backend|pg_cancel_backend|pg_reload_conf|"
    r"pg_rotate_logfile|pg_promote|pg_create_restore_point|"
    r"pg_switch_wal|pg_log_backend_memory_contexts|"
    r"pg_advisory_lock(?:_shared)?|"
    r"pg_try_advisory_lock(?:_shared)?|"
    r"pg_notify|pg_stat_reset(?:_shared)?|"
    r"nextval|setval|set_config|"
    r"lo_import|lo_export|"
    r"dblink(?:_exec)?"
    r")\s*\(",
    re.IGNORECASE,
)

QUERY_DESCRIPTIONS = {
    "products": "Product inventory, pricing, and stock",
    "services": "Additional services and service pricing",
    "sales": "Checkout transactions and payment records",
    "sale_items": "Product snapshots associated with sales",
    "terminals": "Registered POS devices and their configuration",
    "terminal_commands": "Queued terminal commands and acknowledgements",
    "alembic_version": "Database migration version tracking",
}


class DatabaseAdminSettings(BaseSettings):
    backup_directory: str | None = None
    backup_timeout_seconds: int = Field(default=300, ge=10, le=3600)
    restore_timeout_seconds: int = Field(default=900, ge=10, le=7200)
    backup_retention_days: int = Field(default=30, ge=1, le=3650)
    max_restore_upload_bytes: int = Field(
        default=MAX_RESTORE_UPLOAD_BYTES,
        ge=1_048_576,
        le=10_737_418_240,
    )
    query_timeout_ms: int = Field(
        default=DEFAULT_QUERY_TIMEOUT_MS,
        ge=100,
        le=30_000,
    )
    query_max_rows: int = Field(
        default=DEFAULT_QUERY_MAX_ROWS,
        ge=1,
        le=1000,
    )

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_prefix="KINESIS_DATABASE_",
        extra="ignore",
    )


admin_settings = DatabaseAdminSettings()

# Prevent overlapping backup and restore operations within this API process.
backup_operation_lock = threading.Lock()


# --------------------------------------------------
# Helpers: configuration and paths
# --------------------------------------------------


def backup_directory() -> Path:
    configured = admin_settings.backup_directory

    if configured and configured.strip():
        path = Path(configured).expanduser()

        if not path.is_absolute():
            path = Path(__file__).resolve().parent / path
    else:
        # Keep private backups outside the Git repository by default.
        path = Path.home() / ".local" / "share" / "kinesis" / "backups"

    return path.resolve()


def ensure_backup_directory() -> Path:
    directory = backup_directory()
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)

    if not directory.is_dir():
        raise RuntimeError("The configured backup location is not a directory.")

    # Backups contain customer and transaction data.
    directory.chmod(0o700)

    return directory


def available_tools() -> dict[str, str | None]:
    return {
        "pg_dump": shutil.which("pg_dump"),
        "pg_restore": shutil.which("pg_restore"),
    }


def require_backup_tools() -> dict[str, str]:
    tools = available_tools()

    missing = [name for name, path in tools.items() if path is None]

    if missing:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Database backup utilities are unavailable: "
                + ", ".join(missing)
                + ". Install compatible PostgreSQL client utilities."
            ),
        )

    return {name: path for name, path in tools.items() if path is not None}


def pgpass_escape(value: str) -> str:
    if "\n" in value or "\r" in value:
        raise RuntimeError(
            "The database credential contains a newline and cannot be "
            "used with the PostgreSQL password file."
        )

    return value.replace("\\", "\\\\").replace(":", "\\:")


def create_pgpass_file(directory: Path) -> Path:
    database_user = database_settings.database_user
    database_password = database_settings.database_password
    database_host = database_settings.database_host
    database_port = database_settings.database_port
    database_name = database_settings.database_name

    line = ":".join(
        (
            pgpass_escape(database_host),
            str(database_port),
            pgpass_escape(database_name),
            pgpass_escape(database_user),
            pgpass_escape(database_password),
        )
    )

    fd, filename = tempfile.mkstemp(
        prefix=".kinesis-pgpass-",
        dir=directory,
        text=True,
    )

    path = Path(filename)

    try:
        os.fchmod(fd, stat.S_IRUSR | stat.S_IWUSR)

        with os.fdopen(fd, "w", encoding="utf-8") as file:
            file.write(line + "\n")

    except Exception:
        path.unlink(missing_ok=True)
        raise

    return path


def run_postgres_command(
    command: list[str],
    *,
    timeout_seconds: int,
    stdout: Any = subprocess.PIPE,
) -> subprocess.CompletedProcess:
    directory = ensure_backup_directory()
    password_file = create_pgpass_file(directory)

    environment = os.environ.copy()
    environment["PGPASSFILE"] = str(password_file)
    environment["PGCONNECT_TIMEOUT"] = "5"

    try:
        return subprocess.run(
            command,
            env=environment,
            stdin=subprocess.DEVNULL,
            stdout=stdout,
            stderr=subprocess.PIPE,
            text=True,
            timeout=timeout_seconds,
            check=False,
        )

    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(
            "The PostgreSQL utility exceeded its configured time limit."
        ) from exc

    finally:
        password_file.unlink(missing_ok=True)


def log_utility_failure(
    utility: str,
    result: subprocess.CompletedProcess,
) -> None:
    detail = (result.stderr or "").strip()

    # Keep server logs bounded; never return the raw utility output to clients.
    if len(detail) > 2000:
        detail = detail[-2000:]

    logger.error(
        "%s failed with exit code %s. Utility output: %s",
        utility,
        result.returncode,
        detail or "(no error output)",
    )


# --------------------------------------------------
# Helpers: backup discovery and retention
# --------------------------------------------------


def cleanup_expired_backups() -> None:
    directory = ensure_backup_directory()
    cutoff = time.time() - admin_settings.backup_retention_days * 86400

    for path in directory.iterdir():
        if path.is_symlink() or not path.is_file():
            continue

        if not BACKUP_FILENAME_PATTERN.fullmatch(path.name):
            continue

        try:
            if path.stat().st_mtime < cutoff:
                path.unlink(missing_ok=True)

        except OSError:
            logger.warning(
                "Could not remove an expired database backup.",
                exc_info=True,
            )


def backup_metadata(path: Path) -> dict[str, Any]:
    match = BACKUP_FILENAME_PATTERN.fullmatch(path.name)

    if match is None:
        raise ValueError("The requested file is not a managed backup.")

    file_stat = path.stat()

    return {
        "file_name": path.name,
        "purpose": match.group(1),
        "format": "custom" if match.group(2) == "dump" else "sql",
        "size_bytes": file_stat.st_size,
        "created_at": datetime.fromtimestamp(
            file_stat.st_mtime,
            tz=timezone.utc,
        ).isoformat(),
    }


def list_managed_backups() -> list[dict[str, Any]]:
    directory = ensure_backup_directory()
    cleanup_expired_backups()

    backups: list[dict[str, Any]] = []

    for path in directory.iterdir():
        if path.is_symlink() or not path.is_file():
            continue

        if not BACKUP_FILENAME_PATTERN.fullmatch(path.name):
            continue

        try:
            backups.append(backup_metadata(path))
        except (OSError, ValueError):
            continue

    backups.sort(
        key=lambda backup: backup["created_at"],
        reverse=True,
    )

    return backups


def backup_output_path(
    backup_format: Literal["custom", "sql"],
    purpose: Literal["backup", "pre_restore"],
) -> Path:
    directory = ensure_backup_directory()
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    random_id = uuid4().hex[:12]
    extension = "dump" if backup_format == "custom" else "sql"

    return directory / (f"kinesis_{purpose}_{timestamp}_{random_id}.{extension}")


def create_backup_file(
    backup_format: Literal["custom", "sql"],
    purpose: Literal["backup", "pre_restore"] = "backup",
) -> Path:
    tools = require_backup_tools()
    output_path = backup_output_path(backup_format, purpose)

    # Create the file with private permissions before pg_dump opens it.
    fd = os.open(
        output_path,
        os.O_CREAT | os.O_EXCL | os.O_WRONLY,
        0o600,
    )
    os.close(fd)

    try:
        pg_format = "custom" if backup_format == "custom" else "plain"

        command = [
            tools["pg_dump"],
            "--host",
            database_settings.database_host,
            "--port",
            str(database_settings.database_port),
            "--username",
            database_settings.database_user,
            "--dbname",
            database_settings.database_name,
            "--no-password",
            "--no-owner",
            "--no-privileges",
            "--format",
            pg_format,
            "--file",
            str(output_path),
        ]

        result = run_postgres_command(
            command,
            timeout_seconds=admin_settings.backup_timeout_seconds,
        )

        if result.returncode != 0:
            log_utility_failure("pg_dump", result)
            raise RuntimeError("PostgreSQL could not create the requested backup.")

        if not output_path.is_file() or output_path.stat().st_size == 0:
            raise RuntimeError("PostgreSQL produced an empty or missing backup file.")

        output_path.chmod(0o600)
        cleanup_expired_backups()

        return output_path

    except Exception:
        output_path.unlink(missing_ok=True)
        raise


# --------------------------------------------------
# Helpers: read-only SQL
# --------------------------------------------------


def validate_read_only_query(sql: str) -> str:
    query = sql.strip()

    if not query:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Enter a SQL query first.",
        )

    if len(query) > MAX_SQL_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=f"Queries must be {MAX_SQL_LENGTH} characters or fewer.",
        )

    if "\x00" in query:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The query contains an invalid null character.",
        )

    # This editor supports one straightforward SELECT statement. SQL comments
    # and dollar-quoted strings are intentionally excluded to simplify review.
    if any(marker in query for marker in ("--", "/*", "*/", "$$")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "SQL comments and dollar-quoted strings are not supported "
                "in the Database Management query editor."
            ),
        )

    if query.endswith(";"):
        query = query[:-1].rstrip()

    if ";" in query:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Submit one SQL statement at a time.",
        )

    if not re.match(r"(?is)^SELECT\b", query):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only SELECT queries are allowed.",
        )

    if re.search(r"(?is)\bINTO\b", query):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="SELECT INTO is not supported.",
        )

    if re.search(
        r"(?is)\bFOR\s+(?:UPDATE|SHARE|NO\s+KEY\s+UPDATE|KEY\s+SHARE)\b",
        query,
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Locking queries are not supported.",
        )

    if UNSAFE_FUNCTION_PATTERN.search(query):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The query contains a restricted PostgreSQL function.",
        )

    return query


def serialize_query_value(value: Any) -> str | int | float | bool | None:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value

    if isinstance(value, Decimal):
        # Preserve numeric precision when displaying monetary values.
        return str(value)

    if isinstance(value, (datetime, date, datetime_time)):
        return value.isoformat()

    if isinstance(value, bytes):
        return f"<binary value: {len(value)} bytes>"

    if isinstance(value, (dict, list, tuple)):
        return json.dumps(value, default=str, ensure_ascii=False)

    return str(value)


def unique_column_names(columns: list[str]) -> list[str]:
    seen: dict[str, int] = {}
    unique: list[str] = []

    for column in columns:
        count = seen.get(column, 0) + 1
        seen[column] = count

        unique.append(column if count == 1 else f"{column}_{count}")

    return unique


class ReadOnlyQueryRequest(BaseModel):
    sql: str = Field(min_length=1, max_length=MAX_SQL_LENGTH)

    @field_validator("sql")
    @classmethod
    def normalize_sql(cls, value: str) -> str:
        value = value.strip()

        if not value:
            raise ValueError("Enter a SQL query first.")

        return value


# --------------------------------------------------
# Database status
# --------------------------------------------------


@router.get("/status", summary="Get database health and configuration")
def get_database_status(
    _authorized: None = Depends(require_admin_token),
):
    tools = available_tools()
    started = time.perf_counter()

    response: dict[str, Any] = {
        "configured": True,
        "connected": False,
        "engine": engine.dialect.name,
        "driver": engine.dialect.driver,
        "database_name": database_settings.database_name,
        "host": database_settings.database_host,
        "port": database_settings.database_port,
        "schema_name": None,
        "server_version": None,
        "response_time_ms": None,
        "backup_service_available": bool(tools["pg_dump"] and tools["pg_restore"]),
        "s3_configured": False,
        "backup_retention_days": admin_settings.backup_retention_days,
        "query_max_rows": admin_settings.query_max_rows,
        "error": None,
    }

    try:
        with engine.connect() as connection:
            row = (
                connection.execute(
                    text(
                        """
                    SELECT
                        current_database() AS database_name,
                        current_schema() AS schema_name,
                        current_setting('server_version') AS server_version
                    """
                    )
                )
                .mappings()
                .one()
            )

        response["connected"] = True
        response["database_name"] = row["database_name"]
        response["schema_name"] = row["schema_name"]
        response["server_version"] = row["server_version"]

    except SQLAlchemyError:
        logger.exception("Database health check failed.")
        response["error"] = "The database connection failed. Check the backend logs."

    response["response_time_ms"] = round(
        (time.perf_counter() - started) * 1000,
        2,
    )

    return response


# --------------------------------------------------
# Inspect actual database schema
# --------------------------------------------------


@router.get("/schema", summary="Inspect PostgreSQL tables and columns")
def get_database_schema(
    _authorized: None = Depends(require_admin_token),
):
    try:
        with engine.connect() as connection:
            inspector = inspect(connection)

            schema_name = (
                connection.execute(text("SELECT current_schema()")).scalar_one_or_none()
                or "public"
            )

            statistics = (
                connection.execute(
                    text(
                        """
                    SELECT
                        c.relname AS table_name,
                        CASE
                            WHEN c.reltuples >= 0
                            THEN c.reltuples::bigint
                            ELSE NULL
                        END AS estimated_rows,
                        pg_total_relation_size(c.oid) AS total_bytes
                    FROM pg_class AS c
                    JOIN pg_namespace AS n
                        ON n.oid = c.relnamespace
                    WHERE n.nspname = :schema_name
                      AND c.relkind IN ('r', 'p', 'm')
                    """
                    ),
                    {"schema_name": schema_name},
                )
                .mappings()
                .all()
            )

            statistics_by_name = {row["table_name"]: row for row in statistics}

            table_names = inspector.get_table_names(schema=schema_name)
            tables: list[dict[str, Any]] = []

            for table_name in sorted(table_names):
                columns = inspector.get_columns(
                    table_name,
                    schema=schema_name,
                )

                primary_key_columns = set(
                    (
                        inspector.get_pk_constraint(
                            table_name,
                            schema=schema_name,
                        ).get("constrained_columns")
                        or []
                    )
                )

                details = [
                    {
                        "name": column["name"],
                        "type": str(column["type"]),
                        "nullable": bool(column.get("nullable", True)),
                        "primary_key": column["name"] in primary_key_columns,
                    }
                    for column in columns
                ]

                stat_row = statistics_by_name.get(table_name)
                rows = (
                    int(stat_row["estimated_rows"])
                    if stat_row is not None and stat_row["estimated_rows"] is not None
                    else None
                )
                size_bytes = (
                    int(stat_row["total_bytes"])
                    if stat_row is not None and stat_row["total_bytes"] is not None
                    else None
                )

                tables.append(
                    {
                        "name": table_name,
                        "description": QUERY_DESCRIPTIONS.get(
                            table_name,
                            "Database table",
                        ),
                        "columns": len(details),
                        "rows": rows,
                        "row_count_is_estimate": True,
                        "size_bytes": size_bytes,
                        "size": format_size(size_bytes),
                        "column_details": details,
                    }
                )

            database_size = connection.execute(
                text("SELECT pg_database_size(current_database())")
            ).scalar_one()

        return {
            "schema_name": schema_name,
            "table_count": len(tables),
            "database_size_bytes": int(database_size),
            "database_size": format_size(int(database_size)),
            "tables": tables,
            "note": (
                "Row counts are PostgreSQL planner estimates, not exact counts. "
                "They may be stale until PostgreSQL updates its statistics."
            ),
        }

    except SQLAlchemyError as exc:
        logger.exception("Database schema inspection failed.")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database schema inspection failed. Check database access.",
        ) from exc


def format_size(size_bytes: int | None) -> str:
    if size_bytes is None:
        return "—"

    units = ("B", "KB", "MB", "GB", "TB")
    size = float(size_bytes)

    for unit in units:
        if size < 1024 or unit == units[-1]:
            return f"{size:.0f} {unit}" if unit == "B" else f"{size:.2f} {unit}"

        size /= 1024

    return f"{size_bytes} B"


# --------------------------------------------------
# Execute a bounded, read-only SELECT
# --------------------------------------------------


@router.post("/query", summary="Execute a read-only SELECT query")
def run_read_only_query(
    request: ReadOnlyQueryRequest,
    _authorized: None = Depends(require_admin_token),
):
    sql = validate_read_only_query(request.sql)
    max_rows = admin_settings.query_max_rows
    timeout_ms = admin_settings.query_timeout_ms

    # The server enforces a read-only transaction independently of the
    # frontend validation. A client cannot turn this endpoint into a write API.
    wrapped_query = (
        "SELECT * FROM ("
        + sql
        + ") AS kinesis_read_only_result LIMIT "
        + str(max_rows + 1)
    )

    started = time.perf_counter()

    try:
        with engine.connect() as connection:
            with connection.begin():
                connection.exec_driver_sql("SET TRANSACTION READ ONLY")
                connection.exec_driver_sql(
                    f"SET LOCAL statement_timeout = '{timeout_ms}ms'"
                )
                connection.exec_driver_sql("SET LOCAL lock_timeout = '1000ms'")

                result = connection.exec_driver_sql(wrapped_query)

                raw_columns = list(result.keys())
                columns = unique_column_names(raw_columns)
                raw_rows = result.fetchmany(max_rows + 1)

        truncated = len(raw_rows) > max_rows
        raw_rows = raw_rows[:max_rows]

        rows = [
            {
                columns[index]: serialize_query_value(value)
                for index, value in enumerate(row)
            }
            for row in raw_rows
        ]

        return {
            "columns": columns,
            "rows": rows,
            "row_count": len(rows),
            "truncated": truncated,
            "max_rows": max_rows,
            "execution_time_ms": round(
                (time.perf_counter() - started) * 1000,
                2,
            ),
            "read_only": True,
        }

    except HTTPException:
        raise

    except SQLAlchemyError as exc:
        logger.warning(
            "Admin read-only query failed. Database error type: %s",
            type(exc).__name__,
        )

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "The query failed or exceeded the execution limit. "
                "Check the SQL syntax, permissions, and query complexity."
            ),
        ) from exc


# --------------------------------------------------
# Create downloadable backups
# --------------------------------------------------


@router.get("/backups", summary="List available managed backups")
def get_backups(
    limit: int = Query(default=20, ge=1, le=100),
    _authorized: None = Depends(require_admin_token),
):
    backups = list_managed_backups()

    return {
        "items": backups[:limit],
        "count": len(backups),
        "retention_days": admin_settings.backup_retention_days,
    }


@router.post("/backups", summary="Create and download a PostgreSQL backup")
def create_downloadable_backup(
    format: Literal["custom", "sql"] = Query(default="custom"),
    _authorized: None = Depends(require_admin_token),
):
    if not backup_operation_lock.acquire(blocking=False):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Another database backup or restore is already running.",
        )

    try:
        try:
            backup_path = create_backup_file(format, "backup")

        except HTTPException:
            raise

        except RuntimeError as exc:
            logger.exception("Database backup creation failed.")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=(
                    "The database backup could not be created. "
                    "Check backend logs and PostgreSQL utility availability."
                ),
            ) from exc

        return FileResponse(
            path=backup_path,
            media_type="application/octet-stream",
            filename=backup_path.name,
            headers={
                "Cache-Control": "no-store",
                "X-Content-Type-Options": "nosniff",
            },
        )

    finally:
        backup_operation_lock.release()


# --------------------------------------------------
# Validate and restore a PostgreSQL custom-format dump
# --------------------------------------------------


@router.post("/restore", summary="Restore a PostgreSQL custom-format backup")
async def restore_database(
    backup_file: UploadFile = File(...),
    database_name_confirmation: str = Form(...),
    _authorized: None = Depends(require_admin_token),
):
    if database_name_confirmation != database_settings.database_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "The database name confirmation does not match the configured "
                "database. No restore was performed."
            ),
        )

    supplied_filename = backup_file.filename or ""

    if Path(supplied_filename).suffix.lower() != ".dump":
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=(
                "Restore accepts PostgreSQL custom-format .dump files only. "
                "SQLite files and plain SQL exports are not accepted here."
            ),
        )

    if not backup_operation_lock.acquire(blocking=False):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Another database backup or restore is already running.",
        )

    uploaded_path: Path | None = None

    try:
        tools = require_backup_tools()
        directory = ensure_backup_directory()

        uploaded_path = directory / f".restore-upload-{uuid4().hex}.dump"
        total_bytes = 0

        # Stream the upload to disk with private permissions. Never load a
        # potentially large database dump completely into memory.
        fd = os.open(
            uploaded_path,
            os.O_CREAT | os.O_EXCL | os.O_WRONLY,
            0o600,
        )

        try:
            with os.fdopen(fd, "wb") as target:
                while True:
                    chunk = await backup_file.read(1024 * 1024)

                    if not chunk:
                        break

                    total_bytes += len(chunk)

                    if total_bytes > admin_settings.max_restore_upload_bytes:
                        raise HTTPException(
                            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                            detail=(
                                "The uploaded backup exceeds the configured "
                                "restore upload limit."
                            ),
                        )

                    target.write(chunk)

        except Exception:
            uploaded_path.unlink(missing_ok=True)
            raise

        if total_bytes == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The uploaded backup is empty.",
            )

        with uploaded_path.open("rb") as source:
            signature = source.read(5)

        if signature != b"PGDMP":
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail=(
                    "The file is not recognized as a PostgreSQL custom-format "
                    "archive. No restore was performed."
                ),
            )

        # Ask pg_restore to parse the archive before taking a backup or
        # applying changes to the configured database.
        try:
            validation = subprocess.run(
                [tools["pg_restore"], "--list", str(uploaded_path)],
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                text=True,
                timeout=30,
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The uploaded archive took too long to validate.",
            ) from exc

        if validation.returncode != 0:
            logger.warning(
                "Uploaded PostgreSQL archive failed validation: %s",
                (validation.stderr or "")[-1000:],
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "PostgreSQL could not validate this archive. "
                    "No restore was performed."
                ),
            )

        # A recoverable pre-restore snapshot is mandatory. If it cannot be
        # created, restoration does not start.
        try:
            pre_restore_backup = await asyncio.to_thread(
                create_backup_file,
                "custom",
                "pre_restore",
            )
        except Exception as exc:
            logger.exception("Pre-restore backup creation failed.")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=(
                    "A pre-restore backup could not be created. "
                    "The uploaded backup was not applied."
                ),
            ) from exc

        command = [
            tools["pg_restore"],
            "--host",
            database_settings.database_host,
            "--port",
            str(database_settings.database_port),
            "--username",
            database_settings.database_user,
            "--dbname",
            database_settings.database_name,
            "--no-password",
            "--exit-on-error",
            "--clean",
            "--if-exists",
            "--no-owner",
            "--no-privileges",
            "--single-transaction",
            str(uploaded_path),
        ]

        try:
            result = await asyncio.to_thread(
                run_postgres_command,
                command,
                timeout_seconds=admin_settings.restore_timeout_seconds,
            )
        except RuntimeError as exc:
            logger.exception("PostgreSQL restore utility failed.")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=(
                    "Restore failed. A pre-restore backup was created at "
                    f"{pre_restore_backup.name}. Check backend logs before "
                    "retrying."
                ),
            ) from exc

        if result.returncode != 0:
            log_utility_failure("pg_restore", result)

            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=(
                    "PostgreSQL rejected the restore. The operation used a "
                    "single transaction. A pre-restore backup was retained at "
                    f"{pre_restore_backup.name}."
                ),
            )

        # Existing pooled connections may have stale metadata after a restore.
        engine.dispose()

        logger.warning(
            "A database restore completed for the configured database. "
            "Pre-restore backup: %s",
            pre_restore_backup.name,
        )

        return {
            "message": "The PostgreSQL restore completed successfully.",
            "database_name": database_settings.database_name,
            "restored_file": Path(supplied_filename).name,
            "pre_restore_backup": backup_metadata(pre_restore_backup),
            "restored_at": datetime.now(timezone.utc).isoformat(),
        }

    finally:
        await backup_file.close()

        if uploaded_path is not None:
            uploaded_path.unlink(missing_ok=True)

        backup_operation_lock.release()
