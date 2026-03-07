"""Task request/response schemas."""

from datetime import datetime

from pydantic import BaseModel, Field


class TaskCreate(BaseModel):
    id: str = Field(..., pattern=r"^[a-z0-9\-]+$", max_length=64)
    name: str = Field(..., max_length=256)
    description: str = ""
    schedule_type: str = Field("cron", pattern=r"^(cron|heartbeat)$")
    cron_expression: str | None = None
    heartbeat_interval: str | None = None
    timezone: str = "UTC"
    session_mode: str = Field("isolated", pattern=r"^(main|isolated)$")
    message: str = ""
    agent_id: str = "main"
    status: str = Field("backlog", pattern=r"^(backlog|active|paused|completed)$")
    enabled: bool = True
    model_override: str | None = None
    announce: bool = False
    template_id: str | None = None
    active_hours: str | None = None
    delete_after_run: bool = False


class TaskUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    schedule_type: str | None = None
    cron_expression: str | None = None
    heartbeat_interval: str | None = None
    timezone: str | None = None
    session_mode: str | None = None
    message: str | None = None
    agent_id: str | None = None
    status: str | None = None
    enabled: bool | None = None
    model_override: str | None = None
    announce: bool | None = None
    template_id: str | None = None
    active_hours: str | None = None
    delete_after_run: bool | None = None


class TaskResponse(BaseModel):
    id: str
    name: str
    description: str
    schedule_type: str
    cron_expression: str | None
    heartbeat_interval: str | None
    timezone: str
    session_mode: str
    message: str
    agent_id: str
    status: str
    enabled: bool
    model_override: str | None
    announce: bool
    template_id: str | None
    active_hours: str | None
    delete_after_run: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Task run schemas ─────────────────────────────────────────────────

class TaskRunCreate(BaseModel):
    task_id: str
    result: str = Field("running", pattern=r"^(running|success|failed|skipped|timeout)$")
    summary: str = ""
    output: str = ""
    error: str | None = None
    duration_s: float | None = None
    tokens_used: int | None = None
    agent_id: str = "main"
    session_key: str | None = None
    trigger: str = Field("manual", pattern=r"^(scheduled|manual|template)$")


class TaskRunResponse(BaseModel):
    id: int
    task_id: str
    result: str
    summary: str
    output: str
    error: str | None
    duration_s: float | None
    tokens_used: int | None
    agent_id: str
    session_key: str | None
    trigger: str
    started_at: datetime
    finished_at: datetime | None

    model_config = {"from_attributes": True}


# ── Task with latest run stats ───────────────────────────────────────

class TaskDetailResponse(BaseModel):
    """Full task detail including recent run history."""
    task: TaskResponse
    runs: list[TaskRunResponse]
    total_runs: int
    success_count: int
    fail_count: int
    last_run: TaskRunResponse | None


# ── Task templates (predefined task configurations) ──────────────────

class TaskTemplateResponse(BaseModel):
    """Pre-built task template the UI can offer."""
    id: str
    name: str
    description: str
    icon: str
    schedule_type: str
    cron_expression: str | None = None
    heartbeat_interval: str | None = None
    session_mode: str = "isolated"
    message: str = ""
    announce: bool = False
    category: str = "general"
