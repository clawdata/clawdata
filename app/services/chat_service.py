"""Chat service — relay messages between clients and OpenClaw."""

from __future__ import annotations

import asyncio
import datetime
import logging
import time
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

from app.adapters.openclaw import openclaw
from app.config import settings

logger = logging.getLogger(__name__)

# ── Memory helpers ───────────────────────────────────────────────────

_MEMORY_CONTEXT_HEADER = (
    "[SYSTEM — WORKSPACE FILE SNAPSHOT]\n"
    "The following is a snapshot of YOUR workspace files (the files you read/write "
    "with your file tools). This is provided so you have context from previous "
    "sessions without needing to read every file first. These are YOUR files — "
    "continue to update them as instructed in AGENTS.md."
)
_MEMORY_CONTEXT_FOOTER = "[END WORKSPACE SNAPSHOT]"

# Max bytes of memory context to inject (prevent bloating the message)
_MAX_MEMORY_CONTEXT = 4000


def _agent_workspace(agent_id: str) -> Path:
    """Return the local workspace directory for an agent."""
    return settings.userdata_dir / "agents" / agent_id


def _has_filled_fields(content: str) -> bool:
    """Return True if a markdown file has fields with actual values filled in.

    Detects both ``- **Name:** Sean`` and ``- Name: Sean`` patterns.
    """
    for line in content.splitlines():
        line = line.strip()
        if not line.startswith("- "):
            continue
        # Bold format: "- **Label:** Value"
        if ":**" in line:
            after_colon = line.split(":**", 1)[1].strip()
            if after_colon and after_colon not in (
                "_", "_(unspecified)_", "_(optional)_",
            ):
                return True
        # Plain format: "- Label: Value" (agent may write without bold)
        elif ": " in line:
            after_colon = line.split(": ", 1)[1].strip()
            if after_colon and not after_colon.startswith("_("):
                return True
    return False


def _load_memory_context(agent_id: str) -> str:
    """Read recent memory files and key workspace files, return a context block.

    This is injected into the first/every message so the agent retains
    knowledge across session resets (e.g. user's name, preferences).
    """
    workspace = _agent_workspace(agent_id)
    if not workspace.exists():
        return ""

    parts: list[str] = []

    # 1. USER.md — who the human is
    user_file = workspace / "USER.md"
    if user_file.exists():
        content = user_file.read_text().strip()
        if content and _has_filled_fields(content):
            parts.append(f"[USER.md]\n{content}")

    # 2. IDENTITY.md — who the agent is
    identity_file = workspace / "IDENTITY.md"
    if identity_file.exists():
        content = identity_file.read_text().strip()
        if content and _has_filled_fields(content):
            parts.append(f"[IDENTITY.md]\n{content}")

    # 3. MEMORY.md — curated long-term memory
    memory_file = workspace / "MEMORY.md"
    if memory_file.exists():
        content = memory_file.read_text().strip()
        if content and content != "# Memory\n\n_Long-term curated memory. Update this with important facts, decisions, and context._":
            parts.append(f"[MEMORY.md]\n{content}")

    # 4. Recent daily memory files (today + 2 days back)
    memory_dir = workspace / "memory"
    if memory_dir.exists():
        today = datetime.date.today()
        for days_ago in range(3):
            date = today - datetime.timedelta(days=days_ago)
            daily_file = memory_dir / f"{date.isoformat()}.md"
            if daily_file.exists():
                content = daily_file.read_text().strip()
                if content:
                    parts.append(f"[memory/{date.isoformat()}.md]\n{content}")

    if not parts:
        return ""

    combined = "\n\n---\n\n".join(parts)
    # Truncate if too large
    if len(combined) > _MAX_MEMORY_CONTEXT:
        combined = combined[:_MAX_MEMORY_CONTEXT] + "\n… (truncated)"

    return f"{_MEMORY_CONTEXT_HEADER}\n\n{combined}\n\n{_MEMORY_CONTEXT_FOOTER}\n\n"


def _persist_memory(
    agent_id: str, user_message: str, assistant_text: str,
) -> None:
    """Best-effort: leave a lightweight breadcrumb in the daily memory file.

    OpenClaw's design is that the **agent** writes meaningful notes to its
    own ``memory/YYYY-MM-DD.md`` and ``MEMORY.md`` files using its file tools.
    We do NOT duplicate the full chat here — that already lives in session
    history on the gateway.

    All we do is drop a one-line timestamp + topic hint so the agent (or
    the workspace snapshot injector) can see that a conversation happened
    even if the agent forgot to write its own notes.
    """
    if not assistant_text.strip():
        return

    workspace = _agent_workspace(agent_id)
    if not workspace.exists():
        return

    try:
        memory_dir = workspace / "memory"
        memory_dir.mkdir(parents=True, exist_ok=True)

        today = datetime.date.today().isoformat()
        daily_file = memory_dir / f"{today}.md"

        timestamp = datetime.datetime.now().strftime("%H:%M")

        # Build a brief topic hint (first ~80 chars of the user message)
        topic = user_message.strip().replace("\n", " ")[:80]
        if len(user_message.strip()) > 80:
            topic += "…"

        entry = f"- {timestamp} — {topic}\n"

        if not daily_file.exists():
            daily_file.write_text(
                f"# Conversation Log — {today}\n\n"
                f"_Timestamps of exchanges. The agent should add its own notes below._\n\n"
                f"{entry}"
            )
        else:
            with open(daily_file, "a") as fh:
                fh.write(entry)

        logger.info("Saved breadcrumb for agent %s → memory/%s.md", agent_id, today)
    except Exception:
        logger.warning("Failed to persist memory for agent %s", agent_id, exc_info=True)

# How long to wait for a sub-agent announce-triggered follow-up run (seconds)
_ANNOUNCE_TIMEOUT = 60.0

# Tool names (or substrings) that indicate sub-agent delegation
_SPAWN_KEYWORDS = (
    "sessions_spawn", "sessions.spawn", "spawn_session",
    "agent_to_agent", "agenttoagent",
    "subagent", "sub_agent", "delegate_to",
    "sessions_run", "sessions.run",
)

# Phrases in assistant text that suggest delegation happened even if we
# missed the tool event (fallback detection).
_DELEGATION_TEXT_HINTS = (
    "passed the question along to",
    "passed it along to",
    "delegated to",
    "asked john",
    "forwarded to",
    "handed off to",
    "relay his answer",
    "relay her answer",
    "relay their answer",
    "waiting for his reply",
    "waiting for her reply",
    "waiting for their reply",
    "sub-agent",
    "subagent",
)


def _is_spawn_tool(name: str) -> bool:
    """Return True if *name* looks like a sub-agent spawn / delegation tool."""
    lower = name.lower()
    return any(kw in lower for kw in _SPAWN_KEYWORDS)


def _text_hints_delegation(text: str) -> bool:
    """Return True if *text* contains phrases suggesting delegation occurred."""
    lower = text.lower()
    return any(hint in lower for hint in _DELEGATION_TEXT_HINTS)


def _process_stream_event(
    payload: dict[str, Any], run_id: str, agent_id: str
) -> tuple[dict[str, Any] | None, bool, bool]:
    """Process a single stream event payload.

    Returns (event_to_yield, is_lifecycle_end, is_sessions_spawn).
    """
    stream = payload.get("stream", "")
    data = payload.get("data") or {}
    is_spawn = False

    if stream == "assistant":
        delta = data.get("delta", "")
        if delta:
            return (
                {"type": "text", "content": delta, "run_id": run_id, "agent_id": agent_id},
                False,
                False,
            )
        return None, False, False

    if stream == "tool":
        phase = data.get("phase", "")
        tool_name = data.get("name") or data.get("tool") or ""

        # Detect sub-agent delegation (broad match)
        if _is_spawn_tool(str(tool_name)):
            is_spawn = True

        # Extract target agent for delegation tools
        target_agent = ""
        name_lower = str(tool_name).lower()
        if is_spawn or "agent" in name_lower:
            target_agent = (
                data.get("agentId")
                or data.get("targetAgentId")
                or data.get("args", {}).get("agentId", "")
                or ""
            )
        content = f"{tool_name}: @{target_agent}" if target_agent else str(tool_name)
        return (
            {
                "type": "tool_start" if phase == "start" else "tool_end",
                "content": content,
                "run_id": run_id,
                "agent_id": agent_id,
                "target_agent": target_agent,
                "metadata": data,
            },
            False,
            is_spawn,
        )

    if stream == "lifecycle":
        phase = data.get("phase", "")
        if phase in ("end", "error"):
            error_msg = data.get("error") or data.get("message") or ""
            content = "completed" if phase == "end" else f"failed: {error_msg}" if error_msg else "failed"
            return (
                {
                    "type": "status",
                    "content": content,
                    "run_id": run_id,
                    "agent_id": agent_id,
                    "metadata": data,
                },
                True,
                False,
            )

    return None, False, False


def _make_trace(payload: dict[str, Any], phase: str = "primary") -> dict[str, Any]:
    """Build a trace event from a raw gateway payload."""
    data = payload.get("data") or {}
    return {
        "type": "trace",
        "phase": phase,
        "run_id": payload.get("runId"),
        "stream": payload.get("stream", ""),
        "seq": payload.get("seq"),
        "ts": payload.get("ts"),
        "data": data,
    }


async def send_and_stream(
    agent_id: str,
    message: str,
    session_key: str | None = None,
) -> AsyncIterator[dict[str, Any]]:
    """Send a message to an OpenClaw agent and stream back events.

    Handles **three** sub-agent patterns:
    1. Tool-based spawn detection (``sessions_spawn`` / ``agent_to_agent``)
    2. Concurrent sub-agent runs that appear as events with a *different*
       ``runId`` during the primary run (inline delegation)
    3. Post-run announce follow-up (classic announce pattern)

    Every gateway event is also emitted as a ``trace`` event so the frontend
    can display a full event timeline.
    """
    await openclaw.connect()

    # ── Inject memory context so agent recalls past sessions ────────
    memory_ctx = _load_memory_context(agent_id)
    outgoing = f"{memory_ctx}{message}" if memory_ctx else message

    # ── Pre-send context traces ─────────────────────────────────────
    t_start = time.monotonic()

    # 0. Workspace skills are auto-discovered by OpenClaw from disk.
    #    No gateway enable/sync needed here — that would accidentally
    #    turn on bundled gateway tools sharing a name with workspace skills.

    # 1. Gather agent skills snapshot (best-effort, non-blocking)
    skills_snapshot: list[dict[str, Any]] = []
    agent_model: str | None = None
    try:
        skills_raw = await openclaw.skills_status(agent_id)
        for s in skills_raw.get("skills", []):
            # Gateway uses "disabled" (bool), not "enabled" — invert it
            is_disabled = s.get("disabled", True)
            skills_snapshot.append({
                "name": s.get("name") or s.get("key", "?"),
                "key": s.get("key", ""),
                "enabled": not is_disabled,
                "eligible": s.get("eligible", False),
                "status": s.get("status", "unknown"),
                "hasApiKey": bool(s.get("apiKey") or s.get("hasApiKey")),
            })
    except Exception as exc:
        logger.debug("Could not fetch skills for trace: %s", exc)

    # 2. Resolve model from config (best-effort)
    try:
        from app.services.openclaw_lifecycle import _read_config
        cfg = _read_config()
        for a in cfg.get("agents", {}).get("list", []):
            if a.get("id") == agent_id:
                m = a.get("model")
                agent_model = m.get("primary") if isinstance(m, dict) else m
                break
        if not agent_model:
            agent_model = (
                cfg.get("agents", {}).get("defaults", {}).get("model") or {}
            ).get("primary")
    except Exception as exc:
        logger.debug("Could not resolve model for trace: %s", exc)

    ack = await openclaw.send_message(agent_id, outgoing, session_key=session_key)
    run_id = ack.get("runId")
    status = ack.get("status")

    yield {
        "type": "status",
        "content": f"Run {run_id} — {status}",
        "run_id": run_id,
        "agent_id": agent_id,
    }
    yield {
        "type": "trace",
        "phase": "ack",
        "run_id": run_id,
        "stream": "ack",
        "data": {"status": status, "runId": run_id, "sessionKey": session_key},
    }

    # 3. Gather workspace / project skills (core skills from SKILL.md)
    core_skills: list[str] = []
    try:
        from app.services.openclaw_lifecycle import list_workspace_skills
        ws_skills = await list_workspace_skills(agent_id)
        for s in (
            ws_skills.workspace_skills
            + ws_skills.project_skills
            + ws_skills.managed_skills
        ):
            core_skills.append(s.name)
    except Exception as exc:
        logger.debug("Could not fetch workspace skills for trace: %s", exc)

    # 4. Emit context trace — what was sent & what's available
    enabled_skills = [s["name"] for s in skills_snapshot if s["enabled"]]
    disabled_skills = [s["name"] for s in skills_snapshot if not s["enabled"]]
    yield {
        "type": "trace",
        "phase": "context",
        "run_id": run_id,
        "stream": "context",
        "data": {
            "event": "pre_send",
            "agent_id": agent_id,
            "model": agent_model or "unknown",
            "session_key": session_key,
            "memory_injected": bool(memory_ctx),
            "memory_length": len(memory_ctx) if memory_ctx else 0,
            "message_length": len(outgoing),
            "user_message": message[:200] + ("…" if len(message) > 200 else ""),
            "skills_enabled": enabled_skills,
            "skills_disabled": disabled_skills,
            "core_skills": core_skills,
            "total_skills": len(skills_snapshot),
        },
    }

    if not run_id:
        yield {"type": "error", "content": "No runId returned from agent"}
        return

    # One subscription for the ENTIRE lifetime
    queue = openclaw._subscribe_events("agent")
    try:
        # ── Phase 1: stream the primary run ──────────────────────────
        saw_spawn = False
        assistant_text = ""
        tools_invoked: list[dict[str, Any]] = []   # track every tool call

        # Track concurrent (other) runs — likely inline sub-agent work
        other_runs: dict[str, str] = {}       # run_id → accumulated text
        other_runs_done: set[str] = set()     # run_ids whose lifecycle ended
        sent_delegation_status = False
        inline_responded = False              # True once sub-agent response sent to chat
        delegation_target = ""                 # Agent ID/name the task was delegated to

        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=120.0)
            except TimeoutError:
                logger.warning("Primary run %s timed out waiting for events", run_id)
                break

            payload = event.get("payload", {})
            evt_run = payload.get("runId")
            stream = payload.get("stream", "")
            data = payload.get("data") or {}

            logger.debug(
                "Event run=%s stream=%s data_keys=%s",
                evt_run, stream, list(data.keys()),
            )

            # ── Events from a DIFFERENT run (concurrent sub-agent) ───
            if evt_run != run_id:
                if evt_run:
                    other_runs.setdefault(evt_run, "")

                # Emit trace for the other run
                yield {
                    "type": "trace",
                    "phase": "subagent",
                    "run_id": evt_run or "",
                    "stream": stream,
                    "ts": payload.get("ts"),
                    "data": data,
                }

                # Accumulate sub-agent assistant text
                if stream == "assistant":
                    delta = data.get("delta", "")
                    if delta and evt_run:
                        other_runs[evt_run] += delta

                # Notify UI that delegation is happening (once)
                # Only emit for REAL delegation (target is a different agent).
                # Skill execution also spawns sub-runs but targets the same agent.
                if not sent_delegation_status and evt_run and stream == "lifecycle" and data.get("phase") == "start":
                    # Try to identify target from lifecycle data or prior tool event
                    if not delegation_target:
                        delegation_target = data.get("agentId") or data.get("agent") or ""
                    is_real_delegation = delegation_target and delegation_target != agent_id
                    if is_real_delegation:
                        sent_delegation_status = True
                        yield {
                            "type": "delegation_status",
                            "content": "waiting",
                            "agent_id": agent_id,
                            "target_agent": delegation_target,
                        }

                # Sub-agent lifecycle end → immediately show response
                if stream == "lifecycle" and data.get("phase") in ("end", "error"):
                    if evt_run:
                        other_runs_done.add(evt_run)
                        subagent_text = other_runs.get(evt_run, "").strip()
                        if subagent_text:
                            inline_responded = True
                            logger.info(
                                "Inline sub-agent %s completed: %s",
                                evt_run, subagent_text[:120],
                            )
                            yield {
                                "type": "trace",
                                "phase": "subagent",
                                "run_id": evt_run,
                                "stream": "delegation",
                                "data": {
                                    "event": "inline_subagent_complete",
                                    "response": subagent_text[:500],
                                },
                            }
                            # Show the response in chat immediately
                            yield {
                                "type": "text",
                                "content": f"📨 {subagent_text}",
                                "run_id": run_id,
                                "agent_id": agent_id,
                            }
                            yield {
                                "type": "delegation_status",
                                "content": "done",
                                "agent_id": agent_id,
                            }

                continue

            # ── Events from OUR primary run ──────────────────────────
            yield _make_trace(payload, "primary")

            if stream == "assistant":
                delta = data.get("delta", "")
                if delta:
                    assistant_text += delta

            # Track tool invocations for the summary trace
            if stream == "tool":
                tool_name = data.get("name") or data.get("tool") or ""
                tool_phase = data.get("phase", "")
                if tool_phase == "start":
                    tools_invoked.append({
                        "name": tool_name,
                        "started_at": time.monotonic(),
                        "args": {k: str(v)[:200] for k, v in (data.get("args") or data.get("input") or {}).items()},
                    })
                elif tool_phase in ("end", "complete", "result"):
                    # Annotate the matching start entry
                    for t in reversed(tools_invoked):
                        if t["name"] == tool_name and "duration_ms" not in t:
                            t["duration_ms"] = round((time.monotonic() - t["started_at"]) * 1000)
                            t["result_preview"] = str(
                                data.get("result") or data.get("output") or ""
                            )[:300]
                            break

            ev, is_end, is_spawn_evt = _process_stream_event(payload, run_id, agent_id)
            if is_spawn_evt:
                saw_spawn = True
                # Capture the target agent from the tool event
                if ev and ev.get("target_agent"):
                    delegation_target = ev["target_agent"]
                logger.info("sessions_spawn detected in run %s (tool event), target=%s", run_id, delegation_target)
            if ev:
                yield ev
                # If lifecycle errored, also yield an explicit error event for the UI
                if is_end and stream == "lifecycle" and data.get("phase") == "error":
                    error_msg = data.get("error") or data.get("message") or "Agent run failed"
                    yield {
                        "type": "error",
                        "content": error_msg,
                        "run_id": run_id,
                        "agent_id": agent_id,
                    }
            if is_end:
                break

        # ── Emit run summary trace ───────────────────────────────────
        t_elapsed = round((time.monotonic() - t_start) * 1000)
        tool_names_used = [t["name"] for t in tools_invoked]
        # Sanitise tool entries for JSON (remove monotonic timestamps)
        tools_summary = [
            {k: v for k, v in t.items() if k != "started_at"}
            for t in tools_invoked
        ]

        # Determine inference source — how the model produced its answer
        if tools_invoked:
            inference_source = "tools"
            inference_detail = f"Used {len(tools_invoked)} tool(s): {', '.join(tool_names_used)}"
        elif assistant_text.strip():
            inference_source = "model_direct"
            inference_detail = (
                "The model answered directly without invoking any gateway tools or skills. "
                "If the response contains real-time data (e.g. weather, prices), "
                "the model likely has built-in web access — this is a model capability, "
                "not a gateway skill."
            )
        else:
            inference_source = "none"
            inference_detail = "No assistant text produced."

        yield {
            "type": "trace",
            "phase": "summary",
            "run_id": run_id,
            "stream": "summary",
            "data": {
                "event": "run_complete",
                "duration_ms": t_elapsed,
                "inference_source": inference_source,
                "inference_detail": inference_detail,
                "tools_used": tool_names_used,
                "tools_detail": tools_summary,
                "assistant_length": len(assistant_text),
                "assistant_preview": assistant_text[:300] + ("…" if len(assistant_text) > 300 else ""),
                "model": agent_model or "unknown",
                "skills_enabled": enabled_skills,
                "skills_disabled": disabled_skills,
                "core_skills": core_skills,
                "saw_delegation": saw_spawn,
            },
        }

        # ── If sub-agent already responded inline, we're done ────────
        if inline_responded:
            logger.info("Sub-agent responded inline — skipping Phase 2")
            return

        # Check for completed inline sub-agents whose response wasn't
        # sent yet (edge case: lifecycle end arrived same batch as primary end)
        completed_subagent_text = ""
        for other_id in other_runs_done:
            text = other_runs.get(other_id, "").strip()
            if text:
                completed_subagent_text = text
                logger.info(
                    "Inline sub-agent %s completed with text: %s",
                    other_id, text[:120],
                )

        if completed_subagent_text:
            logger.info("Late inline sub-agent response — showing in chat")
            yield {
                "type": "text",
                "content": f"📨 {completed_subagent_text}",
                "run_id": run_id,
                "agent_id": agent_id,
            }
            yield {
                "type": "delegation_status",
                "content": "done",
                "agent_id": agent_id,
            }
            return

        # Determine if this was a skill spawn (same agent) vs real delegation
        is_real_delegation = bool(delegation_target and delegation_target != agent_id)

        # Text-based fallback detection
        if not saw_spawn and assistant_text and _text_hints_delegation(assistant_text):
            saw_spawn = True
            logger.info(
                "Delegation detected from assistant text in run %s: %s",
                run_id, assistant_text[:120],
            )
            yield {
                "type": "trace",
                "phase": "gap",
                "run_id": run_id,
                "stream": "delegation",
                "data": {
                    "event": "text_based_delegation_detected",
                    "hint": assistant_text[:200],
                },
            }

        # Emit primary-run-complete trace
        if saw_spawn:
            yield {
                "type": "trace",
                "phase": "gap",
                "run_id": run_id,
                "stream": "delegation",
                "data": {"event": "primary_complete", "message": "Primary run ended, waiting for announce…"},
            }

        # ── Phase 2: wait for announce follow-up ─────────────────────
        if not saw_spawn:
            return

        logger.info(
            "Waiting up to %.0fs for announce follow-up after run %s",
            _ANNOUNCE_TIMEOUT, run_id,
        )
        # Only show "waiting" system message for real delegation, not skill spawns
        if is_real_delegation:
            yield {
                "type": "system",
                "content": "⏳ Waiting for sub-agent response…",
                "agent_id": agent_id,
            }
        if not sent_delegation_status and is_real_delegation:
            yield {
                "type": "delegation_status",
                "content": "waiting",
                "agent_id": agent_id,
                "target_agent": delegation_target,
            }
        yield {
            "type": "trace",
            "phase": "gap",
            "run_id": run_id,
            "stream": "delegation",
            "ts": None,
            "data": {"event": "waiting_for_announce", "timeout": _ANNOUNCE_TIMEOUT},
        }

        followup_run_id: str | None = None

        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=_ANNOUNCE_TIMEOUT)
            except TimeoutError:
                logger.info("Announce follow-up timed out after %.0fs", _ANNOUNCE_TIMEOUT)
                yield {
                    "type": "system",
                    "content": "Sub-agent may still be running — send another message to check.",
                    "agent_id": agent_id,
                }
                yield {
                    "type": "delegation_status",
                    "content": "timeout",
                    "agent_id": agent_id,
                }
                yield {
                    "type": "trace",
                    "phase": "gap",
                    "run_id": run_id,
                    "stream": "delegation",
                    "data": {"event": "announce_timeout", "timeout": _ANNOUNCE_TIMEOUT},
                }
                break

            payload = event.get("payload", {})
            evt_run = payload.get("runId")
            stream = payload.get("stream", "")

            logger.debug(
                "Follow-up event run=%s stream=%s data_keys=%s",
                evt_run, stream, list((payload.get("data") or {}).keys()),
            )

            # Detect the first new run for our agent
            if not followup_run_id and evt_run and evt_run != run_id:
                followup_run_id = evt_run
                logger.info("Announce follow-up run detected: %s", followup_run_id)
                yield {
                    "type": "trace",
                    "phase": "gap",
                    "run_id": followup_run_id,
                    "stream": "delegation",
                    "ts": payload.get("ts"),
                    "data": {"event": "followup_detected", "followup_run_id": followup_run_id},
                }

            if followup_run_id and evt_run == followup_run_id:
                yield _make_trace(payload, "announce")
                ev, is_end, _ = _process_stream_event(
                    payload, followup_run_id, agent_id
                )
                if ev:
                    yield ev
                if is_end:
                    yield {
                        "type": "delegation_status",
                        "content": "done",
                        "agent_id": agent_id,
                    }
                    yield {
                        "type": "trace",
                        "phase": "gap",
                        "run_id": followup_run_id,
                        "stream": "delegation",
                        "ts": payload.get("ts"),
                        "data": {"event": "delegation_complete"},
                    }
                    break
    finally:
        # ── Persist memory (best-effort, non-blocking) ─────────────
        _persist_memory(agent_id, message, assistant_text)
        openclaw._unsubscribe_events("agent")
