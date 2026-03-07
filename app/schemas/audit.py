"""Audit log query/response schemas."""

from datetime import datetime

from pydantic import BaseModel, Field


class AuditLogEntry(BaseModel):
    id: int
    timestamp: datetime
    event_type: str
    agent_id: str | None
    session_id: str | None
    user_id: str | None
    action: str
    details: dict | None
    guardrail_id: str | None
    guardrail_action: str | None
    tokens_used: int | None
    estimated_cost: float | None
    model: str | None

    model_config = {"from_attributes": True}


class AuditLogQuery(BaseModel):
    """Filters for querying the audit log."""
    agent_id: str | None = None
    session_id: str | None = None
    event_type: str | None = None
    start: datetime | None = None
    end: datetime | None = None
    limit: int = Field(100, ge=1, le=1000)
    offset: int = Field(0, ge=0)


class AuditSummary(BaseModel):
    """Aggregated audit stats."""
    total_events: int = 0
    events_today: int = 0
    total_tokens: int = 0
    total_cost: float = 0.0
    guardrail_triggers: int = 0
    top_agents: list[dict] = Field(default_factory=list)
    top_event_types: list[dict] = Field(default_factory=list)
