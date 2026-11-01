import asyncio
import hashlib
import logging
import secrets
from datetime import datetime, timezone

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from database import SessionLocal
from models import Terminal
from terminal_routes import require_admin_token


logger = logging.getLogger(__name__)

router = APIRouter()

PING_INTERVAL_SECONDS = 10
PING_TIMEOUT_SECONDS = 5
MAX_MISSED_PINGS = 3

HEALTHY_LATENCY_MS = 100
DEGRADED_LATENCY_MS = 300


class SettingsConnectionManager:
    def __init__(self):
        self.connections: dict[int, set[WebSocket]] = {}

        self.latency_samples: dict[
            int,
            tuple[float | None, datetime | None],
        ] = {}

        self.missed_pings: dict[int, int] = {}

    async def connect(
        self,
        terminal_id: int,
        websocket: WebSocket,
    ) -> None:
        self.connections.setdefault(terminal_id, set()).add(websocket)

        self.latency_samples[terminal_id] = (None, None)
        self.missed_pings[terminal_id] = 0

    def disconnect(
        self,
        terminal_id: int,
        websocket: WebSocket,
    ) -> None:
        sockets = self.connections.get(terminal_id)

        if sockets is None:
            return

        sockets.discard(websocket)

        if not sockets:
            self.connections.pop(terminal_id, None)
            self.latency_samples.pop(terminal_id, None)
            self.missed_pings.pop(terminal_id, None)

    def record_latency(
        self,
        terminal_id: int,
        latency_ms: float,
    ) -> None:
        self.latency_samples[terminal_id] = (
            round(latency_ms, 2),
            datetime.now(timezone.utc),
        )

        self.missed_pings[terminal_id] = 0

    def record_ping_timeout(self, terminal_id: int) -> None:
        if terminal_id not in self.connections:
            return

        self.latency_samples[terminal_id] = (
            None,
            datetime.now(timezone.utc),
        )

        self.missed_pings[terminal_id] = self.missed_pings.get(terminal_id, 0) + 1

    def get_terminal_metrics(self, terminal_id: int) -> dict:
        sockets = self.connections.get(terminal_id)
        connected = bool(sockets)

        latency_ms: float | None = None
        latency_updated_at: datetime | None = None

        sample = self.latency_samples.get(terminal_id)

        if sample is not None:
            latency_ms, latency_updated_at = sample

        missed_pings = self.missed_pings.get(terminal_id, 0)

        if not connected:
            health = "Unavailable"
        elif missed_pings > 0:
            health = "Poor"
        elif latency_ms is None:
            health = "Measuring"
        elif latency_ms <= HEALTHY_LATENCY_MS:
            health = "Healthy"
        elif latency_ms <= DEGRADED_LATENCY_MS:
            health = "Degraded"
        else:
            health = "Poor"

        return {
            "websocket_connected": connected,
            "latency_ms": latency_ms,
            "latency_updated_at": (
                latency_updated_at.isoformat()
                if latency_updated_at is not None
                else None
            ),
            "connection_health": health,
            "consecutive_ping_timeouts": missed_pings,
        }

    async def disconnect_terminal(
        self,
        terminal_id: int,
        *,
        code: int = 4403,
        reason: str = "Terminal access disabled.",
    ) -> None:
        sockets = list(self.connections.get(terminal_id, set()))

        for websocket in sockets:
            try:
                await websocket.close(
                    code=code,
                    reason=reason,
                )
            except Exception:
                logger.debug(
                    "Could not close terminal %s WebSocket.",
                    terminal_id,
                    exc_info=True,
                )
            finally:
                self.disconnect(terminal_id, websocket)

    async def broadcast_settings_updated(
        self,
        version: int,
    ) -> int:
        message = {
            "type": "settings_updated",
            "version": version,
        }

        delivered = 0
        stale_connections: list[tuple[int, WebSocket]] = []

        for terminal_id, sockets in list(self.connections.items()):
            for websocket in list(sockets):
                try:
                    await websocket.send_json(message)
                    delivered += 1

                except Exception:
                    stale_connections.append((terminal_id, websocket))

        for terminal_id, websocket in stale_connections:
            self.disconnect(terminal_id, websocket)

        return delivered


connection_manager = SettingsConnectionManager()


async def broadcast_settings_updated(version: int) -> int:
    return await connection_manager.broadcast_settings_updated(version)


# --------------------------------------------------
# Admin: terminal connection metrics
# --------------------------------------------------


@router.get(
    "/api/admin/terminals/metrics",
    tags=["Terminals"],
)
def get_terminal_connection_metrics(
    _authorized: None = Depends(require_admin_token),
):
    try:
        with SessionLocal() as db:
            terminal_ids = db.scalars(select(Terminal.id).order_by(Terminal.id)).all()

        return {
            "items": [
                {
                    "terminal_id": terminal_id,
                    **connection_manager.get_terminal_metrics(terminal_id),
                }
                for terminal_id in terminal_ids
            ],
            "measured_at": datetime.now(timezone.utc).isoformat(),
        }

    except SQLAlchemyError as exc:
        logger.exception("Could not retrieve terminal connection metrics.")

        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Terminal connection metrics are temporarily unavailable.",
        ) from exc


# --------------------------------------------------
# Terminal settings WebSocket
# --------------------------------------------------


@router.websocket("/api/terminals/ws")
async def terminal_settings_websocket(websocket: WebSocket):
    terminal_id: int | None = None

    await websocket.accept()

    try:
        # Require authentication immediately after connecting.
        try:
            authentication = await asyncio.wait_for(
                websocket.receive_json(),
                timeout=10,
            )
        except asyncio.TimeoutError:
            await websocket.close(code=4408)
            return

        if not isinstance(authentication, dict):
            await websocket.close(code=4400)
            return

        if authentication.get("type") != "authenticate":
            await websocket.close(code=4400)
            return

        raw_token = authentication.get("session_token")

        if not isinstance(raw_token, str) or not raw_token.strip():
            await websocket.close(code=4401)
            return

        token_hash = hashlib.sha256(raw_token.strip().encode("utf-8")).hexdigest()

        # Use the same hashed terminal credentials as HTTP authentication.
        with SessionLocal() as db:
            terminal = db.scalar(
                select(Terminal).where(
                    Terminal.session_token_hash == token_hash,
                )
            )

            if terminal is None:
                await websocket.close(code=4401)
                return

            if not terminal.is_enabled:
                await websocket.close(code=4403)
                return

            terminal_id = terminal.id

        await connection_manager.connect(
            terminal_id,
            websocket,
        )

        await websocket.send_json(
            {
                "type": "authenticated",
                "terminal_id": terminal_id,
            }
        )

        logger.info(
            "Terminal %s connected to settings notifications.",
            terminal_id,
        )

        loop = asyncio.get_running_loop()
        missed_pings = 0

        while True:
            ping_id = secrets.token_urlsafe(16)
            started_at = loop.time()

            await websocket.send_json(
                {
                    "type": "ping",
                    "ping_id": ping_id,
                }
            )

            received_pong = False
            deadline = started_at + PING_TIMEOUT_SECONDS

            while loop.time() < deadline:
                remaining = deadline - loop.time()

                try:
                    message = await asyncio.wait_for(
                        websocket.receive_json(),
                        timeout=remaining,
                    )
                except asyncio.TimeoutError:
                    break

                if (
                    isinstance(message, dict)
                    and message.get("type") == "pong"
                    and message.get("ping_id") == ping_id
                ):
                    elapsed_ms = (loop.time() - started_at) * 1000

                    connection_manager.record_latency(
                        terminal_id,
                        elapsed_ms,
                    )

                    received_pong = True
                    missed_pings = 0

                    break

            if not received_pong:
                missed_pings += 1

                connection_manager.record_ping_timeout(
                    terminal_id,
                )

                logger.warning(
                    "Terminal %s missed WebSocket ping %s of %s.",
                    terminal_id,
                    missed_pings,
                    MAX_MISSED_PINGS,
                )

                if missed_pings >= MAX_MISSED_PINGS:
                    await websocket.close(
                        code=4408,
                        reason="WebSocket ping timeout.",
                    )
                    break

            elapsed_seconds = loop.time() - started_at

            await asyncio.sleep(
                max(
                    0,
                    PING_INTERVAL_SECONDS - elapsed_seconds,
                )
            )

    except WebSocketDisconnect:
        pass

    except Exception:
        logger.exception(
            "Terminal settings WebSocket failed. Terminal ID: %s",
            terminal_id,
        )

        try:
            await websocket.close(code=1011)
        except Exception:
            pass

    finally:
        if terminal_id is not None:
            connection_manager.disconnect(
                terminal_id,
                websocket,
            )

            logger.info(
                "Terminal %s disconnected from settings notifications.",
                terminal_id,
            )
