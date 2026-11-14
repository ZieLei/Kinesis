"""make audit tables append-only

activity_events and stock_adjustments reject UPDATE and DELETE; sale_reversals
rejects them too, except that the cashier/terminal references may be set to
NULL (the existing ON DELETE SET NULL behaviour when an account or device is
removed). The triggers also stop the application's own database role, so a
bug or a stray console statement cannot rewrite history.

TRUNCATE is not blocked (disposable test databases rely on it). A database
superuser can still drop the triggers; this guards against mistakes and
application-level tampering, not against the database owner.

Existing rows are untouched.

Revision ID: d4f6b8c0e213
Revises: c3e5a7b9d102
Create Date: 2026-11-10 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = "d4f6b8c0e213"
down_revision: Union[str, Sequence[str], None] = "c3e5a7b9d102"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

STRICT_TABLES = ("activity_events", "stock_adjustments")


def upgrade() -> None:
    op.execute(
        """
        CREATE FUNCTION kinesis_reject_audit_change() RETURNS trigger AS $$
        BEGIN
            RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP
                USING ERRCODE = 'integrity_constraint_violation';
        END;
        $$ LANGUAGE plpgsql
        """
    )

    # Only the references that ON DELETE SET NULL may clear are mutable.
    op.execute(
        """
        CREATE FUNCTION kinesis_reject_reversal_change() RETURNS trigger AS $$
        BEGIN
            IF TG_OP = 'DELETE' THEN
                RAISE EXCEPTION 'sale_reversals is append-only: DELETE is not allowed'
                    USING ERRCODE = 'integrity_constraint_violation';
            END IF;

            IF (to_jsonb(NEW) - 'requested_by' - 'authorized_by' - 'terminal_id')
               IS DISTINCT FROM
               (to_jsonb(OLD) - 'requested_by' - 'authorized_by' - 'terminal_id')
               OR (NEW.requested_by IS NOT NULL AND NEW.requested_by IS DISTINCT FROM OLD.requested_by)
               OR (NEW.authorized_by IS NOT NULL AND NEW.authorized_by IS DISTINCT FROM OLD.authorized_by)
               OR (NEW.terminal_id IS NOT NULL AND NEW.terminal_id IS DISTINCT FROM OLD.terminal_id)
            THEN
                RAISE EXCEPTION 'sale_reversals is append-only: UPDATE is not allowed'
                    USING ERRCODE = 'integrity_constraint_violation';
            END IF;

            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
        """
    )

    for table in STRICT_TABLES:
        op.execute(
            f"""
            CREATE TRIGGER {table}_append_only
            BEFORE UPDATE OR DELETE ON {table}
            FOR EACH ROW EXECUTE FUNCTION kinesis_reject_audit_change()
            """
        )

    op.execute(
        """
        CREATE TRIGGER sale_reversals_append_only
        BEFORE UPDATE OR DELETE ON sale_reversals
        FOR EACH ROW EXECUTE FUNCTION kinesis_reject_reversal_change()
        """
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS sale_reversals_append_only ON sale_reversals")

    for table in STRICT_TABLES:
        op.execute(f"DROP TRIGGER IF EXISTS {table}_append_only ON {table}")

    op.execute("DROP FUNCTION IF EXISTS kinesis_reject_reversal_change()")
    op.execute("DROP FUNCTION IF EXISTS kinesis_reject_audit_change()")
