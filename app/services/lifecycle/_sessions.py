"""Session listing, reset, delete, and history retrieval."""

from __future__ import annotations

import logging
import re as _re

from app.schemas.lifecycle import (
    ActionResult,
    SessionEntry,
    SessionHistoryResponse,
    SessionMessage,
    SessionsResponse,
)

logger = logging.getLogger(__name__)

# ── Session history helpers ──────────────────────────────────────────

# End-of-block markers the gateway injects before the real user text.
_SYSTEM_END_MARKERS = [
    "[END WORKSPACE SNAPSHOT]",
    "[END CREDENTIAL STORAGE CAPABILITY]",
]

# Fenced code blocks the live chat renders as interactive components.
_ACTION_BLOCK_RE = _re.compile(
    r"```(?:setup_skill|store_secret)\s*\n.*?\n```",
    _re.DOTALL,
)


def _strip_system_prefix(content: str) -> str:
    """Extract the actual user text from a gateway-stored user message.

    The gateway prepends system blocks (workspace snapshot, credential
    storage info) to the user's message.  We find the last known end-marker
    and return everything after it, which is what the user actually typed.
    """
    last_end = -1
    for marker in _SYSTEM_END_MARKERS:
        idx = content.rfind(marker)
        if idx > last_end:
            last_end = idx + len(marker)

    if last_end > 0:
        return content[last_end:].strip()

    if content.lstrip().startswith("[SYSTEM"):
        return ""

    return content.strip()


def _strip_action_blocks(content: str) -> str:
    """Remove ``setup_skill`` / ``store_secret`` fenced code blocks."""
    cleaned = _ACTION_BLOCK_RE.sub("", content)
    return cleaned.strip()


# ── Session CRUD ─────────────────────────────────────────────────────


async def get_agent_sessions(agent_id: str) -> SessionsResponse:
    """List sessions for an agent."""
    from app.adapters.openclaw import openclaw

    try:
        await openclaw.connect()
    except (ConnectionRefusedError, ConnectionError, OSError) as exc:
        logger.warning("Gateway not reachable for sessions: %s", exc)
        return SessionsResponse(count=0, sessions=[])

    raw = await openclaw.sessions_list_full(agent_id, limit=50)
    sessions = [
        SessionEntry(
            key=s.get("key", ""),
            kind=s.get("kind", ""),
            display_name=s.get("displayName", ""),
            channel=s.get("lastChannel") or s.get("channel", ""),
            updated_at=s.get("updatedAt"),
            session_id=s.get("sessionId", ""),
            model_provider=s.get("modelProvider", ""),
            model=s.get("model", ""),
            input_tokens=s.get("inputTokens", 0),
            output_tokens=s.get("outputTokens", 0),
            total_tokens=s.get("totalTokens", 0),
            derived_title=s.get("derivedTitle", ""),
            last_message_preview=s.get("lastMessagePreview", ""),
        )
        for s in raw.get("sessions", [])
    ]
    return SessionsResponse(
        count=raw.get("count", len(sessions)), sessions=sessions
    )


async def reset_session(key: str) -> ActionResult:
    """Reset a session (clear history)."""
    from app.adapters.openclaw import openclaw

    try:
        await openclaw.connect()
        await openclaw.sessions_reset(key)
        return ActionResult(success=True, message="Session reset")
    except Exception as exc:
        return ActionResult(success=False, message=str(exc))


async def delete_session(key: str) -> ActionResult:
    """Delete a session."""
    from app.adapters.openclaw import openclaw

    try:
        await openclaw.connect()
        await openclaw.sessions_delete(key)
        return ActionResult(success=True, message="Session deleted")
    except Exception as exc:
        return ActionResult(success=False, message=str(exc))


# ── Session history ──────────────────────────────────────────────────


async def get_session_history(
    agent_id: str,
    session_id: str,
) -> SessionHistoryResponse:
    """Fetch message history for a specific session.

    ``session_id`` may be either a full session *key*
    (e.g. ``agent:main:clawdata-<uuid>``) or a bare *sessionId* UUID.
    """
    from app.adapters.openclaw import openclaw

    try:
        await openclaw.connect()
    except (ConnectionRefusedError, ConnectionError, OSError) as exc:
        logger.warning("Gateway not reachable for session history: %s", exc)
        return SessionHistoryResponse(session_id=session_id, agent_id=agent_id)

    # Resolve session_id to a session key if it isn't one already
    session_key = session_id if ":" in session_id else None

    if not session_key:
        try:
            raw = await openclaw.sessions_list_full(agent_id, limit=200)
            for s in raw.get("sessions", []):
                if s.get("sessionId") == session_id:
                    session_key = s.get("key", "")
                    break
        except Exception as exc:
            logger.warning("Failed to resolve session key from list: %s", exc)

    if not session_key:
        logger.warning(
            "Could not resolve session key for session_id=%s", session_id
        )
        return SessionHistoryResponse(session_id=session_id, agent_id=agent_id)

    raw_msgs: list[dict] = []
    try:
        raw_msgs = await openclaw.get_session_history(agent_id, session_key)
    except Exception as exc:
        logger.warning(
            "Failed to fetch session history for key %s: %s", session_key, exc
        )

    messages: list[SessionMessage] = []
    for m in raw_msgs:
        role = m.get("role", "")
        if role in ("tool", "toolResult"):
            continue
        content = m.get("content", "")
        if isinstance(content, list):
            text_parts = [
                p.get("text", "")
                for p in content
                if isinstance(p, dict) and p.get("type") == "text"
            ]
            content = "\n".join(text_parts)
        if not content or not content.strip():
            continue

        if role == "user":
            content = _strip_system_prefix(content)
            if not content:
                continue

        if role == "assistant":
            content = _strip_action_blocks(content)
            if not content:
                continue

        # Normalise timestamp
        raw_ts = m.get("timestamp") or m.get("ts")
        if isinstance(raw_ts, (int, float)):
            from datetime import datetime, timezone

            raw_ts = datetime.fromtimestamp(
                raw_ts / 1000, tz=timezone.utc
            ).isoformat()
        elif raw_ts is not None:
            raw_ts = str(raw_ts)

        messages.append(
            SessionMessage(
                role=role,
                content=content,
                timestamp=raw_ts,
                tool_name=m.get("toolName") or m.get("name"),
            )
        )

    return SessionHistoryResponse(
        messages=messages, session_id=session_id, agent_id=agent_id
    )
