"""Template request/response schemas."""

import json
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator


class TemplateCreate(BaseModel):
    id: str = Field(..., max_length=128)  # e.g. dbt/staging_model
    name: str = Field(..., max_length=128)
    category: str = Field(..., pattern=r"^(dbt|airflow|sql|custom)$")
    description: str = ""
    content: str  # Jinja2 template body
    variables: list[str] = []  # expected variable names


class TemplateUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    content: str | None = None
    variables: list[str] | None = None


class TemplateResponse(BaseModel):
    id: str
    name: str
    category: str
    description: str
    file_path: str
    variables: list[str]
    content: str | None = None
    created_at: datetime
    updated_at: datetime

    @field_validator("variables", mode="before")
    @classmethod
    def parse_variables(cls, v: Any) -> list[str]:
        if isinstance(v, str):
            return json.loads(v)
        return v

    model_config = {"from_attributes": True}


class TemplateRender(BaseModel):
    """Render a template with the provided variables."""
    variables: dict[str, Any]


class TemplateRenderResponse(BaseModel):
    template_id: str
    rendered: str
