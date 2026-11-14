"""
Service catalog: list, create, edit, archive, restore and delete.

POS terminals: any signed-in cashier can create a service; only a supervisor
can edit one or archive it (prices and what is on sale are supervisor
decisions). Administrators manage everything from /api/admin/services,
including restoring archived services and deleting ones never sold.

Rules that apply everywhere:
- Active service names are unique, ignoring case and extra spaces (enforced
  by a database index, so two simultaneous saves cannot both succeed).
- Archived services cannot be sold or edited, and are hidden from the POS,
  but stay on past sales and reports.
- A service that appears on any sale can never be deleted, only archived.
- Every change is recorded in the activity log with who made it and, for
  edits, the before and after values. Sold prices are copied onto each sale,
  so changing a price never alters history.
"""

import logging
import re
from datetime import datetime, timezone
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import case, func, or_, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from activity_tracking import _record
from admin_inventory_routes import require_admin_actor
from cashier_routes import (
    CashierPrincipal,
    require_supervisor_cashier,
    require_writable_cashier,
)
from database import get_db
from models import Sale, SaleServiceItem, Service
from terminal_routes import require_admin_or_terminal


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/services", tags=["Services"])
admin_router = APIRouter(prefix="/api/admin/services", tags=["Admin services"])

MAX_PRICE = Decimal("9999999.99")


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


class ServiceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=300)
    price: Decimal = Field(ge=0, le=MAX_PRICE, max_digits=10, decimal_places=2)
    estimated_cost: Decimal | None = Field(
        default=None, ge=0, le=MAX_PRICE, max_digits=12, decimal_places=4
    )

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        value = clean_text(value)

        if not value:
            raise ValueError("Service name cannot be blank.")

        return value

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str) -> str:
        return clean_text(value)


class ServiceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=300)
    price: Decimal | None = Field(default=None, ge=0, le=MAX_PRICE, max_digits=10, decimal_places=2)
    estimated_cost: Decimal | None = Field(
        default=None, ge=0, le=MAX_PRICE, max_digits=12, decimal_places=4
    )

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str | None) -> str | None:
        if value is None:
            return None

        value = clean_text(value)

        if not value:
            raise ValueError("Service name cannot be blank.")

        return value

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str | None) -> str | None:
        return clean_text(value) if value is not None else None


def service_response(service: Service) -> dict:
    return {
        "id": service.id,
        "name": service.name,
        "description": service.description,
        "price": float(service.price),
        "estimated_cost": (
            float(service.estimated_cost) if service.estimated_cost is not None else None
        ),
        "archived": service.archived_at is not None,
        "archived_at": service.archived_at.isoformat() if service.archived_at else None,
        "updated_at": service.updated_at.isoformat() if service.updated_at else None,
    }


def escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def lock_service(db: Session, service_id: int) -> Service:
    service = db.scalar(select(Service).where(Service.id == service_id).with_for_update())

    if service is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Service not found.")

    return service


def duplicate_name_error(name: str) -> HTTPException:
    return HTTPException(
        status.HTTP_409_CONFLICT,
        f"An active service named '{name}' already exists. Edit that one instead.",
    )


def ensure_name_free(db: Session, name: str, exclude_id: int | None = None) -> None:
    statement = select(Service.id).where(
        Service.archived_at.is_(None),
        func.lower(func.btrim(Service.name)) == name.lower(),
    )

    if exclude_id is not None:
        statement = statement.where(Service.id != exclude_id)

    if db.scalar(statement.limit(1)) is not None:
        raise duplicate_name_error(name)


def money(value) -> str | None:
    return None if value is None else str(Decimal(value).quantize(Decimal("0.01")))


def audit(db: Session, event: str, summary: str, details: dict, severity: str = "info") -> None:
    _record(db, event, summary[:250], severity=severity, details=details)


def commit(db: Session, message: str) -> None:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        # The partial unique index: another request took this name first.
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "An active service with that name already exists.",
        ) from exc
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception(message)
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, message) from exc


# --------------------------------------------------
# Operations shared by the POS and admin routes
# --------------------------------------------------


def create_service_record(db: Session, data: ServiceCreate) -> Service:
    ensure_name_free(db, data.name)

    service = Service(
        name=data.name,
        description=data.description,
        price=data.price,
        estimated_cost=data.estimated_cost,
    )
    db.add(service)

    # The activity log records the creation itself (activity_tracking); the
    # unique index turns a simultaneous duplicate into a 409 here.
    commit(db, "The service could not be saved.")
    db.refresh(service)

    return service


def update_service_record(db: Session, service_id: int, updates: dict) -> Service:
    if not updates:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Provide at least one field to update.")

    try:
        service = lock_service(db, service_id)

        if service.archived_at is not None:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"'{service.name}' is archived. Restore it before editing.",
            )

        if "name" in updates and updates["name"] is not None:
            ensure_name_free(db, updates["name"], exclude_id=service.id)

        if "price" in updates and updates["price"] is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "A price is required.")

        if "name" in updates and updates["name"] is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "A name is required.")

        if "description" in updates and updates["description"] is None:
            updates["description"] = ""

        changes = {}
        decimal_fields = ("price", "estimated_cost")

        def same(field, before, value) -> bool:
            if field in decimal_fields:
                if before is None or value is None:
                    return before is None and value is None
                return Decimal(before).quantize(Decimal("0.0001")) == Decimal(value).quantize(Decimal("0.0001"))
            return before == value

        for field, value in updates.items():
            before = getattr(service, field)

            if same(field, before, value):
                continue

            changes[field] = {
                "from": money(before) if field in decimal_fields else before,
                "to": money(value) if field in decimal_fields else value,
            }
            setattr(service, field, value)

        if not changes:
            result = service
            db.rollback()
            return result

        price_changed = "price" in changes
        audit(
            db,
            "service.updated",
            f"Service updated: {service.name}"
            + (f" (price {changes['price']['from']} to {changes['price']['to']})" if price_changed else ""),
            {"service_id": service.id, "changes": changes},
            severity="warning" if price_changed else "info",
        )
        commit(db, "The service could not be updated.")
        db.refresh(service)

        return service

    except HTTPException:
        db.rollback()
        raise


def archive_service_record(db: Session, service_id: int) -> tuple[Service, bool]:
    try:
        service = lock_service(db, service_id)

        if service.archived_at is not None:
            result = service
            db.rollback()
            return result, False

        service.archived_at = utc_now()
        audit(
            db,
            "service.archived",
            f"Service archived: {service.name}",
            {"service_id": service.id, "name": service.name},
            severity="warning",
        )
        commit(db, "The service could not be archived.")
        db.refresh(service)

        return service, True

    except HTTPException:
        db.rollback()
        raise


def restore_service_record(db: Session, service_id: int) -> Service:
    try:
        service = lock_service(db, service_id)

        if service.archived_at is None:
            result = service
            db.rollback()
            return result

        ensure_name_free(db, clean_text(service.name).lower(), exclude_id=service.id)

        service.archived_at = None
        audit(
            db,
            "service.restored",
            f"Service restored: {service.name}",
            {"service_id": service.id, "name": service.name},
        )
        commit(db, "The service could not be restored.")
        db.refresh(service)

        return service

    except HTTPException:
        db.rollback()
        raise


def service_has_sales(db: Session, service_id: int) -> bool:
    return (
        db.scalar(select(SaleServiceItem.id).where(SaleServiceItem.service_id == service_id).limit(1))
        is not None
    )


def delete_service_record(db: Session, service_id: int) -> None:
    try:
        service = lock_service(db, service_id)

        if service_has_sales(db, service_id):
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"'{service.name}' appears on past sales, so it cannot be deleted. "
                "Archive it instead; its history is kept.",
            )

        name = service.name
        db.delete(service)
        audit(db, "service.deleted", f"Service deleted: {name}", {"service_id": service_id, "name": name}, severity="warning")

        try:
            db.commit()
        except IntegrityError as exc:
            db.rollback()
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "This service was just sold, so it cannot be deleted. Archive it instead.",
            ) from exc

    except HTTPException:
        db.rollback()
        raise
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Could not delete service.")
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "The service could not be deleted.") from exc


# --------------------------------------------------
# POS routes
# --------------------------------------------------


@router.get("", summary="List and search active services")
def get_services(
    search: str | None = Query(default=None, max_length=150),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    _authorized: object = Depends(require_admin_or_terminal),
    db: Session = Depends(get_db),
):
    conditions = [Service.archived_at.is_(None)]

    if search and search.strip():
        pattern = f"%{escape_like(search.strip())}%"
        conditions.append(
            or_(
                Service.name.ilike(pattern, escape="\\"),
                Service.description.ilike(pattern, escape="\\"),
            )
        )

    total = db.scalar(select(func.count(Service.id)).where(*conditions)) or 0
    services = db.scalars(
        select(Service).where(*conditions).order_by(Service.name.asc(), Service.id.asc()).offset(offset).limit(limit)
    ).all()

    return {
        "items": [service_response(service) for service in services],
        "limit": limit,
        "offset": offset,
        "count": int(total),
    }


@router.post("", status_code=status.HTTP_201_CREATED, summary="Create a service")
def create_service(
    service_data: ServiceCreate,
    _cashier: CashierPrincipal = Depends(require_writable_cashier),
    db: Session = Depends(get_db),
):
    return service_response(create_service_record(db, service_data))


@router.put("/{service_id}", summary="Update a service (supervisor)")
def update_service(
    service_id: int,
    service_data: ServiceUpdate,
    _supervisor: CashierPrincipal = Depends(require_supervisor_cashier),
    db: Session = Depends(get_db),
):
    return service_response(
        update_service_record(db, service_id, service_data.model_dump(exclude_unset=True))
    )


@router.post("/{service_id}/archive", summary="Archive a service (supervisor)")
def archive_service(
    service_id: int,
    _supervisor: CashierPrincipal = Depends(require_supervisor_cashier),
    db: Session = Depends(get_db),
):
    service, changed = archive_service_record(db, service_id)

    return {
        "message": f"'{service.name}' was archived." if changed else "Service is already archived.",
        "service": service_response(service),
    }


# --------------------------------------------------
# Admin routes
# --------------------------------------------------

AdminSort = Literal["name", "price", "updated", "sold", "revenue"]


def sales_stats_subquery():
    """Units, revenue and last sale per service, completed sales only."""

    return (
        select(
            SaleServiceItem.service_id.label("service_id"),
            func.coalesce(func.sum(SaleServiceItem.quantity), 0).label("sold"),
            func.coalesce(func.sum(SaleServiceItem.line_total), 0).label("revenue"),
            func.max(Sale.created_at).label("last_sold_at"),
        )
        .join(Sale, Sale.id == SaleServiceItem.sale_id)
        .where(Sale.status == "completed", SaleServiceItem.service_id.is_not(None))
        .group_by(SaleServiceItem.service_id)
        .subquery()
    )


def admin_service_entry(service: Service, stats, has_sales: bool) -> dict:
    return {
        **service_response(service),
        "times_sold": int(stats.sold) if stats is not None else 0,
        "revenue": float(stats.revenue) if stats is not None else 0.0,
        "last_sold_at": stats.last_sold_at.isoformat() if stats is not None and stats.last_sold_at else None,
        "can_delete": not has_sales,
    }


@admin_router.get("", summary="List services with sales statistics")
def admin_list_services(
    search: str | None = Query(default=None, max_length=150),
    state: Literal["active", "archived", "all"] = Query(default="active"),
    sort: AdminSort = Query(default="name"),
    direction: Literal["asc", "desc"] = Query(default="asc"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _admin: object = Depends(require_admin_actor),
    db: Session = Depends(get_db),
):
    stats = sales_stats_subquery()
    conditions = []

    if state == "active":
        conditions.append(Service.archived_at.is_(None))
    elif state == "archived":
        conditions.append(Service.archived_at.is_not(None))

    if search and search.strip():
        pattern = f"%{escape_like(search.strip())}%"
        conditions.append(
            or_(Service.name.ilike(pattern, escape="\\"), Service.description.ilike(pattern, escape="\\"))
        )

    sort_columns = {
        "name": func.lower(Service.name),
        "price": Service.price,
        "updated": Service.updated_at,
        "sold": func.coalesce(stats.c.sold, 0),
        "revenue": func.coalesce(stats.c.revenue, 0),
    }
    column = sort_columns[sort]
    ordering = column.desc() if direction == "desc" else column.asc()

    total = db.scalar(select(func.count(Service.id)).where(*conditions)) or 0
    rows = db.execute(
        select(Service, stats)
        .outerjoin(stats, stats.c.service_id == Service.id)
        .where(*conditions)
        .order_by(ordering, Service.id.asc())
        .offset(offset)
        .limit(limit)
    ).all()

    ids = [row[0].id for row in rows]
    with_sales = set(
        db.scalars(select(SaleServiceItem.service_id).where(SaleServiceItem.service_id.in_(ids)).distinct()).all()
    ) if ids else set()

    return {
        "items": [admin_service_entry(row[0], row, row[0].id in with_sales) if row.sold is not None else admin_service_entry(row[0], None, row[0].id in with_sales) for row in rows],
        "count": int(total),
        "limit": limit,
        "offset": offset,
        "active_count": db.scalar(select(func.count(Service.id)).where(Service.archived_at.is_(None))) or 0,
        "archived_count": db.scalar(select(func.count(Service.id)).where(Service.archived_at.is_not(None))) or 0,
    }


@admin_router.post("", status_code=status.HTTP_201_CREATED, summary="Create a service")
def admin_create_service(
    service_data: ServiceCreate,
    _admin: object = Depends(require_admin_actor),
    db: Session = Depends(get_db),
):
    return service_response(create_service_record(db, service_data))


@admin_router.put("/{service_id}", summary="Edit a service")
def admin_update_service(
    service_id: int,
    service_data: ServiceUpdate,
    _admin: object = Depends(require_admin_actor),
    db: Session = Depends(get_db),
):
    return service_response(
        update_service_record(db, service_id, service_data.model_dump(exclude_unset=True))
    )


@admin_router.post("/{service_id}/archive", summary="Archive a service")
def admin_archive_service(
    service_id: int,
    _admin: object = Depends(require_admin_actor),
    db: Session = Depends(get_db),
):
    service, changed = archive_service_record(db, service_id)

    return {
        "message": f"'{service.name}' was archived." if changed else "Service is already archived.",
        "service": service_response(service),
    }


@admin_router.post("/{service_id}/restore", summary="Restore an archived service")
def admin_restore_service(
    service_id: int,
    _admin: object = Depends(require_admin_actor),
    db: Session = Depends(get_db),
):
    service = restore_service_record(db, service_id)

    return {"message": f"'{service.name}' was restored.", "service": service_response(service)}


@admin_router.delete("/{service_id}", summary="Delete a service that was never sold")
def admin_delete_service(
    service_id: int,
    _admin: object = Depends(require_admin_actor),
    db: Session = Depends(get_db),
):
    delete_service_record(db, service_id)

    return {"message": "Service deleted.", "id": service_id}
