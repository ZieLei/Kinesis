from decimal import Decimal
from pathlib import Path
from uuid import uuid4
import logging
import os

from fastapi import (
    Depends,
    FastAPI,
    File,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from database import get_db
from models import Product
from sales_routes import router as sales_router
from services_routes import router as services_router
from terminal_routes import router as terminal_router
from console_routes import router as console_router
from database_routes import router as database_router


logger = logging.getLogger(__name__)

MAX_IMAGE_SIZE = 5 * 1024 * 1024
IMAGE_DIRECTORY = Path(
    os.getenv("KINESIS_IMAGE_DIRECTORY", "uploads/products")
).resolve()

IMAGE_FORMATS = {
    b"\xff\xd8\xff": (".jpg", "image/jpeg"),
    b"\x89PNG\r\n\x1a\n": (".png", "image/png"),
    b"GIF87a": (".gif", "image/gif"),
    b"GIF89a": (".gif", "image/gif"),
    b"RIFF": (".webp", "image/webp"),
}

app = FastAPI(
    title="Kinesis API",
    version="1.3.0",
    description=(
        "Inventory, services, checkout, reporting, and terminal "
        "management API for the Kinesis point-of-sale system."
    ),
)

origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8081",
    "http://127.0.0.1:8081",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(sales_router)
app.include_router(services_router)
app.include_router(terminal_router)
app.include_router(console_router)
app.include_router(database_router)


# -------------------------
# Product request schemas
# -------------------------


class ProductCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    category: str = Field(min_length=1, max_length=100)
    price: Decimal = Field(gt=0, max_digits=10, decimal_places=2)
    stock: int = Field(ge=0)
    sku: str | None = Field(default=None, max_length=64)
    howMuchSold: int = Field(default=0, ge=0)

    @field_validator("name", "category")
    @classmethod
    def normalize_required_text(cls, value: str) -> str:
        value = value.strip()

        if not value:
            raise ValueError("This field cannot be blank.")

        return value

    @field_validator("sku")
    @classmethod
    def normalize_sku(cls, value: str | None) -> str | None:
        if value is None:
            return None

        return value.strip() or None


class ProductUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    category: str | None = Field(default=None, min_length=1, max_length=100)
    price: Decimal | None = Field(
        default=None,
        gt=0,
        max_digits=10,
        decimal_places=2,
    )
    stock: int | None = Field(default=None, ge=0)
    sku: str | None = Field(default=None, max_length=64)

    @field_validator("name", "category")
    @classmethod
    def normalize_required_text(cls, value: str | None) -> str | None:
        if value is None:
            return None

        value = value.strip()

        if not value:
            raise ValueError("This field cannot be blank.")

        return value

    @field_validator("sku")
    @classmethod
    def normalize_sku(cls, value: str | None) -> str | None:
        if value is None:
            return None

        return value.strip() or None


# -------------------------
# Product response helpers
# -------------------------


def product_response(product: Product) -> dict:
    return {
        "id": product.id,
        "sku": product.sku,
        "name": product.name,
        "category": product.category,
        "price": product.price,
        "stock": product.stock,
        "howMuchSold": product.how_much_sold,
        "image_path": product.image_path,
        "image_url": (
            f"/api/products/{product.id}/image" if product.image_path else None
        ),
    }


def commit_or_raise_sku_conflict(db: Session) -> None:
    try:
        db.commit()

    except IntegrityError as exc:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That SKU is already assigned to another product.",
        ) from exc

    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Database commit failed")

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The database operation failed.",
        ) from exc


def resolve_image_path(relative_path: str) -> Path:
    """Resolve a stored relative image path without allowing path traversal."""
    root = IMAGE_DIRECTORY.resolve()
    candidate = (root / relative_path).resolve()

    if not candidate.is_relative_to(root):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The stored image path is invalid.",
        )

    return candidate


def detect_image(data: bytes) -> tuple[str, str] | None:
    """Return the extension and media type for a supported image signature."""
    for signature, result in IMAGE_FORMATS.items():
        if data.startswith(signature):
            extension, media_type = result

            if signature == b"RIFF":
                if len(data) < 12 or data[8:12] != b"WEBP":
                    continue

            return extension, media_type

    return None


async def read_validated_image(file: UploadFile) -> tuple[bytes, str, str]:
    """Read a bounded upload and validate its actual file signature."""
    data = await file.read(MAX_IMAGE_SIZE + 1)

    if not data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded image is empty.",
        )

    if len(data) > MAX_IMAGE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail="Image must be 5 MiB or smaller.",
        )

    detected = detect_image(data)

    if detected is None:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only JPEG, PNG, GIF, and WebP images are supported.",
        )

    extension, media_type = detected
    return data, extension, media_type


# -------------------------
# Health check
# -------------------------


@app.get("/api/health", tags=["Health"])
def health_check():
    return {
        "status": "online",
        "message": "Kinesis FastAPI Backend is running!",
    }


# -------------------------
# List, search, and filter products
# -------------------------


@app.get("/api/products", tags=["Products"])
def get_products(
    search: str | None = Query(default=None, max_length=150),
    category: str | None = Query(default=None, max_length=100),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    statement = select(Product)

    if search and search.strip():
        term = (
            search.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        )
        pattern = f"%{term}%"

        statement = statement.where(
            or_(
                Product.name.ilike(pattern, escape="\\"),
                Product.sku.ilike(pattern, escape="\\"),
            )
        )

    if category and category.strip():
        statement = statement.where(Product.category.ilike(category.strip()))

    statement = statement.order_by(Product.id).offset(offset).limit(limit)
    products = db.scalars(statement).all()

    return {
        "items": [product_response(product) for product in products],
        "limit": limit,
        "offset": offset,
        "count": len(products),
    }


# -------------------------
# Get one product
# -------------------------


@app.get("/api/products/{product_id}", tags=["Products"])
def get_product(product_id: int, db: Session = Depends(get_db)):
    product = db.get(Product, product_id)

    if product is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found.",
        )

    return product_response(product)


# -------------------------
# Create product
# -------------------------


@app.post(
    "/api/products",
    status_code=status.HTTP_201_CREATED,
    tags=["Products"],
)
def create_product(product_data: ProductCreate, db: Session = Depends(get_db)):
    product = Product(
        name=product_data.name,
        category=product_data.category,
        price=product_data.price,
        stock=product_data.stock,
        sku=product_data.sku,
        how_much_sold=product_data.howMuchSold,
    )

    db.add(product)
    commit_or_raise_sku_conflict(db)

    try:
        db.refresh(product)

    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Could not refresh created product")

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Product was saved, but its latest data could not be loaded.",
        ) from exc

    return product_response(product)


# -------------------------
# Update product
# -------------------------


@app.put("/api/products/{product_id}", tags=["Products"])
def update_product(
    product_id: int,
    product_data: ProductUpdate,
    db: Session = Depends(get_db),
):
    product = db.get(Product, product_id)

    if product is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found.",
        )

    updates = product_data.model_dump(exclude_unset=True)

    if not updates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide at least one field to update.",
        )

    for field, value in updates.items():
        setattr(product, field, value)

    commit_or_raise_sku_conflict(db)

    try:
        db.refresh(product)

    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Could not refresh updated product")

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Product was updated, but its latest data could not be loaded.",
        ) from exc

    return product_response(product)


# -------------------------
# Upload or replace product image
# -------------------------


@app.post("/api/products/{product_id}/image", tags=["Product images"])
async def upload_product_image(
    product_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    product = db.get(Product, product_id)

    if product is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found.",
        )

    data, extension, _media_type = await read_validated_image(file)

    new_filename = f"{uuid4().hex}{extension}"
    new_path = IMAGE_DIRECTORY / new_filename
    relative_path = new_filename

    try:
        IMAGE_DIRECTORY.mkdir(parents=True, exist_ok=True)

        with new_path.open("xb") as image_file:
            image_file.write(data)

    except OSError as exc:
        logger.exception("Could not store uploaded product image")

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The image could not be stored.",
        ) from exc

    finally:
        await file.close()

    old_relative_path = product.image_path
    product.image_path = relative_path

    try:
        db.commit()
        db.refresh(product)

    except IntegrityError as exc:
        db.rollback()
        new_path.unlink(missing_ok=True)

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The image could not be associated with the product.",
        ) from exc

    except SQLAlchemyError as exc:
        db.rollback()
        new_path.unlink(missing_ok=True)
        logger.exception("Could not save product image path")

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The image path could not be saved.",
        ) from exc

    if old_relative_path and old_relative_path != relative_path:
        try:
            resolve_image_path(old_relative_path).unlink(missing_ok=True)

        except OSError:
            logger.exception("Old product image could not be removed")

    return product_response(product)


# -------------------------
# Retrieve product image
# -------------------------


@app.get("/api/products/{product_id}/image", tags=["Product images"])
def get_product_image(product_id: int, db: Session = Depends(get_db)):
    product = db.get(Product, product_id)

    if product is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found.",
        )

    if not product.image_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This product has no image.",
        )

    image_path = resolve_image_path(product.image_path)

    if not image_path.is_file():
        logger.error("Image file is missing for product ID %s", product_id)

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="The product image file is missing.",
        )

    media_type = detect_image(image_path.read_bytes())

    if media_type is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The stored product image is invalid.",
        )

    _, content_type = media_type

    return FileResponse(
        path=image_path,
        media_type=content_type,
        headers={"Cache-Control": "no-cache"},
    )


# -------------------------
# Delete product image
# -------------------------


@app.delete("/api/products/{product_id}/image", tags=["Product images"])
def delete_product_image(product_id: int, db: Session = Depends(get_db)):
    product = db.get(Product, product_id)

    if product is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found.",
        )

    old_relative_path = product.image_path

    if not old_relative_path:
        return {"message": "Product has no image.", "id": product_id}

    product.image_path = None

    try:
        db.commit()

    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Could not remove product image reference")

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The product image could not be removed.",
        ) from exc

    try:
        resolve_image_path(old_relative_path).unlink(missing_ok=True)

    except OSError:
        logger.exception("Unreferenced product image could not be removed")

    return {
        "message": "Product image deleted successfully.",
        "id": product_id,
    }


# -------------------------
# Delete product
# -------------------------


@app.delete("/api/products/{product_id}", tags=["Products"])
def delete_product(product_id: int, db: Session = Depends(get_db)):
    product = db.get(Product, product_id)

    if product is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found.",
        )

    image_path = product.image_path

    try:
        db.delete(product)
        db.commit()

    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Could not delete product")

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The product could not be deleted.",
        ) from exc

    if image_path:
        try:
            resolve_image_path(image_path).unlink(missing_ok=True)

        except OSError:
            logger.exception(
                "Product %s was deleted but its image file remains",
                product_id,
            )

    return {
        "message": "Product deleted successfully.",
        "id": product_id,
    }
