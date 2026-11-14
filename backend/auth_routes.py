import logging
import re
from datetime import datetime, timezone

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Request,
    Response,
    status,
)
from pydantic import BaseModel, Field, SecretStr, field_validator
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from admin_models import AdminRecoveryCode, AdminUser
from auth.cookies import (
    clear_admin_session_cookie,
    set_admin_session_cookie,
)
from auth.dependencies import (
    AdminPrincipal,
    get_admin_principal,
    require_admin_origin,
)
from auth.login_limits import (
    is_login_rate_limited,
    login_attempt_keys,
    record_failed_login,
    reset_login_attempts,
)
from auth.mfa import check_second_factor
from auth import totp
from auth.password import (
    DUMMY_PASSWORD_HASH,
    hash_password,
    password_needs_rehash,
    verify_password,
)
from auth.security import verify_csrf_token
from auth.sessions import (
    create_admin_session,
    resolve_admin_session,
    revoke_admin_session,
)
from auth.config import auth_settings
from database import get_db


logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/auth",
    tags=["Admin Authentication"],
)


USERNAME_PATTERN = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9._-]{2,63}$")


class AdminLoginRequest(BaseModel):
    username: str = Field(
        min_length=3,
        max_length=64,
    )

    password: SecretStr = Field(
        min_length=1,
        max_length=128,
    )

    # Authenticator code or recovery code; required only for accounts with
    # two-factor authentication enabled.
    otp: str | None = Field(default=None, max_length=32)

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        value = value.strip().lower()

        if not USERNAME_PATTERN.fullmatch(value):
            raise ValueError("Invalid username.")

        return value


def no_store(response: Response) -> None:
    """Prevent authentication responses from being cached."""

    response.headers["Cache-Control"] = "no-store, private"
    response.headers["Pragma"] = "no-cache"


def get_client_ip(request: Request) -> str | None:
    """
    Use the directly connected peer.

    Do not trust forwarded IP headers unless a trusted reverse proxy
    has been explicitly configured.
    """

    if request.client is None:
        return None

    return request.client.host[:45]


def authentication_failed() -> HTTPException:
    """
    Return a generic response that does not reveal whether an
    administrator username exists.
    """

    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid username or password.",
        headers={
            "WWW-Authenticate": "Session",
            "Cache-Control": "no-store",
        },
    )


# --------------------------------------------------
# Administrator login
# --------------------------------------------------


@router.post("/login")
def login_admin(
    payload: AdminLoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    """
    Authenticate an administrator and issue a new browser session.

    Passwords are verified using Argon2id.
    Raw session tokens are returned only through HttpOnly cookies.
    """

    require_admin_origin(request)
    no_store(response)

    client_ip = get_client_ip(request)

    attempt_keys = login_attempt_keys(
        payload.username,
        client_ip,
    )

    is_limited, retry_after = is_login_rate_limited(
        db,
        attempt_keys,
    )

    if is_limited:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=("Too many unsuccessful login attempts. Please try again later."),
            headers={
                "Retry-After": str(retry_after),
                "Cache-Control": "no-store",
            },
        )

    admin = db.scalar(
        select(AdminUser).where(
            AdminUser.username == payload.username,
        )
    )

    supplied_password = payload.password.get_secret_value()

    # Always perform password verification, including for nonexistent
    # usernames, to reduce username-enumeration timing differences.
    stored_hash = admin.password_hash if admin is not None else DUMMY_PASSWORD_HASH

    password_valid = verify_password(
        supplied_password,
        stored_hash,
    )

    if admin is None or not password_valid or not admin.is_active:
        record_failed_login(
            db,
            attempt_keys,
        )

        raise authentication_failed()

    if admin.totp_enabled_at is not None:
        if not (payload.otp or "").strip():
            # Password was right; ask for the second factor. Not counted
            # as a failure.
            raise HTTPException(
                status_code=status.HTTP_428_PRECONDITION_REQUIRED,
                detail="Enter the 6-digit code from your authenticator app.",
                headers={"Cache-Control": "no-store"},
            )

        if not check_second_factor(db, admin, payload.otp):
            db.rollback()
            record_failed_login(db, attempt_keys)

            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="That verification code is not valid.",
                headers={"Cache-Control": "no-store"},
            )

    now = datetime.now(timezone.utc)

    try:
        # Upgrade the stored hash when the current Argon2 parameters
        # differ from the parameters used to create the existing hash.
        if password_needs_rehash(admin.password_hash):
            admin.password_hash = hash_password(supplied_password)

        reset_login_attempts(
            db,
            attempt_keys,
        )

        admin.last_login_at = now

        new_session = create_admin_session(
            db,
            admin,
            request,
        )

        db.commit()

    except SQLAlchemyError as exc:
        db.rollback()

        logger.exception("Administrator session creation failed.")

        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "The administrator session could not be created. Please try again."
            ),
        ) from exc

    set_admin_session_cookie(
        response,
        new_session.session_token,
    )

    return {
        "authenticated": True,
        "user": {
            "username": admin.username,
        },
        "csrf_token": new_session.csrf_token,
        "idle_expires_at": new_session.record.idle_expires_at.isoformat(),
        "absolute_expires_at": new_session.record.absolute_expires_at.isoformat(),
    }


# --------------------------------------------------
# Restore an existing browser session
# --------------------------------------------------


@router.get("/session")
def get_current_admin_session(
    response: Response,
    principal: AdminPrincipal = Depends(get_admin_principal),
):
    """
    Retrieve the currently authenticated administrator.

    Also provides the CSRF token needed by the frontend after a
    browser refresh.
    """

    no_store(response)

    return {
        "authenticated": True,
        "user": {
            "username": principal.user.username,
        },
        "csrf_token": principal.csrf_token,
        "idle_expires_at": principal.session.idle_expires_at.isoformat(),
        "absolute_expires_at": principal.session.absolute_expires_at.isoformat(),
    }


# --------------------------------------------------
# Administrator logout
# --------------------------------------------------


@router.post("/logout")
def logout_admin(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    """
    Revoke the current administrator session.

    Logout also clears an expired or otherwise invalid cookie, allowing
    the browser to recover without manually clearing site data.
    """

    require_admin_origin(request)
    no_store(response)

    raw_token = request.cookies.get(
        auth_settings.admin_cookie_name,
    )

    if raw_token:
        session_record = resolve_admin_session(
            db,
            raw_token,
        )

        if session_record is not None:
            supplied_csrf = request.headers.get(
                "X-CSRF-Token",
            )

            if not verify_csrf_token(
                supplied_csrf,
                session_record.id,
            ):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="The CSRF token is missing or invalid.",
                )

            revoke_admin_session(
                db,
                session_record,
            )

            try:
                db.commit()

            except SQLAlchemyError as exc:
                db.rollback()

                logger.exception("Administrator session revocation failed.")

                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="The administrator session could not be revoked.",
                ) from exc

    clear_admin_session_cookie(response)

    return {
        "authenticated": False,
        "message": "Administrator session ended.",
    }


# --------------------------------------------------
# Two-factor authentication management
# --------------------------------------------------


class MfaCodeRequest(BaseModel):
    code: str = Field(min_length=1, max_length=32)


class MfaDisableRequest(BaseModel):
    password: SecretStr = Field(min_length=1, max_length=128)
    code: str = Field(min_length=1, max_length=32)


def _recovery_remaining(db: Session, admin: AdminUser) -> int:
    return len(
        db.scalars(
            select(AdminRecoveryCode.id).where(
                AdminRecoveryCode.admin_user_id == admin.id,
                AdminRecoveryCode.used_at.is_(None),
            )
        ).all()
    )


@router.get("/mfa")
def mfa_status(
    response: Response,
    principal: AdminPrincipal = Depends(get_admin_principal),
    db: Session = Depends(get_db),
):
    no_store(response)

    return {
        "enabled": principal.user.totp_enabled_at is not None,
        "recovery_codes_remaining": _recovery_remaining(db, principal.user),
    }


@router.post("/mfa/setup")
def mfa_setup(
    response: Response,
    principal: AdminPrincipal = Depends(get_admin_principal),
    db: Session = Depends(get_db),
):
    """Start enrolment: create a secret to add to an authenticator app."""

    no_store(response)
    admin = principal.user

    if admin.totp_enabled_at is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Two-factor authentication is already enabled. Disable it first.",
        )

    secret = totp.generate_secret()
    admin.totp_secret_enc = totp.encrypt_secret(secret)
    admin.totp_last_step = None
    db.commit()

    return {
        "secret": secret,
        "otpauth_uri": totp.provisioning_uri(secret, admin.username),
    }


@router.post("/mfa/enable")
def mfa_enable(
    payload: MfaCodeRequest,
    response: Response,
    principal: AdminPrincipal = Depends(get_admin_principal),
    db: Session = Depends(get_db),
):
    """Confirm enrolment with a code; returns the recovery codes once."""

    no_store(response)
    admin = db.scalar(
        select(AdminUser)
        .where(AdminUser.id == principal.user.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )

    if admin is None or admin.totp_secret_enc is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Start the setup first.")

    if admin.totp_enabled_at is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Two-factor authentication is already enabled.")

    step = totp.verify_code(totp.decrypt_secret(admin.totp_secret_enc), payload.code)

    if step is None:
        db.rollback()
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "That code is not valid. Check the time on your phone and try the next code.",
        )

    codes = totp.generate_recovery_codes()
    db.execute(
        AdminRecoveryCode.__table__.delete().where(
            AdminRecoveryCode.admin_user_id == admin.id
        )
    )
    db.add_all(
        AdminRecoveryCode(admin_user_id=admin.id, code_hash=totp.hash_recovery_code(code))
        for code in codes
    )

    admin.totp_last_step = step
    admin.totp_enabled_at = datetime.now(timezone.utc)
    db.commit()

    return {"enabled": True, "recovery_codes": codes}


@router.post("/mfa/disable")
def mfa_disable(
    payload: MfaDisableRequest,
    response: Response,
    principal: AdminPrincipal = Depends(get_admin_principal),
    db: Session = Depends(get_db),
):
    """Turn off two-factor authentication; needs the password and a code."""

    no_store(response)
    admin = principal.user

    if admin.totp_enabled_at is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Two-factor authentication is not enabled.")

    if not verify_password(payload.password.get_secret_value(), admin.password_hash):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "The password is not correct.")

    if not check_second_factor(db, admin, payload.code):
        db.rollback()
        raise HTTPException(status.HTTP_403_FORBIDDEN, "That verification code is not valid.")

    admin.totp_secret_enc = None
    admin.totp_enabled_at = None
    admin.totp_last_step = None
    db.execute(
        AdminRecoveryCode.__table__.delete().where(
            AdminRecoveryCode.admin_user_id == admin.id
        )
    )
    db.commit()

    return {"enabled": False}
