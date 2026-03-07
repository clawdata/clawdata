"""Task model — scheduled jobs (cron & heartbeat)."""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(256))
    description: Mapped[str] = mapped_column(Text, default="")

    # "cron" | "heartbeat"
    schedule_type: Mapped[str] = mapped_column(String(16), default="cron")

    # Cron expression (e.g. "0 7 * * *") — only for schedule_type=cron
    cron_expression: Mapped[str | None] = mapped_column(String(128), nullable=True)

    # Heartbeat interval (e.g. "30m", "1h") — only for schedule_type=heartbeat
    heartbeat_interval: Mapped[str | None] = mapped_column(String(32), nullable=True)

    # Timezone for cron schedules
    timezone: Mapped[str] = mapped_column(String(64), default="UTC")

    # Session mode: "main" | "isolated"
    session_mode: Mapped[str] = mapped_column(String(16), default="isolated")

    # The message/prompt sent to the agent
    message: Mapped[str] = mapped_column(Text, default="")

    # Agent assignment
    agent_id: Mapped[str] = mapped_column(String(64), default="main")

    # Swim lane status: "backlog" | "active" | "paused" | "completed"
    status: Mapped[str] = mapped_column(String(16), default="backlog")

    # Enable/disable toggle
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)

    # Model override (optional)
    model_override: Mapped[str | None] = mapped_column(String(128), nullable=True)

    # Announce results
    announce: Mapped[bool] = mapped_column(Boolean, default=False)

    # Template reference — e.g. "check-email", "data-ingestion"
    template_id: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # Active hours (JSON string: {"start": "08:00", "end": "22:00"})
    active_hours: Mapped[str | None] = mapped_column(Text, nullable=True)

    # One-shot: delete after run
    delete_after_run: Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
