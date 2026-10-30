import asyncio
import hashlib
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from database import SessionLocal
from models import Terminal


logger = logging.getLogger(__name__)

router = APIRouter()


class SettingsConnectionManager:
    def __init__(self):
        self.connections: dict[int, set[WebSocket]] = {}

    async def connect(
        self,
        terminal_id: int,
        websocket: WebSocket,
    ) -> None:
        self.connections.setdefault(terminal_id, set()).add(websocket)

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

    async def broadcast_settings_updated(self, version: int) -> int:
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

        # Reuse the same hashed terminal credentials as HTTP authentication.
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

        await connection_manager.connect(terminal_id, websocket)

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

        # Keep the connection alive with application-level ping messages.
        while True:
            try:
                message = await asyncio.wait_for(
                    websocket.receive_json(),
                    timeout=25,
                )

                if isinstance(message, dict) and message.get("type") == "pong":
                    continue

            except asyncio.TimeoutError:
                await websocket.send_json(
                    {
                        "type": "ping",
                    }
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
            connection_manager.disconnect(terminal_id, websocket)

            logger.info(
                "Terminal %s disconnected from settings notifications.",
                terminal_id,
            )
