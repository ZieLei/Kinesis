import asyncio
import hashlib
import logging
import re
import secrets
import threading
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from database import SessionLocal, engine
from models import Product, Sale, Terminal


logger = logging.getLogger(__name__)

router = APIRouter(tags=["Console"])

REPORT_TIMEZONE = ZoneInfo("Asia/Manila")
MAX_COMMAND_LENGTH = 200
MAX_LOG_MESSAGE_LENGTH = 2000
MAX_SUBSCRIBER_QUEUE_SIZE = 300
COMMAND_COOLDOWN_SECONDS = 0.5
AUTH_TIMEOUT_SECONDS = 10


class ConsoleSettings(BaseSettings):
    admin_api_token: SecretStr | None = None
    admin_allowed_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    terminal_heartbeat_timeout_seconds: int = 90

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_prefix="KINESIS_",
        extra="ignore",
    )


settings = ConsoleSettings()


def allowed_origins() -> set[str]:
    return {
        origin.strip().rstrip("/")
        for origin in settings.admin_allowed_origins.split(",")
        if origin.strip()
    }


_SECRET_ASSIGNMENT = re.compile(
    r"(?i)\b(password|passwd|token|secret|api[_-]?key|authorization)"
    r"(\s*[:=]\s*)([^,\s;]+)"
)
_BEARER_TOKEN = re.compile(r"(?i)\bBearer\s+[A-Za-z0-9._~+/=-]+")


def sanitize_log_message(message: str) -> str:
    """Reduce the chance of exposing credentials in console log output."""
    message = _SECRET_ASSIGNMENT.sub(r"\1\2[REDACTED]", message)
    message = _BEARER_TOKEN.sub("Bearer [REDACTED]", message)

    if len(message) > MAX_LOG_MESSAGE_LENGTH:
        message = message[:MAX_LOG_MESSAGE_LENGTH] + "… [truncated]"

    return message


def enqueue_latest(
    queue: asyncio.Queue[dict[str, Any]],
    payload: dict[str, Any],
) -> None:
    """Keep the newest events when a browser cannot consume logs quickly."""
    if queue.full():
        try:
            queue.get_nowait()
        except asyncio.QueueEmpty:
            pass

    try:
        queue.put_nowait(payload)
    except asyncio.QueueFull:
        pass


Subscriber = tuple[
    asyncio.AbstractEventLoop,
    asyncio.Queue[dict[str, Any]],
]

_subscribers: set[Subscriber] = set()
_subscribers_lock = threading.Lock()


class ConsoleLogHandler(logging.Handler):
    """Fan application log records out to authenticated console clients."""

    def emit(self, record: logging.LogRecord) -> None:
        try:
            message = sanitize_log_message(record.getMessage())

            if record.levelno >= logging.ERROR:
                level = "ERROR"
            elif record.levelno >= logging.WARNING:
                level = "WARN"
            elif record.levelno <= logging.DEBUG:
                level = "DEBUG"
            else:
                level = "INFO"

            payload = {
                "type": "log",
                "log": {
                    "level": level,
                    "timestamp": datetime.fromtimestamp(
                        record.created,
                        tz=timezone.utc,
                    ).isoformat(),
                    "message": message,
                },
            }

            with _subscribers_lock:
                subscribers = tuple(_subscribers)

            for loop, queue in subscribers:
                try:
                    loop.call_soon_threadsafe(
                        enqueue_latest,
                        queue,
                        payload,
                    )
                except RuntimeError:
                    # The connection's event loop has already closed.
                    continue

        except Exception:
            # Logging handlers must never break the application request.
            self.handleError(record)


console_log_handler = ConsoleLogHandler()
console_log_handler.setLevel(logging.INFO)

root_logger = logging.getLogger()

if not any(isinstance(handler, ConsoleLogHandler) for handler in root_logger.handlers):
    root_logger.addHandler(console_log_handler)

# Ensure application INFO messages can reach the console. This affects only
# the named application loggers, not the global root logger's level.
for logger_name in (
    "main",
    "sales_routes",
    "services_routes",
    "terminal_routes",
    "console_routes",
):
    logging.getLogger(logger_name).setLevel(logging.INFO)


# --------------------------------------------------
# Safe diagnostic commands
# --------------------------------------------------


HELP_TEXT = """Available diagnostic commands:
  help                 Show this command list.
  status               Check API process and database access.
  db check             Run a simple database connectivity check.
  inventory summary    Show product and stock counts.
  terminals list       Show the most recently seen registered terminals.
  sales today          Show completed sales for today (Asia/Manila).

Only these read-only diagnostics are supported. Shell commands and arbitrary
SQL execution are not available through the browser console."""


def database_check(db: Session) -> str:
    db.execute(select(1)).scalar_one()

    return (
        f"Database query successful.\n"
        f"Engine: {engine.dialect.name}\n"
        f"Database driver: {engine.dialect.driver}"
    )


def run_diagnostic_command(command: str) -> str:
    """
    Execute a supported, read-only diagnostic.
    Never interpret user input as Python, SQL, or a shell command.
    """
    normalized = " ".join(command.strip().lower().split())

    if normalized == "help":
        return HELP_TEXT

    with SessionLocal() as db:
        if normalized in {"status", "health"}:
            db.execute(select(1)).scalar_one()

            product_count = db.scalar(select(func.count(Product.id))) or 0

            terminal_count = db.scalar(select(func.count(Terminal.id))) or 0

            cutoff = datetime.now(timezone.utc) - timedelta(
                seconds=settings.terminal_heartbeat_timeout_seconds
            )

            connected_count = (
                db.scalar(
                    select(func.count(Terminal.id)).where(
                        Terminal.is_enabled.is_(True),
                        Terminal.last_seen_at >= cutoff,
                    )
                )
                or 0
            )

            return (
                "Kinesis API diagnostic completed.\n"
                "API process: responding\n"
                "Database: query successful\n"
                f"Database engine: {engine.dialect.name}\n"
                f"Products: {int(product_count)}\n"
                f"Registered terminals: {int(terminal_count)}\n"
                f"Recently connected terminals: {int(connected_count)}"
            )

        if normalized == "db check":
            return database_check(db)

        if normalized == "inventory summary":
            total_products = db.scalar(select(func.count(Product.id))) or 0

            low_stock = (
                db.scalar(
                    select(func.count(Product.id)).where(
                        Product.stock > 0,
                        Product.stock <= 5,
                    )
                )
                or 0
            )

            out_of_stock = (
                db.scalar(
                    select(func.count(Product.id)).where(
                        Product.stock == 0,
                    )
                )
                or 0
            )

            return (
                "Inventory summary\n"
                f"Products: {int(total_products)}\n"
                f"Low stock (1–5 units): {int(low_stock)}\n"
                f"Out of stock: {int(out_of_stock)}"
            )

        if normalized == "terminals list":
            now = datetime.now(timezone.utc)
            cutoff = now - timedelta(
                seconds=settings.terminal_heartbeat_timeout_seconds
            )

            terminals = db.scalars(
                select(Terminal)
                .order_by(
                    Terminal.last_seen_at.desc(),
                    Terminal.id.desc(),
                )
                .limit(20)
            ).all()

            if not terminals:
                return "No terminals have registered yet."

            lines = ["Registered terminals (latest 20):"]

            for terminal in terminals:
                connected = terminal.is_enabled and terminal.last_seen_at >= cutoff

                state = (
                    "CONNECTED"
                    if connected
                    else "DISABLED"
                    if not terminal.is_enabled
                    else "DISCONNECTED"
                )

                lines.append(
                    f"TERM-{terminal.id:03d} | "
                    f"{terminal.name} | {state} | "
                    f"last seen {terminal.last_seen_at.isoformat()}"
                )

            return "\n".join(lines)

        if normalized == "sales today":
            now_local = datetime.now(REPORT_TIMEZONE)
            local_start = datetime.combine(
                now_local.date(),
                time.min,
                tzinfo=REPORT_TIMEZONE,
            )
            local_end = local_start + timedelta(days=1)

            start_utc = local_start.astimezone(timezone.utc)
            end_utc = local_end.astimezone(timezone.utc)

            transaction_count, revenue = db.execute(
                select(
                    func.count(Sale.id),
                    func.coalesce(
                        func.sum(Sale.total),
                        Decimal("0.00"),
                    ),
                ).where(
                    Sale.status == "completed",
                    Sale.created_at >= start_utc,
                    Sale.created_at < end_utc,
                )
            ).one()

            return (
                f"Completed sales for {now_local.date().isoformat()} "
                "(Asia/Manila)\n"
                f"Transactions: {int(transaction_count or 0)}\n"
                f"Revenue: PHP {Decimal(revenue or 0):,.2f}"
            )

    raise ValueError(
        "Unsupported command. Type 'help' to see the available diagnostics."
    )


async def send_error(websocket: WebSocket, message: str) -> None:
    await websocket.send_json(
        {
            "type": "error",
            "message": message,
        }
    )


async def stream_logs(
    websocket: WebSocket,
    queue: asyncio.Queue[dict[str, Any]],
) -> None:
    while True:
        payload = await queue.get()
        await websocket.send_json(payload)


async def receive_commands(websocket: WebSocket) -> None:
    loop = asyncio.get_running_loop()
    last_command_time = 0.0

    while True:
        incoming = await websocket.receive_json()

        if not isinstance(incoming, dict):
            await send_error(websocket, "Expected a JSON object.")
            continue

        if incoming.get("type") != "command":
            await send_error(
                websocket,
                "Unsupported message type. Send a diagnostic command.",
            )
            continue

        command = incoming.get("command")

        if not isinstance(command, str) or not command.strip():
            await send_error(websocket, "Enter a diagnostic command.")
            continue

        if len(command) > MAX_COMMAND_LENGTH:
            await send_error(
                websocket,
                f"Commands must be {MAX_COMMAND_LENGTH} characters or fewer.",
            )
            continue

        current_time = loop.time()

        if current_time - last_command_time < COMMAND_COOLDOWN_SECONDS:
            await send_error(
                websocket,
                "Please wait before running another command.",
            )
            continue

        last_command_time = current_time

        try:
            output = await asyncio.to_thread(
                run_diagnostic_command,
                command,
            )

            await websocket.send_json(
                {
                    "type": "result",
                    "command": command,
                    "output": output,
                }
            )

        except ValueError as exc:
            await send_error(websocket, str(exc))

        except SQLAlchemyError:
            logger.exception("Console diagnostic database query failed.")
            await send_error(
                websocket,
                "The diagnostic failed while querying the database. "
                "Check the backend logs for details.",
            )

        except Exception:
            logger.exception("Console diagnostic failed unexpectedly.")
            await send_error(
                websocket,
                "The diagnostic failed unexpectedly. Check backend logs.",
            )


# --------------------------------------------------
# Authenticated administrative WebSocket
# --------------------------------------------------


@router.websocket("/api/console/ws")
async def console_websocket(websocket: WebSocket) -> None:
    origin = websocket.headers.get("origin")

    # The browser console is intended to be accessed from an explicitly
    # configured admin origin. WebSocket connections aren't protected by
    # FastAPI's regular CORS middleware.
    if not origin or origin.rstrip("/") not in allowed_origins():
        await websocket.close(
            code=1008,
            reason="Admin origin is not allowed.",
        )
        return

    await websocket.accept()

    configured_token = settings.admin_api_token

    if configured_token is None or not configured_token.get_secret_value().strip():
        await send_error(
            websocket,
            "Admin API authentication is not configured on the server.",
        )
        await websocket.close(code=1011)
        return

    try:
        auth_message = await asyncio.wait_for(
            websocket.receive_json(),
            timeout=AUTH_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        await websocket.close(
            code=1008,
            reason="Authentication timed out.",
        )
        return
    except WebSocketDisconnect:
        return
    except Exception:
        await websocket.close(
            code=1008,
            reason="Invalid authentication message.",
        )
        return

    if not isinstance(auth_message, dict) or auth_message.get("type") != "auth":
        await send_error(websocket, "Authenticate before using the console.")
        await websocket.close(code=1008)
        return

    supplied_token = auth_message.get("token")

    if (
        not isinstance(supplied_token, str)
        or not supplied_token
        or not secrets.compare_digest(
            supplied_token,
            configured_token.get_secret_value(),
        )
    ):
        await send_error(websocket, "Admin authentication failed.")
        await websocket.close(code=1008)
        return

    loop = asyncio.get_running_loop()
    queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(
        maxsize=MAX_SUBSCRIBER_QUEUE_SIZE
    )
    subscriber: Subscriber = (loop, queue)

    with _subscribers_lock:
        _subscribers.add(subscriber)

    try:
        await websocket.send_json(
            {
                "type": "status",
                "message": (
                    "Authenticated. The console streams backend logs and accepts "
                    "read-only diagnostic commands. Type 'help' for commands."
                ),
            }
        )

        sender_task = asyncio.create_task(stream_logs(websocket, queue))
        receiver_task = asyncio.create_task(receive_commands(websocket))

        tasks = {sender_task, receiver_task}

        try:
            done, pending = await asyncio.wait(
                tasks,
                return_when=asyncio.FIRST_COMPLETED,
            )

            for task in pending:
                task.cancel()

            await asyncio.gather(*pending, return_exceptions=True)

            for task in done:
                exception = task.exception()

                if exception is not None:
                    raise exception

        finally:
            for task in tasks:
                if not task.done():
                    task.cancel()

            await asyncio.gather(*tasks, return_exceptions=True)

    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("Console WebSocket terminated unexpectedly.")
    finally:
        with _subscribers_lock:
            _subscribers.discard(subscriber)

        try:
            await websocket.close()
        except Exception:
            pass
