"""Agent ORM model — tracks registered agents and their workspace paths."""

from datetime import datetime

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Agent(Base):
    __tablename__ = "agents"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    description: Mapped[str] = mapped_column(Text, default="")
    workspace_path: Mapped[str] = mapped_column(String(512))
    agent_dir: Mapped[str] = mapped_column(String(512), default="")
    model: Mapped[str] = mapped_column(String(128), default="anthropic/claude-sonnet-4-5")
    role: Mapped[str] = mapped_column(String(32), default="agent")  # agent | orchestrator
    parent_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    source: Mapped[str] = mapped_column(String(32), default="local")  # local | openclaw
    emoji: Mapped[str] = mapped_column(String(16), default="")
    openclaw_workspace: Mapped[str | None] = mapped_column(String(512), nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
