"""Pydantic schemas for OpenClaw lifecycle / connection management.

v2: Read-only schemas — no install/start/stop/setup/config mutation.
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import StrEnum

from pydantic import BaseModel, Field


class GatewayState(StrEnum):
    """Possible states of the OpenClaw gateway process."""

    UNKNOWN = "unknown"
    NOT_INSTALLED = "not_installed"
    INSTALLED = "installed"
    RUNNING = "running"
    STOPPED = "stopped"
    ERROR = "error"


# ── Health ───────────────────────────────────────────────────────────


class HealthResult(BaseModel):
    healthy: bool
    raw: dict = Field(default_factory=dict)
    error: str | None = None


class ActionResult(BaseModel):
    """Generic success/fail result for write operations."""

    success: bool
    message: str = ""
    output: str = ""


# ── Config (read-only) ──────────────────────────────────────────────


class ConfigGetResponse(BaseModel):
    path: str
    exists: bool
    config: dict = Field(default_factory=dict)


# ── Onboarding ──────────────────────────────────────────────────────


class OnboardingStatus(BaseModel):
    config_exists: bool = False
    config_valid: bool = False
    workspace_exists: bool = False
    workspace_path: str = ""
    sessions_ok: bool = False
    gateway_token_set: bool = False
    any_channel_configured: bool = False
    any_api_key_configured: bool = False
    gateway_running: bool = False
    onboarded: bool = False
    issues: list[str] = Field(default_factory=list)


# ── Providers & env (read-only) ─────────────────────────────────────


class Provider(BaseModel):
    id: str
    name: str
    env_var: str
    configured: bool = False
    onboard_flag: str = ""
    popular_models: list[str] = Field(default_factory=list)


class ProvidersResponse(BaseModel):
    providers: list[Provider]


class EnvEntry(BaseModel):
    key: str
    masked_value: str


class EnvListResponse(BaseModel):
    entries: list[EnvEntry]
    path: str = ""


# ── Models ───────────────────────────────────────────────────────────


class ModelsStatusResponse(BaseModel):
    current_model: str | None = None
    image_model: str | None = None
    fallbacks: list[str] = Field(default_factory=list)
    output: str = ""


class ModelCatalogEntry(BaseModel):
    key: str
    name: str = ""
    input: str = "text"
    context_window: int = 0
    local: bool = False
    available: bool = False
    tags: list[str] = Field(default_factory=list)


class ModelCatalogResponse(BaseModel):
    count: int = 0
    models: list[ModelCatalogEntry] = Field(default_factory=list)


# ── Agents (from gateway) ───────────────────────────────────────────


class OpenClawAgent(BaseModel):
    id: str
    name: str = ""
    emoji: str = ""
    model: str | None = None
    skills: list[str] = Field(default_factory=list)
    is_default: bool = False


class OpenClawAgentsList(BaseModel):
    default_id: str = ""
    main_key: str = ""
    scope: str = ""
    agents: list[OpenClawAgent] = Field(default_factory=list)


class AgentCreatePayload(BaseModel):
    name: str
    emoji: str = ""
    model: str | None = None


class AgentUpdatePayload(BaseModel):
    name: str | None = None
    emoji: str | None = None
    model: str | None = None


# ── Agent files ──────────────────────────────────────────────────────


class AgentFile(BaseModel):
    name: str
    path: str = ""
    missing: bool = False
    size: int | None = None
    updated_at_ms: int | None = None
    content: str | None = None


class AgentFilesResponse(BaseModel):
    agent_id: str
    workspace: str = ""
    files: list[AgentFile] = Field(default_factory=list)


class AgentFileSetRequest(BaseModel):
    content: str


# ── Sessions ─────────────────────────────────────────────────────────


class SessionEntry(BaseModel):
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
    count: int = 0
    sessions: list[SessionEntry] = Field(default_factory=list)


class SessionMessage(BaseModel):
    role: str
    content: str = ""
    timestamp: str | None = None
    tool_name: str | None = None


class SessionHistoryResponse(BaseModel):
    messages: list[SessionMessage] = Field(default_factory=list)
    session_id: str = ""
    agent_id: str = ""


# ── Agent detail ─────────────────────────────────────────────────────


class OpenClawSkill(BaseModel):
    """A skill from the OpenClaw gateway (for agent detail view)."""

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


class AgentDetail(BaseModel):
    id: str
    name: str = ""
    emoji: str = ""
    model: str | None = None
    is_default: bool = False
    workspace: str = ""
    files: list[AgentFile] = Field(default_factory=list)
    skills: list[OpenClawSkill] = Field(default_factory=list)
    sessions: list[SessionEntry] = Field(default_factory=list)


# ── Workspace skills (SKILL.md files, read-only) ────────────────────


class WorkspaceSkill(BaseModel):
    name: str
    slug: str
    description: str = ""
    metadata: dict = Field(default_factory=dict)
    content: str = ""
    location: str = ""
    agent_id: str | None = None
    path: str = ""


class WorkspaceSkillsList(BaseModel):
    workspace_skills: list[WorkspaceSkill] = Field(default_factory=list)
    project_skills: list[WorkspaceSkill] = Field(default_factory=list)
    managed_skills: list[WorkspaceSkill] = Field(default_factory=list)


# ── Costing ──────────────────────────────────────────────────────────


class CostingModelBreakdown(BaseModel):
    model: str
    provider: str
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    session_count: int = 0
    estimated_cost_usd: float = 0.0


class CostingAgentBreakdown(BaseModel):
    agent_id: str
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    session_count: int = 0
    estimated_cost_usd: float = 0.0


class CostingSessionDetail(BaseModel):
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
