"""Heartbeat sync — keeps HEARTBEAT.md in agent workspace aligned with DB tasks.

When tasks are created, updated, or deleted, this service regenerates the
agent's HEARTBEAT.md file so the agent has context about its scheduled work.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.task import Task
from app.services.lifecycle._helpers import resolve_agent_workspace_sync

logger = logging.getLogger(__name__)

# OpenClaw stores per-agent workspaces here
_OPENCLAW_AGENTS_DIR = Path.home() / ".openclaw" / "agents"


def _agent_workspace(agent_id: str) -> Path:
    return resolve_agent_workspace_sync(agent_id)


def _render_heartbeat(tasks: list[Task]) -> str:
    """Generate HEARTBEAT.md content from a list of tasks."""
    lines = [
        "# Heartbeat",
        "",
        "This file is **auto-generated** from your registered tasks.",
        "It tells you what scheduled work is assigned to you.",
        "",
    ]

    active = [t for t in tasks if t.status == "active" and t.enabled]
    paused = [t for t in tasks if t.status == "paused" or (t.status == "active" and not t.enabled)]
    other = [t for t in tasks if t.status not in ("active", "paused") and not (t.status == "active" and not t.enabled)]

    if not tasks:
        lines.append("_No tasks are currently assigned to you._")
        lines.append("")
        lines.append("## How tasks work")
        lines.append("")
        lines.append("- **Heartbeat** tasks run at regular intervals (e.g. every 30m)")
        lines.append("- **Cron** tasks run at precise times (e.g. `0 7 * * *` = 7 AM daily)")
        lines.append("- When a task fires, you'll receive its prompt as a message prefixed with `[Scheduled Task: ...]`")
        lines.append("- Respond concisely and action-oriented for scheduled tasks")
        lines.append("")
        return "\n".join(lines)

    # Active tasks
    if active:
        lines.append("## Active Tasks")
        lines.append("")
        for t in active:
            schedule = (
                f"every {t.heartbeat_interval}"
                if t.schedule_type == "heartbeat"
                else f"`{t.cron_expression}`"
            )
            lines.append(f"### {t.name}")
            lines.append(f"- **Schedule**: {t.schedule_type} — {schedule}")
            lines.append(f"- **Session**: {t.session_mode}")
            if t.description:
                lines.append(f"- **Purpose**: {t.description}")
            if t.message:
                lines.append(f"- **Prompt**: {t.message}")
            lines.append("")

    # Paused
    if paused:
        lines.append("## Paused Tasks")
        lines.append("")
        for t in paused:
            lines.append(f"- ~~{t.name}~~ (paused)")
        lines.append("")

    # Instructions
    lines.append("## Behaviour")
    lines.append("")
    lines.append("When you receive a `[Scheduled Task: ...]` message:")
    lines.append("- Execute the prompt concisely")
    lines.append("- Keep responses focused and action-oriented")
    lines.append("- Report results, anomalies, or failures clearly")
    lines.append("- For heartbeat tasks in the main session, be brief")
    lines.append("- For cron tasks in isolated sessions, you can be more detailed")
    lines.append("")

    return "\n".join(lines)


async def sync_heartbeat(db: AsyncSession, agent_id: str) -> None:
    """Regenerate HEARTBEAT.md for the given agent from their DB tasks."""
    workspace = _agent_workspace(agent_id)
    if not workspace.exists():
        logger.debug("Agent workspace %s does not exist, skipping HEARTBEAT sync", workspace)
        return

    stmt = select(Task).where(Task.agent_id == agent_id).order_by(Task.created_at)
    result = await db.execute(stmt)
    tasks = list(result.scalars().all())

    content = _render_heartbeat(tasks)
    heartbeat_path = workspace / "HEARTBEAT.md"

    try:
        heartbeat_path.write_text(content)
        logger.info("Synced HEARTBEAT.md for agent %s (%d tasks)", agent_id, len(tasks))
    except Exception as exc:
        logger.error("Failed to write HEARTBEAT.md for agent %s: %s", agent_id, exc)
