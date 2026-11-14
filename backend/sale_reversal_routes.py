"""
Void and refund of a completed sale.

The original sale and its lines are preserved. A reversal needs a supervisor
username and PIN and a reason code, flips the sale status, optionally puts
the goods back into stock (with a stock-history entry per product) and is
recorded in sale_reversals and the activity log. Reversals are all-or-nothing
per sale; reports already count only status = 'completed' sales.
"""

import logging
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field, SecretStr, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session, selectinload

from activity_tracking import _record
from cashier_routes import CashierPrincipal, require_cashier_principal
from database import get_db
from models import (
    Product,
    Sale,
    SaleReversal,
    StockAdjustment,
    Terminal,
)
from sales_routes import (
    authorize_supervisor_discount,
    get_sale_by_code,
    sale_response,
)
from terminal_routes import require_writable_terminal


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["Sales"])

ReversalKind = Literal["void", "refund"]
ReversalReason = Literal[
    "customer_changed_mind",
    "wrong_item",
    "cashier_error",
    "defective_item",
    "duplicate_sale",
    "pricing_dispute",
    "other",
]

class SaleReversalRequest(BaseModel):
    kind: ReversalKind
    reason_code: ReversalReason
    note: str | None = Field(default=None, max_length=500)
    # Refunds may leave unsellable goods out of stock. Voids always restock.
    return_to_stock: bool = True
    supervisor_username: str = Field(min_length=3, max_length=64)
    supervisor_pin: SecretStr = Field(min_length=1, max_length=128)

    @field_validator("note")
    @classmethod
    def normalize_note(cls, value: str | None) -> str | None:
        if value is None:
            return None

        return value.strip() or None

    @field_validator("supervisor_username")
    @classmethod
    def normalize_supervisor(cls, value: str) -> str:
        return value.strip().lower()


def same_request(reversal: SaleReversal, data: SaleReversalRequest) -> bool:
    return (
        reversal.kind == data.kind
        and reversal.reason_code == data.reason_code
        and reversal.note == data.note
    )


@router.post("/sales/{transaction_code}/reversal")
def reverse_sale(
    transaction_code: str,
    data: SaleReversalRequest,
    request: Request,
    terminal: Terminal = Depends(require_writable_terminal),
    cashier: CashierPrincipal = Depends(require_cashier_principal),
    db: Session = Depends(get_db),
):
    if data.reason_code == "other" and data.note is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "Describe the reason when choosing 'Other'.",
        )

    try:
        sale = db.scalar(
            select(Sale)
            .where(Sale.transaction_code == transaction_code)
            .with_for_update()
            .execution_options(populate_existing=True)
        )

        if sale is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Transaction not found.")

        # A retry of an already recorded reversal returns it unchanged.
        existing = db.scalar(
            select(SaleReversal).where(SaleReversal.sale_id == sale.id)
        )

        if existing is not None:
            if same_request(existing, data):
                result = sale_response(get_sale_by_code(db, transaction_code))
                db.rollback()
                return result

            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"This transaction was already {sale.status}.",
            )

        if sale.status != "completed":
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"Only completed transactions can be reversed (this one is {sale.status}).",
            )

        supervisor = authorize_supervisor_discount(
            db, request, data.supervisor_username, data.supervisor_pin
        )

        restock = data.kind == "void" or data.return_to_stock

        if restock:
            quantities: dict[int, int] = {}

            for item in sale.items:
                if item.product_id is not None:
                    quantities[item.product_id] = (
                        quantities.get(item.product_id, 0) + item.quantity
                    )

            products = db.scalars(
                select(Product)
                .where(Product.id.in_(sorted(quantities)))
                .order_by(Product.id.asc())
                .with_for_update()
            ).all()

            actor = db.info.get("kinesis_actor") or {}

            for product in products:
                quantity = quantities[product.id]
                before = product.stock

                product.stock = before + quantity
                product.how_much_sold = max(0, product.how_much_sold - quantity)

                db.add(
                    StockAdjustment(
                        product_id=product.id,
                        product_name=product.name,
                        sku=product.sku,
                        quantity_change=quantity,
                        stock_before=before,
                        stock_after=product.stock,
                        reason="sale_reversal",
                        note=f"{data.kind.capitalize()} of {sale.transaction_code}"[:500],
                        actor_type=actor.get("actor_type", "cashier"),
                        actor_id=actor.get("actor_id"),
                        actor_name=actor.get("actor_name"),
                    )
                )

        sale.status = "voided" if data.kind == "void" else "refunded"

        db.add(
            SaleReversal(
                sale_id=sale.id,
                transaction_code=sale.transaction_code,
                kind=data.kind,
                reason_code=data.reason_code,
                note=data.note,
                amount=sale.total,
                restocked=restock,
                requested_by=cashier.cashier.id,
                requested_by_username=cashier.cashier.username,
                authorized_by=supervisor.id,
                authorized_by_username=supervisor.username,
                terminal_id=terminal.id,
            )
        )

        _record(
            db,
            f"sale.{sale.status}",
            f"Sale {sale.transaction_code} {sale.status}",
            severity="warning",
            terminal_id=terminal.id,
            details={
                "transaction_code": sale.transaction_code,
                "kind": data.kind,
                "reason_code": data.reason_code,
                "amount": sale.total,
                "restocked": restock,
                "authorized_by": supervisor.username,
            },
        )

        db.commit()

    except HTTPException:
        db.rollback()
        raise

    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This transaction was already reversed.",
        ) from exc

    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Could not reverse sale.")
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "The reversal could not be saved. Nothing was changed.",
        ) from exc

    db.expire_all()

    return sale_response(get_sale_by_code(db, transaction_code))
