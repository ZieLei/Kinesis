import re
from decimal import Decimal, InvalidOperation
from typing import Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, StrictBool, field_validator


class AppSettingsDocument(BaseModel):
    """Validated global Kinesis application settings."""

    model_config = ConfigDict(
        extra="forbid",
        strict=True,
    )

    # POS and store policies
    currencySymbol: Literal["₱", "$", "¥", "€", "£", "฿", "₹"] = "₱"
    currencyPlacement: Literal["before", "after"] = "before"
    decimalPrecision: Literal["0", "2", "3"] = "2"
    cashRounding: Literal["0.01", "0.05", "0.10", "1.00"] = "0.01"

    # Inventory and SKU
    lowStockThreshold: str = Field(
        default="5",
        pattern=r"^(0|[1-9][0-9]{0,6})$",
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
        pattern=r"^[A-Z0-9][A-Z0-9-]{0,11}$",
    )
    skuDigits: Literal["4", "5", "6", "8"] = "6"
    skuIncludeYear: StrictBool = False

    # Tax and receipts
    taxRate: str = Field(
        default="0",
        pattern=r"^(?:0|[1-9][0-9]?)(?:\.[0-9]{1,2})?$|^100(?:\.0{1,2})?$",
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
    receiptOutput: Literal["bluetooth", "sms", "qr"] = "bluetooth"

    # Cashier permissions
    supervisorPinForDiscounts: StrictBool = True
    allowCustomLineItems: StrictBool = False
    discountLimit: str = Field(
        default="10",
        pattern=r"^(0|[1-9][0-9]?|100)$",
    )
    inactivityLock: Literal[
        "5",
        "10",
        "15",
        "30",
        "60",
        "disabled",
    ] = "5"

    # Server and network
    listenAddress: Literal["0.0.0.0", "127.0.0.1"] = "0.0.0.0"
    httpPort: str = Field(
        default="8000",
        pattern=r"^[0-9]{1,5}$",
    )
    corsOrigins: str = Field(
        default="http://localhost:5173",
        max_length=2048,
    )
    websocketHeartbeat: str = Field(
        default="30",
        pattern=r"^[0-9]{1,3}$",
    )
    offlineQueueStrategy: Literal[
        "queue-and-retry",
        "manual-reconciliation",
        "reject-offline",
    ] = "queue-and-retry"

    # Backups
    backupSchedule: Literal[
        "every-6-hours",
        "every-12-hours",
        "daily",
        "weekly",
        "manual",
    ] = "daily"

    # Diagnostics
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
        if int(value) > 1_000_000:
            raise ValueError("Low-stock threshold cannot exceed 1,000,000.")

        return value

    @field_validator("taxRate")
    @classmethod
    def validate_tax_rate(cls, value: str) -> str:
        try:
            rate = Decimal(value)
        except InvalidOperation as exc:
            raise ValueError("Tax rate must be a valid decimal number.") from exc

        if not rate.is_finite() or not Decimal("0") <= rate <= Decimal("100"):
            raise ValueError("Tax rate must be between 0 and 100.")

        return value

    @field_validator("discountLimit")
    @classmethod
    def validate_discount_limit(cls, value: str) -> str:
        if not 0 <= int(value) <= 100:
            raise ValueError("Discount limit must be between 0 and 100.")

        return value

    @field_validator("httpPort")
    @classmethod
    def validate_http_port(cls, value: str) -> str:
        port = int(value)

        if not 1 <= port <= 65535:
            raise ValueError("HTTP port must be between 1 and 65535.")

        return value

    @field_validator("websocketHeartbeat")
    @classmethod
    def validate_websocket_heartbeat(cls, value: str) -> str:
        interval = int(value)

        if not 5 <= interval <= 300:
            raise ValueError("Heartbeat interval must be between 5 and 300 seconds.")

        return value

    @field_validator("receiptHeader", "receiptFooter", "receiptNotes")
    @classmethod
    def reject_null_characters(cls, value: str) -> str:
        if "\x00" in value:
            raise ValueError("Receipt text cannot contain null characters.")

        return value

    @field_validator("corsOrigins")
    @classmethod
    def validate_cors_origins(cls, value: str) -> str:
        origins = [line.strip() for line in value.splitlines() if line.strip()]

        if not origins:
            raise ValueError("At least one CORS origin is required.")

        if len(origins) > 30:
            raise ValueError("A maximum of 30 CORS origins is allowed.")

        normalized: set[str] = set()

        for origin in origins:
            if "*" in origin:
                raise ValueError("Wildcard CORS origins are not allowed.")

            try:
                parsed = urlsplit(origin)
                hostname = parsed.hostname
                port = parsed.port
            except ValueError as exc:
                raise ValueError(f"Invalid CORS origin: {origin}") from exc

            if (
                parsed.scheme not in ("http", "https")
                or not hostname
                or parsed.username is not None
                or parsed.password is not None
                or parsed.path
                or parsed.query
                or parsed.fragment
            ):
                raise ValueError(
                    f"Use a complete HTTP or HTTPS origin without a path: {origin}"
                )

            if port is not None and not 1 <= port <= 65535:
                raise ValueError(f"Invalid port in CORS origin: {origin}")

            normalized_origin = origin.rstrip("/").lower()

            if normalized_origin in normalized:
                raise ValueError(f"Duplicate CORS origin: {origin}")

            normalized.add(normalized_origin)

        return "\n".join(origins)


DEFAULT_SETTINGS = AppSettingsDocument().model_dump()


# These are the settings intended for POS terminals.
# Server administration and diagnostic settings stay private to the backend.
TERMINAL_SETTING_KEYS = (
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
)


def terminal_settings_projection(
    settings: dict[str, object],
) -> dict[str, object]:
    """Return only settings that POS terminals are permitted to receive."""
    return {key: settings[key] for key in TERMINAL_SETTING_KEYS}
