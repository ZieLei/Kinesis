"""
Migration e004e9b64dcb (product archiving) against a restored real backup.

Needs, in addition to KINESIS_TEST_ENV_FILE:

    KINESIS_TEST_BACKUP=/path/to/pre-migration.dump
    KINESIS_TEST_BACKUP_SHA256=<hex>

The tests run in file order and share one restored database: upgrade,
refused downgrade, downgrade, upgrade again.
"""

import os
from decimal import Decimal
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from tests.conftest import (
    BACKEND_DIRECTORY,
    TEST_ENV_FILE,
    assert_test_database,
    requires_database,
)


BEFORE = "a7c3e91f4b20"
AFTER = "e004e9b64dcb"

BACKUP = os.environ.get("KINESIS_TEST_BACKUP", "").strip()
BACKUP_SHA256 = os.environ.get("KINESIS_TEST_BACKUP_SHA256", "").strip()

pytestmark = [
    requires_database,
    pytest.mark.skipif(
        not (BACKUP and BACKUP_SHA256),
        reason="KINESIS_TEST_BACKUP and KINESIS_TEST_BACKUP_SHA256 are not set",
    ),
]

PRODUCT_FKS = {
    "sale_items": "sale_items_product_id_fkey",
    "inventory_receipt_items": "inventory_receipt_items_product_id_fkey",
    "stockout_periods": "stockout_periods_product_id_fkey",
}


@pytest.fixture(scope="module")
def backup():
    from tests.db_restore import require_backup

    return require_backup(Path(BACKUP), BACKUP_SHA256)


@pytest.fixture(scope="module")
def engine(backup):
    from database import engine
    from tests.db_restore import restore

    assert_test_database(engine)
    restore(backup, Path(TEST_ENV_FILE))

    return engine


def alembic(engine, action: str, revision: str) -> None:
    # Alembic reads the same settings as the app; never run it unguarded.
    assert_test_database(engine)

    config = Config(str(BACKEND_DIRECTORY / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIRECTORY / "migrations"))

    getattr(command, action)(config, revision)
    engine.dispose()


def scalar(engine, sql: str, **params):
    with engine.connect() as connection:
        return connection.execute(text(sql), params).scalar()


def fk_rules(engine) -> dict[str, str]:
    with engine.connect() as connection:
        rows = connection.execute(
            text(
                "SELECT conrelid::regclass::text, conname, confdeltype "
                "FROM pg_constraint WHERE contype = 'f' "
                "AND confrelid IN ('products'::regclass, 'services'::regclass)"
            )
        ).all()

    return {f"{table}.{name}": rule for table, name, rule in rows}


def data_differences(engine, backup) -> list[str]:
    """Every pre-migration row, compared column for column with the backup."""

    from tests.db_restore import verify

    problems = verify(backup, Path(TEST_ENV_FILE))

    # alembic_version is the one table a migration is supposed to change.
    return [p for p in problems if not p.startswith("table alembic_version:")]


def assert_orphaned_oil_lines_intact(engine) -> None:
    with engine.connect() as connection:
        rows = connection.execute(
            text(
                "SELECT sku, product_name, category, quantity, line_total "
                "FROM sale_items WHERE product_id IS NULL ORDER BY id"
            )
        ).all()

    assert len(rows) == 3
    assert {(r.sku, r.product_name, r.category) for r in rows} == {
        ("OIL-001", "Synthetic Engine Oil", "Oil")
    }
    assert sum(r.line_total for r in rows) == Decimal("826.50")


# --------------------------------------------------------------------------


def test_restored_backup_is_the_expected_pre_migration_state(engine, backup):
    assert scalar(engine, "SELECT version_num FROM alembic_version") == BEFORE
    assert data_differences(engine, backup) == []
    assert set(fk_rules(engine).values()) == {"n"}  # all SET NULL
    assert_orphaned_oil_lines_intact(engine)


def test_upgrade_preserves_every_record(engine, backup):
    alembic(engine, "upgrade", AFTER)

    assert scalar(engine, "SELECT version_num FROM alembic_version") == AFTER
    assert data_differences(engine, backup) == []
    assert_orphaned_oil_lines_intact(engine)

    # Every existing product starts active.
    assert scalar(engine, "SELECT count(*) FROM products WHERE archived_at IS NOT NULL") == 0


def test_upgrade_schema(engine):
    rules = fk_rules(engine)

    for table, name in PRODUCT_FKS.items():
        assert rules[f"{table}.{name}"] == "r", f"{table} should RESTRICT"

    # Out of scope for this migration: services keep SET NULL.
    assert rules["sale_service_items.sale_service_items_service_id_fkey"] == "n"

    assert scalar(
        engine,
        "SELECT is_nullable FROM information_schema.columns "
        "WHERE table_name = 'products' AND column_name = 'archived_at'",
    ) == "YES"

    assert "WHERE (archived_at IS NULL)" in scalar(
        engine,
        "SELECT indexdef FROM pg_indexes WHERE indexname = 'ix_products_active'",
    )


def test_referenced_product_cannot_be_deleted(engine):
    product_id = scalar(engine, "SELECT min(product_id) FROM sale_items")
    assert product_id is not None

    with engine.connect() as connection:
        with pytest.raises(IntegrityError, match="violates RESTRICT setting of foreign key"):
            connection.execute(
                text("DELETE FROM products WHERE id = :id"), {"id": product_id}
            )
        connection.rollback()

    assert scalar(engine, "SELECT count(*) FROM products WHERE id = :id", id=product_id) == 1


def test_unreferenced_product_can_still_be_deleted(engine):
    with engine.connect() as connection:
        product_id = connection.execute(
            text(
                "INSERT INTO products (name, category, price, stock, how_much_sold) "
                "VALUES ('Migration probe', 'Test', 1.00, 0, 0) RETURNING id"
            )
        ).scalar_one()

        deleted = connection.execute(
            text("DELETE FROM products WHERE id = :id"), {"id": product_id}
        ).rowcount

        connection.rollback()

    assert deleted == 1


def test_downgrade_refused_while_products_are_archived(engine, backup):
    product_id = scalar(engine, "SELECT min(id) FROM products")

    with engine.begin() as connection:
        connection.execute(
            text("UPDATE products SET archived_at = now() WHERE id = :id"),
            {"id": product_id},
        )

    try:
        with pytest.raises(RuntimeError, match="Refusing to downgrade"):
            alembic(engine, "downgrade", BEFORE)

        # The refused downgrade changed nothing.
        assert scalar(engine, "SELECT version_num FROM alembic_version") == AFTER
        assert all(fk_rules(engine)[f"{t}.{n}"] == "r" for t, n in PRODUCT_FKS.items())
        assert scalar(
            engine, "SELECT archived_at IS NOT NULL FROM products WHERE id = :id", id=product_id
        )
    finally:
        with engine.begin() as connection:
            connection.execute(text("UPDATE products SET archived_at = NULL"))

    assert data_differences(engine, backup) == []


def test_downgrade_restores_original_schema_and_data(engine, backup):
    alembic(engine, "downgrade", BEFORE)

    assert scalar(engine, "SELECT version_num FROM alembic_version") == BEFORE
    assert set(fk_rules(engine).values()) == {"n"}
    assert scalar(
        engine,
        "SELECT count(*) FROM information_schema.columns "
        "WHERE table_name = 'products' AND column_name = 'archived_at'",
    ) == 0
    assert scalar(engine, "SELECT count(*) FROM pg_indexes WHERE indexname = 'ix_products_active'") == 0

    # Including alembic_version: the database is the backup again.
    from tests.db_restore import verify

    assert verify(backup, Path(TEST_ENV_FILE)) == []


def test_upgrade_again_is_clean(engine, backup):
    alembic(engine, "upgrade", AFTER)

    assert scalar(engine, "SELECT version_num FROM alembic_version") == AFTER
    assert all(fk_rules(engine)[f"{t}.{n}"] == "r" for t, n in PRODUCT_FKS.items())
    assert data_differences(engine, backup) == []
    assert_orphaned_oil_lines_intact(engine)


def test_reports_over_restored_history(engine):
    """Top Products on the real pre-migration data, after upgrading."""

    from sqlalchemy.orm import Session

    from models import Sale
    from sales_routes import product_sales_rows

    with Session(engine) as db:
        rows = product_sales_rows(db, [Sale.status == "completed"], include_unsold=False)

        oil = [row for row in rows if row["sku"] == "OIL-001"]
        assert len(oil) == 1
        assert oil[0]["product_id"] is None and oil[0]["deleted"] is True
        assert (oil[0]["name"], oil[0]["category"]) == ("Synthetic Engine Oil", "Oil")
        assert (oil[0]["units_sold"], oil[0]["revenue"]) == (3, 826.50)

        # Every completed unit is attributed to exactly one row.
        expected_units = scalar(
            engine,
            "SELECT coalesce(sum(si.quantity), 0) FROM sale_items si "
            "JOIN sales s ON s.id = si.sale_id WHERE s.status = 'completed'",
        )
        assert sum(row["units_sold"] for row in rows) == expected_units

        linked = scalar(
            engine,
            "SELECT count(DISTINCT si.product_id) FROM sale_items si "
            "JOIN sales s ON s.id = si.sale_id WHERE s.status = 'completed'",
        )
        assert len(rows) == linked + 1
