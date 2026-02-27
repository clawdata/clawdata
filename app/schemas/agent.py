"""Agent request/response schemas."""

from datetime import datetime

from pydantic import BaseModel, Field


class AgentCreate(BaseModel):
    id: str = Field(..., pattern=r"^[a-z0-9\-]+$", max_length=64)
    name: str = Field(..., max_length=128)
    description: str = ""
    model: str = "anthropic/claude-sonnet-4-5"
    role: str = Field("agent", pattern=r"^(agent|orchestrator)$")
    parent_id: str | None = None
    emoji: str = ""


class AgentUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    model: str | None = None
    role: str | None = None
    emoji: str | None = None
    is_active: bool | None = None


class AgentResponse(BaseModel):
    id: str
    name: str
    description: str
    workspace_path: str
    agent_dir: str
    model: str
    role: str
    parent_id: str | None
    source: str
    emoji: str
    openclaw_workspace: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
