"""
Time-based one-time passwords (RFC 6238) for administrator accounts, using
only the standard library.

The TOTP secret has to be recoverable, so it cannot be hashed. It is stored
encrypted with keys derived from the server's authentication secret
(KINESIS_ADMIN_AUTH_SECRET_KEY, mandatory in production): HMAC-SHA256 in
counter mode as the keystream and a separate HMAC-SHA256 key as the
integrity tag (encrypt-then-MAC). That protects the secret against a copy
of the database alone. If the `cryptography` package is ever added to the
production lock file, replace this with Fernet.
"""

import base64
import hashlib
import hmac
import secrets
import struct
import time
from urllib.parse import quote

from auth.config import auth_settings

STEP_SECONDS = 30
DIGITS = 6
ALLOWED_DRIFT_STEPS = 1
RECOVERY_CODE_COUNT = 8


def generate_secret() -> str:
    """A new 160-bit base32 secret, as authenticator apps expect."""

    return base64.b32encode(secrets.token_bytes(20)).decode("ascii")


def _code_for_step(secret: str, step: int) -> str:
    key = base64.b32decode(secret, casefold=True)
    digest = hmac.new(key, struct.pack(">Q", step), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    value = struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF

    return str(value % 10**DIGITS).zfill(DIGITS)


def verify_code(
    secret: str,
    code: str,
    *,
    last_used_step: int | None = None,
    now: float | None = None,
) -> int | None:
    """
    Return the accepted time step, or None.

    A step at or before ``last_used_step`` is rejected, so one code cannot
    be used twice.
    """

    code = (code or "").strip().replace(" ", "")

    if len(code) != DIGITS or not code.isdigit():
        return None

    current = int((now if now is not None else time.time()) // STEP_SECONDS)
    accepted: int | None = None

    for step in range(current - ALLOWED_DRIFT_STEPS, current + ALLOWED_DRIFT_STEPS + 1):
        if hmac.compare_digest(_code_for_step(secret, step), code):
            accepted = step

    if accepted is None:
        return None

    if last_used_step is not None and accepted <= last_used_step:
        return None

    return accepted


def provisioning_uri(secret: str, username: str, issuer: str = "Kinesis") -> str:
    label = quote(f"{issuer}:{username}", safe=":")

    return (
        f"otpauth://totp/{label}?secret={secret}&issuer={quote(issuer)}"
        f"&algorithm=SHA1&digits={DIGITS}&period={STEP_SECONDS}"
    )


# --------------------------------------------------
# Secret encryption at rest
# --------------------------------------------------


def _derive(purpose: bytes) -> bytes:
    return hmac.new(
        auth_settings.effective_secret_key, b"kinesis-totp-" + purpose, hashlib.sha256
    ).digest()


def _keystream(key: bytes, nonce: bytes, length: int) -> bytes:
    blocks = []

    for counter in range((length + 31) // 32):
        blocks.append(hmac.new(key, nonce + struct.pack(">I", counter), hashlib.sha256).digest())

    return b"".join(blocks)[:length]


def encrypt_secret(secret: str) -> str:
    plaintext = secret.encode("ascii")
    nonce = secrets.token_bytes(16)
    stream = _keystream(_derive(b"enc"), nonce, len(plaintext))
    ciphertext = bytes(a ^ b for a, b in zip(plaintext, stream))
    tag = hmac.new(_derive(b"mac"), nonce + ciphertext, hashlib.sha256).digest()

    return base64.urlsafe_b64encode(nonce + ciphertext + tag).decode("ascii")


def decrypt_secret(stored: str) -> str:
    raw = base64.urlsafe_b64decode(stored.encode("ascii"))

    if len(raw) < 16 + 32 + 1:
        raise ValueError("Stored TOTP secret is malformed.")

    nonce, ciphertext, tag = raw[:16], raw[16:-32], raw[-32:]
    expected = hmac.new(_derive(b"mac"), nonce + ciphertext, hashlib.sha256).digest()

    if not hmac.compare_digest(tag, expected):
        raise ValueError("Stored TOTP secret failed its integrity check.")

    stream = _keystream(_derive(b"enc"), nonce, len(ciphertext))

    return bytes(a ^ b for a, b in zip(ciphertext, stream)).decode("ascii")


# --------------------------------------------------
# Recovery codes
# --------------------------------------------------


def generate_recovery_codes() -> list[str]:
    """Ten-character codes from an unambiguous alphabet (about 50 bits each)."""

    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

    return [
        "".join(secrets.choice(alphabet) for _ in range(10))
        for _ in range(RECOVERY_CODE_COUNT)
    ]


def normalize_recovery_code(value: str) -> str:
    return value.strip().replace("-", "").replace(" ", "").upper()


def hash_recovery_code(value: str) -> str:
    return hashlib.sha256(normalize_recovery_code(value).encode("ascii", "ignore")).hexdigest()
