"""
Guards that keep tests and migration experiments off real databases.

Tests truncate tables and migration experiments drop the public schema,
so every destructive operation must first prove it is connected to a
disposable database. A database is accepted only when:

- its name ends in "_test",
- its name is not a protected name and differs from the database the
  real deployment uses (backend/.env, or KINESIS_ENV_FILE when that
  points somewhere other than the test env file),
- no DATABASE_* environment variable overrides the test env file
  (pydantic-settings gives environment variables precedence over files),
- and the live connection reports the same name via current_database().
"""

import os
from pathlib import Path

from dotenv import dotenv_values


BACKEND_DIRECTORY = Path(__file__).resolve().parents[1]
DEVELOPMENT_ENV_FILE = BACKEND_DIRECTORY / ".env"

TEST_DATABASE_SUFFIX = "_test"
PROTECTED_DATABASE_NAMES = frozenset({"kinesis", "postgres", "template0", "template1"})

OVERRIDE_VARIABLES = (
    "DATABASE_USER",
    "DATABASE_PASSWORD",
    "DATABASE_HOST",
    "DATABASE_PORT",
    "DATABASE_NAME",
)


class UnsafeTestDatabaseError(RuntimeError):
    pass


def _deployment_database_names(test_env_file: Path) -> set[str]:
    names = set(PROTECTED_DATABASE_NAMES)

    candidates = [DEVELOPMENT_ENV_FILE]

    if (configured := os.environ.get("KINESIS_ENV_FILE", "").strip()):
        candidates.append(Path(configured).expanduser().resolve())

    for candidate in candidates:
        if candidate == test_env_file or not candidate.is_file():
            continue

        name = (dotenv_values(candidate).get("DATABASE_NAME") or "").strip()

        names.add(name or "kinesis")

    return names


def check_database_name(name: str | None, test_env_file: Path) -> str:
    name = (name or "").strip()

    if not name.endswith(TEST_DATABASE_SUFFIX):
        raise UnsafeTestDatabaseError(
            f"Refusing to use database {name!r}: test database names must "
            f"end in {TEST_DATABASE_SUFFIX!r}."
        )

    if name in _deployment_database_names(test_env_file):
        raise UnsafeTestDatabaseError(
            f"Refusing to use database {name!r}: it is a protected or "
            "deployment database."
        )

    return name


def check_test_env_file(path: str | os.PathLike[str]) -> Path:
    """Validate the env file before any backend module reads settings."""

    env_file = Path(path).expanduser().resolve()

    if not env_file.is_file():
        raise UnsafeTestDatabaseError(f"Test env file {env_file} does not exist.")

    if env_file == DEVELOPMENT_ENV_FILE:
        raise UnsafeTestDatabaseError(
            "KINESIS_TEST_ENV_FILE points at backend/.env, the development "
            "deployment configuration."
        )

    overridden = [name for name in OVERRIDE_VARIABLES if name in os.environ]

    if overridden:
        raise UnsafeTestDatabaseError(
            "Unset these environment variables before running tests; they "
            f"would override the test env file: {', '.join(overridden)}."
        )

    check_database_name(dotenv_values(env_file).get("DATABASE_NAME"), env_file)

    return env_file


def check_connected_database(engine, test_env_file: str | os.PathLike[str]) -> str:
    """Confirm the effective settings and the live connection are a test DB."""

    from sqlalchemy import text

    env_file = Path(test_env_file).expanduser().resolve()
    configured = check_database_name(engine.url.database, env_file)

    with engine.connect() as connection:
        actual = connection.execute(text("SELECT current_database()")).scalar_one()

    check_database_name(actual, env_file)

    if actual != configured:
        raise UnsafeTestDatabaseError(
            f"Connected to {actual!r} but settings name {configured!r}."
        )

    return actual
