"""Skill ORM model — metadata for managed SKILL.md files."""

from datetime import datetime

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Skill(Base):
    __tablename__ = "skills"

    id: Mapped[str] = mapped_column(String(128), primary_key=True)  # folder name
    name: Mapped[str] = mapped_column(String(128))
    description: Mapped[str] = mapped_column(Text, default="")
    agent_id: Mapped[str | None] = mapped_column(String(64), nullable=True)  # None = shared
    skill_path: Mapped[str] = mapped_column(String(512))  # path to SKILL.md dir
    is_enabled: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
