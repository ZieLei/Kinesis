import asyncio
import logging
import re
import threading
from datetime import datetime, time, timedelta, timezone
from decimal import Decimal
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import (
    APIRouter,
    WebSocket,
    WebSocketDisconnect,
)

from sqlalchemy import func, select
from sqlalchemy.orm import joinedload

from admin_models import AdminSession
from auth.config import auth_settings
from auth.security import hash_secret
from auth.sessions import resolve_admin_session

from database import SessionLocal, engine
from models import Product, Sale, Terminal
from terminal_routes import (
    heartbeat_cutoff,
    is_terminal_connected,
    settings as terminal_settings,
)


logger = logging.getLogger(__name__)

router = APIRouter(
    tags=["Console"],
)

REPORT_TIMEZONE = ZoneInfo("Asia/Manila")

MAX_COMMAND_LENGTH = 200
MAX_LOG_MESSAGE_LENGTH = 2000
MAX_SUBSCRIBER_QUEUE_SIZE = 300

COMMAND_COOLDOWN_SECONDS = 0.5

SESSION_CHECK_INTERVAL_SECONDS = 15


# --------------------------------------------------
# Console configuration
# --------------------------------------------------


def allowed_origins() -> frozenset[str]:
    return auth_settings.allowed_origins


# --------------------------------------------------
# Log sanitization
# --------------------------------------------------


_SECRET_ASSIGNMENT = re.compile(
    r"(?i)\b(password|passwd|token|secret|api[_-]?key|authorization)"
    r"(\s*[:=]\s*)([^,\s;]+)"
)

_BEARER_TOKEN = re.compile(r"(?i)\bBearer\s+[A-Za-z0-9._~+/=-]+")


def sanitize_log_message(message: str) -> str:
    """Reduce the chance of exposing credentials in console output."""

    message = _SECRET_ASSIGNMENT.sub(
        r"\1\2[REDACTED]",
        message,
    )

    message = _BEARER_TOKEN.sub(
        "Bearer [REDACTED]",
        message,
    )

    if len(message) > MAX_LOG_MESSAGE_LENGTH:
        message = message[:MAX_LOG_MESSAGE_LENGTH] + "… [truncated]"

    return message


# --------------------------------------------------
# WebSocket subscriber management
# --------------------------------------------------


def enqueue_latest(
    queue: asyncio.Queue[dict[str, Any]],
    payload: dict[str, Any],
) -> None:
    """Keep the newest log events when a client consumes logs slowly."""

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
    """Send application log records to authenticated console clients."""

    def emit(
        self,
        record: logging.LogRecord,
    ) -> None:
        try:
            message = sanitize_log_message(
                record.getMessage(),
            )

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
                    continue

        except Exception:
            self.handleError(record)


console_log_handler = ConsoleLogHandler()
console_log_handler.setLevel(logging.INFO)

root_logger = logging.getLogger()

if not any(isinstance(handler, ConsoleLogHandler) for handler in root_logger.handlers):
    root_logger.addHandler(console_log_handler)


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


def database_check(db) -> str:
    db.execute(
        select(1),
    ).scalar_one()

    return (
        "Database query successful.\n"
        f"Engine: {engine.dialect.name}\n"
        f"Database driver: {engine.dialect.driver}"
    )


def run_diagnostic_command(command: str) -> str:
    """
    Execute a supported read-only diagnostic.

    User input is never interpreted as Python, SQL, or shell commands.
    """

    normalized = " ".join(command.strip().lower().split())

    if normalized == "help":
        return HELP_TEXT

    with SessionLocal() as db:
        if normalized in {"status", "health"}:
            db.execute(
                select(1),
            ).scalar_one()

            product_count = db.scalar(select(func.count(Product.id))) or 0

            terminal_count = db.scalar(select(func.count(Terminal.id))) or 0

            cutoff = heartbeat_cutoff()

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
                f"Recently connected terminals: {int(connected_count)}\n"
                "Heartbeat timeout: "
                f"{terminal_settings.terminal_heartbeat_timeout_seconds} seconds"
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

            lines = [
                "Registered terminals (latest 20):",
            ]

            for terminal in terminals:
                connected = is_terminal_connected(
                    terminal,
                    now,
                )

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


# --------------------------------------------------
# Session authentication
# --------------------------------------------------


def get_websocket_username(
    token: str,
) -> str | None:
    """
    Resolve an administrator session and return its username.

    The username is copied while the database session is still open.
    This avoids returning an ORM object that may become detached or
    expired after resolve_admin_session commits a session touch.
    """

    if not token or len(token) > 256:
        return None

    with SessionLocal() as db:
        session_record = resolve_admin_session(
            db,
            token,
        )

        if session_record is None:
            return None

        return session_record.admin_user.username


def console_session_is_valid(
    token: str,
) -> bool:
    """
    Recheck session validity without extending idle expiration.

    This allows logout, administrative revocation, and expiration
    to terminate an existing Console WebSocket.
    """

    if not token or len(token) > 256:
        return False

    token_hash = hash_secret(token)
    now = datetime.now(timezone.utc)

    with SessionLocal() as db:
        session_record = db.scalar(
            select(AdminSession)
            .options(
                joinedload(AdminSession.admin_user),
            )
            .where(
                AdminSession.session_token_hash == token_hash,
            )
        )

        if session_record is None:
            return False

        if session_record.revoked_at is not None:
            return False

        if (
            session_record.idle_expires_at <= now
            or session_record.absolute_expires_at <= now
        ):
            return False

        if not session_record.admin_user.is_active:
            return False

        return True


def touch_console_session(
    token: str,
) -> bool:
    """
    Extend idle expiration when an administrator actively submits
    a diagnostic command through the Console.
    """

    if not token:
        return False

    with SessionLocal() as db:
        session_record = resolve_admin_session(
            db,
            token,
        )

        return session_record is not None


async def monitor_admin_session(
    websocket: WebSocket,
    token: str,
) -> None:
    """
    Periodically detect expired and revoked administrator sessions.

    A Console connection is not allowed to remain authenticated
    indefinitely after the browser session expires.
    """

    while True:
        await asyncio.sleep(
            SESSION_CHECK_INTERVAL_SECONDS,
        )

        valid = await asyncio.to_thread(
            console_session_is_valid,
            token,
        )

        if not valid:
            try:
                await websocket.close(
                    code=4401,
                    reason="Administrator session expired or revoked.",
                )

            except Exception:
                pass

            return


# --------------------------------------------------
# WebSocket messaging
# --------------------------------------------------


async def send_error(
    websocket: WebSocket,
    message: str,
) -> None:
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


async def receive_commands(
    websocket: WebSocket,
    session_token: str,
) -> None:
    loop = asyncio.get_running_loop()

    last_command_time = 0.0

    while True:
        incoming = await websocket.receive_json()

        if not isinstance(incoming, dict):
            await send_error(
                websocket,
                "Expected a JSON object.",
            )

            continue

        if incoming.get("type") != "command":
            await send_error(
                websocket,
                "Unsupported message type. Send a diagnostic command.",
            )

            continue

        command = incoming.get("command")

        if not isinstance(command, str) or not command.strip():
            await send_error(
                websocket,
                "Enter a diagnostic command.",
            )

            continue

        if len(command) > MAX_COMMAND_LENGTH:
            await send_error(
                websocket,
                f"Commands must be {MAX_COMMAND_LENGTH} characters or fewer.",
            )

            continue

        # User interaction renews the administrator's idle session.
        session_valid = await asyncio.to_thread(
            touch_console_session,
            session_token,
        )

        if not session_valid:
            await websocket.close(
                code=4401,
                reason="Administrator session expired or revoked.",
            )

            return

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
            await send_error(
                websocket,
                str(exc),
            )

        except Exception:
            logger.exception("Console diagnostic failed.")

            await send_error(
                websocket,
                "The diagnostic failed. Check the backend logs.",
            )


# --------------------------------------------------
# Authenticated administrative WebSocket
# --------------------------------------------------


@router.websocket("/api/console/ws")
async def console_websocket(
    websocket: WebSocket,
) -> None:
    origin = websocket.headers.get("origin")

    # WebSocket connections are not protected by FastAPI's normal
    # CORS middleware. Explicitly validate the browser origin.
    if not origin or origin.rstrip("/") not in allowed_origins():
        await websocket.close(
            code=1008,
            reason="Admin origin is not allowed.",
        )

        return

    # Browser WebSocket handshakes automatically include same-origin
    # cookies. No authentication JSON message is required.
    session_token = websocket.cookies.get(
        auth_settings.admin_cookie_name,
    )

    if not session_token:
        await websocket.close(
            code=4401,
            reason="Administrator authentication is required.",
        )

        return

    try:
        username = await asyncio.to_thread(
            get_websocket_username,
            session_token,
        )

    except Exception:
        logger.exception("Console administrator session lookup failed.")

        await websocket.close(
            code=1011,
            reason="Authentication service unavailable.",
        )

        return

    if username is None:
        await websocket.close(
            code=4401,
            reason="Administrator session is invalid.",
        )

        return

    await websocket.accept()

    loop = asyncio.get_running_loop()

    queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(
        maxsize=MAX_SUBSCRIBER_QUEUE_SIZE,
    )

    subscriber: Subscriber = (
        loop,
        queue,
    )

    with _subscribers_lock:
        _subscribers.add(subscriber)

    logger.info(
        "Administrator %s connected to the operational console.",
        username,
    )

    try:
        await websocket.send_json(
            {
                "type": "status",
                "message": (
                    f"Authenticated as {username}. "
                    "The console streams backend logs and accepts "
                    "read-only diagnostic commands. Type 'help' for commands."
                ),
            }
        )

        sender_task = asyncio.create_task(
            stream_logs(
                websocket,
                queue,
            )
        )

        receiver_task = asyncio.create_task(
            receive_commands(
                websocket,
                session_token,
            )
        )

        session_task = asyncio.create_task(
            monitor_admin_session(
                websocket,
                session_token,
            )
        )

        tasks = {
            sender_task,
            receiver_task,
            session_task,
        }

        try:
            done, pending = await asyncio.wait(
                tasks,
                return_when=asyncio.FIRST_COMPLETED,
            )

            for task in pending:
                task.cancel()

            await asyncio.gather(
                *pending,
                return_exceptions=True,
            )

            for task in done:
                exception = task.exception()

                if exception is not None:
                    raise exception

        finally:
            for task in tasks:
                if not task.done():
                    task.cancel()

            await asyncio.gather(
                *tasks,
                return_exceptions=True,
            )

    except WebSocketDisconnect:
        pass

    except Exception:
        logger.exception("Console WebSocket terminated unexpectedly.")

    finally:
        with _subscribers_lock:
            _subscribers.discard(subscriber)

        logger.info(
            "Administrator %s disconnected from the operational console.",
            username,
        )

        try:
            await websocket.close()

        except Exception:
            pass
