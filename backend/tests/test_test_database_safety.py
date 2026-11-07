"""The test-database guard must refuse anything that could be a real database."""

from types import SimpleNamespace

import pytest

from tests import safety
from tests.safety import (
    UnsafeTestDatabaseError,
    check_connected_database,
    check_test_env_file,
)


@pytest.fixture()
def env_file(tmp_path, monkeypatch):
    for name in safety.OVERRIDE_VARIABLES:
        monkeypatch.delenv(name, raising=False)

    # conftest points KINESIS_ENV_FILE at the real test env file during
    # database runs; isolate these unit tests from it.
    monkeypatch.delenv("KINESIS_ENV_FILE", raising=False)

    def write(database_name: str):
        path = tmp_path / "test.env"
        path.write_text(f"DATABASE_NAME={database_name}\n")
        return path

    return write


@pytest.mark.parametrize(
    "name",
    ["kinesis", "kinesis_prod", "postgres", "template1", "", "test", "kinesis_test_copy"],
)
def test_rejects_names_that_are_not_test_databases(env_file, name):
    with pytest.raises(UnsafeTestDatabaseError):
        check_test_env_file(env_file(name))


def test_rejects_the_deployment_database_even_with_test_suffix(
    env_file, tmp_path, monkeypatch
):
    deployment = tmp_path / "deployment.env"
    deployment.write_text("DATABASE_NAME=shop_test\n")
    monkeypatch.setenv("KINESIS_ENV_FILE", str(deployment))

    with pytest.raises(UnsafeTestDatabaseError):
        check_test_env_file(env_file("shop_test"))


def test_rejects_the_development_env_file(monkeypatch):
    for name in safety.OVERRIDE_VARIABLES:
        monkeypatch.delenv(name, raising=False)

    with pytest.raises(UnsafeTestDatabaseError):
        check_test_env_file(safety.DEVELOPMENT_ENV_FILE)


@pytest.mark.parametrize("variable", safety.OVERRIDE_VARIABLES)
def test_rejects_environment_overrides(env_file, monkeypatch, variable):
    path = env_file("kinesis_test")
    monkeypatch.setenv(variable, "kinesis")

    with pytest.raises(UnsafeTestDatabaseError):
        check_test_env_file(path)


def test_accepts_a_disposable_test_database(env_file):
    path = env_file("kinesis_test")

    assert check_test_env_file(path) == path.resolve()


class FakeEngine:
    def __init__(self, configured: str, connected: str):
        self.url = SimpleNamespace(database=configured)
        self._connected = connected

    def connect(self):
        connected = self._connected

        class Connection:
            def __enter__(self):
                return self

            def __exit__(self, *exc):
                return False

            def execute(self, _statement):
                return SimpleNamespace(scalar_one=lambda: connected)

        return Connection()


@pytest.mark.parametrize(
    ("configured", "connected"),
    [
        ("kinesis", "kinesis"),
        ("kinesis_test", "kinesis"),
        ("kinesis_test", "other_test"),
    ],
)
def test_rejects_unsafe_live_connections(env_file, configured, connected):
    path = env_file("kinesis_test")

    with pytest.raises(UnsafeTestDatabaseError):
        check_connected_database(FakeEngine(configured, connected), path)


def test_accepts_matching_live_test_connection(env_file):
    path = env_file("kinesis_test")

    assert (
        check_connected_database(FakeEngine("kinesis_test", "kinesis_test"), path)
        == "kinesis_test"
    )
