import logging
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, or_, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from database import get_db
from models import Service


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/services", tags=["Services"])


class ServiceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=300)
    price: Decimal = Field(
        ge=0,
        max_digits=10,
        decimal_places=2,
    )

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        value = value.strip()

        if not value:
            raise ValueError("Service name cannot be blank.")

        return value

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str) -> str:
        return value.strip()


def service_response(service: Service) -> dict:
    return {
        "id": service.id,
        "name": service.name,
        "description": service.description,
        "price": float(service.price),
    }


@router.get("", summary="List and search services")
def get_services(
    search: str | None = Query(default=None, max_length=150),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    conditions = []

    if search and search.strip():
        term = (
            search.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        )
        pattern = f"%{term}%"

        conditions.append(
            or_(
                Service.name.ilike(pattern, escape="\\"),
                Service.description.ilike(pattern, escape="\\"),
            )
        )

    total = db.scalar(select(func.count(Service.id)).where(*conditions)) or 0

    services = db.scalars(
        select(Service)
        .where(*conditions)
        .order_by(Service.name.asc(), Service.id.asc())
        .offset(offset)
        .limit(limit)
    ).all()

    return {
        "items": [service_response(service) for service in services],
        "limit": limit,
        "offset": offset,
        "count": int(total),
    }


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    summary="Create a service",
)
def create_service(
    service_data: ServiceCreate,
    db: Session = Depends(get_db),
):
    service = Service(
        name=service_data.name,
        description=service_data.description,
        price=service_data.price,
    )

    try:
        db.add(service)
        db.commit()
        db.refresh(service)
        return service_response(service)

    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Could not create service")

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The service could not be saved.",
        ) from exc
