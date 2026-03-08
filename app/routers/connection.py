"""Connection & gateway endpoints.

Provides read-only gateway queries plus start/stop/restart process control.
"""

from __future__ import annotations

import asyncio
import logging
import os

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.lifecycle import (
    ActionResult,
    AgentCreatePayload,
    AgentDetail,
    AgentFile,
    AgentFileSetRequest,
    AgentFilesResponse,
    AgentMemoryResponse,
    AgentUpdatePayload,
    ConfigGetResponse,
    CostingSummary,
    EnvListResponse,
    HealthResult,
    ModelCatalogResponse,
    ModelsStatusResponse,
    OnboardingStatus,
    OpenClawAgentsList,
    ProvidersResponse,
    SessionHistoryResponse,
    SessionsResponse,
    WorkspaceSkill,
    WorkspaceSkillsList,
)
from app.services import openclaw_lifecycle as lifecycle
from app.services import audit_service

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Status ───────────────────────────────────────────────────────────


@router.get("/status")
async def get_status():
    """Full status including prerequisites, gateway state, and config paths."""
    return await lifecycle.get_full_status()


@router.get("/onboarding", response_model=OnboardingStatus)
async def get_onboarding():
    """Check whether OpenClaw has been set up (config, workspace, token)."""
    return await lifecycle.check_onboarding()


# ── Health & diagnostics ─────────────────────────────────────────────


@router.get("/health", response_model=HealthResult)
async def get_health():
    """Ask the running gateway for its health snapshot."""
    return await lifecycle.get_health()


# ── Gateway process control ──────────────────────────────────────────


async def _kill_gateway() -> int:
    """SIGKILL all processes on port 18789. Returns count killed."""
    import signal

    killed = 0
    try:
        proc = await asyncio.create_subprocess_exec(
            "lsof", "-ti:18789",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=5)
        for pid in stdout.decode().strip().split():
            try:
                os.kill(int(pid), signal.SIGKILL)
                killed += 1
            except (ProcessLookupError, ValueError):
                pass
    except Exception:
        pass
    return killed


async def _start_gateway() -> bool:
    """Start a fresh gateway process and poll until ready (up to 15 s)."""
    import shutil
    import socket

    oc = shutil.which("openclaw")
    if not oc:
        return False

    await asyncio.create_subprocess_exec(
        oc, "gateway",
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL,
        start_new_session=True,
    )

    for _ in range(30):
        await asyncio.sleep(0.5)
        try:
            with socket.create_connection(("127.0.0.1", 18789), timeout=1):
                return True
        except OSError:
            continue
    return False


@router.post("/start", response_model=ActionResult)
async def start_gateway(req: dict | None = None, db: AsyncSession = Depends(get_db)):
    """Start the OpenClaw gateway process."""
    ok = await _start_gateway()
    if ok:
        await audit_service.log_event(
            db,
            event_type="gateway.started",
            action="Started the OpenClaw gateway",
        )
        return ActionResult(success=True, message="Gateway started")
    return ActionResult(success=False, message="Gateway did not become ready within 15s")


@router.post("/stop", response_model=ActionResult)
async def stop_gateway(db: AsyncSession = Depends(get_db)):
    """Stop the OpenClaw gateway process."""
    killed = await _kill_gateway()
    if killed:
        await audit_service.log_event(
            db,
            event_type="gateway.stopped",
            action=f"Stopped the OpenClaw gateway ({killed} process(es))",
        )
        return ActionResult(success=True, message=f"Gateway stopped ({killed} process(es) killed)")
    return ActionResult(success=True, message="Gateway was not running")


@router.post("/restart", response_model=ActionResult)
async def restart_gateway(db: AsyncSession = Depends(get_db)):
    """Restart the OpenClaw gateway process (SIGKILL + fresh start)."""
    await _kill_gateway()
    await asyncio.sleep(1)
    ok = await _start_gateway()
    if ok:
        await audit_service.log_event(
            db,
            event_type="gateway.restarted",
            action="Restarted the OpenClaw gateway",
        )
        return ActionResult(success=True, message="Gateway restarted")
    return ActionResult(success=False, message="Gateway did not become ready after restart")


@router.get("/costing", response_model=CostingSummary)
async def get_costing():
    """Aggregate token usage and estimated costs from all gateway sessions."""
    return await lifecycle.get_costing_summary()


@router.get("/logs")
async def get_logs(lines: int = Query(100, ge=1, le=5000)):
    """Return recent gateway log lines."""
    output = await lifecycle.get_logs(lines=lines)
    return {"lines": lines, "output": output}


# ── Config (read-only) ──────────────────────────────────────────────


@router.get("/config", response_model=ConfigGetResponse)
async def get_config():
    """Read the current ~/.openclaw/openclaw.json config."""
    return await lifecycle.get_config()


# ── Providers & API keys (read-only) ────────────────────────────────


@router.get("/providers", response_model=ProvidersResponse)
async def get_providers():
    """List supported LLM providers and whether they are configured."""
    return await lifecycle.get_providers()


@router.get("/env", response_model=EnvListResponse)
async def list_env():
    """List all keys in ~/.openclaw/.env with masked values."""
    return await lifecycle.get_env_keys()


# ── Models ───────────────────────────────────────────────────────────


@router.get("/models/status", response_model=ModelsStatusResponse)
async def get_models_status():
    """Get current model configuration."""
    return await lifecycle.get_models_status()


@router.get("/models/catalog", response_model=ModelCatalogResponse)
async def get_models_catalog():
    """Get the full model catalog from OpenClaw."""
    return await lifecycle.get_models_catalog()


# ── Agents (gateway read + files) ───────────────────────────────────


@router.get("/agents", response_model=OpenClawAgentsList)
async def list_openclaw_agents():
    """List agents registered in the OpenClaw gateway."""
    return await lifecycle.list_openclaw_agents()


@router.post("/agents/reset", response_model=ActionResult)
async def reset_openclaw_agents():
    """Reset all agents to default state."""
    return await lifecycle.reset_agents()


@router.post("/agents", response_model=ActionResult)
async def create_openclaw_agent(payload: AgentCreatePayload):
    """Create a new agent in the OpenClaw gateway."""
    return await lifecycle.create_agent(payload.model_dump(exclude_none=True))


@router.patch("/agents/{agent_id}", response_model=ActionResult)
async def update_openclaw_agent(agent_id: str, payload: AgentUpdatePayload):
    """Update agent metadata in the OpenClaw gateway."""
    return await lifecycle.update_agent(agent_id, payload.model_dump(exclude_none=True))


@router.delete("/agents/{agent_id}", response_model=ActionResult)
async def delete_openclaw_agent(agent_id: str, delete_files: bool = True):
    """Delete an agent from the OpenClaw gateway."""
    return await lifecycle.delete_agent(agent_id, delete_files=delete_files)


@router.get("/agents/{agent_id}/detail", response_model=AgentDetail)
async def get_agent_detail(agent_id: str):
    """Get comprehensive agent info: profile, files, skills, sessions."""
    return await lifecycle.get_agent_detail(agent_id)


@router.get("/agents/{agent_id}/files", response_model=AgentFilesResponse)
async def list_agent_files(agent_id: str):
    """List workspace files for an agent."""
    return await lifecycle.get_agent_files(agent_id)


@router.get("/agents/{agent_id}/memory", response_model=AgentMemoryResponse)
async def get_agent_memory(agent_id: str):
    """List daily memory files for an agent."""
    return await lifecycle.get_agent_memory(agent_id)


@router.get("/agents/{agent_id}/files/{name:path}", response_model=AgentFile)
async def get_agent_file(agent_id: str, name: str):
    """Get a workspace file with its content."""
    return await lifecycle.get_agent_file(agent_id, name)


@router.put("/agents/{agent_id}/files/{name:path}", response_model=ActionResult)
async def set_agent_file(agent_id: str, name: str, req: AgentFileSetRequest):
    """Write content to a workspace file."""
    return await lifecycle.set_agent_file(agent_id, name, req.content)


@router.put("/agents/{agent_id}/linked-agents", response_model=ActionResult)
async def update_linked_agents(agent_id: str, req: dict):
    """Update which agents this agent can delegate to.

    Body: {"linked_ids": ["harry", "other_agent"]}
    """
    linked_ids = req.get("linked_ids", [])
    return await lifecycle.update_agent_to_agent_allow(agent_id, linked_ids)


# ── Sessions ─────────────────────────────────────────────────────────


@router.get("/agents/{agent_id}/sessions", response_model=SessionsResponse)
async def list_agent_sessions(agent_id: str):
    """List sessions for an agent."""
    return await lifecycle.get_agent_sessions(agent_id)


@router.post("/sessions/{key:path}/reset", response_model=ActionResult)
async def reset_session(key: str):
    """Reset a session (clear history)."""
    return await lifecycle.reset_session(key)


@router.delete("/sessions/{key:path}", response_model=ActionResult)
async def delete_session(key: str):
    """Delete a session."""
    return await lifecycle.delete_session(key)


@router.get(
    "/agents/{agent_id}/sessions/{session_id:path}/history",
    response_model=SessionHistoryResponse,
)
async def get_session_history(agent_id: str, session_id: str):
    """Fetch message history for a specific session."""
    return await lifecycle.get_session_history(agent_id, session_id)


# ── Workspace skills ─────────────────────────────────────────────────


@router.get("/project-skills", response_model=list[WorkspaceSkill])
async def list_project_skills():
    """List project-level skills (shared SKILL.md files from skills/ directory)."""
    return lifecycle.list_project_skills()


@router.get("/agents/{agent_id}/workspace-skills", response_model=WorkspaceSkillsList)
async def list_workspace_skills(agent_id: str):
    """List workspace, project, and managed custom skills."""
    return await lifecycle.list_workspace_skills(agent_id)


@router.post("/agents/{agent_id}/workspace-skills/deploy", response_model=ActionResult)
async def deploy_project_skill(agent_id: str, req: dict):
    """Copy a project-level skill into the agent workspace."""
    return await lifecycle.deploy_project_skill(agent_id, req.get("slug", ""))


@router.post("/agents/{agent_id}/workspace-skills/unlink", response_model=ActionResult)
async def unlink_project_skill(agent_id: str, req: dict):
    """Remove a deployed project skill from the agent workspace."""
    return await lifecycle.unlink_project_skill(agent_id, req.get("slug", ""))


@router.post("/agents/{agent_id}/workspace-skills", response_model=WorkspaceSkill)
async def create_workspace_skill(agent_id: str, req: dict):
    """Create a new custom skill in the agent workspace."""
    return await lifecycle.create_workspace_skill(
        agent_id,
        name=req.get("name", ""),
        description=req.get("description", ""),
        instructions=req.get("instructions", ""),
    )


@router.get("/agents/{agent_id}/workspace-skills/{slug}", response_model=WorkspaceSkill)
async def get_workspace_skill(agent_id: str, slug: str):
    """Get a specific workspace skill."""
    return await lifecycle.get_workspace_skill(agent_id, slug)


@router.put("/agents/{agent_id}/workspace-skills/{slug}", response_model=WorkspaceSkill)
async def update_workspace_skill(agent_id: str, slug: str, req: dict):
    """Update a workspace skill's content."""
    return await lifecycle.update_workspace_skill(agent_id, slug, req.get("content", ""))


@router.delete("/agents/{agent_id}/workspace-skills/{slug}", response_model=ActionResult)
async def delete_workspace_skill(agent_id: str, slug: str):
    """Delete a workspace skill."""
    return await lifecycle.delete_workspace_skill(agent_id, slug)
