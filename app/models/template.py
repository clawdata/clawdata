"""Template ORM model — metadata for Jinja2 reference templates."""

from datetime import datetime

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Template(Base):
    __tablename__ = "templates"

    id: Mapped[str] = mapped_column(String(128), primary_key=True)  # e.g. dbt/staging_model
    name: Mapped[str] = mapped_column(String(128))
    category: Mapped[str] = mapped_column(String(64))  # dbt | airflow | sql
    description: Mapped[str] = mapped_column(Text, default="")
    file_path: Mapped[str] = mapped_column(String(512))  # relative path to .j2
    variables: Mapped[str] = mapped_column(Text, default="[]")  # JSON list of var names
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
