"""add payment reference to sales

Revision ID: 2b9ab1d73b3e
Revises: d49fc8b678b1
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "2b9ab1d73b3e"
down_revision: Union[str, Sequence[str], None] = "d49fc8b678b1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "sales",
        sa.Column(
            "reference_number",
            sa.String(length=64),
            nullable=True,
        ),
    )
    op.create_unique_constraint(
        "sales_reference_number_key",
        "sales",
        ["reference_number"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "sales_reference_number_key",
        "sales",
        type_="unique",
    )
    op.drop_column("sales", "reference_number")
