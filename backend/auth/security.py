import hashlib
import hmac
import secrets
from uuid import UUID

from auth.config import auth_settings


def generate_secret() -> str:
    """
    Generate a cryptographically secure random secret.

    A 32-byte random value is encoded using URL-safe Base64.
    """
    return secrets.token_urlsafe(32)


def hash_secret(value: str) -> str:
    """
    Produce a SHA-256 digest for a high-entropy session identifier.

    Session identifiers are already cryptographically random, so a
    fast cryptographic hash is appropriate here.
    """
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def derive_csrf_token(session_id: UUID) -> str:
    """
    Derive a session-specific CSRF token using HMAC-SHA256.

    This allows the server to reproduce the CSRF token after a browser
    reload without storing the raw token in PostgreSQL.

    The token is bound to one administrator session.
    """
    message = b"kinesis-admin-csrf-v1:" + session_id.bytes

    return hmac.new(
        auth_settings.effective_secret_key,
        message,
        hashlib.sha256,
    ).hexdigest()


def verify_csrf_token(
    supplied_token: str | None,
    session_id: UUID,
) -> bool:
    if not supplied_token:
        return False

    expected_token = derive_csrf_token(session_id)

    return secrets.compare_digest(
        supplied_token,
        expected_token,
    )
