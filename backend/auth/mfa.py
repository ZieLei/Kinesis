"""Second-factor checks shared by login and the MFA management endpoints."""

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from admin_models import AdminRecoveryCode, AdminUser
from auth import totp


def check_second_factor(db: Session, admin: AdminUser, code: str) -> bool:
    """
    Accept a current authenticator code or an unused recovery code.

    The admin row is locked while checking so two requests cannot use the
    same code. Nothing is committed here; the caller commits on success.
    """

    if admin.totp_secret_enc is None or admin.totp_enabled_at is None:
        return False

    locked = db.scalar(
        select(AdminUser)
        .where(AdminUser.id == admin.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )

    if locked is None:
        return False

    compact = totp.normalize_recovery_code(code)

    if len(compact) == totp.DIGITS and compact.isdigit():
        step = totp.verify_code(
            totp.decrypt_secret(locked.totp_secret_enc),
            compact,
            last_used_step=locked.totp_last_step,
        )

        if step is None:
            return False

        locked.totp_last_step = step
        return True

    recovery = db.scalar(
        select(AdminRecoveryCode)
        .where(
            AdminRecoveryCode.admin_user_id == locked.id,
            AdminRecoveryCode.code_hash == totp.hash_recovery_code(code),
            AdminRecoveryCode.used_at.is_(None),
        )
        .with_for_update()
    )

    if recovery is None:
        return False

    recovery.used_at = datetime.now(timezone.utc)
    return True
