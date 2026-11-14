import logging
import re
from datetime import datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit
from uuid import uuid4

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from pydantic import (
    AliasChoices,
    BaseModel,
    ConfigDict,
    Field,
    StrictBool,
    field_validator,
)
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from database import get_db
from logging_config import apply_application_log_level
from models import AppSettings
from settings_realtime import (
    broadcast_settings_updated,
    router as settings_realtime_router,
)
from config_paths import path_settings, resolve_data_path
from terminal_routes import require_admin_token, require_terminal


logger = logging.getLogger(__name__)

router = APIRouter(tags=["Settings"])

MAX_GCASH_QR_SIZE = 5 * 1024 * 1024

GCASH_QR_DIRECTORY = resolve_data_path(
    path_settings.gcash_qr_directory,
    "uploads/gcash",
)

GCASH_QR_FORMATS = {
    b"\xff\xd8\xff": (".jpg", "image/jpeg"),
    b"\x89PNG\r\n\x1a\n": (".png", "image/png"),
}


# --------------------------------------------------
# Settings schema
# --------------------------------------------------


GCASH_BACKUP_LIMIT = 5

GCASH_QR_FILENAME = re.compile(r"[a-f0-9]{32}\.(?:jpg|png)")


def normalize_gcash_number(value: str) -> str:
    """
    Canonical Philippine mobile number: 09XXXXXXXXX.

    Accepts spaces, dashes and the +63 / 63 prefixes; an empty string means
    "no number set".
    """

    digits = re.sub(r"[\s\-().]", "", value)

    if not digits:
        return ""

    if digits.startswith("+63"):
        digits = "0" + digits[3:]
    elif digits.startswith("63") and len(digits) == 12:
        digits = "0" + digits[2:]

    if not re.fullmatch(r"09[0-9]{9}", digits):
        raise ValueError(
            "Enter an 11-digit mobile number that starts with 09 "
            "(for example 0917 123 4567)."
        )

    return digits


class GCashAccount(BaseModel):
    """A saved GCash account an administrator can switch to (rotation)."""

    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
    )

    id: str = Field(pattern=r"^[a-f0-9]{32}$")
    label: str = Field(default="", max_length=40)
    number: str = Field(default="", max_length=20)
    accountName: str = Field(default="", max_length=60)
    qrImagePath: str | None = None

    @field_validator("number")
    @classmethod
    def validate_number(cls, value: str) -> str:
        return normalize_gcash_number(value)

    @field_validator("qrImagePath")
    @classmethod
    def validate_qr(cls, value: str | None) -> str | None:
        if value is not None and not GCASH_QR_FILENAME.fullmatch(value):
            raise ValueError("The GCash QR image reference is invalid.")

        return value


class SettingsDocument(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
    )

    currencySymbol: Literal["₱", "$", "¥", "€", "£", "฿", "₹"] = "₱"
    currencyPlacement: Literal["before", "after"] = "before"
    decimalPrecision: Literal["0", "2", "3"] = "2"
    cashRounding: Literal["0.01", "0.05", "0.10", "1.00"] = "0.01"

    lowStockThreshold: str = Field(
        default="5",
        pattern=r"^\d{1,7}$",
    )
    allowNegativeInventory: StrictBool = False

    skuFormat: Literal[
        "prefix-sequence",
        "sequence-only",
        "prefix-part-sequence",
    ] = "prefix-sequence"

    skuPrefix: str = Field(
        default="KNS",
        min_length=1,
        max_length=12,
        pattern=r"^[A-Z0-9_-]+$",
    )

    skuDigits: Literal["4", "5", "6", "8"] = "6"
    skuIncludeYear: StrictBool = False

    taxRate: str = Field(
        default="0",
        pattern=r"^(?:100(?:\.0{1,2})?|(?:\d{1,2})(?:\.\d{1,2})?)$",
    )

    receiptHeader: str = Field(
        default="KINESIS MOTORCYCLE PARTS",
        max_length=500,
    )
    receiptFooter: str = Field(
        default="Thank you for your purchase!",
        max_length=500,
    )
    receiptNotes: str = Field(
        default="Please keep your receipt for returns and exchanges.",
        max_length=1000,
    )

    digitalReceipts: StrictBool = False

    receiptOutput: Literal[
        "bluetooth",
        "sms",
        "qr",
    ] = "bluetooth"

    supervisorPinForDiscounts: StrictBool = True
    allowCustomLineItems: StrictBool = False

    discountLimit: str = Field(
        default="10",
        pattern=r"^(?:100(?:\.0{1,2})?|(?:\d{1,2})(?:\.\d{1,2})?)$",
    )

    inactivityLock: Literal[
        "5",
        "10",
        "15",
        "30",
        "60",
        "disabled",
    ] = "5"

    # Generated server-side filename of the uploaded GCash QR.
    # Never stores the image bytes or an arbitrary filesystem path.
    gcashQrImagePath: str | None = None

    # The GCash account terminals show at checkout is the number, name and QR
    # above/below. The administrator can keep other accounts ready and switch
    # to one when the active account reaches its limit (see gcash_routes.py).
    gcashNumber: str = Field(default="", max_length=20)
    gcashAccountName: str = Field(default="", max_length=60)
    # When the active account was switched to; null until the first switch.
    gcashActiveSince: str | None = Field(default=None, max_length=40)
    gcashBackupAccounts: list[GCashAccount] = Field(
        default_factory=list,
        max_length=GCASH_BACKUP_LIMIT,
    )

    listenAddress: Literal[
        "0.0.0.0",  # nosec B104 - a setting value, not a bind call
        "127.0.0.1",
    ] = "0.0.0.0"  # nosec B104 - a setting value, not a bind call

    httpPort: str = Field(
        default="8000",
        pattern=r"^\d{1,5}$",
    )

    corsOrigins: str = Field(
        default="http://localhost:5173",
        max_length=2048,
    )

    websocketHeartbeat: str = Field(
        default="30",
        pattern=r"^\d{1,3}$",
    )

    offlineQueueStrategy: Literal[
        "queue-and-retry",
        "manual-reconciliation",
        "reject-offline",
    ] = "queue-and-retry"

    backupSchedule: Literal[
        "every-6-hours",
        "every-12-hours",
        "daily",
        "weekly",
        "manual",
    ] = "daily"

    logLevel: Literal[
        "DEBUG",
        "INFO",
        "WARNING",
        "ERROR",
        "CRITICAL",
    ] = "INFO"

    consoleBufferLines: Literal[
        "250",
        "500",
        "1000",
        "2500",
        "5000",
        "10000",
    ] = "1000"

    @field_validator("gcashQrImagePath")
    @classmethod
    def validate_gcash_qr_filename(
        cls,
        value: str | None,
    ) -> str | None:
        if value is None:
            return None

        if not re.fullmatch(
            r"[a-f0-9]{32}\.(?:jpg|png)",
            value,
        ):
            raise ValueError("The GCash QR image reference is invalid.")

        return value

    @field_validator("gcashNumber")
    @classmethod
    def validate_gcash_number(cls, value: str) -> str:
        return normalize_gcash_number(value)

    @field_validator("gcashActiveSince")
    @classmethod
    def validate_gcash_active_since(cls, value: str | None) -> str | None:
        if value is None:
            return None

        try:
            datetime.fromisoformat(value)
        except ValueError as exc:
            raise ValueError("gcashActiveSince must be an ISO timestamp.") from exc

        return value

    @field_validator("lowStockThreshold")
    @classmethod
    def validate_low_stock_threshold(cls, value: str) -> str:
        try:
            threshold = int(value)
        except ValueError as exc:
            raise ValueError("Low-stock threshold must be a whole number.") from exc

        if threshold < 0 or threshold > 1_000_000:
            raise ValueError("Low-stock threshold must be between 0 and 1,000,000.")

        return str(threshold)

    @field_validator("taxRate", "discountLimit")
    @classmethod
    def validate_percentage(cls, value: str) -> str:
        try:
            percentage = Decimal(value)
        except InvalidOperation as exc:
            raise ValueError("Enter a valid percentage.") from exc

        if not percentage.is_finite() or percentage < 0 or percentage > 100:
            raise ValueError("Percentage must be between 0 and 100.")

        return value

    @field_validator("receiptHeader", "receiptFooter", "receiptNotes")
    @classmethod
    def normalize_receipt_text(cls, value: str) -> str:
        return value.strip()

    @field_validator("skuPrefix")
    @classmethod
    def normalize_sku_prefix(cls, value: str) -> str:
        return value.strip().upper()

    @field_validator("httpPort")
    @classmethod
    def validate_http_port(cls, value: str) -> str:
        port = int(value)

        if not 1 <= port <= 65535:
            raise ValueError("HTTP port must be between 1 and 65535.")

        return str(port)

    @field_validator("websocketHeartbeat")
    @classmethod
    def validate_websocket_heartbeat(cls, value: str) -> str:
        seconds = int(value)

        if not 5 <= seconds <= 300:
            raise ValueError("WebSocket heartbeat must be between 5 and 300 seconds.")

        return str(seconds)

    @field_validator("corsOrigins")
    @classmethod
    def validate_cors_origins(cls, value: str) -> str:
        origins = [origin.strip() for origin in value.splitlines() if origin.strip()]

        if not origins:
            raise ValueError("Add at least one allowed CORS origin.")

        if len(origins) > 30:
            raise ValueError("You can configure at most 30 CORS origins.")

        normalized_origins = set()

        for origin in origins:
            if "*" in origin:
                raise ValueError("Wildcard CORS origins are not allowed.")

            parsed = urlsplit(origin)

            try:
                parsed.port
            except ValueError as exc:
                raise ValueError(f"Invalid port in CORS origin: {origin}") from exc

            if parsed.scheme not in {"http", "https"}:
                raise ValueError("CORS origins must use HTTP or HTTPS.")

            if not parsed.hostname:
                raise ValueError(f"Invalid CORS origin: {origin}")

            if parsed.username or parsed.password:
                raise ValueError("CORS origins cannot contain credentials.")

            if parsed.path or parsed.query or parsed.fragment:
                raise ValueError(
                    "Enter an origin only, without a path, query, or fragment."
                )

            if origin in normalized_origins:
                raise ValueError(f"Duplicate CORS origin: {origin}")

            normalized_origins.add(origin)

        return "\n".join(origins)


DEFAULT_SETTINGS = SettingsDocument().model_dump(mode="json")


# --------------------------------------------------
# Terminal settings projection
# --------------------------------------------------


TERMINAL_SETTING_KEYS = {
    "currencySymbol",
    "currencyPlacement",
    "decimalPrecision",
    "cashRounding",
    "lowStockThreshold",
    "allowNegativeInventory",
    "skuFormat",
    "skuPrefix",
    "skuDigits",
    "skuIncludeYear",
    "taxRate",
    "receiptHeader",
    "receiptFooter",
    "receiptNotes",
    "digitalReceipts",
    "receiptOutput",
    "supervisorPinForDiscounts",
    "allowCustomLineItems",
    "discountLimit",
    "inactivityLock",
    "offlineQueueStrategy",
    "gcashQrImagePath",
    # What the cashier shows the customer. The backup accounts stay on the
    # server; terminals never see them.
    "gcashNumber",
    "gcashAccountName",
}


def terminal_settings_projection(settings: dict) -> dict:
    return {key: settings[key] for key in TERMINAL_SETTING_KEYS if key in settings}


# --------------------------------------------------
# Request schemas
# --------------------------------------------------


class SettingsUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_version: int = Field(
        ge=1,
        validation_alias=AliasChoices(
            "expected_version",
            "expectedVersion",
        ),
    )

    settings: SettingsDocument


class GCashQrDeleteRequest(BaseModel):
    expected_version: int = Field(ge=1)


# --------------------------------------------------
# Database helpers
# --------------------------------------------------


def get_or_create_settings(
    db: Session,
    *,
    lock: bool = False,
) -> AppSettings:
    statement = (
        pg_insert(AppSettings)
        .values(
            id=1,
            settings=DEFAULT_SETTINGS,
            version=1,
        )
        .on_conflict_do_nothing(
            index_elements=[AppSettings.id],
        )
    )

    db.execute(statement)
    db.commit()

    query = select(AppSettings).where(AppSettings.id == 1)

    if lock:
        query = query.with_for_update()

    row = db.scalar(query)

    if row is None:
        raise RuntimeError("The application settings row could not be loaded.")

    return row


def serialize_settings(row: AppSettings) -> dict:
    document = SettingsDocument.model_validate(row.settings)

    return {
        "settings": document.model_dump(mode="json"),
        "version": row.version,
        "updated_at": row.updated_at.isoformat(),
    }


def resolve_gcash_qr_path(filename: str) -> Path:
    if not re.fullmatch(
        r"[a-f0-9]{32}\.(?:jpg|png)",
        filename,
    ):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The stored GCash QR image reference is invalid.",
        )

    root = GCASH_QR_DIRECTORY.resolve()
    candidate = (root / filename).resolve()

    if not candidate.is_relative_to(root):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The stored GCash QR image path is invalid.",
        )

    return candidate


def detect_gcash_qr_image(data: bytes) -> tuple[str, str] | None:
    for signature, result in GCASH_QR_FORMATS.items():
        if data.startswith(signature):
            return result

    return None


async def read_gcash_qr_image(
    file: UploadFile,
) -> tuple[bytes, str, str]:
    try:
        data = await file.read(MAX_GCASH_QR_SIZE + 1)
    finally:
        await file.close()

    if not data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded GCash QR image is empty.",
        )

    if len(data) > MAX_GCASH_QR_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail="The GCash QR image must be 5 MiB or smaller.",
        )

    detected = detect_gcash_qr_image(data)

    if detected is None:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only JPEG and PNG GCash QR images are supported.",
        )

    extension, media_type = detected

    return data, extension, media_type


async def notify_settings_updated(version: int) -> None:
    try:
        delivered = await broadcast_settings_updated(version)

        logger.debug(
            "Settings update notification sent to %s connection(s).",
            delivered,
        )

    except Exception:
        logger.exception(
            "Settings were saved, but terminal notifications failed. "
            "Periodic refresh will recover."
        )


def get_gcash_qr_file(
    db: Session,
) -> tuple[Path, str]:
    row = get_or_create_settings(db)

    document = SettingsDocument.model_validate(row.settings)

    filename = document.gcashQrImagePath

    if not filename:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No GCash QR image has been uploaded.",
        )

    image_path = resolve_gcash_qr_path(filename)

    if not image_path.is_file():
        logger.error(
            "The configured GCash QR image is missing: %s",
            filename,
        )

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="The configured GCash QR image file is missing.",
        )

    media_type = "image/png" if image_path.suffix == ".png" else "image/jpeg"

    return image_path, media_type


# --------------------------------------------------
# Admin: retrieve application settings
# --------------------------------------------------


@router.get("/api/admin/settings")
def get_admin_settings(
    _authorized: None = Depends(require_admin_token),
    db: Session = Depends(get_db),
):
    try:
        row = get_or_create_settings(db)
        return serialize_settings(row)

    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Could not retrieve application settings.")

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Application settings could not be loaded.",
        ) from exc

    except RuntimeError as exc:
        db.rollback()
        logger.exception("Application settings row is unavailable.")

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Application settings could not be loaded.",
        ) from exc


# --------------------------------------------------
# Admin: update application settings
# --------------------------------------------------


@router.put("/api/admin/settings")
async def update_admin_settings(
    payload: SettingsUpdateRequest,
    _authorized: None = Depends(require_admin_token),
    db: Session = Depends(get_db),
):
    supplied_fields = payload.settings.model_fields_set
    expected_fields = set(SettingsDocument.model_fields)
    missing_fields = expected_fields - supplied_fields

    if missing_fields:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "message": "The settings document is incomplete.",
                "missing_fields": sorted(missing_fields),
            },
        )

    try:
        row = get_or_create_settings(
            db,
            lock=True,
        )

        if row.version != payload.expected_version:
            current_version = row.version
            db.rollback()

            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "message": (
                        "Settings were changed by another request. "
                        "Reload the latest settings before saving again."
                    ),
                    "expected_version": payload.expected_version,
                    "current_version": current_version,
                },
            )

        row.settings = payload.settings.model_dump(mode="json")
        row.version += 1

        db.commit()
        db.refresh(row)

        try:
            apply_application_log_level(payload.settings.logLevel)
        except Exception:
            logger.exception(
                "Settings were saved, but the application log level "
                "could not be applied."
            )

        await notify_settings_updated(row.version)

        logger.info(
            "Application settings updated. New version: %s",
            row.version,
        )

        return serialize_settings(row)

    except HTTPException:
        raise

    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Could not update application settings.")

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Application settings could not be saved.",
        ) from exc


# --------------------------------------------------
# Admin: upload or replace the GCash QR image
# --------------------------------------------------


@router.post("/api/admin/settings/gcash-qr")
async def upload_gcash_qr(
    file: UploadFile = File(...),
    expected_version: int = Form(ge=1),
    _authorized: None = Depends(require_admin_token),
    db: Session = Depends(get_db),
):
    data, extension, _media_type = await read_gcash_qr_image(file)

    new_filename = f"{uuid4().hex}{extension}"
    new_path = resolve_gcash_qr_path(new_filename)

    old_filename: str | None = None

    try:
        row = get_or_create_settings(
            db,
            lock=True,
        )

        if row.version != expected_version:
            current_version = row.version
            db.rollback()

            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "message": (
                        "Settings changed before the QR image was uploaded. "
                        "Reload the latest settings and try again."
                    ),
                    "expected_version": expected_version,
                    "current_version": current_version,
                },
            )

        current_document = SettingsDocument.model_validate(row.settings)

        old_filename = current_document.gcashQrImagePath

        GCASH_QR_DIRECTORY.mkdir(
            parents=True,
            exist_ok=True,
        )

        # A unique generated filename prevents overwriting the previous
        # image before the database transaction commits successfully.
        with new_path.open("xb") as image_file:
            image_file.write(data)

        updated_settings = current_document.model_dump(mode="json")

        updated_settings["gcashQrImagePath"] = new_filename

        row.settings = updated_settings
        row.version += 1

        db.commit()
        db.refresh(row)

    except HTTPException:
        db.rollback()
        new_path.unlink(missing_ok=True)
        raise

    except OSError as exc:
        db.rollback()
        new_path.unlink(missing_ok=True)

        logger.exception("Could not store the GCash QR image.")

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The GCash QR image could not be stored.",
        ) from exc

    except SQLAlchemyError as exc:
        db.rollback()
        new_path.unlink(missing_ok=True)

        logger.exception("Could not save the GCash QR image setting.")

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The GCash QR image setting could not be saved.",
        ) from exc

    # Remove the previous image only after the new setting has committed.
    if old_filename and old_filename != new_filename:
        try:
            resolve_gcash_qr_path(old_filename).unlink(missing_ok=True)
        except OSError:
            logger.exception("The previous GCash QR image could not be removed.")

    await notify_settings_updated(row.version)

    logger.info(
        "GCash QR image updated. Settings version: %s",
        row.version,
    )

    return serialize_settings(row)


# --------------------------------------------------
# Admin: remove the GCash QR image
# --------------------------------------------------


@router.delete("/api/admin/settings/gcash-qr")
async def delete_gcash_qr(
    payload: GCashQrDeleteRequest,
    _authorized: None = Depends(require_admin_token),
    db: Session = Depends(get_db),
):
    old_filename: str | None = None

    try:
        row = get_or_create_settings(
            db,
            lock=True,
        )

        if row.version != payload.expected_version:
            current_version = row.version
            db.rollback()

            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "message": (
                        "Settings changed before the QR image was removed. "
                        "Reload the latest settings and try again."
                    ),
                    "expected_version": payload.expected_version,
                    "current_version": current_version,
                },
            )

        current_document = SettingsDocument.model_validate(row.settings)

        old_filename = current_document.gcashQrImagePath

        if old_filename is None:
            db.rollback()
            return serialize_settings(get_or_create_settings(db))

        updated_settings = current_document.model_dump(mode="json")

        updated_settings["gcashQrImagePath"] = None

        row.settings = updated_settings
        row.version += 1

        db.commit()
        db.refresh(row)

    except HTTPException:
        db.rollback()
        raise

    except SQLAlchemyError as exc:
        db.rollback()

        logger.exception("Could not remove the GCash QR image setting.")

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The GCash QR image could not be removed.",
        ) from exc

    if old_filename:
        try:
            resolve_gcash_qr_path(old_filename).unlink(missing_ok=True)
        except OSError:
            logger.exception("The unreferenced GCash QR image could not be removed.")

    await notify_settings_updated(row.version)

    logger.info(
        "GCash QR image removed. Settings version: %s",
        row.version,
    )

    return serialize_settings(row)


# --------------------------------------------------
# Admin: retrieve the current GCash QR image
# --------------------------------------------------


@router.get("/api/admin/settings/gcash-qr")
def get_admin_gcash_qr(
    _authorized: None = Depends(require_admin_token),
    db: Session = Depends(get_db),
):
    try:
        image_path, media_type = get_gcash_qr_file(db)

        return FileResponse(
            image_path,
            media_type=media_type,
            headers={
                "Cache-Control": "no-store, private",
            },
        )

    except SQLAlchemyError as exc:
        db.rollback()

        logger.exception("Could not retrieve the GCash QR image.")

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The GCash QR image could not be loaded.",
        ) from exc


# --------------------------------------------------
# Terminal: retrieve the GCash QR image
# --------------------------------------------------


@router.get("/api/terminals/gcash-qr")
def get_terminal_gcash_qr(
    _terminal=Depends(require_terminal),
    db: Session = Depends(get_db),
):
    try:
        image_path, media_type = get_gcash_qr_file(db)

        return FileResponse(
            image_path,
            media_type=media_type,
            headers={
                "Cache-Control": "no-store, private",
            },
        )

    except SQLAlchemyError as exc:
        db.rollback()

        logger.exception("Could not retrieve the terminal GCash QR image.")

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The GCash QR image could not be loaded.",
        ) from exc


# --------------------------------------------------
# Terminal: retrieve POS settings
# --------------------------------------------------


@router.get("/api/terminals/settings")
def get_terminal_settings(
    _terminal=Depends(require_terminal),
    db: Session = Depends(get_db),
):
    try:
        row = get_or_create_settings(db)

        document = SettingsDocument.model_validate(row.settings)

        all_settings = document.model_dump(mode="json")

        return {
            "settings": terminal_settings_projection(all_settings),
            "version": row.version,
            "updated_at": row.updated_at.isoformat(),
        }

    except SQLAlchemyError as exc:
        db.rollback()

        logger.exception("Could not retrieve terminal settings.")

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Terminal settings could not be loaded.",
        ) from exc

    except RuntimeError as exc:
        db.rollback()

        logger.exception("Terminal settings row is unavailable.")

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Terminal settings could not be loaded.",
        ) from exc


# Include the realtime WebSocket endpoint in the existing settings router.
router.include_router(settings_realtime_router)
