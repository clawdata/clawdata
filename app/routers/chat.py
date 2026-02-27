"""Chat WebSocket endpoint — proxies messages to/from OpenClaw."""

import json
import logging
import uuid

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services import chat_service

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/{agent_id}")
async def chat_ws(ws: WebSocket, agent_id: str):
    """WebSocket chat relay.

    Client sends: {"message": "...", "session_key": "..."}
    Server sends: {"type": "text|tool_start|tool_end|status|error", "content": "...", ...}

    Each WebSocket connection gets a unique session key so that
    "New Chat" creates a truly fresh gateway session with no stale context.
    """
    await ws.accept()
    # Unique session per WS connection — "New Chat" reconnects → clean session
    # Gateway requires format "agent:{agentId}:{rest}" to bind key to the agent
    connection_session_key = f"agent:{agent_id}:clawdata-{uuid.uuid4()}"
    logger.info(
        "Chat WS connected for agent %s (session %s)", agent_id, connection_session_key
    )

    try:
        while True:
            raw = await ws.receive_text()
            data = json.loads(raw)
            message = data.get("message", "")
            # Allow client to override, but default to this connection's unique key
            session_key = data.get("session_key") or connection_session_key

            if not message:
                await ws.send_json({"type": "error", "content": "Empty message"})
                continue

            async for event in chat_service.send_and_stream(
                agent_id=agent_id,
                message=message,
                session_key=session_key,
            ):
                await ws.send_json(event)

    except WebSocketDisconnect:
        logger.info("Chat WS disconnected for agent %s", agent_id)
    except Exception as e:
        logger.exception("Chat WS error for agent %s", agent_id)
        try:
            await ws.send_json({"type": "error", "content": str(e)})
        except Exception:
            pass
