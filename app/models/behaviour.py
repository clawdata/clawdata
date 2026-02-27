"""BehaviourSnapshot — tracks changes to agent workspace markdown files."""

from datetime import datetime

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class BehaviourSnapshot(Base):
    __tablename__ = "behaviour_snapshots"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    agent_id: Mapped[str] = mapped_column(String(64))
    file_name: Mapped[str] = mapped_column(String(64))  # AGENTS.md, SOUL.md, etc.
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
