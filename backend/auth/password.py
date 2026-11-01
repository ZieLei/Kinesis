from argon2 import PasswordHasher, Type
from argon2.exceptions import (
    InvalidHashError,
    VerificationError,
    VerifyMismatchError,
)


PASSWORD_HASHER = PasswordHasher(
    time_cost=3,
    memory_cost=65536,
    parallelism=2,
    hash_len=32,
    salt_len=16,
    type=Type.ID,
)


# Used to make nonexistent usernames follow a similar password-verification
# path to existing usernames.
DUMMY_PASSWORD_HASH = PASSWORD_HASHER.hash(
    "Kinesis-development-dummy-password-never-use-as-a-real-credential"
)


def hash_password(password: str) -> str:
    """
    Hash an administrator password using Argon2id.

    The returned hash contains its algorithm parameters and salt.
    """
    return PASSWORD_HASHER.hash(password)


def verify_password(
    password: str,
    password_hash: str,
) -> bool:
    """
    Verify a password against an existing Argon2id hash.

    Invalid hashes and mismatched passwords both return False.
    """
    try:
        return PASSWORD_HASHER.verify(
            password_hash,
            password,
        )

    except (
        VerifyMismatchError,
        VerificationError,
        InvalidHashError,
    ):
        return False


def password_needs_rehash(password_hash: str) -> bool:
    """
    Determine whether an existing password hash should be upgraded
    to the current Argon2id parameters.
    """
    try:
        return PASSWORD_HASHER.check_needs_rehash(password_hash)

    except (
        VerificationError,
        InvalidHashError,
    ):
        return False
