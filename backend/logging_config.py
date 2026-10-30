import logging

from sqlalchemy.exc import SQLAlchemyError

from database import SessionLocal
from models import AppSettings


DEFAULT_LOG_LEVEL = "INFO"

LOG_LEVELS = {
    "DEBUG": logging.DEBUG,
    "INFO": logging.INFO,
    "WARNING": logging.WARNING,
    "ERROR": logging.ERROR,
    "CRITICAL": logging.CRITICAL,
}

APPLICATION_LOGGERS = (
    "main",
    "sales_routes",
    "services_routes",
    "terminal_routes",
    "console_routes",
    "settings_routes",
    "database_routes",
    "sku_generator",
)

logger = logging.getLogger(__name__)


def apply_application_log_level(value: str) -> str:
    normalized = value.strip().upper()

    if normalized not in LOG_LEVELS:
        raise ValueError(f"Unsupported application log level: {value}")

    numeric_level = LOG_LEVELS[normalized]

    root_logger = logging.getLogger()
    root_logger.setLevel(numeric_level)

    for logger_name in APPLICATION_LOGGERS:
        logging.getLogger(logger_name).setLevel(numeric_level)

    for handler in root_logger.handlers:
        handler.setLevel(numeric_level)

    return normalized


def initialize_application_logging() -> str:
    """
    Load the saved application log level during backend startup.

    If the database is unavailable or the setting is invalid,
    fall back to INFO instead of preventing the application from starting.
    """

    try:
        with SessionLocal() as db:
            row = db.get(AppSettings, 1)

            if row is None or not isinstance(row.settings, dict):
                return apply_application_log_level(DEFAULT_LOG_LEVEL)

            configured_level = row.settings.get(
                "logLevel",
                DEFAULT_LOG_LEVEL,
            )

            if not isinstance(configured_level, str):
                configured_level = DEFAULT_LOG_LEVEL

            try:
                applied_level = apply_application_log_level(configured_level)
            except ValueError:
                logger.warning(
                    "Invalid saved log level %r. Falling back to INFO.",
                    configured_level,
                )
                applied_level = apply_application_log_level(DEFAULT_LOG_LEVEL)

            logger.info(
                "Application logging initialized at %s level.",
                applied_level,
            )

            return applied_level

    except SQLAlchemyError:
        logger.exception("Could not load the saved log level. Falling back to INFO.")
        return apply_application_log_level(DEFAULT_LOG_LEVEL)
