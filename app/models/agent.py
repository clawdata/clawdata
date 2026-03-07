"""Agent ORM model — metadata overlay for gateway agents.

The gateway is the source of truth for agent identity/workspace.
ClawData tracks additional metadata: guardrail policies, tags, cost limits.
"""

from datetime import datetime

from sqlalchemy import DateTime, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Agent(Base):
    __tablename__ = "agents"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    description: Mapped[str] = mapped_column(Text, default="")
    model: Mapped[str] = mapped_column(String(128), default="anthropic/claude-sonnet-4-5")
    role: Mapped[str] = mapped_column(String(32), default="agent")  # agent | orchestrator
    parent_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    emoji: Mapped[str] = mapped_column(String(16), default="")
    is_active: Mapped[bool] = mapped_column(default=True)

    # v2 additions — guardrails + metadata
    guardrail_policy_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    tags: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
