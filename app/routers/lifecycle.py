"""OpenClaw lifecycle management API routes.

Exposes install, start/stop, config, health, doctor, and onboarding
so the frontend (or any HTTP client) can fully control OpenClaw
without touching the CLI.
"""

from __future__ import annotations

from fastapi import APIRouter, Query

from app.schemas.lifecycle import (
    ActionResult,
    AgentCreateRequest,
    AgentDeleteRequest,
    AgentDetail,
    AgentFile,
    AgentFileSetRequest,
    AgentFilesResponse,
    AgentUpdateRequest,
    ConfigGetResponse,
    ConfigPatchRequest,
    ConfigPatchResponse,
    ConfigSetRequest,
    CostingSummary,
    DoctorResult,
    EnvListResponse,
    EnvSetRequest,
    FullStatus,
    GatewayStartRequest,
    HealthResult,
    InstallRequest,
    InstallResult,
    ModelCatalogResponse,
    ModelSetRequest,
    ModelsStatusResponse,
    OnboardingStatus,
    OpenClawAgentsList,
    ProvidersResponse,
    SessionsResponse,
    SetupRequest,
    SetupResult,
    SkillInstallRequest,
    SkillsStatusResponse,
    SkillUpdateRequest,
    UninstallResult,
    UpdateRequest,
    UpdateResult,
    WorkspaceSkill,
    WorkspaceSkillCreate,
    WorkspaceSkillUpdate,
    WorkspaceSkillsList,
    DeploySkillRequest,
)
from app.services import openclaw_lifecycle as lifecycle

router = APIRouter()


# ── Status ───────────────────────────────────────────────────────────


@router.get("/status", response_model=FullStatus)
async def get_status():
    """Full system status: prerequisites, gateway state, config paths."""
    return await lifecycle.get_full_status()


@router.get("/onboarding", response_model=OnboardingStatus)
async def get_onboarding():
    """Check whether OpenClaw has been set up (config, workspace, token)."""
    return await lifecycle.check_onboarding()


# ── Install & update ─────────────────────────────────────────────────


@router.post("/install", response_model=InstallResult)
async def install(req: InstallRequest | None = None):
    """Install OpenClaw globally via npm."""
    return await lifecycle.install_openclaw(req or InstallRequest())


@router.post("/update", response_model=UpdateResult)
async def update(req: UpdateRequest | None = None):
    """Update OpenClaw to the latest version on a given channel."""
    return await lifecycle.update_openclaw(req or UpdateRequest())


@router.post("/uninstall", response_model=UninstallResult)
async def uninstall():
    """Uninstall OpenClaw globally via npm. Stops the gateway first."""
    return await lifecycle.uninstall_openclaw()


# ── Gateway control ──────────────────────────────────────────────────


@router.post("/start", response_model=ActionResult)
async def start_gateway(req: GatewayStartRequest | None = None):
    """Start the OpenClaw gateway process."""
    return await lifecycle.start_gateway(req or GatewayStartRequest())


@router.post("/stop", response_model=ActionResult)
async def stop_gateway():
    """Stop the running OpenClaw gateway."""
    return await lifecycle.stop_gateway()


@router.post("/restart", response_model=ActionResult)
async def restart_gateway():
    """Restart the OpenClaw gateway."""
    return await lifecycle.restart_gateway()


# ── Health & diagnostics ─────────────────────────────────────────────


@router.get("/health", response_model=HealthResult)
async def get_health():
    """Ask the running gateway for its health snapshot."""
    return await lifecycle.get_health()


@router.get("/costing", response_model=CostingSummary)
async def get_costing():
    """Aggregate token usage and estimated costs from all gateway sessions."""
    return await lifecycle.get_costing_summary()


@router.get("/doctor", response_model=DoctorResult)
async def run_doctor(fix: bool = Query(False, description="Auto-fix detected issues")):
    """Run `openclaw doctor` to diagnose and optionally repair issues."""
    return await lifecycle.run_doctor(fix=fix)


@router.get("/logs")
async def get_logs(lines: int = Query(100, ge=1, le=5000)):
    """Return recent gateway log lines."""
    output = await lifecycle.get_logs(lines=lines)
    return {"lines": lines, "output": output}


# ── Config management ────────────────────────────────────────────────


@router.get("/config", response_model=ConfigGetResponse)
async def get_config():
    """Read the current ~/.openclaw/openclaw.json config."""
    return await lifecycle.get_config()


@router.put("/config", response_model=ConfigPatchResponse)
async def set_config(req: ConfigSetRequest):
    """Full replace of ~/.openclaw/openclaw.json."""
    return await lifecycle.set_config(req.config)


@router.patch("/config", response_model=ConfigPatchResponse)
async def patch_config(req: ConfigPatchRequest):
    """Deep-merge patch into existing openclaw.json."""
    return await lifecycle.patch_config(req.patch)


# ── Providers & API keys ─────────────────────────────────────────────


@router.get("/providers", response_model=ProvidersResponse)
async def get_providers():
    """List supported LLM providers and whether they are configured."""
    return await lifecycle.get_providers()


@router.get("/env", response_model=EnvListResponse)
async def list_env():
    """List all keys in ~/.openclaw/.env with masked values."""
    return await lifecycle.get_env_keys()


@router.put("/env", response_model=ActionResult)
async def set_env(req: EnvSetRequest):
    """Set or update an environment variable in ~/.openclaw/.env."""
    return await lifecycle.set_env_key(req.key, req.value)


@router.delete("/env/{key}", response_model=ActionResult)
async def delete_env(key: str):
    """Remove an environment variable from ~/.openclaw/.env."""
    return await lifecycle.delete_env_key(key)


# ── Models ───────────────────────────────────────────────────────────


@router.get("/models/status", response_model=ModelsStatusResponse)
async def get_models_status():
    """Get current model configuration."""
    return await lifecycle.get_models_status()


@router.get("/models/catalog", response_model=ModelCatalogResponse)
async def get_models_catalog():
    """Get the full model catalog from OpenClaw."""
    return await lifecycle.get_models_catalog()


@router.post("/models/set", response_model=ActionResult)
async def set_model(req: ModelSetRequest):
    """Set the default model."""
    return await lifecycle.set_default_model(req.model)


# ── Setup wizard ─────────────────────────────────────────────────────


@router.post("/setup", response_model=SetupResult)
async def run_setup(req: SetupRequest | None = None):
    """Run the full setup flow: init, API keys, model, gateway."""
    return await lifecycle.run_setup(req or SetupRequest())


# ── Agents (from openclaw.json) ──────────────────────────────────────


@router.post("/agents/reset", response_model=ActionResult)
async def reset_agents():
    """Reset all agents: remove non-main from gateway, wipe local data, re-seed main."""
    return await lifecycle.reset_all_agents()


@router.get("/agents", response_model=OpenClawAgentsList)
async def list_openclaw_agents():
    """List agents registered in the OpenClaw gateway."""
    return await lifecycle.list_openclaw_agents()


@router.post("/agents", response_model=ActionResult)
async def create_openclaw_agent(req: AgentCreateRequest):
    """Create a new agent in OpenClaw."""
    return await lifecycle.create_openclaw_agent(
        name=req.name, workspace=req.workspace,
        emoji=req.emoji, avatar=req.avatar,
    )


@router.patch("/agents/{agent_id}", response_model=ActionResult)
async def update_openclaw_agent(agent_id: str, req: AgentUpdateRequest):
    """Update an existing OpenClaw agent."""
    return await lifecycle.update_openclaw_agent(
        agent_id, name=req.name, model=req.model,
        workspace=req.workspace, avatar=req.avatar,
    )


@router.delete("/agents/{agent_id}", response_model=ActionResult)
async def delete_openclaw_agent(agent_id: str, delete_files: bool = True):
    """Delete an OpenClaw agent."""
    return await lifecycle.delete_openclaw_agent(agent_id, delete_files=delete_files)


# ── Skills ───────────────────────────────────────────────────────────


@router.get("/skills", response_model=SkillsStatusResponse)
async def list_skills(agent_id: str | None = Query(None, description="Filter skills for a specific agent")):
    """List all skills and their status from the gateway."""
    return await lifecycle.list_skills(agent_id=agent_id)


@router.post("/skills/install", response_model=ActionResult)
async def install_skill(req: SkillInstallRequest):
    """Install a skill binary."""
    return await lifecycle.install_skill(
        name=req.name, install_id=req.install_id, timeout_ms=req.timeout_ms,
    )


@router.patch("/skills/{skill_key}", response_model=ActionResult)
async def update_skill(skill_key: str, req: SkillUpdateRequest):
    """Enable/disable a skill or set its API key / environment."""
    return await lifecycle.update_skill(
        skill_key, enabled=req.enabled, api_key=req.api_key, env=req.env,
    )


# ── Agent detail & files ─────────────────────────────────────────────


@router.get("/agents/{agent_id}/detail", response_model=AgentDetail)
async def get_agent_detail(agent_id: str):
    """Get comprehensive agent info: profile, files, skills, sessions."""
    return await lifecycle.get_agent_detail(agent_id)


@router.get("/agents/{agent_id}/files", response_model=AgentFilesResponse)
async def list_agent_files(agent_id: str):
    """List workspace files for an agent."""
    return await lifecycle.get_agent_files(agent_id)


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


# ── Workspace skills (SKILL.md) ───────────────────────────────────


@router.get("/project-skills", response_model=list[WorkspaceSkill])
async def list_project_skills():
    """List project-level skills (shared SKILL.md files from skills/ directory)."""
    return lifecycle.list_project_skills()


@router.get("/agents/{agent_id}/workspace-skills", response_model=WorkspaceSkillsList)
async def list_workspace_skills(agent_id: str):
    """List workspace, project, and managed custom skills."""
    return await lifecycle.list_workspace_skills(agent_id)


@router.get("/agents/{agent_id}/workspace-skills/{slug}", response_model=WorkspaceSkill)
async def get_workspace_skill(agent_id: str, slug: str):
    """Get a specific workspace skill."""
    return await lifecycle.get_workspace_skill(agent_id, slug)


@router.post("/agents/{agent_id}/workspace-skills", response_model=WorkspaceSkill)
async def create_workspace_skill(agent_id: str, req: WorkspaceSkillCreate):
    """Create a new workspace skill."""
    return await lifecycle.create_workspace_skill(
        agent_id, req.name, req.description, req.instructions, req.metadata,
    )


@router.put("/agents/{agent_id}/workspace-skills/{slug}", response_model=WorkspaceSkill)
async def update_workspace_skill(agent_id: str, slug: str, req: WorkspaceSkillUpdate):
    """Update a workspace skill's SKILL.md content."""
    return await lifecycle.update_workspace_skill(agent_id, slug, req.content)


@router.delete("/agents/{agent_id}/workspace-skills/{slug}", response_model=ActionResult)
async def delete_workspace_skill(agent_id: str, slug: str):
    """Delete a workspace skill."""
    return await lifecycle.delete_workspace_skill(agent_id, slug)


@router.post("/agents/{agent_id}/workspace-skills/deploy", response_model=ActionResult)
async def deploy_project_skill(agent_id: str, req: DeploySkillRequest):
    """Deploy (symlink) a project skill to the agent's workspace."""
    return await lifecycle.deploy_project_skill(agent_id, req.slug)


@router.post("/agents/{agent_id}/workspace-skills/unlink", response_model=ActionResult)
async def unlink_project_skill(agent_id: str, req: DeploySkillRequest):
    """Remove a symlinked project skill from the agent's workspace."""
    return await lifecycle.unlink_project_skill(agent_id, req.slug)
