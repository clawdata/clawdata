"""Shared constants and low-level helpers for lifecycle operations."""

from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

OPENCLAW_HOME = Path.home() / ".openclaw"
OPENCLAW_CONFIG = OPENCLAW_HOME / "openclaw.json"


async def resolve_agent_workspace(agent_id: str) -> Path:
    """Resolve the filesystem workspace path for an agent.

    Uses the gateway ``agents.files.list`` which returns a ``workspace`` key,
    falling back to the default workspace from openclaw.json or convention.
    """
    from app.adapters.openclaw import openclaw

    # Ask the gateway — it knows the actual workspace per agent
    try:
        raw = await openclaw.get_agent_files(agent_id)
        ws = raw.get("workspace", "")
        if ws:
            return Path(ws)
    except Exception:
        pass

    # Fallback: read from config
    try:
        cfg = json.loads(OPENCLAW_CONFIG.read_text())
        ws = cfg.get("agents", {}).get("defaults", {}).get("workspace", "")
        if ws:
            return Path(ws)
    except Exception:
        pass

    # Last resort: convention
    return OPENCLAW_HOME / "workspace"


async def _run(
    cmd: list[str],
    *,
    timeout: int = 30,
    cwd: str | None = None,
) -> tuple[int, str, str]:
    """Run a subprocess and return (returncode, stdout, stderr)."""
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=cwd,
    )
    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except TimeoutError:
        proc.kill()
        await proc.wait()
        return -1, "", "Timed out"
    return proc.returncode or 0, stdout.decode(errors="replace"), stderr.decode(errors="replace")
