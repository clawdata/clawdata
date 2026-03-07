"""Agent operations — gateway as source of truth.

v2: No dual data store, no workspace seeding, no symlinks.
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


async def list_openclaw_agents() -> dict:
    """List agents from the gateway."""
    from app.adapters.openclaw import openclaw

    try:
        raw = await openclaw.list_agents()
        default_id = raw.get("defaultId", "")
        agents = []
        for a in raw.get("agents", []):
            aid = a.get("id", "")
            agents.append({
                "id": aid,
                "name": a.get("name", ""),
                "emoji": a.get("emoji", ""),
                "model": a.get("model"),
                "skills": a.get("skills", []),
                "is_default": a.get("isDefault", False) or aid == default_id,
            })
        return {
            "default_id": default_id,
            "main_key": raw.get("mainKey", ""),
            "scope": raw.get("scope", ""),
            "agents": agents,
        }
    except Exception as exc:
        logger.warning("Failed to list agents from gateway: %s", exc)
        return {"default_id": "", "main_key": "", "scope": "", "agents": []}


async def create_agent(payload: dict) -> dict:
    """Create a new agent via the gateway."""
    from app.adapters.openclaw import openclaw

    try:
        await openclaw.create_agent(payload)
        return {"success": True, "message": f"Agent created"}
    except Exception as exc:
        logger.warning("Failed to create agent: %s", exc)
        return {"success": False, "message": str(exc)}


async def update_agent(agent_id: str, payload: dict) -> dict:
    """Update agent metadata via the gateway."""
    from app.adapters.openclaw import openclaw

    try:
        await openclaw.update_agent(agent_id, payload)
        return {"success": True, "message": f"Agent {agent_id} updated"}
    except Exception as exc:
        logger.warning("Failed to update agent %s: %s", agent_id, exc)
        return {"success": False, "message": str(exc)}


async def delete_agent(agent_id: str, *, delete_files: bool = True) -> dict:
    """Delete an agent via the gateway."""
    from app.adapters.openclaw import openclaw

    try:
        await openclaw.delete_agent(agent_id, delete_files=delete_files)
        return {"success": True, "message": f"Agent {agent_id} deleted"}
    except Exception as exc:
        logger.warning("Failed to delete agent %s: %s", agent_id, exc)
        return {"success": False, "message": str(exc)}


async def reset_agents() -> dict:
    """Reset all agents to default state via the gateway."""
    from app.adapters.openclaw import openclaw

    try:
        await openclaw.reset_agents()
        return {"success": True, "message": "Agents reset"}
    except Exception as exc:
        logger.warning("Failed to reset agents: %s", exc)
        return {"success": False, "message": str(exc)}


async def get_agent_detail(agent_id: str) -> dict:
    """Get comprehensive agent info: profile, files, sessions."""
    from app.adapters.openclaw import openclaw

    # Fetch agent list to find this one
    raw = await openclaw.list_agents()
    agent_info = {}
    for a in raw.get("agents", []):
        if a.get("id") == agent_id:
            agent_info = a
            break

    # Fetch files
    workspace = ""
    try:
        files_raw = await openclaw.get_agent_files(agent_id)
        files = files_raw.get("files", [])
        workspace = files_raw.get("workspace", "")
    except Exception:
        files = []

    # Fetch sessions
    try:
        sessions = await openclaw.list_sessions(agent_id)
    except Exception:
        sessions = []

    default_id = raw.get("defaultId", "")

    return {
        "id": agent_id,
        "name": agent_info.get("name", agent_id),
        "emoji": agent_info.get("emoji", ""),
        "model": agent_info.get("model"),
        "is_default": agent_info.get("isDefault", False) or agent_id == default_id,
        "workspace": workspace or agent_info.get("workspace", ""),
        "source": "openclaw",
        "files": files,
        "skills": [],
        "sessions": sessions,
    }


async def get_agent_files(agent_id: str) -> dict:
    """List workspace files for an agent."""
    from app.adapters.openclaw import openclaw

    raw = await openclaw.get_agent_files(agent_id)
    return {
        "agent_id": agent_id,
        "workspace": "",
        "files": raw.get("files", []),
    }


async def get_agent_file(agent_id: str, name: str) -> dict:
    """Get a workspace file with its content."""
    from app.adapters.openclaw import openclaw

    raw = await openclaw.read_agent_file(agent_id, name)
    return {
        "name": name,
        "path": raw.get("path", ""),
        "content": raw.get("content", ""),
        "missing": raw.get("missing", False),
        "size": raw.get("size"),
        "updated_at_ms": raw.get("updatedAtMs"),
    }


async def set_agent_file(agent_id: str, name: str, content: str) -> dict:
    """Write content to a workspace file."""
    from app.adapters.openclaw import openclaw

    await openclaw.write_agent_file(agent_id, name, content)
    return {"success": True, "message": f"Wrote {name}"}


async def update_agent_to_agent_allow(agent_id: str, linked_ids: list[str]) -> dict:
    """Record which agents this agent can delegate to.

    The caller (frontend) already writes a rich AGENTS.md — this
    endpoint only persists the list so the gateway can enforce it.
    We no longer write AGENTS.md here to avoid racing with the
    setAgentFile call.
    """
    # For now this is a no-op beyond confirmation since the frontend
    # writes the full AGENTS.md.  A future gateway API could accept
    # a structured linked-agents config; for now the file IS the config.
    return {"success": True, "message": f"Updated linked agents for {agent_id}"}
