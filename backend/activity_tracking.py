from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from uuid import UUID

from sqlalchemy import event, inspect
from sqlalchemy.orm import Session

from activity_models import ActivityEvent


def _json_value(value):
    if value is None:
        return None

    if isinstance(value, (str, int, float, bool)):
        return value

    if isinstance(value, (datetime, date)):
        return value.isoformat()

    if isinstance(value, (Decimal, UUID)):
        return str(value)

    if isinstance(value, Enum):
        return value.value

    if isinstance(value, dict):
        return {str(key): _json_value(item) for key, item in value.items()}

    if isinstance(value, (list, tuple, set)):
        return [_json_value(item) for item in value]

    return str(value)


def _get(obj, *names, default=None):
    for name in names:
        value = getattr(obj, name, None)

        if value is not None:
            return value

    return default


def _history_value(obj, field: str):
    history = inspect(obj).attrs[field].history

    old_value = history.deleted[0] if history.deleted else None

    new_value = history.added[0] if history.added else getattr(obj, field, None)

    return old_value, new_value


def _changed_fields(obj, fields: tuple[str, ...]) -> dict:
    changes = {}

    state = inspect(obj)

    for field in fields:
        history = state.attrs[field].history

        if not history.has_changes():
            continue

        old_value, new_value = _history_value(obj, field)

        changes[field] = {
            "from": _json_value(old_value),
            "to": _json_value(new_value),
        }

    return changes


def _record(
    session: Session,
    event_type: str,
    summary: str,
    *,
    severity: str = "info",
    actor_type: str = "system",
    actor_id=None,
    actor_name=None,
    cashier_id=None,
    terminal_id=None,
    details: dict | None = None,
):
    # Requests authenticated as a cashier register the actor on the
    # database session; use it for events that would otherwise be
    # recorded as anonymous "system" changes.
    actor = session.info.get("kinesis_actor")

    if actor_type == "system" and actor:
        actor_type = actor["actor_type"]
        actor_id = actor["actor_id"]
        actor_name = actor["actor_name"]
        cashier_id = cashier_id or actor["cashier_id"]

        if terminal_id is None:
            terminal_id = actor["terminal_id"]

    session.add(
        ActivityEvent(
            event_type=event_type,
            severity=severity,
            actor_type=actor_type,
            actor_id=str(actor_id) if actor_id is not None else None,
            actor_name=actor_name,
            cashier_id=str(cashier_id) if cashier_id is not None else None,
            terminal_id=terminal_id,
            summary=summary[:250],
            details=_json_value(details or {}),
        )
    )


def _record_sale(session: Session, sale):
    transaction_code = _get(
        sale,
        "transaction_code",
        default=f"Sale #{_get(sale, 'id', default='unknown')}",
    )

    cashier_id = _get(sale, "cashier_id")
    cashier_name = _get(
        sale,
        "cashier_display_name",
        "cashier_username",
        default="Cashier",
    )

    terminal_id = _get(sale, "terminal_id")
    payment_method = _get(sale, "payment_method")
    total = _get(sale, "total")
    sale_status = str(_get(sale, "status", default="completed")).lower()

    event_type = "sale.completed" if sale_status == "completed" else "sale.created"

    _record(
        session,
        event_type,
        f"Sale {transaction_code} completed",
        actor_type="cashier" if cashier_id else "system",
        actor_id=cashier_id,
        actor_name=cashier_name,
        cashier_id=cashier_id,
        terminal_id=terminal_id,
        details={
            "sale_id": _get(sale, "id"),
            "transaction_code": transaction_code,
            "payment_method": payment_method,
            "total": total,
            "status": sale_status,
        },
    )


def _record_product_change(session: Session, product, *, created=False, deleted=False):
    product_id = _get(product, "id")
    product_name = _get(product, "name", default="Unnamed product")
    sku = _get(product, "sku")

    if created:
        _record(
            session,
            "inventory.product_created",
            f"Product added: {product_name}",
            details={
                "product_id": product_id,
                "name": product_name,
                "sku": sku,
                "stock": _get(product, "stock"),
                "price": _get(product, "price"),
            },
        )
        return

    if deleted:
        _record(
            session,
            "inventory.product_deleted",
            f"Product deleted: {product_name}",
            severity="warning",
            details={
                "product_id": product_id,
                "name": product_name,
                "sku": sku,
            },
        )
        return

    changes = _changed_fields(
        product,
        ("name", "category", "price", "stock", "sku"),
    )

    if not changes:
        return

    if "stock" in changes:
        old_stock = changes["stock"]["from"]
        new_stock = changes["stock"]["to"]

        try:
            delta = int(new_stock) - int(old_stock)
        except (TypeError, ValueError):
            delta = None

        changes["stock"]["delta"] = delta

        _record(
            session,
            "inventory.stock_adjusted",
            f"Stock changed: {product_name}",
            severity=("warning" if new_stock == 0 else "info"),
            details={
                "product_id": product_id,
                "name": product_name,
                "sku": sku,
                "changes": changes,
            },
        )
        return

    _record(
        session,
        "inventory.product_updated",
        f"Product updated: {product_name}",
        details={
            "product_id": product_id,
            "name": product_name,
            "sku": sku,
            "changes": changes,
        },
    )


def _record_terminal_change(session: Session, terminal, *, created=False):
    terminal_id = _get(terminal, "id")
    device_id = _get(terminal, "device_id", default="Unknown device")
    label = f"Terminal {device_id}"

    if created:
        _record(
            session,
            "terminal.paired",
            f"{label} paired successfully",
            terminal_id=terminal_id,
            details={
                "device_id": device_id,
                "ip_address": _get(terminal, "ip_address"),
            },
        )
        return

    changes = _changed_fields(
        terminal,
        ("is_enabled", "maintenance_mode"),
    )

    if not changes:
        return

    if "is_enabled" in changes:
        enabled = changes["is_enabled"]["to"]

        _record(
            session,
            "terminal.enabled" if enabled else "terminal.disabled",
            f"{label} {'enabled' if enabled else 'disabled'}",
            severity="info" if enabled else "warning",
            terminal_id=terminal_id,
            details={
                "device_id": device_id,
                "changes": changes,
            },
        )

    if "maintenance_mode" in changes:
        maintenance = changes["maintenance_mode"]["to"]

        _record(
            session,
            (
                "terminal.maintenance_enabled"
                if maintenance
                else "terminal.maintenance_disabled"
            ),
            (
                f"{label} placed in maintenance"
                if maintenance
                else f"{label} removed from maintenance"
            ),
            terminal_id=terminal_id,
            details={
                "device_id": device_id,
                "changes": changes,
            },
        )


def _record_cashier_session(session: Session, cashier_session, *, created=False):
    cashier_id = _get(cashier_session, "cashier_id")
    terminal_id = _get(cashier_session, "terminal_id")

    if created:
        _record(
            session,
            "cashier.session_started",
            "Cashier session started",
            actor_type="cashier",
            actor_id=cashier_id,
            actor_name=_get(
                cashier_session,
                "cashier_display_name",
                "username",
                default="Cashier",
            ),
            cashier_id=cashier_id,
            terminal_id=terminal_id,
            details={
                "cashier_id": cashier_id,
                "terminal_id": terminal_id,
            },
        )
        return

    changes = _changed_fields(
        cashier_session,
        ("revoked_at",),
    )

    if "revoked_at" not in changes:
        return

    old_value = changes["revoked_at"]["from"]
    new_value = changes["revoked_at"]["to"]

    if old_value is not None or new_value is None:
        return

    _record(
        session,
        "cashier.session_ended",
        "Cashier session ended",
        actor_type="cashier",
        actor_id=cashier_id,
        actor_name=_get(
            cashier_session,
            "cashier_display_name",
            "username",
            default="Cashier",
        ),
        cashier_id=cashier_id,
        terminal_id=terminal_id,
        details={
            "cashier_id": cashier_id,
            "terminal_id": terminal_id,
        },
    )


def _record_cashier_change(session: Session, cashier, *, created=False):
    cashier_id = _get(cashier, "id")
    username = _get(cashier, "username", default="Cashier")
    display_name = _get(cashier, "display_name", default=username)

    if created:
        _record(
            session,
            "cashier.created",
            f"Cashier account created: {display_name}",
            details={
                "cashier_id": cashier_id,
                "username": username,
                "display_name": display_name,
            },
        )
        return

    changes = _changed_fields(
        cashier,
        ("is_active", "username", "display_name"),
    )

    if not changes:
        return

    if "is_active" in changes:
        active = changes["is_active"]["to"]

        _record(
            session,
            "cashier.enabled" if active else "cashier.disabled",
            f"Cashier account {'enabled' if active else 'disabled'}: {display_name}",
            severity="info" if active else "warning",
            details={
                "cashier_id": cashier_id,
                "username": username,
                "display_name": display_name,
                "changes": changes,
            },
        )
        return

    _record(
        session,
        "cashier.updated",
        f"Cashier account updated: {display_name}",
        details={
            "cashier_id": cashier_id,
            "username": username,
            "display_name": display_name,
            "changes": changes,
        },
    )


def _before_flush(
    session: Session,
    _flush_context,
    _instances,
):
    new_objects = list(session.new)
    dirty_objects = list(session.dirty)
    deleted_objects = list(session.deleted)

    new_sale_exists = any(obj.__class__.__name__ == "Sale" for obj in new_objects)

    for obj in new_objects:
        model_name = obj.__class__.__name__

        if model_name == "ActivityEvent":
            continue

        if model_name == "Sale":
            _record_sale(session, obj)

        elif model_name == "Product":
            _record_product_change(session, obj, created=True)

        elif model_name == "Terminal":
            _record_terminal_change(session, obj, created=True)

        elif model_name == "CashierSession":
            _record_cashier_session(session, obj, created=True)

        elif model_name == "Cashier":
            _record_cashier_change(session, obj, created=True)

        elif model_name == "Service":
            service_name = _get(obj, "name", default="Unnamed service")

            _record(
                session,
                "service.created",
                f"Service added: {service_name}",
                details={
                    "service_id": _get(obj, "id"),
                    "name": service_name,
                    "price": _get(obj, "price"),
                },
            )

        elif model_name == "TerminalCommand":
            _record(
                session,
                "terminal.command_queued",
                "A terminal command was queued",
                terminal_id=_get(obj, "terminal_id"),
                details={
                    "command_id": _get(obj, "id"),
                    "command_type": _get(
                        obj,
                        "command_type",
                        "type",
                        "command",
                    ),
                    "terminal_id": _get(obj, "terminal_id"),
                },
            )

        elif model_name == "TerminalPairingChallenge":
            _record(
                session,
                "terminal.pairing_created",
                "A terminal pairing challenge was created",
                details={
                    "challenge_id": _get(obj, "id"),
                    "expires_at": _get(obj, "expires_at"),
                },
            )

    for obj in dirty_objects:
        model_name = obj.__class__.__name__

        if model_name == "ActivityEvent":
            continue

        if model_name == "Product":
            # Checkout already produces a sale event. Avoid turning its
            # automatic stock deduction into a separate manual adjustment.
            if new_sale_exists:
                changed = _changed_fields(
                    obj,
                    ("name", "category", "price", "sku"),
                )

                if changed:
                    _record(
                        session,
                        "inventory.product_updated",
                        f"Product updated: {_get(obj, 'name', default='Product')}",
                        details={
                            "product_id": _get(obj, "id"),
                            "name": _get(obj, "name"),
                            "changes": changed,
                        },
                    )
            else:
                _record_product_change(session, obj)

        elif model_name == "Terminal":
            _record_terminal_change(session, obj)

        elif model_name == "CashierSession":
            _record_cashier_session(session, obj)

        elif model_name == "Cashier":
            _record_cashier_change(session, obj)

    for obj in deleted_objects:
        model_name = obj.__class__.__name__

        if model_name == "Product":
            _record_product_change(session, obj, deleted=True)


def install_activity_tracking():
    if not event.contains(Session, "before_flush", _before_flush):
        event.listen(
            Session,
            "before_flush",
            _before_flush,
        )
