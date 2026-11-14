import logging
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
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
from auth.pos_auth import (
    clear_cashier_cookie,
    current_terminal_auth,
    read_cashier_credential,
    set_cashier_cookie,
)
from auth.security import hash_secret
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
    get_inactivity_lock_minutes,
    is_session_locked,
    lock_cashier_login_attempts,
    record_failed_cashier_login,
    reset_cashier_login_attempts,
    resolve_cashier_session,
)
from activity_tracking import _record
from database import get_db
from server_state import effective_maintenance
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


def validate_new_pin(value: SecretStr) -> SecretStr:
    """Format check plus a weak-PIN check. Only for PINs being set, never for
    sign-in: existing cashiers may already have simple PINs."""

    validate_pin(value)
    raw_pin = value.get_secret_value()

    digits = [int(character) for character in raw_pin]
    steps = {digits[i + 1] - digits[i] for i in range(5)}

    if len(set(digits)) == 1 or steps == {1} or steps == {-1}:
        raise ValueError(
            "That PIN is too easy to guess (for example 000000 or 123456). "
            "Choose a different one."
        )

    if raw_pin[:3] == raw_pin[3:]:
        raise ValueError("That PIN is too easy to guess. Choose a different one.")

    return value


def get_client_ip(request: Request) -> str | None:
    if request.client is None:
        return None

    return request.client.host[:45]


class CashierLoginRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    pin: SecretStr

    @field_validator("username")
    @classmethod
    def validate_username(cls, value: str) -> str:
        return normalize_username(value)

    @field_validator("pin")
    @classmethod
    def validate_cashier_pin(cls, value: SecretStr) -> SecretStr:
        return validate_pin(value)


class CashierPinVerificationRequest(BaseModel):
    pin: SecretStr

    @field_validator("pin")
    @classmethod
    def validate_cashier_pin(cls, value: SecretStr) -> SecretStr:
        return validate_pin(value)


class CashierCreateRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    display_name: str = Field(min_length=1, max_length=100)
    pin: SecretStr
    is_supervisor: bool = False

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
        return validate_new_pin(value)


class CashierUpdateRequest(BaseModel):
    display_name: str | None = Field(default=None, max_length=100)
    is_active: bool | None = None
    is_supervisor: bool | None = None

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

        if "is_supervisor" in self.model_fields_set and self.is_supervisor is None:
            raise ValueError("Supervisor status cannot be null.")

        return self


class CashierPinResetRequest(BaseModel):
    pin: SecretStr

    @field_validator("pin")
    @classmethod
    def validate_cashier_pin(cls, value: SecretStr) -> SecretStr:
        return validate_new_pin(value)


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
        "is_supervisor": cashier.is_supervisor,
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


def cashier_credential_body(
    request: Request,
    response: Response,
    raw_session_token: str,
) -> dict:
    """
    Deliver a new cashier session credential using the terminal's transport:
    an HttpOnly cookie for browser terminals, JSON for native apps.
    """

    if current_terminal_auth(request).via_cookie:
        set_cashier_cookie(response, raw_session_token)
        return {}

    return {"session_token": raw_session_token}


# The app recognises this exact message (src/lib/api.ts) and shows its lock
# screen, so keep the two in step.
TERMINAL_LOCKED_DETAIL = "This terminal is locked. Enter your PIN to continue."

# A cashier request refreshes "last activity" at most this often.
ACTIVITY_WRITE_INTERVAL_SECONDS = 5


def touch_activity(db: Session, session_record) -> None:
    now = utc_now()

    if (now - session_record.last_activity_at).total_seconds() >= ACTIVITY_WRITE_INTERVAL_SECONDS:
        session_record.last_activity_at = now
        db.commit()


def resolve_cashier_principal(
    request: Request,
    terminal: Terminal,
    db: Session,
) -> CashierPrincipal:
    raw_cashier_token = read_cashier_credential(request)

    if not raw_cashier_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Cashier authentication is required.",
        )

    session_record = resolve_cashier_session(
        db,
        raw_cashier_token,
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


def attribute_to_cashier(db: Session, principal: CashierPrincipal) -> None:
    # Attribute activity events recorded during this request to the cashier
    # (see activity_tracking._record).
    db.info["kinesis_actor"] = {
        "actor_type": "cashier",
        "actor_id": str(principal.cashier.id),
        "actor_name": principal.cashier.display_name,
        "cashier_id": str(principal.cashier.id),
        "terminal_id": principal.terminal.id,
    }


def require_cashier_principal_allow_locked(
    request: Request,
    terminal: Terminal = Depends(require_terminal),
    db: Session = Depends(get_db),
) -> CashierPrincipal:
    """
    Authenticate the cashier session even when the terminal is locked. Only
    for the few routes a locked terminal needs: asking whether it is locked,
    unlocking with the PIN, and signing out.
    """

    principal = resolve_cashier_principal(request, terminal, db)
    attribute_to_cashier(db, principal)

    return principal


def require_cashier_principal(
    request: Request,
    terminal: Terminal = Depends(require_terminal),
    db: Session = Depends(get_db),
) -> CashierPrincipal:
    """
    Authenticate a cashier session that belongs to the requesting terminal
    and is not locked.

    Terminal authentication and cashier authentication are independent.
    Both credentials are required. Native apps send X-Cashier-Session;
    browser terminals send the HttpOnly cashier cookie.

    A locked terminal answers 423 here, so reloading the page, or calling
    the API directly, cannot get around the lock: it ends only when the
    cashier's PIN is verified again.
    """

    principal = resolve_cashier_principal(request, terminal, db)

    if is_session_locked(db, principal.session):
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail=TERMINAL_LOCKED_DETAIL,
            headers={"Cache-Control": "no-store"},
        )

    attribute_to_cashier(db, principal)

    return principal


def require_writable_cashier(
    principal: CashierPrincipal = Depends(require_cashier_principal),
) -> CashierPrincipal:
    """
    Require a signed-in cashier on an enabled terminal that is not in
    maintenance mode. Used for catalog and inventory changes so that every
    modification is made, and recorded, by an identified person rather than
    by any holder of a terminal credential.
    """

    if effective_maintenance(principal.terminal):
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail=(
                "This terminal is in maintenance mode. "
                "POS modifications are temporarily unavailable."
            ),
        )

    return principal


def require_supervisor_cashier(
    principal: CashierPrincipal = Depends(require_writable_cashier),
) -> CashierPrincipal:
    """
    Require a signed-in supervisor. Used for changes that alter what the shop
    charges or sells (service prices, retiring a service), so an ordinary
    cashier cannot reprice or remove items.
    """

    if not principal.cashier.is_supervisor:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only a supervisor can make this change.",
        )

    return principal


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

    No PIN hashes, supervisor designations, or authentication
    credentials are exposed to the public account-selection screen.
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
                detail="Too many unsuccessful PIN attempts. Please try again later.",
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

        # Recheck the account under a row lock to prevent a PIN reset
        # or account disable from racing with authentication.
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
            **cashier_credential_body(
                request,
                response,
                created_session.session_token,
            ),
            "authenticated": True,
            "cashier": {
                "id": str(locked_cashier.id),
                "username": locked_cashier.username,
                "display_name": locked_cashier.display_name,
                "is_supervisor": locked_cashier.is_supervisor,
            },
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
    principal: CashierPrincipal = Depends(require_cashier_principal_allow_locked),
    db: Session = Depends(get_db),
):
    no_store(response)

    locked = is_session_locked(db, principal.session)

    if not locked:
        # Apps from before the server-side lock keep the session alive with
        # this request while the cashier uses the terminal, so it counts as
        # activity. It can never unlock: a locked session is reported as
        # locked and left alone.
        touch_activity(db, principal.session)

    return {
        # The app shows its lock screen from this, including right after a
        # page reload or an app restart.
        "locked": locked,
        "lock_after_minutes": get_inactivity_lock_minutes(db),
        "authenticated": True,
        "cashier": {
            "id": str(principal.cashier.id),
            "username": principal.cashier.username,
            "display_name": principal.cashier.display_name,
            "is_supervisor": principal.cashier.is_supervisor,
        },
        "terminal_id": principal.terminal.id,
        "idle_expires_at": principal.session.idle_expires_at.isoformat(),
        "absolute_expires_at": principal.session.absolute_expires_at.isoformat(),
    }


# --------------------------------------------------
# Terminal lock: lock now, and keep the activity clock
# --------------------------------------------------


@router.post("/api/cashier-auth/lock")
def lock_cashier_terminal(
    response: Response,
    principal: CashierPrincipal = Depends(require_cashier_principal_allow_locked),
    db: Session = Depends(get_db),
):
    """Lock this terminal until the cashier's PIN is verified again."""

    no_store(response)

    if principal.session.locked_at is None:
        principal.session.locked_at = utc_now()

        _record(
            db,
            "cashier.terminal_locked",
            f"Terminal locked: {principal.cashier.display_name}",
            terminal_id=principal.terminal.id,
        )

        db.commit()

    return {"locked": True}


@router.post("/api/cashier-auth/activity")
def record_cashier_activity(
    response: Response,
    principal: CashierPrincipal = Depends(require_cashier_principal_allow_locked),
    db: Session = Depends(get_db),
):
    """
    The app calls this while the cashier is using the terminal. It moves the
    inactivity clock; a terminal that is already locked stays locked.
    """

    no_store(response)

    if is_session_locked(db, principal.session):
        return {"locked": True}

    touch_activity(db, principal.session)

    return {"locked": False}


# --------------------------------------------------
# Mobile: verify current cashier PIN when unlocking
# --------------------------------------------------


@router.post("/api/cashier-auth/verify-pin")
def verify_current_cashier_pin(
    payload: CashierPinVerificationRequest,
    request: Request,
    response: Response,
    principal: CashierPrincipal = Depends(require_cashier_principal_allow_locked),
    db: Session = Depends(get_db),
):
    """
    Re-verify the currently authenticated cashier without creating
    a new session. Used to unlock a terminal after inactivity.

    Attempts share the existing account/IP rate-limit buckets
    with cashier login.
    """

    no_store(response)

    attempt_keys = cashier_login_attempt_keys(
        principal.cashier.username,
        get_client_ip(request),
    )

    try:
        locked_attempts, retry_after = lock_cashier_login_attempts(
            db,
            attempt_keys,
        )

        if retry_after:
            db.rollback()

            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many unsuccessful PIN attempts. Please try again later.",
                headers={
                    "Retry-After": str(retry_after),
                    "Cache-Control": "no-store",
                },
            )

        cashier = db.scalar(
            select(Cashier)
            .where(Cashier.id == principal.cashier.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )

        stored_hash = cashier.pin_hash if cashier is not None else DUMMY_PASSWORD_HASH

        pin_valid = verify_password(
            payload.pin.get_secret_value(),
            stored_hash,
        )

        if cashier is None or not cashier.is_active or not pin_valid:
            record_failed_cashier_login(locked_attempts)
            db.commit()
            raise authentication_failed()

        # Re-authentication issues a new session identifier and revokes the
        # old one, so a token captured before the lock cannot be reused.
        locked_terminal = db.scalar(
            select(Terminal)
            .where(Terminal.id == principal.terminal.id)
            .with_for_update()
        )

        if locked_terminal is None or not locked_terminal.is_enabled:
            db.rollback()

            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This terminal is no longer authorized.",
            )

        db.execute(
            update(CashierSession)
            .where(
                CashierSession.id == principal.session.id,
                CashierSession.revoked_at.is_(None),
            )
            .values(revoked_at=utc_now())
            .execution_options(synchronize_session=False)
        )

        created_session = create_cashier_session(
            db,
            cashier,
            locked_terminal.id,
        )

        reset_cashier_login_attempts(
            db,
            attempt_keys,
        )

        if principal.session.locked_at is not None or is_session_locked(db, principal.session):
            _record(
                db,
                "cashier.terminal_unlocked",
                f"Terminal unlocked: {cashier.display_name}",
                terminal_id=locked_terminal.id,
            )

        db.commit()

        return {
            **cashier_credential_body(
                request,
                response,
                created_session.session_token,
            ),
            "idle_expires_at": created_session.record.idle_expires_at.isoformat(),
            "absolute_expires_at": (
                created_session.record.absolute_expires_at.isoformat()
            ),
            "verified": True,
            "cashier": {
                "id": str(cashier.id),
                "username": cashier.username,
                "display_name": cashier.display_name,
                "is_supervisor": cashier.is_supervisor,
            },
        }

    except HTTPException:
        raise

    except SQLAlchemyError as exc:
        db.rollback()

        logger.exception("Cashier PIN verification failed.")

        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="PIN verification is temporarily unavailable.",
        ) from exc


# --------------------------------------------------
# Mobile: cashier logout
# --------------------------------------------------


@router.post("/api/cashier-auth/logout")
def logout_cashier(
    request: Request,
    response: Response,
    terminal: Terminal = Depends(require_terminal),
    db: Session = Depends(get_db),
):
    """
    Revoke the current cashier session on this terminal.

    Logout is idempotent. An expired or already-revoked session
    does not prevent the mobile app from clearing its local token.
    """

    no_store(response)

    raw_cashier_token = read_cashier_credential(request)

    if current_terminal_auth(request).via_cookie:
        clear_cashier_cookie(response)

    if raw_cashier_token:
        now = utc_now()

        try:
            db.execute(
                update(CashierSession)
                .where(
                    CashierSession.terminal_id == terminal.id,
                    CashierSession.session_token_hash == hash_secret(raw_cashier_token),
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
        is_supervisor=payload.is_supervisor,
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
            "message": (
                "Cashier PIN reset successfully. Existing sessions were revoked."
            ),
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
