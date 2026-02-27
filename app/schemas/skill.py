"""Skill request/response schemas."""

from datetime import datetime

from pydantic import BaseModel, Field


class SkillCreate(BaseModel):
    id: str = Field(..., pattern=r"^[a-z0-9\-]+$", max_length=128)
    name: str = Field(..., max_length=128)
    description: str = ""
    agent_id: str | None = None  # None = shared skill
    content: str = ""  # SKILL.md body


class SkillUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    content: str | None = None
    is_enabled: bool | None = None


class SkillResponse(BaseModel):
    id: str
    name: str
    description: str
    agent_id: str | None
    skill_path: str
    is_enabled: bool
    content: str | None = None  # Only populated on detail view
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
