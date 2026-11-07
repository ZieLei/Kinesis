"""
Integration test fixtures.

The tests need a disposable PostgreSQL database. Point KINESIS_TEST_ENV_FILE
at an environment file for it (never at a production database: tables are
truncated between tests). Database tests are skipped when it is not set.

    KINESIS_TEST_ENV_FILE=backend/.env.test pytest backend/tests

tests/safety.py refuses to run unless the configured and the connected
database name ends in "_test" and is not a deployment database.
"""

import os
import sys
from pathlib import Path

import pytest


BACKEND_DIRECTORY = Path(__file__).resolve().parents[1]

sys.path.insert(0, str(BACKEND_DIRECTORY))

from tests.safety import (  # noqa: E402
    UnsafeTestDatabaseError,
    check_connected_database,
    check_test_env_file,
)

TEST_ENV_FILE = os.environ.get("KINESIS_TEST_ENV_FILE", "").strip()

if TEST_ENV_FILE:
    # Validate before any backend module reads its settings, and before
    # KINESIS_ENV_FILE is replaced (it may name the deployment database).
    try:
        TEST_ENV_FILE = str(check_test_env_file(TEST_ENV_FILE))
    except UnsafeTestDatabaseError as exc:
        pytest.exit(f"Unsafe test database configuration: {exc}", returncode=4)

    os.environ["KINESIS_ENV_FILE"] = TEST_ENV_FILE


def assert_test_database(engine) -> None:
    try:
        check_connected_database(engine, TEST_ENV_FILE)
    except UnsafeTestDatabaseError as exc:
        pytest.exit(f"Unsafe test database: {exc}", returncode=4)


requires_database = pytest.mark.skipif(
    not TEST_ENV_FILE,
    reason="KINESIS_TEST_ENV_FILE is not set",
)


POS_ORIGIN = "http://localhost:8081"
ADMIN_ORIGIN = "http://localhost:5173"


@pytest.fixture()
def db_session():
    from sqlalchemy import text

    from database import SessionLocal, engine

    # Re-checked on every use: this fixture truncates every table.
    assert_test_database(engine)

    with engine.begin() as connection:
        tables = connection.execute(
            text(
                "SELECT tablename FROM pg_tables "
                "WHERE schemaname = 'public' AND tablename <> 'alembic_version'"
            )
        ).scalars().all()

        if tables:
            connection.execute(
                text(
                    "TRUNCATE "
                    + ", ".join(f'"{name}"' for name in tables)
                    + " RESTART IDENTITY CASCADE"
                )
            )

    session = SessionLocal()

    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def app():
    import main

    return main.app


@pytest.fixture()
def client_factory(app, db_session):
    from fastapi.testclient import TestClient

    clients = []

    def make() -> TestClient:
        # Entering the client runs the application lifespan, which installs
        # activity and inventory tracking.
        client = TestClient(app).__enter__()
        clients.append(client)
        return client

    yield make

    for client in clients:
        client.__exit__(None, None, None)
