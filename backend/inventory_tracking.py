from datetime import datetime, timezone

from sqlalchemy import event, inspect, select
from sqlalchemy.orm import Session

from models import StockoutPeriod


def _stock_change(product):
    history = inspect(product).attrs.stock.history

    if not history.has_changes():
        return None

    old_stock = (
        history.deleted[0] if history.deleted else getattr(product, "stock", None)
    )

    new_stock = history.added[0] if history.added else getattr(product, "stock", None)

    try:
        return int(old_stock), int(new_stock)
    except (TypeError, ValueError):
        return None


def _before_flush(session, _flush_context, _instances):
    now = datetime.now(timezone.utc)

    for product in list(session.dirty):
        if product.__class__.__name__ != "Product":
            continue

        change = _stock_change(product)

        if change is None:
            continue

        old_stock, new_stock = change
        product_id = getattr(product, "id", None)

        # Newly created products have no persisted ID yet. Stockout
        # history begins when an existing product transitions to zero.
        if product_id is None:
            continue

        open_periods = session.scalars(
            select(StockoutPeriod)
            .where(
                StockoutPeriod.product_id == product_id,
                StockoutPeriod.ended_at.is_(None),
            )
            .order_by(StockoutPeriod.started_at.desc())
            .with_for_update()
        ).all()

        if new_stock <= 0:
            if old_stock > 0 or not open_periods:
                if not open_periods:
                    session.add(
                        StockoutPeriod(
                            product_id=product_id,
                            product_name=product.name,
                            started_at=now,
                        )
                    )

        elif new_stock > 0 and open_periods:
            # Close any duplicate open intervals defensively.
            for period in open_periods:
                period.ended_at = now


def install_inventory_tracking():
    if not event.contains(Session, "before_flush", _before_flush):
        event.listen(Session, "before_flush", _before_flush)
