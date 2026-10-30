"""add tax amount to sales

Revision ID: 1f229a8cc520
Revises: 82e3427f6051
Create Date: 2026-10-30 10:43:59.839374
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "1f229a8cc520"
down_revision: Union[str, Sequence[str], None] = "82e3427f6051"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "sales",
        sa.Column(
            "tax_amount",
            sa.Numeric(precision=12, scale=2),
            server_default=sa.text("0.00"),
            nullable=False,
        ),
    )

    op.create_check_constraint(
        "ck_sales_tax_amount_nonnegative",
        "sales",
        "tax_amount >= 0",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_sales_tax_amount_nonnegative",
        "sales",
        type_="check",
    )

    op.drop_column("sales", "tax_amount")
