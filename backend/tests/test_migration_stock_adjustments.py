"""
Migration f1b914eead0e (stock adjustments) against the restored backup.

Uses the same KINESIS_TEST_BACKUP / KINESIS_TEST_BACKUP_SHA256 variables as
test_migration_product_archiving.py and leaves the database at head.
"""

import pytest
from sqlalchemy import text

from tests.test_migration_product_archiving import (  # noqa: F401
    AFTER as ARCHIVING,
    alembic,
    backup,
    data_differences as archiving_differences,
    engine,
    pytestmark,
    scalar,
)


HEAD = "f1b914eead0e"

NEW_TABLE = "table stock_adjustments exists in the database but not the backup"


def data_differences(engine, backup) -> list[str]:
    """Pre-existing rows vs the backup; the new table is expected."""

    return [p for p in archiving_differences(engine, backup) if p != NEW_TABLE]


def table_exists(engine) -> bool:
    return bool(scalar(engine, "SELECT to_regclass('public.stock_adjustments') IS NOT NULL"))


def test_upgrade_adds_table_and_preserves_records(engine, backup):
    alembic(engine, "upgrade", HEAD)

    assert scalar(engine, "SELECT version_num FROM alembic_version") == HEAD
    assert table_exists(engine)
    assert data_differences(engine, backup) == []


def test_constraints_reject_inconsistent_rows(engine):
    product_id = scalar(engine, "SELECT min(id) FROM products")

    bad_rows = [
        "0, 5, 5, 'damaged', NULL",       # no change
        "-1, 5, 3, 'damaged', NULL",      # arithmetic does not add up
        "-1, 5, 4, 'stolen', NULL",       # unknown reason
        "-1, 5, 4, 'other', NULL",        # 'other' without a note
    ]

    for values in bad_rows:
        with engine.connect() as connection:
            with pytest.raises(Exception, match="violates check constraint"):
                connection.execute(
                    text(
                        "INSERT INTO stock_adjustments (product_id, product_name, "
                        "quantity_change, stock_before, stock_after, reason, note, "
                        f"actor_type, created_at) VALUES (:id, 'x', {values}, "
                        "'admin', now())"
                    ),
                    {"id": product_id},
                )
            connection.rollback()


def test_downgrade_refused_while_adjustments_exist(engine, backup):
    product_id = scalar(engine, "SELECT min(id) FROM products")

    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO stock_adjustments (product_id, product_name, "
                "quantity_change, stock_before, stock_after, reason, actor_type, "
                "created_at) VALUES (:id, 'x', -1, 5, 4, 'damaged', 'admin', now())"
            ),
            {"id": product_id},
        )

    try:
        with pytest.raises(RuntimeError, match="Refusing to downgrade"):
            alembic(engine, "downgrade", ARCHIVING)

        assert scalar(engine, "SELECT version_num FROM alembic_version") == HEAD
        assert scalar(engine, "SELECT count(*) FROM stock_adjustments") == 1
    finally:
        with engine.begin() as connection:
            connection.execute(text("DELETE FROM stock_adjustments"))


def test_downgrade_then_upgrade_again(engine, backup):
    alembic(engine, "downgrade", ARCHIVING)

    assert scalar(engine, "SELECT version_num FROM alembic_version") == ARCHIVING
    assert not table_exists(engine)
    assert data_differences(engine, backup) == []

    alembic(engine, "upgrade", HEAD)

    assert table_exists(engine)
    assert data_differences(engine, backup) == []
