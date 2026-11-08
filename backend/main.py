from contextlib import asynccontextmanager
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from uuid import uuid4
import logging

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
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import exists, or_, select, text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from database import get_db
from models import (
    InventoryReceiptItem,
    Product,
    SaleItem,
    StockAdjustment,
    StockoutPeriod,
)
from sales_routes import router as sales_router
from services_routes import router as services_router
from inventory_routes import (
    InventoryReceiptCreate,
    ReceiptItemInput,
    router as inventory_router,
    save_inventory_receipt,
)
from analytics_routes import router as analytics_router
from terminal_routes import (
    require_admin_or_terminal,
    require_admin_token,
    router as terminal_router,
)
from terminal_pairing_routes import router as terminal_pairing_router
from console_routes import router as console_router
from database_routes import router as database_router
from settings_routes import router as settings_router
from sku_generator import generate_product_sku
from logging_config import initialize_application_logging
from config_paths import path_settings, resolve_data_path
from auth.integration import install_admin_authentication
from auth.config import auth_settings
from cashier_routes import require_writable_cashier, router as cashier_router
from activity_tracking import install_activity_tracking
from inventory_tracking import install_inventory_tracking
from overview_routes import router as overview_router
from admin_inventory_routes import (
    require_admin_actor,
    router as admin_inventory_router,
)


logger = logging.getLogger(__name__)

MAX_IMAGE_SIZE = 5 * 1024 * 1024
COST_QUANTUM = Decimal("0.0001")

IMAGE_DIRECTORY = resolve_data_path(
    path_settings.image_directory,
    "uploads/products",
)

IMAGE_FORMATS = {
    b"\xff\xd8\xff": (".jpg", "image/jpeg"),
    b"\x89PNG\r\n\x1a\n": (".png", "image/png"),
    b"GIF87a": (".gif", "image/gif"),
    b"GIF89a": (".gif", "image/gif"),
    b"RIFF": (".webp", "image/webp"),
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    initialize_application_logging()
    install_activity_tracking()
    install_inventory_tracking()
    yield


app = FastAPI(
    title="Kinesis API",
    version="1.4.2",
    description=(
        "Inventory, services, checkout, reporting, settings, and terminal "
        "management API for the Kinesis point-of-sale system."
    ),
    lifespan=lifespan,
)


# --------------------------------------------------
# CORS
# --------------------------------------------------


# In production the reverse proxy serves each web application from the same
# origin as its API, so CORS is only exercised by development servers
# (Vite admin on :5173, Expo web on :8081). Both lists are explicit.
origins = set(auth_settings.allowed_origins) | set(auth_settings.pos_origins)

app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(origins),
    allow_credentials=True,
    allow_methods=[
        "GET",
        "POST",
        "PUT",
        "PATCH",
        "DELETE",
        "OPTIONS",
    ],
    allow_headers=[
        "Accept",
        "Authorization",
        "Content-Type",
        "X-CSRF-Token",
        "X-Cashier-Session",
        "X-Kinesis-Client",
    ],
)


@app.middleware("http")
async def baseline_security_headers(request, call_next):
    """
    Defence in depth for API responses. The reverse proxy sets the full
    browser policy (CSP, HSTS, Permissions-Policy) for the web applications.
    """

    response = await call_next(request)

    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")

    return response

install_admin_authentication(app)


# --------------------------------------------------
# Application routers
# --------------------------------------------------


app.include_router(sales_router)
app.include_router(services_router)
app.include_router(inventory_router)
app.include_router(analytics_router)
app.include_router(terminal_router)
app.include_router(terminal_pairing_router)
app.include_router(console_router)
app.include_router(database_router)
app.include_router(settings_router)
app.include_router(cashier_router)
app.include_router(overview_router)
app.include_router(admin_inventory_router)


# --------------------------------------------------
# Product request schemas
# --------------------------------------------------


class ProductCatalogFields(BaseModel):
    """Catalog fields and rules shared by POS and admin product creation."""

    name: str = Field(min_length=1, max_length=150)
    category: str = Field(min_length=1, max_length=100)
    price: Decimal = Field(gt=0, max_digits=10, decimal_places=2)
    sku: str | None = Field(default=None, max_length=64)

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


class ProductCreate(ProductCatalogFields):
    stock: int = Field(ge=0)
    howMuchSold: int = Field(default=0, ge=0)

    # Optional acquisition cost for the initial stock quantity.
    # Products can still be created with an unknown cost.
    initial_unit_cost: Decimal | None = Field(
        default=None,
        ge=0,
        max_digits=12,
        decimal_places=4,
    )


class AdminProductCreate(ProductCatalogFields):
    # Opening stock is recorded as an inventory receipt, never set silently.
    initial_stock: int = Field(default=0, ge=0, le=100000)
    initial_unit_cost: Decimal | None = Field(
        default=None,
        ge=0,
        max_digits=12,
        decimal_places=4,
    )
    note: str | None = Field(default=None, max_length=500)

    @field_validator("note")
    @classmethod
    def normalize_note(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip() or None

    @model_validator(mode="after")
    def require_cost_for_opening_stock(self):
        # Same rule as receiving stock: every received unit has a cost, so
        # inventory valuation and average cost stay consistent.
        if self.initial_stock > 0 and self.initial_unit_cost is None:
            raise ValueError("Enter the unit cost of the opening stock.")

        return self


class ProductUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    category: str | None = Field(default=None, min_length=1, max_length=100)
    price: Decimal | None = Field(
        default=None,
        gt=0,
        max_digits=10,
        decimal_places=2,
    )
    sku: str | None = Field(default=None, max_length=64)

    # Stock and average_cost are intentionally not editable here.
    # Use inventory receipts for stock increases and cost updates.

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


class AdminProductUpdate(ProductUpdate):
    """
    ProductUpdate's rules, but a field that is sent must have a value:
    administrators can change a SKU but never clear one, and an explicit
    null never reaches the database as a missing name or price.
    """

    @model_validator(mode="after")
    def reject_clearing(self):
        if not self.model_fields_set:
            raise ValueError("Provide at least one field to change.")

        for field in ("name", "category", "price"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"The product {field} cannot be empty.")

        if "sku" in self.model_fields_set and self.sku is None:
            raise ValueError("A product's SKU can be changed but not removed.")

        return self


# --------------------------------------------------
# Product response helpers
# --------------------------------------------------


def product_response(product: Product) -> dict:
    return {
        "id": product.id,
        "sku": product.sku,
        "name": product.name,
        "category": product.category,
        "price": product.price,
        "stock": product.stock,
        "howMuchSold": product.how_much_sold,
        "average_cost": (
            float(product.average_cost) if product.average_cost is not None else None
        ),
        "image_path": product.image_path,
        "image_url": (
            f"/api/products/{product.id}/image" if product.image_path else None
        ),
        "archived": product.archived_at is not None,
        "archived_at": product.archived_at,
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
        logger.exception("Database commit failed.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The database operation failed.",
        ) from exc


def resolve_image_path(relative_path: str) -> Path:
    root = IMAGE_DIRECTORY.resolve()
    candidate = (root / relative_path).resolve()

    if not candidate.is_relative_to(root):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The stored image path is invalid.",
        )

    return candidate


def detect_image(data: bytes) -> tuple[str, str] | None:
    for signature, result in IMAGE_FORMATS.items():
        if data.startswith(signature):
            extension, media_type = result

            if signature == b"RIFF":
                if len(data) < 12 or data[8:12] != b"WEBP":
                    continue

            return extension, media_type

    return None


async def read_validated_image(
    file: UploadFile,
) -> tuple[bytes, str, str]:
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


# --------------------------------------------------
# Health check
# --------------------------------------------------


@app.get("/api/health", tags=["Health"])
def health_check(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))

    except SQLAlchemyError as exc:
        logger.exception("Health check failed: database unavailable.")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Kinesis database is unavailable.",
        ) from exc

    return {
        "status": "online",
        "database": "online",
        "message": "Kinesis API and database are operational.",
    }


# --------------------------------------------------
# List, search, and filter products
# --------------------------------------------------


@app.get("/api/products", tags=["Products"])
def get_products(
    search: str | None = Query(default=None, max_length=150),
    category: str | None = Query(default=None, max_length=100),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    include_archived: bool = Query(default=False),
    _authorized: object = Depends(require_admin_or_terminal),
    db: Session = Depends(get_db),
):
    statement = select(Product)

    # Archived products used to be hard-deleted, so existing clients expect
    # them to disappear from the catalog.
    if not include_archived:
        statement = statement.where(Product.archived_at.is_(None))

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


# --------------------------------------------------
# Get one product
# --------------------------------------------------


@app.get("/api/products/{product_id}", tags=["Products"])
def get_product(
    product_id: int,
    _authorized: object = Depends(require_admin_or_terminal),
    db: Session = Depends(get_db),
):
    product = db.get(Product, product_id)

    if product is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found.",
        )

    return product_response(product)


# --------------------------------------------------
# Create product
# --------------------------------------------------


@app.post(
    "/api/products",
    status_code=status.HTTP_201_CREATED,
    tags=["Products"],
)
def create_product(
    product_data: ProductCreate,
    _cashier: object = Depends(require_writable_cashier),
    db: Session = Depends(get_db),
):
    product_sku = (
        product_data.sku if product_data.sku is not None else generate_product_sku(db)
    )

    initial_cost = None

    if product_data.stock > 0 and product_data.initial_unit_cost is not None:
        initial_cost = Decimal(product_data.initial_unit_cost).quantize(COST_QUANTUM)

    product = Product(
        name=product_data.name,
        category=product_data.category,
        price=product_data.price,
        stock=product_data.stock,
        sku=product_sku,
        how_much_sold=product_data.howMuchSold,
        average_cost=initial_cost,
    )

    db.add(product)
    commit_or_raise_sku_conflict(db)

    try:
        db.refresh(product)

    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Could not refresh created product.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Product was saved, but its latest data could not be loaded.",
        ) from exc

    return product_response(product)


# --------------------------------------------------
# Update product
# --------------------------------------------------


@app.put("/api/products/{product_id}", tags=["Products"])
def update_product(
    product_id: int,
    product_data: ProductUpdate,
    _cashier: object = Depends(require_writable_cashier),
    db: Session = Depends(get_db),
):
    return apply_product_update(
        db, product_id, product_data.model_dump(exclude_unset=True)
    )


def apply_product_update(
    db: Session,
    product_id: int,
    updates: dict,
    *,
    reject_archived: bool = False,
) -> dict:
    """
    Update catalog fields (name, category, price, SKU) of one product.

    Shared by the POS and admin routes. The schemas only allow catalog
    fields, so stock, average cost and sale-line snapshots never change.
    """

    product = db.scalar(
        select(Product).where(Product.id == product_id).with_for_update()
    )

    if product is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found.",
        )

    if reject_archived and product.archived_at is not None:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"'{product.name}' is archived. Restore it before editing.",
        )

    if not updates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide at least one editable field to update.",
        )

    for field, value in updates.items():
        setattr(product, field, value)

    commit_or_raise_sku_conflict(db)

    try:
        db.refresh(product)

    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Could not refresh updated product.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Product was updated, but its latest data could not be loaded.",
        ) from exc

    return product_response(product)


# --------------------------------------------------
# Upload or replace product image
# --------------------------------------------------


@app.post(
    "/api/products/{product_id}/image",
    tags=["Product images"],
)
async def upload_product_image(
    product_id: int,
    file: UploadFile = File(...),
    _cashier: object = Depends(require_writable_cashier),
    db: Session = Depends(get_db),
):
    return await store_product_image(db, product_id, file)


async def store_product_image(
    db: Session,
    product_id: int,
    file: UploadFile,
    *,
    reject_archived: bool = False,
) -> dict:
    """
    Validate, store and attach an image, then remove the replaced file.
    Shared by the POS and admin routes.
    """

    product = db.get(Product, product_id)

    if product is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found.",
        )

    if reject_archived and product.archived_at is not None:
        await file.close()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"'{product.name}' is archived. Restore it before editing.",
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
        logger.exception("Could not store uploaded product image.")
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
        logger.exception("Could not save product image path.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The image path could not be saved.",
        ) from exc

    if old_relative_path and old_relative_path != relative_path:
        try:
            resolve_image_path(old_relative_path).unlink(missing_ok=True)
        except OSError:
            logger.exception("Old product image could not be removed.")

    return product_response(product)


# --------------------------------------------------
# Retrieve product image
# --------------------------------------------------


@app.get(
    "/api/products/{product_id}/image",
    tags=["Product images"],
)
def get_product_image(
    product_id: int,
    _authorized: object = Depends(require_admin_or_terminal),
    db: Session = Depends(get_db),
):
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
        logger.error(
            "Image file is missing for product ID %s",
            product_id,
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="The product image file is missing.",
        )

    detected = detect_image(image_path.read_bytes())

    if detected is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The stored product image is invalid.",
        )

    _, content_type = detected

    return FileResponse(
        path=image_path,
        media_type=content_type,
        headers={"Cache-Control": "no-cache"},
    )


# --------------------------------------------------
# Delete product image
# --------------------------------------------------


@app.delete(
    "/api/products/{product_id}/image",
    tags=["Product images"],
)
def delete_product_image(
    product_id: int,
    _cashier: object = Depends(require_writable_cashier),
    db: Session = Depends(get_db),
):
    return remove_product_image(db, product_id)


def remove_product_image(
    db: Session,
    product_id: int,
    *,
    reject_archived: bool = False,
) -> dict:
    """Detach a product's image and delete its file. Shared by POS and admin."""

    product = db.get(Product, product_id)

    if product is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found.",
        )

    if reject_archived and product.archived_at is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"'{product.name}' is archived. Restore it before editing.",
        )

    old_relative_path = product.image_path

    if not old_relative_path:
        return {
            "message": "Product has no image.",
            "id": product_id,
        }

    product.image_path = None

    try:
        db.commit()

    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Could not remove product image reference.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The product image could not be removed.",
        ) from exc

    try:
        resolve_image_path(old_relative_path).unlink(missing_ok=True)
    except OSError:
        logger.exception("Unreferenced product image could not be removed.")

    return {
        "message": "Product image deleted successfully.",
        "id": product_id,
    }


# --------------------------------------------------
# Delete product
# --------------------------------------------------


def product_has_history(db: Session, product_id: int) -> bool:
    """
    True when sales, receipts, stock adjustments or stockout records
    reference the product.
    """

    return bool(
        db.scalar(
            select(
                exists().where(SaleItem.product_id == product_id)
                | exists().where(InventoryReceiptItem.product_id == product_id)
                | exists().where(StockAdjustment.product_id == product_id)
                | exists().where(StockoutPeriod.product_id == product_id)
            )
        )
    )


def lock_product(db: Session, product_id: int) -> Product:
    # Checkout and inventory receipts lock product rows too, so archiving
    # and deleting are serialized with sales and restocking.
    product = db.scalar(
        select(Product).where(Product.id == product_id).with_for_update()
    )

    if product is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found.",
        )

    return product


def archive_response(product: Product, message: str) -> dict:
    # "message" and "id" are the fields existing clients read.
    return {
        "message": message,
        "id": product.id,
        "archived": True,
        "deleted": False,
        "product": product_response(product),
    }


def archive_locked_product(db: Session, product: Product) -> dict:
    # Stock, cost, SKU and image are deliberately left untouched.
    product.archived_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(product)

    return archive_response(product, "Product archived successfully.")


@app.delete(
    "/api/products/{product_id}",
    tags=["Products"],
)
def delete_product(
    product_id: int,
    _cashier: object = Depends(require_writable_cashier),
    db: Session = Depends(get_db),
):
    return archive_or_delete_product(db, product_id)


def archive_or_delete_product(db: Session, product_id: int) -> dict:
    """
    Archive a product with history; permanently delete one without.
    Shared by the POS and admin routes.

    Products referenced by sales, inventory receipts or stockout records
    are archived so historical reports keep them. The database enforces
    the same rule (ON DELETE RESTRICT) as a backstop.
    """

    try:
        product = lock_product(db, product_id)

        if product.archived_at is not None:
            result = archive_response(product, "Product is already archived.")
            db.rollback()
            return result

        if product_has_history(db, product_id):
            return archive_locked_product(db, product)

        image_path = product.image_path

        try:
            db.delete(product)
            db.commit()

        except IntegrityError:
            # History appeared despite the check (e.g. a writer that does not
            # lock the product row). Archive instead; nothing is lost.
            db.rollback()
            logger.warning(
                "Product %s gained history during deletion; archiving it.",
                product_id,
            )
            return archive_locked_product(db, lock_product(db, product_id))

    except HTTPException:
        db.rollback()
        raise

    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Could not delete or archive product.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The product could not be deleted.",
        ) from exc

    if image_path:
        try:
            resolve_image_path(image_path).unlink(missing_ok=True)
        except OSError:
            logger.exception(
                "Product %s was deleted but its image file remains.",
                product_id,
            )

    return {
        "message": "Product deleted successfully.",
        "id": product_id,
        "archived": False,
        "deleted": True,
    }


# --------------------------------------------------
# Create a product (administrators only)
# --------------------------------------------------


@app.post(
    "/api/admin/products",
    status_code=status.HTTP_201_CREATED,
    tags=["Products"],
)
def admin_create_product(
    product_data: AdminProductCreate,
    _admin: object = Depends(require_admin_actor),
    db: Session = Depends(get_db),
):
    """
    Create a catalog entry with zero stock and, if opening stock is given,
    receive it through the normal inventory receipt in the same transaction.
    The product and its opening receipt are saved together or not at all.
    """

    try:
        if product_data.sku is not None and db.scalar(
            select(Product.id).where(Product.sku == product_data.sku)
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"SKU {product_data.sku} is already assigned to another product.",
            )

        product = Product(
            name=product_data.name,
            category=product_data.category,
            price=product_data.price,
            stock=0,
            sku=(
                product_data.sku
                if product_data.sku is not None
                else generate_product_sku(db)
            ),
            how_much_sold=0,
            average_cost=None,
        )

        db.add(product)

        try:
            db.flush()
        except IntegrityError as exc:
            # Unique SKU constraint: a concurrent request took it first.
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="That SKU is already assigned to another product.",
            ) from exc

        product_id = product.id

        if product_data.initial_stock > 0:
            # Commits the product together with its opening receipt.
            save_inventory_receipt(
                db,
                InventoryReceiptCreate(
                    notes=product_data.note or "Opening stock",
                    items=[
                        ReceiptItemInput(
                            product_id=product_id,
                            quantity=product_data.initial_stock,
                            unit_cost=product_data.initial_unit_cost,
                        )
                    ],
                ),
                expected_stock={product_id: 0},
            )
        else:
            commit_or_raise_sku_conflict(db)

    except HTTPException:
        db.rollback()
        raise

    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Could not create product.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The product could not be created.",
        ) from exc

    return product_response(db.get(Product, product_id))


# --------------------------------------------------
# Edit, image and archive (administrators only)
# --------------------------------------------------
# Thin wrappers over the same helpers the POS routes use. Archived
# products are read-only here until restored.


@app.put("/api/admin/products/{product_id}", tags=["Products"])
def admin_update_product(
    product_id: int,
    product_data: AdminProductUpdate,
    _admin: object = Depends(require_admin_actor),
    db: Session = Depends(get_db),
):
    return apply_product_update(
        db,
        product_id,
        product_data.model_dump(exclude_unset=True),
        reject_archived=True,
    )


@app.post("/api/admin/products/{product_id}/image", tags=["Product images"])
async def admin_upload_product_image(
    product_id: int,
    file: UploadFile = File(...),
    _admin: object = Depends(require_admin_actor),
    db: Session = Depends(get_db),
):
    return await store_product_image(db, product_id, file, reject_archived=True)


@app.delete("/api/admin/products/{product_id}/image", tags=["Product images"])
def admin_delete_product_image(
    product_id: int,
    _admin: object = Depends(require_admin_actor),
    db: Session = Depends(get_db),
):
    return remove_product_image(db, product_id, reject_archived=True)


@app.delete("/api/admin/products/{product_id}", tags=["Products"])
def admin_archive_or_delete_product(
    product_id: int,
    _admin: object = Depends(require_admin_actor),
    db: Session = Depends(get_db),
):
    return archive_or_delete_product(db, product_id)


# --------------------------------------------------
# Restore an archived product (administrators only)
# --------------------------------------------------


@app.post(
    "/api/admin/products/{product_id}/restore",
    tags=["Products"],
)
def restore_product(
    product_id: int,
    admin: object = Depends(require_admin_token),
    db: Session = Depends(get_db),
):
    # Attribute the activity event to the administrator
    # (see activity_tracking._record).
    db.info["kinesis_actor"] = {
        "actor_type": "admin",
        "actor_id": str(getattr(admin, "id", "")) or None,
        "actor_name": getattr(admin, "username", None),
        "cashier_id": None,
        "terminal_id": None,
    }

    try:
        product = lock_product(db, product_id)

        if product.archived_at is None:
            result = product_response(product)
            db.rollback()
            return result

        # The SKU stays reserved while archived (uq_products_sku), so this
        # should never match; checked explicitly so a conflict is a clear 409.
        if product.sku is not None:
            conflict = db.scalar(
                select(Product.id).where(
                    Product.id != product.id,
                    Product.sku == product.sku,
                )
            )

            if conflict is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        f"SKU {product.sku} is used by product {conflict}. "
                        "Change one of the SKUs before restoring."
                    ),
                )

        # Stock is untouched: the product returns with its prior quantity.
        product.archived_at = None
        commit_or_raise_sku_conflict(db)
        db.refresh(product)

    except HTTPException:
        db.rollback()
        raise

    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Could not restore product.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The product could not be restored.",
        ) from exc

    return product_response(product)
