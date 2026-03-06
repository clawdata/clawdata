"""Agent CRUD, listing, reset, and detail operations."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import shutil
from pathlib import Path

from app.schemas.lifecycle import (
    ActionResult,
    AgentDetail,
    AgentFile,
    AgentFilesResponse,
    OpenClawAgent,
    OpenClawAgentsList,
    SessionEntry,
)

from ._config import _read_config, _write_config
from ._helpers import (
    DEFAULT_MODEL,
    OPENCLAW_HOME,
    OPENCLAW_WORKSPACE,
)

logger = logging.getLogger(__name__)


# ── Agent listing ───────────────────────────────────────────────────


async def list_openclaw_agents() -> OpenClawAgentsList:
    """Fetch live agent list from the gateway and sync to local DB."""
    from app.adapters.openclaw import openclaw
    from ._workspace_skills import _scan_skills_dir

    try:
        await openclaw.connect()
        raw = await openclaw.list_agents()
    except Exception as exc:
        logger.warning("Gateway agent list failed, falling back to config: %s", exc)
        return _agents_from_config()

    default_id = raw.get("defaultId", "main")
    agents: list[OpenClawAgent] = []
    sync_payload: list[dict] = []

    # Read config for per-agent model info
    cfg = _read_config()
    cfg_agents = {a.get("id"): a for a in cfg.get("agents", {}).get("list", [])}
    default_model = (cfg.get("agents", {}).get("defaults", {}).get("model") or {}).get("primary")

    for a in raw.get("agents", []):
        ident = a.get("identity") or {}
        agent_id = a.get("id", "")
        name = a.get("name") or ident.get("name") or agent_id
        # Override "main" with "ClawData" for the default agent
        if name == agent_id and agent_id in ("main", default_id):
            name = "ClawData"
        emoji = ident.get("emoji", "")

        # Resolve model from config
        cfg_agent = cfg_agents.get(agent_id, {})
        model_val = cfg_agent.get("model")
        if isinstance(model_val, dict):
            model = model_val.get("primary") or default_model
        else:
            model = model_val or default_model

        # Resolve workspace skills from disk
        agent_skills: list[str] = []
        try:
            ws = a.get("workspace", "") or cfg_agent.get("workspace", "")
            if ws:
                ws_path = Path(os.path.expanduser(ws))
            else:
                ws_path = OPENCLAW_WORKSPACE
            for s in _scan_skills_dir(ws_path / "skills", "workspace", agent_id):
                agent_skills.append(s.slug)
        except Exception:
            pass

        agents.append(OpenClawAgent(
            id=agent_id,
            name=name,
            emoji=emoji,
            skills=agent_skills,
            is_default=agent_id == default_id,
        ))

        sync_payload.append({
            "id": agent_id,
            "name": name,
            "emoji": emoji,
            "model": model,
            "is_default": agent_id == default_id,
            "workspace": a.get("workspace"),
        })

    if not agents:
        agents.append(OpenClawAgent(id="main", name="ClawData", emoji="꩜", is_default=True))
        sync_payload.append({"id": "main", "name": "ClawData", "emoji": "꩜", "model": default_model})

    # Sync to local DB (fire-and-forget, don't block response on failure)
    try:
        await _sync_agents_to_db(sync_payload)
    except Exception as exc:
        logger.warning("Agent sync to local DB failed: %s", exc)

    return OpenClawAgentsList(
        default_id=default_id,
        main_key=raw.get("mainKey", "main"),
        scope=raw.get("scope", ""),
        agents=agents,
    )


async def _sync_agents_to_db(gateway_agents: list[dict]) -> None:
    """Sync gateway agent data into the local SQLite database."""
    from app.database import async_session
    from app.services.agent_service import sync_openclaw_agents

    async with async_session() as db:
        await sync_openclaw_agents(db, gateway_agents)


def _agents_from_config() -> OpenClawAgentsList:
    """Fallback: read agents from openclaw.json when gateway is unavailable."""
    from ._workspace_skills import _scan_skills_dir

    config = _read_config()
    agents_cfg = config.get("agents", {})
    raw_list = agents_cfg.get("list", [])

    agents: list[OpenClawAgent] = []
    for a in raw_list:
        ident = a.get("identity", {})
        agent_id = a.get("id", "")
        # Scan workspace skills from disk
        agent_skills: list[str] = []
        try:
            ws = a.get("workspace", "")
            if ws:
                ws_path = Path(os.path.expanduser(ws))
            else:
                ws_path = OPENCLAW_WORKSPACE
            for s in _scan_skills_dir(ws_path / "skills", "workspace", agent_id):
                agent_skills.append(s.slug)
        except Exception:
            pass
        agents.append(OpenClawAgent(
            id=agent_id,
            name=ident.get("name", agent_id),
            emoji=ident.get("emoji", ""),
            skills=agent_skills,
        ))

    if not agents:
        agents.append(OpenClawAgent(id="main", name="ClawData", emoji="꩜", is_default=True))

    return OpenClawAgentsList(default_id="main", main_key="main", agents=agents)


# ── Reset ───────────────────────────────────────────────────────────


async def reset_all_agents() -> ActionResult:
    """Reset everything: remove non-main agents from the gateway,
    wipe all local agent data, and re-seed the main agent."""
    from app.adapters.openclaw import openclaw
    from app.database import async_session
    from app.services.agent_service import agent_workspace, reset_agents, _WORKSPACE_FILES
    from ._gateway import restart_gateway
    from ._models import set_default_model

    errors: list[str] = []

    # 1. Delete non-main agents from the gateway (with files)
    try:
        await openclaw.connect()
        raw = await openclaw.list_agents()
        main_key = raw.get("mainKey", "main")
        for a in raw.get("agents", []):
            aid = a.get("id", "")
            if aid and aid != main_key:
                try:
                    await openclaw.delete_agent(aid, delete_files=True)
                except Exception as exc:
                    errors.append(f"gateway delete {aid}: {exc}")
    except Exception as exc:
        errors.append(f"gateway list: {exc}")

    # 1b. Remove non-main agent directories from ~/.openclaw/agents/
    try:
        gw_agents_dir = OPENCLAW_HOME / "agents"
        if gw_agents_dir.is_dir():
            for entry in gw_agents_dir.iterdir():
                if entry.is_dir() and entry.name != "main":
                    shutil.rmtree(entry, ignore_errors=True)
                    logger.info("Removed gateway agent dir: %s", entry.name)
    except Exception as exc:
        errors.append(f"cleanup ~/.openclaw/agents: {exc}")

    # 2. Reset main agent identity on the gateway
    try:
        await openclaw.connect()
        main_ws = str(agent_workspace("main").resolve())
        await openclaw.update_agent(
            agent_id=main_key, name="ClawData", workspace=main_ws
        )
        try:
            cfg = _read_config()
            agent_list = cfg.get("agents", {}).get("list", [])
            cfg["agents"]["list"] = [
                a for a in agent_list if a.get("id") == main_key
            ]
            for a in cfg["agents"]["list"]:
                if a.get("id") == main_key:
                    a["name"] = "ClawData"
                    a["workspace"] = main_ws
                    a["identity"] = {"name": "ClawData", "emoji": "꩜"}
                    a.pop("subagents", None)
            _write_config(cfg)
        except Exception:
            pass
    except Exception as exc:
        errors.append(f"gateway reset main: {exc}")

    # 3. Disable all enabled gateway skills (clean slate)
    try:
        await openclaw.connect()
        gw_status = await openclaw.skills_status()
        bundled_to_disable = []
        ws_entries_to_remove = []
        for s in gw_status.get("skills", []):
            skill_key = s.get("name") or s.get("slug", "")
            source = s.get("source", "")
            if not skill_key:
                continue
            if not s.get("disabled", True):
                if "bundled" in source or "managed" in source:
                    bundled_to_disable.append(skill_key)
                else:
                    ws_entries_to_remove.append(skill_key)
        for sk in bundled_to_disable:
            try:
                await openclaw.skills_update(skill_key=sk, enabled=False)
                logger.info("Disabled bundled gateway skill '%s' during reset", sk)
            except Exception as exc:
                errors.append(f"disable skill {sk}: {exc}")
        if ws_entries_to_remove:
            try:
                cfg = _read_config()
                entries = cfg.get("skills", {}).get("entries", {})
                for sk in ws_entries_to_remove:
                    entries.pop(sk, None)
                _write_config(cfg)
                logger.info("Removed workspace skill config entries: %s", ws_entries_to_remove)
            except Exception as exc:
                errors.append(f"remove ws skill entries: {exc}")
    except Exception as exc:
        errors.append(f"gateway skills disable: {exc}")

    # 4. Wipe local DB + workspace dirs, re-seed main
    try:
        async with async_session() as db:
            await reset_agents(db)
    except Exception as exc:
        errors.append(f"local reset: {exc}")

    # 5. Restart the gateway so it reloads identity from disk
    try:
        await restart_gateway()
        await asyncio.sleep(4)
        await openclaw.disconnect()
    except Exception:
        pass

    # 6. Push all workspace .md files to the gateway so they stay in sync
    try:
        await openclaw.connect()
        for filename, content in _WORKSPACE_FILES.items():
            try:
                await openclaw.agent_files_set(main_key, filename, content)
            except Exception as exc:
                errors.append(f"gateway set {filename}: {exc}")
        logger.info("Pushed %d workspace files to gateway for main agent", len(_WORKSPACE_FILES))
    except Exception as exc:
        errors.append(f"gateway push workspace files: {exc}")

    # 7. Set default model
    try:
        await set_default_model(DEFAULT_MODEL)
        logger.info("Reset default model to %s", DEFAULT_MODEL)
    except Exception as exc:
        errors.append(f"set default model: {exc}")

    # 8. Re-sync from gateway to merge gateway state with local DB
    try:
        await list_openclaw_agents()
    except Exception:
        pass

    if errors:
        return ActionResult(success=True, message=f"Reset done with warnings: {'; '.join(errors)}")
    return ActionResult(success=True, message="All agents reset. Main agent re-created.")


# ── CRUD ────────────────────────────────────────────────────────────


async def create_openclaw_agent(
    *, name: str, workspace: str | None = None, emoji: str | None = None, avatar: str | None = None
) -> ActionResult:
    """Create a new agent via the gateway."""
    import re as _re
    from app.adapters.openclaw import openclaw
    from app.services.agent_service import agent_workspace

    slug = _re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "agent"
    resolved_workspace = str(agent_workspace(slug).resolve())

    try:
        await openclaw.connect()
        result = await openclaw.create_agent(
            name=name, workspace=resolved_workspace, emoji=emoji, avatar=avatar
        )
        agent_id = result.get("agentId", slug)

        try:
            await _sync_agents_to_db([{
                "id": agent_id,
                "name": name,
                "emoji": emoji or "",
                "model": None,
                "workspace": resolved_workspace,
            }])
        except Exception:
            pass

        return ActionResult(success=True, message=f"Agent '{agent_id}' created")
    except Exception as exc:
        return ActionResult(success=False, message=str(exc))


async def update_openclaw_agent(
    agent_id: str,
    *,
    name: str | None = None,
    model: str | None = None,
    workspace: str | None = None,
    avatar: str | None = None,
) -> ActionResult:
    """Update an existing agent via the gateway."""
    from app.adapters.openclaw import openclaw

    try:
        await openclaw.connect()
        await openclaw.update_agent(
            agent_id=agent_id, name=name, model=model,
            workspace=workspace, avatar=avatar,
        )

        # Keep IDENTITY.md in sync when the name changes
        if name:
            try:
                raw = await openclaw.agent_files_get(agent_id, "IDENTITY.md")
                content = (raw.get("file") or raw).get("content", "")
                if content:
                    import re
                    updated = re.sub(
                        r"(\*\*Name:\*\*)\s*.*",
                        rf"\1 {name}",
                        content,
                    )
                    if updated != content:
                        await openclaw.agent_files_set(agent_id, "IDENTITY.md", updated)
                else:
                    await openclaw.agent_files_set(
                        agent_id,
                        "IDENTITY.md",
                        f"# IDENTITY.md - Who Am I?\n\n- **Name:** {name}\n",
                    )
            except Exception:
                pass

            # Reset all sessions so the agent picks up the new identity
            try:
                sessions_raw = await openclaw.sessions_list_full(agent_id, limit=50)
                for s in sessions_raw.get("sessions", []):
                    key = s.get("key")
                    if key:
                        await openclaw.sessions_reset(key)
            except Exception:
                pass

        return ActionResult(success=True, message=f"Agent '{agent_id}' updated")
    except Exception as exc:
        return ActionResult(success=False, message=str(exc))


async def delete_openclaw_agent(
    agent_id: str, *, delete_files: bool = True
) -> ActionResult:
    """Delete an agent via the gateway and local DB."""
    from app.adapters.openclaw import openclaw
    from app.database import async_session
    from app.services.agent_service import delete_agent as delete_agent_local

    gateway_ok = False
    gateway_err = ""
    try:
        await openclaw.connect()
        await openclaw.delete_agent(agent_id, delete_files=delete_files)
        gateway_ok = True
    except Exception as exc:
        gateway_err = str(exc)
        logger.warning("Gateway delete for '%s' failed: %s", agent_id, exc)

    try:
        async with async_session() as db:
            await delete_agent_local(db, agent_id)
    except Exception as exc:
        logger.warning("Local DB delete for '%s' failed: %s", agent_id, exc)

    gw_agent_dir = OPENCLAW_HOME / "agents" / agent_id
    if gw_agent_dir.is_dir():
        shutil.rmtree(gw_agent_dir, ignore_errors=True)

    if gateway_ok:
        return ActionResult(success=True, message=f"Agent '{agent_id}' deleted")
    if "not found" in gateway_err.lower():
        return ActionResult(success=True, message=f"Agent '{agent_id}' removed (was already gone from gateway)")
    return ActionResult(success=False, message=gateway_err)


# ── Agent detail ────────────────────────────────────────────────────


async def get_agent_detail(agent_id: str) -> AgentDetail:
    """Get comprehensive agent info: profile, files, skills, sessions."""
    from app.adapters.openclaw import openclaw
    from ._skills import _parse_skill

    await openclaw.connect()

    agents_raw = await openclaw.list_agents()
    default_id = agents_raw.get("defaultId", "main")
    agent_entry = None
    for a in agents_raw.get("agents", []):
        if a.get("id") == agent_id:
            agent_entry = a
            break

    ident = (agent_entry or {}).get("identity") or {}
    name = (agent_entry or {}).get("name") or ident.get("name") or agent_id
    emoji = ident.get("emoji", "")

    files_raw = await openclaw.agent_files_list(agent_id)
    workspace = files_raw.get("workspace", "")
    files = [
        AgentFile(
            name=f.get("name", ""),
            path=f.get("path", ""),
            missing=f.get("missing", False),
            size=f.get("size"),
            updated_at_ms=f.get("updatedAtMs"),
        )
        for f in files_raw.get("files", [])
    ]

    skills_raw = await openclaw.skills_status(agent_id)
    skills = [_parse_skill(s) for s in skills_raw.get("skills", [])]

    sessions_raw = await openclaw.sessions_list_full(agent_id, limit=20)
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
        for s in sessions_raw.get("sessions", [])
    ]

    cfg = _read_config()
    agent_model = None
    for a in cfg.get("agents", {}).get("list", []):
        if a.get("id") == agent_id:
            agent_model = (a.get("model") or {}).get("primary") if isinstance(a.get("model"), dict) else a.get("model")
            break
    if not agent_model:
        agent_model = (cfg.get("agents", {}).get("defaults", {}).get("model") or {}).get("primary")

    try:
        await _sync_agents_to_db([{
            "id": agent_id,
            "name": name,
            "emoji": emoji,
            "model": agent_model,
            "is_default": agent_id == default_id,
            "workspace": workspace,
        }])
    except Exception:
        pass

    return AgentDetail(
        id=agent_id,
        name=name,
        emoji=emoji,
        model=agent_model,
        is_default=agent_id == default_id,
        workspace=workspace,
        source="openclaw",
        files=files,
        skills=skills,
        sessions=sessions,
    )


# ── Agent files ─────────────────────────────────────────────────────


async def get_agent_files(agent_id: str) -> AgentFilesResponse:
    """List workspace files for an agent."""
    from app.adapters.openclaw import openclaw

    await openclaw.connect()
    raw = await openclaw.agent_files_list(agent_id)
    return AgentFilesResponse(
        agent_id=agent_id,
        workspace=raw.get("workspace", ""),
        files=[
            AgentFile(
                name=f.get("name", ""),
                path=f.get("path", ""),
                missing=f.get("missing", False),
                size=f.get("size"),
                updated_at_ms=f.get("updatedAtMs"),
            )
            for f in raw.get("files", [])
        ],
    )


async def get_agent_file(agent_id: str, name: str) -> AgentFile:
    """Get a single workspace file with its content."""
    from app.adapters.openclaw import openclaw

    await openclaw.connect()
    raw = await openclaw.agent_files_get(agent_id, name)
    f = raw.get("file", {})
    return AgentFile(
        name=f.get("name", name),
        path=f.get("path", ""),
        missing=f.get("missing", False),
        size=f.get("size"),
        updated_at_ms=f.get("updatedAtMs"),
        content=f.get("content"),
    )


async def set_agent_file(agent_id: str, name: str, content: str) -> ActionResult:
    """Write content to a workspace file."""
    from app.adapters.openclaw import openclaw

    try:
        await openclaw.connect()
        await openclaw.agent_files_set(agent_id, name, content)
        return ActionResult(success=True, message=f"File '{name}' saved")
    except Exception as exc:
        return ActionResult(success=False, message=str(exc))
