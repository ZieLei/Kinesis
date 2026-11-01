from fastapi import FastAPI

from auth.dependencies import (
    require_admin_session,
    require_admin_session_or_terminal,
)

from auth_routes import router as admin_auth_router

from terminal_routes import (
    require_admin_or_terminal,
    require_admin_token,
)


def install_admin_authentication(
    app: FastAPI,
) -> None:
    """
    Register browser authentication and enforce the new
    administrator session mechanism.

    Existing POS terminal Bearer authentication remains separate.
    """

    app.include_router(admin_auth_router)

    # Administrator-only endpoints now require a browser session.
    app.dependency_overrides[require_admin_token] = require_admin_session

    # Mixed endpoints accept either:
    # 1. An authenticated administrator browser session.
    # 2. A registered and enabled POS terminal.
    app.dependency_overrides[require_admin_or_terminal] = (
        require_admin_session_or_terminal
    )
