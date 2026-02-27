"""Approval request/response schemas."""

from datetime import datetime

from pydantic import BaseModel


class ApprovalResolve(BaseModel):
    approved: bool
    reason: str = ""


class ApprovalResponse(BaseModel):
    id: str
    agent_id: str
    tool_name: str
    command: str
    status: str
    resolved_by: str | None
    resolved_at: datetime | None
    auto_approved: bool
    created_at: datetime

    model_config = {"from_attributes": True}
