import logging
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    Header,
    HTTPException,
    Request,
    Response,
    status,
)
from pydantic import (
    BaseModel,
    Field,
    SecretStr,
    field_validator,
    model_validator,
)
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from admin_models import AdminUser
from auth.dependencies import require_admin_session
from auth.password import (
    DUMMY_PASSWORD_HASH,
    hash_password,
    verify_password,
)
from cashier_models import Cashier, CashierSession
from cashier_sessions import (
    CreatedCashierSession,
    cashier_login_attempt_keys,
    create_cashier_session,
    lock_cashier_login_attempts,
    record_failed_cashier_login,
    reset_cashier_login_attempts,
    resolve_cashier_session,
)
from database import get_db
from models import Terminal
from terminal_routes import require_terminal


logger = logging.getLogger(__name__)

router = APIRouter(tags=["Cashier Authentication"])

USERNAME_PATTERN = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9._-]{2,63}$")

PIN_PATTERN = re.compile(r"^\d{6}$")


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def no_store(response: Response) -> None:
    response.headers["Cache-Control"] = "no-store, private"
    response.headers["Pragma"] = "no-cache"


def normalize_username(value: str) -> str:
    value = value.strip().lower()

    if not USERNAME_PATTERN.fullmatch(value):
        raise ValueError(
            "Username must contain 3–64 characters and use only "
            "letters, numbers, periods, underscores, or hyphens."
        )

    return value


def validate_pin(value: SecretStr) -> SecretStr:
    raw_pin = value.get_secret_value()

    if not PIN_PATTERN.fullmatch(raw_pin):
        raise ValueError("PIN must contain exactly six digits.")

    return value


def get_client_ip(request: Request) -> str | None:
    if request.client is None:
        return None

    return request.client.host[:45]


class CashierLoginRequest(BaseModel):
    username: str = Field(
        min_length=3,
        max_length=64,
    )

    pin: SecretStr

    @field_validator("username")
    @classmethod
    def validate_username(cls, value: str) -> str:
        return normalize_username(value)

    @field_validator("pin")
    @classmethod
    def validate_cashier_pin(cls, value: SecretStr) -> SecretStr:
        return validate_pin(value)


class CashierCreateRequest(BaseModel):
    username: str = Field(
        min_length=3,
        max_length=64,
    )

    display_name: str = Field(
        min_length=1,
        max_length=100,
    )

    pin: SecretStr

    @field_validator("username")
    @classmethod
    def validate_username(cls, value: str) -> str:
        return normalize_username(value)

    @field_validator("display_name")
    @classmethod
    def normalize_display_name(cls, value: str) -> str:
        value = value.strip()

        if not value:
            raise ValueError("Display name cannot be blank.")

        return value

    @field_validator("pin")
    @classmethod
    def validate_cashier_pin(cls, value: SecretStr) -> SecretStr:
        return validate_pin(value)


class CashierUpdateRequest(BaseModel):
    display_name: str | None = Field(
        default=None,
        max_length=100,
    )

    is_active: bool | None = None

    @field_validator("display_name")
    @classmethod
    def normalize_display_name(
        cls,
        value: str | None,
    ) -> str | None:
        if value is None:
            return None

        value = value.strip()

        if not value:
            raise ValueError("Display name cannot be blank.")

        return value

    @model_validator(mode="after")
    def validate_update(self):
        if not self.model_fields_set:
            raise ValueError("Provide at least one field to update.")

        if "display_name" in self.model_fields_set and self.display_name is None:
            raise ValueError("Display name cannot be null.")

        if "is_active" in self.model_fields_set and self.is_active is None:
            raise ValueError("Account status cannot be null.")

        return self


class CashierPinResetRequest(BaseModel):
    pin: SecretStr

    @field_validator("pin")
    @classmethod
    def validate_cashier_pin(cls, value: SecretStr) -> SecretStr:
        return validate_pin(value)


@dataclass(frozen=True, slots=True)
class CashierPrincipal:
    cashier: Cashier
    session: CashierSession
    terminal: Terminal


def cashier_response(cashier: Cashier) -> dict:
    return {
        "id": str(cashier.id),
        "username": cashier.username,
        "display_name": cashier.display_name,
        "is_active": cashier.is_active,
        "created_at": cashier.created_at.isoformat(),
        "updated_at": cashier.updated_at.isoformat(),
        "last_login_at": (
            cashier.last_login_at.isoformat()
            if cashier.last_login_at is not None
            else None
        ),
    }


def authentication_failed() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid username or PIN.",
        headers={
            "WWW-Authenticate": "CashierSession",
            "Cache-Control": "no-store",
        },
    )


def require_cashier_principal(
    x_cashier_session: str | None = Header(
        default=None,
        alias="X-Cashier-Session",
    ),
    terminal: Terminal = Depends(require_terminal),
    db: Session = Depends(get_db),
) -> CashierPrincipal:
    """
    Authenticate a cashier session that belongs to the requesting terminal.

    Terminal authentication and cashier authentication are independent.
    Both credentials are required.
    """

    if not x_cashier_session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Cashier authentication is required.",
        )

    session_record = resolve_cashier_session(
        db,
        x_cashier_session,
        terminal.id,
    )

    if session_record is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Your cashier session has expired or been revoked.",
        )

    return CashierPrincipal(
        cashier=session_record.cashier,
        session=session_record,
        terminal=terminal,
    )


# --------------------------------------------------
# Mobile: available cashier accounts
# --------------------------------------------------


@router.get("/api/cashier-auth/accounts")
def list_available_cashiers(
    response: Response,
    _terminal: Terminal = Depends(require_terminal),
    db: Session = Depends(get_db),
):
    """
    List active cashier accounts for an authenticated POS terminal.

    No PIN hashes or authentication credentials are exposed.
    """

    no_store(response)

    cashiers = db.scalars(
        select(Cashier)
        .where(Cashier.is_active.is_(True))
        .order_by(
            Cashier.display_name.asc(),
            Cashier.username.asc(),
        )
    ).all()

    return {
        "items": [
            {
                "id": str(cashier.id),
                "username": cashier.username,
                "display_name": cashier.display_name,
            }
            for cashier in cashiers
        ]
    }


# --------------------------------------------------
# Mobile: cashier PIN login
# --------------------------------------------------


@router.post("/api/cashier-auth/login")
def login_cashier(
    payload: CashierLoginRequest,
    request: Request,
    response: Response,
    terminal: Terminal = Depends(require_terminal),
    db: Session = Depends(get_db),
):
    """
    Authenticate a cashier using a username and six-digit PIN.

    The registered terminal Bearer credential is also required.

    One active cashier session is permitted per terminal.
    Different terminals may authenticate the same cashier simultaneously.
    """

    no_store(response)

    client_ip = get_client_ip(request)

    attempt_keys = cashier_login_attempt_keys(
        payload.username,
        client_ip,
    )

    locked_attempts: list = []

    try:
        locked_attempts, retry_after = lock_cashier_login_attempts(
            db,
            attempt_keys,
        )

        if retry_after:
            db.rollback()

            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=("Too many unsuccessful PIN attempts. Please try again later."),
                headers={
                    "Retry-After": str(retry_after),
                    "Cache-Control": "no-store",
                },
            )

        cashier = db.scalar(
            select(Cashier).where(
                Cashier.username == payload.username,
            )
        )

        stored_hash = cashier.pin_hash if cashier is not None else DUMMY_PASSWORD_HASH

        supplied_pin = payload.pin.get_secret_value()

        # Verify even when the username doesn't exist.
        # This reduces account-enumeration timing differences.
        pin_valid = verify_password(
            supplied_pin,
            stored_hash,
        )

        if cashier is None or not pin_valid or not cashier.is_active:
            record_failed_cashier_login(locked_attempts)
            db.commit()

            raise authentication_failed()

        original_pin_hash = cashier.pin_hash

        # Serialize logins on the same physical terminal.
        # This also protects against simultaneous cashier switching.
        locked_terminal = db.scalar(
            select(Terminal)
            .where(Terminal.id == terminal.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )

        if locked_terminal is None or not locked_terminal.is_enabled:
            db.rollback()

            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This terminal is no longer authorized.",
            )

        # Recheck the account under a row lock.
        # This prevents a PIN reset or account disable from racing
        # with a login that already verified the previous PIN.
        locked_cashier = db.scalar(
            select(Cashier)
            .where(Cashier.id == cashier.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )

        if (
            locked_cashier is None
            or not locked_cashier.is_active
            or locked_cashier.pin_hash != original_pin_hash
        ):
            record_failed_cashier_login(locked_attempts)
            db.commit()

            raise authentication_failed()

        now = utc_now()

        # Revoke the current cashier session on this terminal.
        # The terminal row lock serializes competing login requests.
        db.execute(
            update(CashierSession)
            .where(
                CashierSession.terminal_id == locked_terminal.id,
                CashierSession.revoked_at.is_(None),
            )
            .values(revoked_at=now)
            .execution_options(synchronize_session=False)
        )

        created_session: CreatedCashierSession = create_cashier_session(
            db,
            locked_cashier,
            locked_terminal.id,
        )

        locked_cashier.last_login_at = now

        reset_cashier_login_attempts(
            db,
            attempt_keys,
        )

        db.commit()

        return {
            "authenticated": True,
            "cashier": {
                "id": str(locked_cashier.id),
                "username": locked_cashier.username,
                "display_name": locked_cashier.display_name,
            },
            "session_token": created_session.session_token,
            "idle_expires_at": (created_session.record.idle_expires_at.isoformat()),
            "absolute_expires_at": (
                created_session.record.absolute_expires_at.isoformat()
            ),
        }

    except HTTPException:
        raise

    except SQLAlchemyError as exc:
        db.rollback()

        logger.exception("Cashier login database operation failed.")

        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Cashier login is temporarily unavailable.",
        ) from exc


# --------------------------------------------------
# Mobile: restore current cashier session
# --------------------------------------------------


@router.get("/api/cashier-auth/session")
def get_cashier_session(
    response: Response,
    principal: CashierPrincipal = Depends(require_cashier_principal),
):
    no_store(response)

    return {
        "authenticated": True,
        "cashier": {
            "id": str(principal.cashier.id),
            "username": principal.cashier.username,
            "display_name": principal.cashier.display_name,
        },
        "terminal_id": principal.terminal.id,
        "idle_expires_at": principal.session.idle_expires_at.isoformat(),
        "absolute_expires_at": (principal.session.absolute_expires_at.isoformat()),
    }


# --------------------------------------------------
# Mobile: cashier logout
# --------------------------------------------------


@router.post("/api/cashier-auth/logout")
def logout_cashier(
    response: Response,
    x_cashier_session: str | None = Header(
        default=None,
        alias="X-Cashier-Session",
    ),
    terminal: Terminal = Depends(require_terminal),
    db: Session = Depends(get_db),
):
    """
    Revoke the current cashier session on this terminal.

    Logout is idempotent. An expired or already-revoked session
    does not prevent the mobile app from clearing its local token.
    """

    no_store(response)

    if x_cashier_session and len(x_cashier_session) <= 256:
        from auth.security import hash_secret

        now = utc_now()

        try:
            db.execute(
                update(CashierSession)
                .where(
                    CashierSession.terminal_id == terminal.id,
                    CashierSession.session_token_hash == hash_secret(x_cashier_session),
                    CashierSession.revoked_at.is_(None),
                )
                .values(revoked_at=now)
                .execution_options(synchronize_session=False)
            )

            db.commit()

        except SQLAlchemyError as exc:
            db.rollback()

            logger.exception("Cashier logout failed.")

            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Cashier logout could not be saved.",
            ) from exc

    return {
        "authenticated": False,
        "message": "Cashier session ended.",
    }


# --------------------------------------------------
# Admin: list cashier accounts
# --------------------------------------------------


@router.get("/api/admin/cashiers")
def list_cashiers(
    response: Response,
    _admin: AdminUser = Depends(require_admin_session),
    db: Session = Depends(get_db),
):
    no_store(response)

    cashiers = db.scalars(
        select(Cashier).order_by(
            Cashier.display_name.asc(),
            Cashier.username.asc(),
        )
    ).all()

    return {"items": [cashier_response(cashier) for cashier in cashiers]}


# --------------------------------------------------
# Admin: create cashier account
# --------------------------------------------------


@router.post(
    "/api/admin/cashiers",
    status_code=status.HTTP_201_CREATED,
)
def create_cashier(
    payload: CashierCreateRequest,
    response: Response,
    _admin: AdminUser = Depends(require_admin_session),
    db: Session = Depends(get_db),
):
    no_store(response)

    cashier = Cashier(
        username=payload.username,
        display_name=payload.display_name,
        pin_hash=hash_password(payload.pin.get_secret_value()),
        is_active=True,
    )

    try:
        db.add(cashier)
        db.commit()
        db.refresh(cashier)

        return cashier_response(cashier)

    except IntegrityError as exc:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That cashier username is already in use.",
        ) from exc

    except SQLAlchemyError as exc:
        db.rollback()

        logger.exception("Cashier account creation failed.")

        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The cashier account could not be created.",
        ) from exc


# --------------------------------------------------
# Admin: update or disable cashier
# --------------------------------------------------


@router.patch("/api/admin/cashiers/{cashier_id}")
def update_cashier(
    cashier_id: UUID,
    payload: CashierUpdateRequest,
    response: Response,
    _admin: AdminUser = Depends(require_admin_session),
    db: Session = Depends(get_db),
):
    no_store(response)

    try:
        cashier = db.scalar(
            select(Cashier).where(Cashier.id == cashier_id).with_for_update()
        )

        if cashier is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Cashier not found.",
            )

        updates = payload.model_dump(exclude_unset=True)

        for field, value in updates.items():
            setattr(cashier, field, value)

        cashier.updated_at = utc_now()

        if cashier.is_active is False:
            now = utc_now()

            db.execute(
                update(CashierSession)
                .where(
                    CashierSession.cashier_id == cashier.id,
                    CashierSession.revoked_at.is_(None),
                )
                .values(revoked_at=now)
                .execution_options(synchronize_session=False)
            )

        db.commit()
        db.refresh(cashier)

        return cashier_response(cashier)

    except HTTPException:
        db.rollback()
        raise

    except SQLAlchemyError as exc:
        db.rollback()

        logger.exception("Cashier account update failed.")

        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The cashier account could not be updated.",
        ) from exc


# --------------------------------------------------
# Admin: reset cashier PIN
# --------------------------------------------------


@router.post("/api/admin/cashiers/{cashier_id}/reset-pin")
def reset_cashier_pin(
    cashier_id: UUID,
    payload: CashierPinResetRequest,
    response: Response,
    _admin: AdminUser = Depends(require_admin_session),
    db: Session = Depends(get_db),
):
    no_store(response)

    try:
        cashier = db.scalar(
            select(Cashier).where(Cashier.id == cashier_id).with_for_update()
        )

        if cashier is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Cashier not found.",
            )

        cashier.pin_hash = hash_password(payload.pin.get_secret_value())

        cashier.updated_at = utc_now()

        # A PIN reset revokes every existing session for this cashier,
        # including sessions on other registered terminals.
        db.execute(
            update(CashierSession)
            .where(
                CashierSession.cashier_id == cashier.id,
                CashierSession.revoked_at.is_(None),
            )
            .values(revoked_at=utc_now())
            .execution_options(synchronize_session=False)
        )

        db.commit()

        return {
            "cashier_id": str(cashier.id),
            "message": "Cashier PIN reset successfully. Existing sessions were revoked.",
        }

    except HTTPException:
        db.rollback()
        raise

    except SQLAlchemyError as exc:
        db.rollback()

        logger.exception("Cashier PIN reset failed.")

        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The cashier PIN could not be reset.",
        ) from exc
