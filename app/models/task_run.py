"""TaskRun model — execution history for scheduled tasks."""

from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class TaskRun(Base):
    __tablename__ = "task_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    task_id: Mapped[str] = mapped_column(String(64), ForeignKey("tasks.id", ondelete="CASCADE"))

    # "running" | "success" | "failed" | "skipped" | "timeout"
    result: Mapped[str] = mapped_column(String(16), default="running")

    # Human-readable summary of the run output
    summary: Mapped[str] = mapped_column(Text, default="")

    # Full output / agent response (may be long)
    output: Mapped[str] = mapped_column(Text, default="")

    # Error details if failed
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Duration in seconds
    duration_s: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Token usage (if available)
    tokens_used: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Which agent ran it
    agent_id: Mapped[str] = mapped_column(String(64), default="main")

    # Session key used for this run
    session_key: Mapped[str | None] = mapped_column(String(256), nullable=True)

    # Trigger: "scheduled" | "manual" | "template"
    trigger: Mapped[str] = mapped_column(String(16), default="scheduled")

    started_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
