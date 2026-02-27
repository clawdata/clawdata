"""Pydantic schemas for OpenClaw lifecycle management."""

from __future__ import annotations

from datetime import datetime, timezone
from enum import StrEnum

from pydantic import BaseModel, Field


class GatewayState(StrEnum):
    """Possible states of the OpenClaw gateway process."""

    UNKNOWN = "unknown"
    NOT_INSTALLED = "not_installed"
    INSTALLED = "installed"  # installed but not running
    STARTING = "starting"
    RUNNING = "running"
    STOPPING = "stopping"
    STOPPED = "stopped"
    ERROR = "error"


# ── Prerequisites ────────────────────────────────────────────────────


class NodeStatus(BaseModel):
    installed: bool = False
    version: str | None = None
    path: str | None = None
    meets_minimum: bool = False
    minimum_version: str = "22.0.0"


class NpmStatus(BaseModel):
    installed: bool = False
    version: str | None = None
    path: str | None = None


class OpenClawPackage(BaseModel):
    installed: bool = False
    version: str | None = None
    path: str | None = None
    latest_version: str | None = None
    update_available: bool = False


class PrerequisiteStatus(BaseModel):
    """Everything needed before the gateway can run."""

    node: NodeStatus = Field(default_factory=NodeStatus)
    npm: NpmStatus = Field(default_factory=NpmStatus)
    openclaw: OpenClawPackage = Field(default_factory=OpenClawPackage)
    ready: bool = False  # True when all prerequisites met


# ── Gateway status ───────────────────────────────────────────────────


class GatewayStatus(BaseModel):
    state: GatewayState = GatewayState.UNKNOWN
    pid: int | None = None
    port: int = 18789
    uptime_seconds: float | None = None
    version: str | None = None
    error: str | None = None


class FullStatus(BaseModel):
    """Complete system status returned by GET /api/openclaw/status."""

    prerequisites: PrerequisiteStatus = Field(default_factory=PrerequisiteStatus)
    gateway: GatewayStatus = Field(default_factory=GatewayStatus)
    config_path: str | None = None
    workspace_path: str | None = None
    checked_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ── Actions ──────────────────────────────────────────────────────────


class InstallRequest(BaseModel):
    version: str = "latest"
    install_daemon: bool = True


class InstallResult(BaseModel):
    success: bool
    version_installed: str | None = None
    message: str = ""
    output: str = ""


class UninstallResult(BaseModel):
    success: bool
    message: str = ""
    output: str = ""


class UpdateRequest(BaseModel):
    channel: str = Field("stable", pattern=r"^(stable|beta|dev)$")


class UpdateResult(BaseModel):
    success: bool
    previous_version: str | None = None
    new_version: str | None = None
    message: str = ""
    output: str = ""


class GatewayStartRequest(BaseModel):
    port: int = 18789
    verbose: bool = False
    force: bool = False


class ActionResult(BaseModel):
    """Generic result for start / stop / restart."""

    success: bool
    message: str = ""
    output: str = ""


class DoctorResult(BaseModel):
    success: bool
    issues: list[str] = []
    fixes_applied: list[str] = []
    output: str = ""


class HealthResult(BaseModel):
    healthy: bool
    raw: dict = Field(default_factory=dict)
    error: str | None = None


# ── Config management ────────────────────────────────────────────────


class ConfigGetResponse(BaseModel):
    path: str
    exists: bool
    config: dict = Field(default_factory=dict)


class ConfigPatchRequest(BaseModel):
    """Merge-patch for openclaw.json — keys provided are deep-merged."""

    patch: dict


class ConfigPatchResponse(BaseModel):
    success: bool
    config: dict = Field(default_factory=dict)
    message: str = ""


class ConfigSetRequest(BaseModel):
    """Full replace of openclaw.json."""

    config: dict


# ── Onboarding ───────────────────────────────────────────────────────


class OnboardingStatus(BaseModel):
    """Quick check — has the user gone through onboarding?"""

    config_exists: bool = False
    workspace_exists: bool = False
    gateway_token_set: bool = False
    any_channel_configured: bool = False
    any_api_key_configured: bool = False
    onboarded: bool = False


# ── Providers & secrets ──────────────────────────────────────────────


class Provider(BaseModel):
    """A supported LLM provider."""

    id: str  # e.g. "openai"
    name: str  # e.g. "OpenAI"
    env_var: str  # e.g. "OPENAI_API_KEY"
    configured: bool = False
    onboard_flag: str = ""  # e.g. "--openai-api-key"
    popular_models: list[str] = Field(default_factory=list)


class ProvidersResponse(BaseModel):
    providers: list[Provider]


class EnvEntry(BaseModel):
    key: str
    masked_value: str  # e.g. "sk-proj-****abcd"


class EnvListResponse(BaseModel):
    entries: list[EnvEntry]
    path: str = ""


class EnvSetRequest(BaseModel):
    key: str = Field(..., pattern=r"^[A-Z][A-Z0-9_]*$")
    value: str


# ── Setup wizard ─────────────────────────────────────────────────────


class SetupRequest(BaseModel):
    """Run an interactive or automated setup flow."""

    mode: str = Field("local", pattern=r"^(local|remote)$")
    api_keys: dict[str, str] = Field(default_factory=dict)  # env_var → value
    default_model: str | None = None
    start_gateway: bool = True


class SetupResult(BaseModel):
    success: bool
    message: str = ""
    output: str = ""
    steps_completed: list[str] = Field(default_factory=list)


class ModelSetRequest(BaseModel):
    model: str = Field(..., min_length=1)


class ModelsStatusResponse(BaseModel):
    current_model: str | None = None
    image_model: str | None = None
    fallbacks: list[str] = Field(default_factory=list)
    output: str = ""


class ModelCatalogEntry(BaseModel):
    """A single model from the OpenClaw catalog."""
    key: str
    name: str = ""
    input: str = "text"
    context_window: int = 0
    local: bool = False
    available: bool = False
    tags: list[str] = Field(default_factory=list)


class ModelCatalogResponse(BaseModel):
    """Full model catalog from `openclaw models list --all --json`."""
    count: int = 0
    models: list[ModelCatalogEntry] = Field(default_factory=list)


class OpenClawAgent(BaseModel):
    """An agent registered in the OpenClaw gateway."""

    id: str
    name: str = ""
    emoji: str = ""
    model: str | None = None
    skills: list[str] = Field(default_factory=list)
    is_default: bool = False


class OpenClawAgentsList(BaseModel):
    """Full agents.list gateway response."""

    default_id: str = ""
    main_key: str = ""
    scope: str = ""
    agents: list[OpenClawAgent] = Field(default_factory=list)


class AgentCreateRequest(BaseModel):
    name: str = Field(..., min_length=1)
    workspace: str | None = None  # auto-derived into userdata/agents/{slug}/
    emoji: str | None = None
    avatar: str | None = None


class AgentUpdateRequest(BaseModel):
    name: str | None = None
    model: str | None = None
    workspace: str | None = None
    avatar: str | None = None


class AgentDeleteRequest(BaseModel):
    delete_files: bool = True


# ── Skills ───────────────────────────────────────────────────────────


class SkillRequirements(BaseModel):
    """What a skill needs to be eligible."""

    bins: list[str] = Field(default_factory=list)
    any_bins: list[str] = Field(default_factory=list)
    env: list[str] = Field(default_factory=list)
    config: list[str] = Field(default_factory=list)
    os: list[str] = Field(default_factory=list)


class SkillConfigCheck(BaseModel):
    path: str
    satisfied: bool = False


class SkillInstallOption(BaseModel):
    id: str
    kind: str = ""
    label: str = ""
    bins: list[str] = Field(default_factory=list)


class OpenClawSkill(BaseModel):
    """A skill from the OpenClaw gateway."""

    name: str
    description: str = ""
    source: str = ""
    bundled: bool = False
    skill_key: str = ""
    emoji: str = ""
    homepage: str = ""
    primary_env: str | None = None
    always: bool = False
    disabled: bool = False
    blocked_by_allowlist: bool = False
    eligible: bool = False
    requirements: SkillRequirements = Field(default_factory=SkillRequirements)
    missing: SkillRequirements = Field(default_factory=SkillRequirements)
    config_checks: list[SkillConfigCheck] = Field(default_factory=list)
    install: list[SkillInstallOption] = Field(default_factory=list)


class SkillsStatusResponse(BaseModel):
    """Response for GET /api/openclaw/skills."""

    skills: list[OpenClawSkill] = Field(default_factory=list)


class SkillInstallRequest(BaseModel):
    """Install a skill binary."""

    name: str
    install_id: str
    timeout_ms: int | None = None


class SkillUpdateRequest(BaseModel):
    """Enable/disable a skill or set its environment."""

    enabled: bool | None = None
    api_key: str | None = None
    env: dict[str, str] | None = None


# ── Agent files ──────────────────────────────────────────────────────


class AgentFile(BaseModel):
    """A file in an agent's workspace."""

    name: str
    path: str = ""
    missing: bool = False
    size: int | None = None
    updated_at_ms: int | None = None
    content: str | None = None


class AgentFilesResponse(BaseModel):
    """Response for listing agent workspace files."""

    agent_id: str
    workspace: str = ""
    files: list[AgentFile] = Field(default_factory=list)


class AgentFileSetRequest(BaseModel):
    """Request to write a file in the agent workspace."""

    content: str


# ── Sessions ─────────────────────────────────────────────────────────


class SessionEntry(BaseModel):
    """A session from sessions.list."""

    key: str
    kind: str = ""
    display_name: str = ""
    channel: str = ""
    updated_at: int | None = None
    session_id: str = ""
    model_provider: str = ""
    model: str = ""
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    derived_title: str = ""
    last_message_preview: str = ""


class SessionsResponse(BaseModel):
    """Response for listing sessions."""

    count: int = 0
    sessions: list[SessionEntry] = Field(default_factory=list)


# ── Agent detail ─────────────────────────────────────────────────────


class AgentDetail(BaseModel):
    """Comprehensive agent detail combining all data sources."""

    id: str
    name: str = ""
    emoji: str = ""
    model: str | None = None
    is_default: bool = False
    workspace: str = ""  # project-local userdata path
    source: str = "openclaw"  # local | openclaw
    files: list[AgentFile] = Field(default_factory=list)
    skills: list[OpenClawSkill] = Field(default_factory=list)
    sessions: list[SessionEntry] = Field(default_factory=list)


# ── Workspace skills (SKILL.md files) ───────────────────────────────


class WorkspaceSkill(BaseModel):
    """A custom skill defined by a SKILL.md file in a workspace or project."""

    name: str
    slug: str  # directory name
    description: str = ""
    metadata: dict = Field(default_factory=dict)
    content: str = ""  # full SKILL.md content
    location: str = ""  # "workspace" | "project" | "managed"
    agent_id: str | None = None
    path: str = ""
    is_symlink: bool = False  # True when this is a symlink to a project skill


class WorkspaceSkillsList(BaseModel):
    """Response listing workspace skills from all locations."""

    workspace_skills: list[WorkspaceSkill] = Field(default_factory=list)
    project_skills: list[WorkspaceSkill] = Field(default_factory=list)
    managed_skills: list[WorkspaceSkill] = Field(default_factory=list)


class WorkspaceSkillCreate(BaseModel):
    """Request to create a new workspace skill."""

    name: str
    description: str = ""
    instructions: str = ""
    metadata: dict = Field(default_factory=dict)


class WorkspaceSkillUpdate(BaseModel):
    """Request to update a workspace skill."""

    content: str  # full SKILL.md content


class DeploySkillRequest(BaseModel):
    """Request to deploy a project skill to an agent workspace."""

    slug: str  # project skill directory name


# ── Costing ──────────────────────────────────────────────────────────


class CostingModelBreakdown(BaseModel):
    """Token usage and estimated cost for a single model."""

    model: str
    provider: str
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    session_count: int = 0
    estimated_cost_usd: float = 0.0


class CostingAgentBreakdown(BaseModel):
    """Token usage and estimated cost for a single agent."""

    agent_id: str
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    session_count: int = 0
    estimated_cost_usd: float = 0.0


class CostingSessionDetail(BaseModel):
    """Per-session costing detail."""

    session_key: str
    session_id: str
    agent_id: str
    model: str | None = None
    provider: str | None = None
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    estimated_cost_usd: float = 0.0
    title: str | None = None
    updated_at: int | None = None


class CostingSummary(BaseModel):
    """Aggregated costing data from all gateway sessions."""

    total_input_tokens: int = 0
    total_output_tokens: int = 0
    total_tokens: int = 0
    total_estimated_cost_usd: float = 0.0
    session_count: int = 0
    by_model: list[CostingModelBreakdown] = Field(default_factory=list)
    by_agent: list[CostingAgentBreakdown] = Field(default_factory=list)
    sessions: list[CostingSessionDetail] = Field(default_factory=list)
    computed_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
