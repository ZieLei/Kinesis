from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_DIRECTORY = Path(__file__).resolve().parents[1]


class AdminAuthSettings(BaseSettings):
    """
    Authentication configuration for the Kinesis admin website.

    Development defaults support the local Vite development server.

    Production deployments require an explicit signing secret, HTTPS,
    a secure __Host- cookie, and HTTPS-only allowed origins.
    """

    environment: Literal["development", "production"] = "development"

    admin_auth_secret_key: SecretStr | None = None

    admin_cookie_name: str = Field(
        default="kinesis_admin_session",
        min_length=1,
        max_length=128,
    )

    admin_cookie_secure: bool = False

    admin_cookie_samesite: Literal["lax", "strict"] = "lax"

    admin_allowed_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    admin_session_idle_minutes: int = Field(
        default=30,
        ge=5,
        le=1440,
    )

    admin_session_absolute_hours: int = Field(
        default=12,
        ge=1,
        le=168,
    )

    admin_session_touch_interval_seconds: int = Field(
        default=60,
        ge=10,
        le=600,
    )

    admin_login_attempt_window_minutes: int = Field(
        default=15,
        ge=1,
        le=120,
    )

    admin_login_max_attempts: int = Field(
        default=8,
        ge=3,
        le=50,
    )

    admin_login_lockout_minutes: int = Field(
        default=15,
        ge=1,
        le=1440,
    )

    model_config = SettingsConfigDict(
        env_file=BACKEND_DIRECTORY / ".env",
        env_file_encoding="utf-8",
        env_prefix="KINESIS_",
        extra="ignore",
    )

    @field_validator("admin_allowed_origins")
    @classmethod
    def validate_admin_origins(cls, value: str) -> str:
        supplied_origins = [item.strip() for item in value.split(",") if item.strip()]

        if not supplied_origins:
            raise ValueError("At least one admin origin must be configured.")

        normalized_origins: list[str] = []

        for origin in supplied_origins:
            parsed = urlsplit(origin)

            try:
                parsed.port
            except ValueError as exc:
                raise ValueError(f"Invalid port in admin origin: {origin}") from exc

            if parsed.scheme not in {"http", "https"}:
                raise ValueError("Admin origins must use HTTP or HTTPS.")

            if not parsed.hostname:
                raise ValueError(f"Invalid admin origin: {origin}")

            if parsed.username or parsed.password:
                raise ValueError("Admin origins cannot contain credentials.")

            if parsed.path not in {"", "/"}:
                raise ValueError("Admin origins must not contain a path.")

            if parsed.query or parsed.fragment:
                raise ValueError("Admin origins cannot contain a query or fragment.")

            normalized = f"{parsed.scheme.lower()}://{parsed.netloc.lower()}"

            if normalized not in normalized_origins:
                normalized_origins.append(normalized)

        return ",".join(normalized_origins)

    @model_validator(mode="after")
    def validate_security_configuration(self):
        if self.admin_cookie_name.startswith("__Host-"):
            if not self.admin_cookie_secure:
                raise ValueError("__Host- cookies require Secure cookies.")

        if self.admin_session_idle_minutes >= self.admin_session_absolute_hours * 60:
            raise ValueError(
                "The idle session lifetime must be shorter "
                "than the absolute session lifetime."
            )

        if self.environment == "production":
            if not self.admin_cookie_secure:
                raise ValueError("Production admin sessions must use Secure cookies.")

            if not self.admin_cookie_name.startswith("__Host-"):
                raise ValueError("Production must use a __Host- session cookie.")

            if self.admin_auth_secret_key is None:
                raise ValueError(
                    "KINESIS_ADMIN_AUTH_SECRET_KEY is required in production."
                )

            secret = self.admin_auth_secret_key.get_secret_value()

            if len(secret) < 32:
                raise ValueError(
                    "The admin authentication secret must contain "
                    "at least 32 characters."
                )

            origins = self.allowed_origins

            if not origins:
                raise ValueError(
                    "Production requires at least one allowed admin origin."
                )

            if any(not origin.startswith("https://") for origin in origins):
                raise ValueError("Production admin origins must use HTTPS.")

        return self

    @property
    def allowed_origins(self) -> frozenset[str]:
        return frozenset(
            origin.strip()
            for origin in self.admin_allowed_origins.split(",")
            if origin.strip()
        )

    @property
    def effective_secret_key(self) -> bytes:
        if self.admin_auth_secret_key is not None:
            return self.admin_auth_secret_key.get_secret_value().encode("utf-8")

        # Development-only fallback.
        # Production refuses to start without an explicit secret.
        return b"kinesis-development-only-secret-change-before-production"


auth_settings = AdminAuthSettings()
