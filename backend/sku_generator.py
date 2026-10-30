from datetime import datetime
import re
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from models import AppSettings, Product


DEFAULT_SKU_SETTINGS = {
    "skuFormat": "prefix-sequence",
    "skuPrefix": "KNS",
    "skuDigits": "6",
    "skuIncludeYear": False,
}

# Shared lock for all automatic SKU generation in this Kinesis database.
SKU_ADVISORY_LOCK_ID = 4_928_374_650_123_456_789

PH_TIMEZONE = ZoneInfo("Asia/Manila")


def generate_product_sku(db: Session) -> str:
    """
    Generate a unique SKU using the saved application settings.

    The PostgreSQL transaction-level advisory lock serializes concurrent
    automatic SKU generation across processes and terminals.

    The caller must commit or roll back the transaction after generation.
    """

    # Serialize automatic SKU generation across concurrent requests.
    db.execute(
        text("SELECT pg_advisory_xact_lock(:lock_id)"),
        {"lock_id": SKU_ADVISORY_LOCK_ID},
    )

    settings_row = db.scalar(
        select(AppSettings).where(AppSettings.id == 1).with_for_update(read=True)
    )

    stored_settings = (
        settings_row.settings
        if settings_row is not None and isinstance(settings_row.settings, dict)
        else {}
    )

    config = {
        **DEFAULT_SKU_SETTINGS,
        **{
            key: stored_settings[key]
            for key in DEFAULT_SKU_SETTINGS
            if key in stored_settings
        },
    }

    sku_format = config["skuFormat"]
    prefix = str(config["skuPrefix"]).strip().upper()
    digits_text = str(config["skuDigits"])
    include_year = config["skuIncludeYear"]

    if sku_format not in {
        "prefix-sequence",
        "sequence-only",
        "prefix-part-sequence",
    }:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The configured SKU format is invalid.",
        )

    if not re.fullmatch(r"[A-Z0-9_-]{1,12}", prefix):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The configured SKU prefix is invalid.",
        )

    if digits_text not in {"4", "5", "6", "8"}:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The configured SKU sequence length is invalid.",
        )

    if not isinstance(include_year, bool):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The configured SKU year option is invalid.",
        )

    digits = int(digits_text)

    year_part = f"{datetime.now(PH_TIMEZONE).year}-" if include_year else ""

    # Read existing SKUs once while holding the advisory lock.
    existing_skus = set(
        db.scalars(select(Product.sku).where(Product.sku.is_not(None))).all()
    )

    sequence = 1

    while sequence <= 999_999_999:
        sequence_text = str(sequence).zfill(digits)

        if sku_format == "prefix-sequence":
            candidate = f"{prefix}-{year_part}{sequence_text}"

        elif sku_format == "sequence-only":
            candidate = f"{year_part}{sequence_text}"

        else:
            candidate = f"{prefix}-{year_part}PART-{sequence_text}"

        if len(candidate) > 64:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="The generated SKU exceeds the maximum supported length.",
            )

        if candidate not in existing_skus:
            return candidate

        sequence += 1

    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail="The available SKU sequence has been exhausted.",
    )
