"""AuditLog ORM model — immutable event log for compliance and debugging."""

from datetime import datetime

from sqlalchemy import DateTime, Float, Index, Integer, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)

    # Event classification
    event_type: Mapped[str] = mapped_column(String(64), index=True)
    # e.g. "chat.message", "tool.execution", "secret.access",
    #       "approval.granted", "guardrail.triggered", "agent.created",
    #       "job.started", "job.completed", "job.failed"

    # Context
    agent_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    session_id: Mapped[str | None] = mapped_column(String(256), nullable=True)
    user_id: Mapped[str | None] = mapped_column(String(128), nullable=True)

    # Human-readable description
    action: Mapped[str] = mapped_column(Text, default="")

    # Full event details (JSON)
    details: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # Guardrail context
    guardrail_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    guardrail_action: Mapped[str | None] = mapped_column(String(32), nullable=True)
    # "blocked", "approved", "redacted", "warned"

    # Cost tracking
    tokens_used: Mapped[int | None] = mapped_column(Integer, nullable=True)
    estimated_cost: Mapped[float | None] = mapped_column(Float, nullable=True)
    model: Mapped[str | None] = mapped_column(String(128), nullable=True)

    __table_args__ = (
        Index("ix_audit_event_type_ts", "event_type", "timestamp"),
    )
