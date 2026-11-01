import argparse
import getpass
import re
import sys
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.exc import SQLAlchemyError

from admin_models import AdminSession, AdminUser
from auth.password import hash_password
from database import SessionLocal


USERNAME_PATTERN = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9._-]{2,63}$")

MIN_PASSWORD_LENGTH = 12
MAX_PASSWORD_LENGTH = 128


def normalize_username(value: str) -> str:
    username = value.strip().lower()

    if not USERNAME_PATTERN.fullmatch(username):
        raise ValueError(
            "Username must contain 3–64 characters and use only "
            "letters, numbers, periods, underscores, or hyphens. "
            "It must begin with a letter or number."
        )

    return username


def read_password(username: str) -> str:
    password = getpass.getpass("Administrator password: ")
    confirmation = getpass.getpass("Confirm password: ")

    if password != confirmation:
        raise ValueError("The passwords do not match.")

    if not MIN_PASSWORD_LENGTH <= len(password) <= MAX_PASSWORD_LENGTH:
        raise ValueError(
            f"Password must contain between {MIN_PASSWORD_LENGTH} "
            f"and {MAX_PASSWORD_LENGTH} characters."
        )

    if password.strip() == "":
        raise ValueError("Password cannot contain only whitespace.")

    if password.casefold() == username.casefold():
        raise ValueError("Password cannot be the same as the username.")

    return password


def provision_admin(
    username: str,
    password: str,
    reset_password: bool,
) -> None:
    now = datetime.now(timezone.utc)

    with SessionLocal() as db:
        existing = db.scalar(select(AdminUser).where(AdminUser.username == username))

        if existing is not None:
            if not reset_password:
                raise ValueError(
                    f"Administrator '{username}' already exists. "
                    "Use --reset-password to update its password."
                )

            existing.password_hash = hash_password(password)
            existing.is_active = True
            existing.updated_at = now

            db.execute(
                update(AdminSession)
                .where(
                    AdminSession.admin_user_id == existing.id,
                    AdminSession.revoked_at.is_(None),
                )
                .values(revoked_at=now)
            )

            db.commit()

            print(f"Administrator '{username}' updated successfully.")
            print("All existing administrator sessions were revoked.")

            return

        if reset_password:
            raise ValueError(
                f"Administrator '{username}' does not exist. "
                "Remove --reset-password to create the account."
            )

        admin = AdminUser(
            username=username,
            password_hash=hash_password(password),
            is_active=True,
            created_at=now,
            updated_at=now,
        )

        db.add(admin)
        db.commit()

        print(f"Administrator '{username}' created successfully.")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Provision a Kinesis administrator account."
    )

    parser.add_argument(
        "--username",
        help="Administrator username. Prompted when omitted.",
    )

    parser.add_argument(
        "--reset-password",
        action="store_true",
        help="Reset an existing administrator's password and revoke sessions.",
    )

    args = parser.parse_args()

    try:
        supplied_username = (
            args.username
            if args.username is not None
            else input("Administrator username: ")
        )

        username = normalize_username(supplied_username)

        password = read_password(username)

        provision_admin(
            username=username,
            password=password,
            reset_password=args.reset_password,
        )

    except ValueError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc

    except SQLAlchemyError:
        print(
            "The administrator account could not be saved to PostgreSQL.",
            file=sys.stderr,
        )
        raise SystemExit(1)


if __name__ == "__main__":
    main()
