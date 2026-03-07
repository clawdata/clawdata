"""GuardrailPolicy ORM model — defines safety rules for agents."""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, Integer, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class GuardrailPolicy(Base):
    __tablename__ = "guardrail_policies"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    description: Mapped[str] = mapped_column(Text, default="")

    # Scope — None = global default, else agent-specific
    agent_id: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # Cost guardrails
    max_cost_per_run: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_cost_per_day: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_tokens_per_message: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Tool guardrails (JSON lists)
    tool_allowlist: Mapped[list | None] = mapped_column(JSON, nullable=True)
    tool_denylist: Mapped[list | None] = mapped_column(JSON, nullable=True)
    require_approval_for: Mapped[list | None] = mapped_column(JSON, nullable=True)

    # Time guardrails
    max_run_duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Content guardrails (JSON lists of regex patterns)
    block_patterns: Mapped[list | None] = mapped_column(JSON, nullable=True)
    redact_patterns: Mapped[list | None] = mapped_column(JSON, nullable=True)

    # Scheduling guardrails
    allowed_hours: Mapped[str | None] = mapped_column(String(32), nullable=True)  # e.g. "9-17"
    allowed_days: Mapped[str | None] = mapped_column(String(32), nullable=True)  # e.g. "mon-fri"

    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
