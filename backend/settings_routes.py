import logging
from decimal import Decimal, InvalidOperation
from typing import Literal
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException, status
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
from terminal_routes import require_admin_token, require_terminal


logger = logging.getLogger(__name__)

router = APIRouter(tags=["Settings"])


# --------------------------------------------------
# Settings schema
# --------------------------------------------------


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

    listenAddress: Literal[
        "0.0.0.0",
        "127.0.0.1",
    ] = "0.0.0.0"

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
        row = get_or_create_settings(db, lock=True)

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

        # Notify connected terminals only after the database commit.
        # A notification failure does not invalidate the successful save.
        try:
            delivered = await broadcast_settings_updated(row.version)

            logger.debug(
                "Settings update notification sent to %s connection(s).",
                delivered,
            )

        except Exception:
            logger.exception(
                "Settings were saved, but terminal notifications failed. "
                "The periodic refresh will recover."
            )

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
