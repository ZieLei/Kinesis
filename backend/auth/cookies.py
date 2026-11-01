from fastapi import Response

from auth.config import auth_settings


def set_admin_session_cookie(
    response: Response,
    session_token: str,
) -> None:
    """
    Issue the administrator session as an HttpOnly browser cookie.
    """

    response.set_cookie(
        key=auth_settings.admin_cookie_name,
        value=session_token,
        max_age=auth_settings.admin_session_absolute_hours * 3600,
        path="/",
        secure=auth_settings.admin_cookie_secure,
        httponly=True,
        samesite=auth_settings.admin_cookie_samesite,
    )


def clear_admin_session_cookie(
    response: Response,
) -> None:
    """
    Remove the administrator session cookie from the browser.
    """

    response.delete_cookie(
        key=auth_settings.admin_cookie_name,
        path="/",
        secure=auth_settings.admin_cookie_secure,
        httponly=True,
        samesite=auth_settings.admin_cookie_samesite,
    )
