"""
Operating-system-neutral resolution of configuration and data locations.

Deployment-specific values (database credentials, secrets, data folders)
live in one environment file outside the source tree. Its location is
given by the KINESIS_ENV_FILE environment variable, which the host's
service definition (systemd, launchd, Windows service wrapper) sets.

When KINESIS_ENV_FILE is not set, development falls back to backend/.env.

Relative data paths are resolved against KINESIS_DATA_DIR when it is
configured and against the backend directory otherwise. They never
depend on the process working directory, because service managers start
processes in different directories (Windows services start in System32).
"""

import os
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_DIRECTORY = Path(__file__).resolve().parent


def _resolve_env_file() -> Path:
    configured = os.environ.get("KINESIS_ENV_FILE", "").strip()

    if configured:
        return Path(configured).expanduser().resolve()

    return BACKEND_DIRECTORY / ".env"


ENV_FILE = _resolve_env_file()


class PathSettings(BaseSettings):
    data_dir: str | None = None
    image_directory: str | None = None
    gcash_qr_directory: str | None = None
    pg_bin_dir: str | None = None

    model_config = SettingsConfigDict(
        env_file=ENV_FILE,
        env_file_encoding="utf-8",
        env_prefix="KINESIS_",
        extra="ignore",
    )


path_settings = PathSettings()


def data_root() -> Path:
    """Base directory for runtime data (uploads, backups)."""

    configured = (path_settings.data_dir or "").strip()

    if configured:
        return Path(configured).expanduser().resolve()

    return BACKEND_DIRECTORY


def resolve_data_path(
    configured: str | None,
    default_relative: str,
) -> Path:
    """
    Resolve a configured data path.

    Absolute paths are used as given. Relative paths, and the default,
    are resolved against data_root().
    """

    value = (configured or "").strip() or default_relative
    path = Path(value).expanduser()

    if not path.is_absolute():
        path = data_root() / path

    return path.resolve()


def postgres_tool(name: str) -> str | None:
    """
    Locate a PostgreSQL client utility such as pg_dump.

    KINESIS_PG_BIN_DIR is checked first because the PostgreSQL bin
    directory is not on PATH by default on Windows or macOS.
    """

    import shutil

    configured = (path_settings.pg_bin_dir or "").strip()

    if configured:
        found = shutil.which(name, path=str(Path(configured).expanduser()))

        if found:
            return found

    return shutil.which(name)


def create_private_file(path: Path) -> None:
    """
    Create a new empty file that only the current user can read.

    os.open's mode is honoured on POSIX. On Windows it only controls the
    read-only flag, so privacy there depends on the data directory's
    access control list, which the deployment guide sets up.
    """

    fd = os.open(
        path,
        os.O_CREAT | os.O_EXCL | os.O_WRONLY,
        0o600,
    )
    os.close(fd)


def restrict_to_owner(path: Path, *, directory: bool = False) -> None:
    """Best-effort owner-only permissions (no effect on Windows ACLs)."""

    if os.name == "nt":
        return

    path.chmod(0o700 if directory else 0o600)
