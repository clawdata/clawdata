"""Secret ORM model — encrypted key-value store for API keys, tokens, etc."""

from datetime import datetime

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Secret(Base):
    __tablename__ = "secrets"

    id: Mapped[str] = mapped_column(String(128), primary_key=True)  # logical name
    description: Mapped[str] = mapped_column(Text, default="")
    encrypted_value: Mapped[str] = mapped_column(Text)  # Fernet-encrypted
    agent_id: Mapped[str | None] = mapped_column(String(64), nullable=True)  # None = global
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
