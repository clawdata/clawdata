"""Secret request/response schemas."""

from datetime import datetime

from pydantic import BaseModel, Field


class SecretCreate(BaseModel):
    id: str = Field(..., pattern=r"^[A-Z0-9_]+$", max_length=128)
    description: str = ""
    value: str  # plaintext — will be encrypted before storage
    agent_id: str | None = None


class SecretUpdate(BaseModel):
    description: str | None = None
    value: str | None = None  # new plaintext value


class SecretResponse(BaseModel):
    id: str
    description: str
    agent_id: str | None
    created_at: datetime
    updated_at: datetime
    # value is NEVER returned

    model_config = {"from_attributes": True}
