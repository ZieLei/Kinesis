"""
GCash account rotation.

Terminals show one GCash account at checkout: the number, name and QR image
in the settings document. A personal GCash account has a limit on what it can
receive in a week, so the administrator can keep other accounts ready and
switch to one when the active account is full.

Switching swaps the active account with a saved one: the previous active
account is kept as a backup (nothing is lost) and terminals pick the change up
through the usual settings synchronisation within seconds.
"""

import logging
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from activity_tracking import _record
from database import get_db
from models import Sale
from settings_routes import (
    GCASH_BACKUP_LIMIT,
    GCASH_QR_DIRECTORY,
    GCASH_QR_FORMATS,
    GCashAccount,
    SettingsDocument,
    get_or_create_settings,
    notify_settings_updated,
    read_gcash_qr_image,
    resolve_gcash_qr_path,
    serialize_settings,
)
from terminal_routes import require_admin_token


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/settings/gcash", tags=["Settings"])


class ExpectedVersion(BaseModel):
    expected_version: int = Field(ge=1)


def mask(number: str) -> str:
    """0917 ••• 4567 style, for the activity feed."""

    return f"{number[:4]}•••{number[-4:]}" if len(number) == 11 else (number or "no number")


def conflict(expected: int, current: int) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={
            "message": "Settings changed on the server. Reload the latest settings and try again.",
            "expected_version": expected,
            "current_version": current,
        },
    )


def locked_settings(db: Session, expected_version: int):
    row = get_or_create_settings(db, lock=True)

    if row.version != expected_version:
        current = row.version
        db.rollback()
        raise conflict(expected_version, current)

    return row, SettingsDocument.model_validate(row.settings).model_dump(mode="json")


def clean_account(raw: dict) -> dict:
    """Validate one account's fields; a readable 422 instead of pydantic's list."""

    try:
        account = GCashAccount.model_validate(raw)
    except ValidationError as error:
        message = error.errors()[0]["msg"].removeprefix("Value error, ")
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=message) from error

    if not account.number:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Enter the GCash number for this account.",
        )

    return account.model_dump(mode="json")


def reject_duplicate_number(data: dict, number: str, ignoring: str | None = None) -> None:
    taken = [data["gcashNumber"]] + [
        account["number"] for account in data["gcashBackupAccounts"] if account["id"] != ignoring
    ]

    if number in taken:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That GCash number is already saved.",
        )


def referenced_images(data: dict) -> set[str]:
    names = {data["gcashQrImagePath"]} if data["gcashQrImagePath"] else set()
    names.update(account["qrImagePath"] for account in data["gcashBackupAccounts"] if account["qrImagePath"])
    return names


def remove_unreferenced(candidates: set[str | None], data: dict) -> None:
    """Delete image files that no account uses any more (after a commit)."""

    keep = referenced_images(data)

    for name in candidates:
        if name and name not in keep:
            try:
                resolve_gcash_qr_path(name).unlink(missing_ok=True)
            except OSError:
                logger.exception("A GCash QR image could not be removed.")


def commit_settings(db: Session, row, data: dict) -> None:
    """Validate the new document, bump the version and commit."""

    row.settings = SettingsDocument.model_validate(data).model_dump(mode="json")
    row.version += 1

    try:
        db.commit()
    except SQLAlchemyError as error:
        db.rollback()
        logger.exception("Could not save the GCash account change.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The GCash account could not be saved.",
        ) from error

    db.refresh(row)


def store_image(data: bytes, extension: str) -> str:
    filename = f"{uuid4().hex}{extension}"
    GCASH_QR_DIRECTORY.mkdir(parents=True, exist_ok=True)

    # "xb": never overwrite an existing file.
    with resolve_gcash_qr_path(filename).open("xb") as handle:
        handle.write(data)

    return filename


# --------------------------------------------------
# Add and edit a saved account
# --------------------------------------------------


@router.post("/accounts", status_code=status.HTTP_201_CREATED)
async def add_account(
    expected_version: int = Form(ge=1),
    number: str = Form(max_length=20),
    account_name: str = Form("", max_length=60),
    label: str = Form("", max_length=40),
    file: UploadFile | None = File(None),
    _admin: object = Depends(require_admin_token),
    db: Session = Depends(get_db),
):
    image = await read_gcash_qr_image(file) if file is not None and file.filename else None
    new_image = None

    try:
        row, data = locked_settings(db, expected_version)

        if len(data["gcashBackupAccounts"]) >= GCASH_BACKUP_LIMIT:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"At most {GCASH_BACKUP_LIMIT} backup accounts can be saved. Remove one first.",
            )

        account = clean_account(
            {"id": uuid4().hex, "label": label, "number": number, "accountName": account_name, "qrImagePath": None}
        )
        reject_duplicate_number(data, account["number"])

        if image is not None:
            new_image = store_image(image[0], image[1])
            account["qrImagePath"] = new_image

        account["label"] = account["label"] or account["accountName"] or account["number"]
        data["gcashBackupAccounts"].append(account)

        commit_settings(db, row, data)
    except HTTPException:
        db.rollback()
        if new_image:
            resolve_gcash_qr_path(new_image).unlink(missing_ok=True)
        raise
    except OSError as error:
        db.rollback()
        logger.exception("Could not store the GCash QR image.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The GCash QR image could not be stored.",
        ) from error

    await notify_settings_updated(row.version)
    return serialize_settings(row)


@router.put("/accounts/{account_id}")
async def update_account(
    account_id: str,
    expected_version: int = Form(ge=1),
    number: str = Form(max_length=20),
    account_name: str = Form("", max_length=60),
    label: str = Form("", max_length=40),
    remove_qr: bool = Form(False),
    file: UploadFile | None = File(None),
    _admin: object = Depends(require_admin_token),
    db: Session = Depends(get_db),
):
    image = await read_gcash_qr_image(file) if file is not None and file.filename else None
    new_image = None
    old_image = None

    try:
        row, data = locked_settings(db, expected_version)
        account = next((item for item in data["gcashBackupAccounts"] if item["id"] == account_id), None)

        if account is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="That account no longer exists.")

        old_image = account["qrImagePath"]
        cleaned = clean_account(
            {"id": account_id, "label": label, "number": number, "accountName": account_name, "qrImagePath": old_image}
        )
        reject_duplicate_number(data, cleaned["number"], ignoring=account_id)

        if image is not None:
            new_image = store_image(image[0], image[1])
            cleaned["qrImagePath"] = new_image
        elif remove_qr:
            cleaned["qrImagePath"] = None

        cleaned["label"] = cleaned["label"] or cleaned["accountName"] or cleaned["number"]
        account.update(cleaned)

        commit_settings(db, row, data)
    except HTTPException:
        db.rollback()
        if new_image:
            resolve_gcash_qr_path(new_image).unlink(missing_ok=True)
        raise
    except OSError as error:
        db.rollback()
        logger.exception("Could not store the GCash QR image.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The GCash QR image could not be stored.",
        ) from error

    remove_unreferenced({old_image}, data)
    await notify_settings_updated(row.version)
    return serialize_settings(row)


@router.delete("/accounts/{account_id}")
async def delete_account(
    account_id: str,
    payload: ExpectedVersion,
    _admin: object = Depends(require_admin_token),
    db: Session = Depends(get_db),
):
    row, data = locked_settings(db, payload.expected_version)
    account = next((item for item in data["gcashBackupAccounts"] if item["id"] == account_id), None)

    if account is None:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="That account no longer exists.")

    data["gcashBackupAccounts"] = [item for item in data["gcashBackupAccounts"] if item["id"] != account_id]

    commit_settings(db, row, data)
    remove_unreferenced({account["qrImagePath"]}, data)
    await notify_settings_updated(row.version)
    return serialize_settings(row)


# --------------------------------------------------
# Rotate: make a saved account the active one
# --------------------------------------------------


@router.post("/accounts/{account_id}/activate")
async def activate_account(
    account_id: str,
    payload: ExpectedVersion,
    _admin: object = Depends(require_admin_token),
    db: Session = Depends(get_db),
):
    row, data = locked_settings(db, payload.expected_version)
    backups = data["gcashBackupAccounts"]
    index = next((position for position, item in enumerate(backups) if item["id"] == account_id), None)

    if index is None:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="That account no longer exists.")

    chosen = backups[index]
    previous_number = data["gcashNumber"]
    previous_name = data["gcashAccountName"]
    previous_image = data["gcashQrImagePath"]

    # The account being replaced takes the chosen account's place in the
    # list, so it can be switched back to later. Without a number there is
    # nothing to keep (a backup needs one), so only the slot is dropped.
    orphaned_image = None

    if previous_number:
        backups[index] = {
            "id": uuid4().hex,
            "label": previous_name or previous_number,
            "number": previous_number,
            "accountName": previous_name,
            "qrImagePath": previous_image,
        }
    else:
        backups.pop(index)
        orphaned_image = previous_image

    data["gcashNumber"] = chosen["number"]
    data["gcashAccountName"] = chosen["accountName"]
    data["gcashQrImagePath"] = chosen["qrImagePath"]
    data["gcashActiveSince"] = datetime.now(timezone.utc).isoformat()

    _record(
        db,
        "settings.gcash_account_switched",
        "GCash account switched",
        details={
            "from": mask(previous_number),
            "to": mask(chosen["number"]),
            "to_name": chosen["accountName"] or None,
        },
    )

    commit_settings(db, row, data)
    remove_unreferenced({orphaned_image}, data)
    await notify_settings_updated(row.version)

    logger.info("GCash account switched. Settings version: %s", row.version)
    return serialize_settings(row)


# --------------------------------------------------
# Preview a saved account's QR image
# --------------------------------------------------


@router.get("/accounts/{account_id}/qr")
def get_account_qr(
    account_id: str,
    _admin: object = Depends(require_admin_token),
    db: Session = Depends(get_db),
):
    row = get_or_create_settings(db)
    document = SettingsDocument.model_validate(row.settings)
    account = next((item for item in document.gcashBackupAccounts if item.id == account_id), None)

    if account is None or not account.qrImagePath:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No QR image for this account.")

    path = resolve_gcash_qr_path(account.qrImagePath)

    if not path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="The QR image file is missing.")

    media_type = next(
        (media for _signature, (extension, media) in GCASH_QR_FORMATS.items() if path.suffix == extension),
        "application/octet-stream",
    )

    return FileResponse(path, media_type=media_type, headers={"Cache-Control": "no-store, private"})


# --------------------------------------------------
# How much came in through the active account
# --------------------------------------------------


@router.get("/usage")
def get_usage(
    _admin: object = Depends(require_admin_token),
    db: Session = Depends(get_db),
):
    """
    Completed GCash sales since the active account was switched to, and over
    the last seven days. GCash limits are the account holder's; this only
    helps judge when to switch, it does not know the actual limit.
    """

    row = get_or_create_settings(db)
    document = SettingsDocument.model_validate(row.settings)
    now = datetime.now(timezone.utc)

    def totals(since: datetime | None) -> dict:
        conditions = [Sale.status == "completed", Sale.payment_method == "gcash"]

        if since is not None:
            conditions.append(Sale.created_at >= since)

        count, total = db.execute(
            select(func.count(Sale.id), func.coalesce(func.sum(Sale.total), 0)).where(*conditions)
        ).one()

        return {"count": int(count), "total": float(total)}

    since = None

    if document.gcashActiveSince:
        since = datetime.fromisoformat(document.gcashActiveSince)

        if since.tzinfo is None:
            since = since.replace(tzinfo=timezone.utc)

    return {
        "active_since": document.gcashActiveSince,
        "since_active": totals(since) if since else None,
        "last_7_days": totals(now - timedelta(days=7)),
    }
