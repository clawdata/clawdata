"""Guardrail policy request/response schemas."""

from datetime import datetime

from pydantic import BaseModel, Field


class GuardrailPolicyCreate(BaseModel):
    name: str = Field(..., max_length=128)
    description: str = ""
    agent_id: str | None = None

    # Cost
    max_cost_per_run: float | None = None
    max_cost_per_day: float | None = None
    max_tokens_per_message: int | None = None

    # Tools
    tool_allowlist: list[str] | None = None
    tool_denylist: list[str] | None = None
    require_approval_for: list[str] | None = None

    # Time
    max_run_duration_seconds: int | None = None

    # Content
    block_patterns: list[str] | None = None
    redact_patterns: list[str] | None = None

    # Schedule restrictions
    allowed_hours: str | None = None
    allowed_days: str | None = None

    enabled: bool = True


class GuardrailPolicyUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    agent_id: str | None = None
    max_cost_per_run: float | None = None
    max_cost_per_day: float | None = None
    max_tokens_per_message: int | None = None
    tool_allowlist: list[str] | None = None
    tool_denylist: list[str] | None = None
    require_approval_for: list[str] | None = None
    max_run_duration_seconds: int | None = None
    block_patterns: list[str] | None = None
    redact_patterns: list[str] | None = None
    allowed_hours: str | None = None
    allowed_days: str | None = None
    enabled: bool | None = None


class GuardrailPolicyResponse(BaseModel):
    id: str
    name: str
    description: str
    agent_id: str | None
    max_cost_per_run: float | None
    max_cost_per_day: float | None
    max_tokens_per_message: int | None
    tool_allowlist: list[str] | None
    tool_denylist: list[str] | None
    require_approval_for: list[str] | None
    max_run_duration_seconds: int | None
    block_patterns: list[str] | None
    redact_patterns: list[str] | None
    allowed_hours: str | None
    allowed_days: str | None
    enabled: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
