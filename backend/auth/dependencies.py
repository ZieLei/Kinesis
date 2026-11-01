from dataclasses import dataclass

from fastapi import (
    Depends,
    Header,
    HTTPException,
    Request,
    status,
)
from sqlalchemy.orm import Session
from starlette.requests import HTTPConnection

from admin_models import AdminSession, AdminUser
from auth.config import auth_settings
from auth.security import (
    derive_csrf_token,
    verify_csrf_token,
)
from auth.sessions import resolve_admin_session
from database import get_db
from terminal_routes import require_terminal


SAFE_METHODS = {
    "GET",
    "HEAD",
    "OPTIONS",
}


@dataclass(frozen=True, slots=True)
class AdminPrincipal:
    """Authenticated administrator and browser session context."""

    user: AdminUser
    session: AdminSession
    csrf_token: str


def require_admin_origin(connection: HTTPConnection) -> None:
    """
    Require an explicitly permitted browser origin.

    HTTPConnection works with both ordinary HTTP requests and
    WebSocket connections.
    """

    origin = connection.headers.get("origin")

    if not origin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="An allowed browser origin is required.",
        )

    if origin.rstrip("/") not in auth_settings.allowed_origins:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This browser origin is not permitted.",
        )


def get_admin_principal(
    connection: HTTPConnection,
    db: Session = Depends(get_db),
) -> AdminPrincipal:
    """
    Authenticate an administrator using the HttpOnly session cookie.

    For HTTP requests:
    - Safe methods require a valid administrator session.
    - Unsafe methods additionally require an allowed Origin and CSRF token.

    For WebSocket connections:
    - A valid administrator session is required.
    - The browser Origin must be explicitly allowed.
    - CSRF headers are not used for WebSocket handshakes.
    """

    raw_token = connection.cookies.get(
        auth_settings.admin_cookie_name,
    )

    if not raw_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Administrator authentication is required.",
        )

    session_record = resolve_admin_session(
        db,
        raw_token,
    )

    if session_record is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Your administrator session has expired or been revoked.",
        )

    connection_type = connection.scope.get("type")

    if connection_type == "websocket":
        require_admin_origin(connection)

    elif connection_type == "http":
        method = connection.method.upper()

        if method not in SAFE_METHODS:
            require_admin_origin(connection)

            supplied_csrf = connection.headers.get(
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

    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Unsupported authentication connection.",
        )

    return AdminPrincipal(
        user=session_record.admin_user,
        session=session_record,
        csrf_token=derive_csrf_token(session_record.id),
    )


def require_admin_session(
    principal: AdminPrincipal = Depends(get_admin_principal),
) -> AdminUser:
    """Require an authenticated administrator session."""

    return principal.user


def require_admin_session_or_terminal(
    request: Request,
    authorization: str | None = Header(
        default=None,
        alias="Authorization",
    ),
    db: Session = Depends(get_db),
) -> AdminUser | object:
    """
    Allow an administrator browser session or an enabled POS terminal.

    Administrator sessions are checked first.

    If no administrator cookie is present, the request must provide
    a valid registered terminal Bearer credential.
    """

    raw_cookie = request.cookies.get(
        auth_settings.admin_cookie_name,
    )

    if raw_cookie:
        principal = get_admin_principal(
            request,
            db,
        )

        return principal.user

    return require_terminal(
        authorization,
        db,
    )
