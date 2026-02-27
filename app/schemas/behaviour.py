"""Behaviour request/response schemas."""

from datetime import datetime

from pydantic import BaseModel, Field

# The workspace markdown files that define agent behaviour
BEHAVIOUR_FILES = ("AGENTS.md", "SOUL.md", "USER.md", "TOOLS.md", "IDENTITY.md", "HEARTBEAT.md")


class BehaviourUpdate(BaseModel):
    content: str


class BehaviourFileResponse(BaseModel):
    agent_id: str
    file_name: str = Field(
        ...,
        description="One of: AGENTS.md, SOUL.md, USER.md, TOOLS.md, IDENTITY.md, HEARTBEAT.md",
    )
    content: str
    updated_at: datetime | None = None


class BehaviourSnapshotResponse(BaseModel):
    id: int
    agent_id: str
    file_name: str
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}
