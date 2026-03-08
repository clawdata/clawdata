"""Chat WebSocket endpoint — proxies messages to/from OpenClaw.

The handler runs **two concurrent loops** so that the client can send
store-secret / skill-setup messages *while* a chat stream is in progress.

* **receiver** – reads from the WebSocket and dispatches control messages
  (store_secret, request_skill_setup) or queues new chat requests.
* **streamer** – consumes chat requests from *_chat_q* and streams gateway
  events back.
"""

import asyncio
import json
import logging
import uuid

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.database import async_session
from app.services import audit_service
from app.services import chat_service
from app.services import secrets_manager as secrets_svc

logger = logging.getLogger(__name__)

router = APIRouter()

@router.websocket("/{agent_id}")
async def chat_ws(ws: WebSocket, agent_id: str):
    """WebSocket chat relay.

    Client sends: {"message": "...", "session_key": "..."}
              or: {"type": "store_secret", "field": "...", "env_var": "...", "value": "..."}
    Server sends: {"type": "text|tool_start|tool_end|status|error|secrets_stored", ...}
    """
    await ws.accept()
    connection_session_key = f"agent:{agent_id}:clawdata-{uuid.uuid4()}"
    logger.info(
        "Chat WS connected for agent %s (session %s)", agent_id, connection_session_key
    )

    # Shared state between receiver and streamer --------------------------
    send_lock = asyncio.Lock()
    chat_queue: asyncio.Queue[tuple[str, str]] = asyncio.Queue()  # (message, session_key)

    async def _safe_send(msg: dict) -> None:
        """Send JSON over the WS with a lock so concurrent tasks don't interleave."""
        async with send_lock:
            await ws.send_json(msg)

    # ── Receiver loop ────────────────────────────────────────────────
    async def _receiver() -> None:
        """Read client messages and dispatch control frames / queue chat requests."""
        while True:
            raw = await ws.receive_text()
            data = json.loads(raw)
            msg_type = data.get("type", "")

            # ── Store secret from chat ───────────────────────
            if msg_type == "store_secret":
                field = data.get("field", "")
                env_var = data.get("env_var", "")
                value = data.get("value", "")
                label = data.get("label", field)
                if not env_var or not value:
                    await _safe_send({
                        "type": "error",
                        "content": "store_secret requires env_var and value",
                    })
                    continue
                try:
                    result = await secrets_svc.setup_secret_ref(
                        field=field,
                        env_var=env_var,
                        value=value,
                    )
                    try:
                        await secrets_svc.reload_secrets()
                    except Exception:
                        pass
                    # Push updated env vars to the running gateway so
                    # skills can use them without a full gateway restart.
                    try:
                        await chat_service.sync_skill_env_to_gateway(env_var)
                    except Exception:
                        logger.debug("sync_skill_env_to_gateway failed", exc_info=True)
                    await _safe_send({
                        "type": "secrets_stored",
                        "field": field,
                        "env_var": env_var,
                        "label": label,
                        "resolved": result.resolved,
                    })
                except Exception as exc:
                    await _safe_send({
                        "type": "error",
                        "content": f"Failed to store secret: {exc}",
                    })
                continue

            # ── Skill setup form request ─────────────────────
            if msg_type == "request_skill_setup":
                skill_name = data.get("skill", "")
                if not skill_name:
                    await _safe_send({
                        "type": "error",
                        "content": "request_skill_setup requires skill name",
                    })
                    continue
                try:
                    fields = await chat_service._get_skill_secrets_with_status(skill_name)
                    if fields:
                        await _safe_send({
                            "type": "skill_setup",
                            "skill": skill_name,
                            "fields": fields,
                            "agent_id": agent_id,
                        })
                    else:
                        await _safe_send({
                            "type": "error",
                            "content": f"No credentials defined for skill '{skill_name}'",
                        })
                except Exception as exc:
                    await _safe_send({
                        "type": "error",
                        "content": f"Failed to get skill setup: {exc}",
                    })
                continue

            # ── Normal chat message → queue for streamer ─────
            message = data.get("message", "")
            session_key = data.get("session_key") or connection_session_key
            if not message:
                await _safe_send({"type": "error", "content": "Empty message"})
                continue
            # Log audit event
            try:
                async with async_session() as db:
                    await audit_service.log_event(
                        db,
                        event_type="chat.sent",
                        action=f"Sent message to agent '{agent_id}'",
                        agent_id=agent_id,
                        session_id=session_key,
                        details={"message_preview": message[:120]},
                    )
            except Exception:
                logger.debug("Failed to log chat audit event", exc_info=True)
            await chat_queue.put((message, session_key))

    # ── Streamer loop ────────────────────────────────────────────────
    async def _streamer() -> None:
        """Pull chat requests from the queue and stream events to the client."""
        while True:
            message, session_key = await chat_queue.get()
            try:
                async for event in chat_service.send_and_stream(
                    agent_id=agent_id,
                    message=message,
                    session_key=session_key,
                ):
                    await _safe_send(event)
            except Exception as exc:
                logger.exception("Streamer error for agent %s", agent_id)
                await _safe_send({"type": "error", "content": str(exc)})

    # ── Run both loops concurrently ──────────────────────────────────
    receiver_task = asyncio.create_task(_receiver())
    streamer_task = asyncio.create_task(_streamer())
    try:
        # If either task finishes (receiver raises on disconnect), cancel the other.
        done, pending = await asyncio.wait(
            [receiver_task, streamer_task],
            return_when=asyncio.FIRST_EXCEPTION,
        )
        for t in pending:
            t.cancel()
        # Re-raise any exception from the completed tasks
        for t in done:
            exc = t.exception()
            if exc:
                raise exc
    except WebSocketDisconnect:
        logger.info("Chat WS disconnected for agent %s", agent_id)
    except asyncio.CancelledError:
        pass
    except Exception as e:
        logger.exception("Chat WS error for agent %s", agent_id)
        try:
            await _safe_send({"type": "error", "content": str(e)})
        except Exception:
            pass
    finally:
        receiver_task.cancel()
        streamer_task.cancel()
