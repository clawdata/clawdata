"""Chat WebSocket endpoint — proxies messages to/from OpenClaw."""

import json
import logging
import uuid

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services import chat_service
from app.services import secrets_manager as secrets_svc
from app.schemas.secrets_manager import SecretsAccessResolve

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/{agent_id}")
async def chat_ws(ws: WebSocket, agent_id: str):
    """WebSocket chat relay.

    Client sends: {"message": "...", "session_key": "..."}
              or: {"type": "secrets_resolve", "request_id": "...", "approved": true}
              or: {"type": "store_secret", "field": "...", "env_var": "...", "value": "..."}
    Server sends: {"type": "text|tool_start|tool_end|status|error|secrets_access|secrets_stored", ...}
    """
    await ws.accept()
    connection_session_key = f"agent:{agent_id}:clawdata-{uuid.uuid4()}"
    logger.info(
        "Chat WS connected for agent %s (session %s)", agent_id, connection_session_key
    )

    try:
        while True:
            raw = await ws.receive_text()
            data = json.loads(raw)

            # ── Secrets access resolution ────────────────────────
            msg_type = data.get("type", "")
            if msg_type == "secrets_resolve":
                request_id = data.get("request_id", "")
                approved = data.get("approved", False)
                reason = data.get("reason", "")
                try:
                    result = await secrets_svc.resolve_access_request(
                        request_id,
                        SecretsAccessResolve(approved=approved, reason=reason),
                    )
                    await ws.send_json({
                        "type": "secrets_access_resolved",
                        "request_id": request_id,
                        "status": result.status,
                        "resolved": result.resolved,
                        "value_masked": result.value_masked,
                    })
                except ValueError as exc:
                    await ws.send_json({
                        "type": "error",
                        "content": f"Failed to resolve secrets request: {exc}",
                    })
                continue

            # ── Store secret from chat ───────────────────────────
            if msg_type == "store_secret":
                field = data.get("field", "")
                env_var = data.get("env_var", "")
                value = data.get("value", "")
                label = data.get("label", field)
                if not env_var or not value:
                    await ws.send_json({
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
                    # Reload to activate
                    try:
                        await secrets_svc.reload_secrets()
                    except Exception:
                        pass
                    await ws.send_json({
                        "type": "secrets_stored",
                        "field": field,
                        "env_var": env_var,
                        "label": label,
                        "resolved": result.resolved,
                    })
                except Exception as exc:
                    await ws.send_json({
                        "type": "error",
                        "content": f"Failed to store secret: {exc}",
                    })
                continue

            # ── Skill setup form request ─────────────────────────
            if msg_type == "request_skill_setup":
                skill_name = data.get("skill", "")
                if not skill_name:
                    await ws.send_json({
                        "type": "error",
                        "content": "request_skill_setup requires skill name",
                    })
                    continue
                try:
                    fields = await chat_service._get_skill_secrets_with_status(skill_name)
                    if fields:
                        await ws.send_json({
                            "type": "skill_setup",
                            "skill": skill_name,
                            "fields": fields,
                            "agent_id": agent_id,
                        })
                    else:
                        await ws.send_json({
                            "type": "error",
                            "content": f"No credentials defined for skill '{skill_name}'",
                        })
                except Exception as exc:
                    await ws.send_json({
                        "type": "error",
                        "content": f"Failed to get skill setup: {exc}",
                    })
                continue

            # ── Normal chat message ──────────────────────────────
            message = data.get("message", "")
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
