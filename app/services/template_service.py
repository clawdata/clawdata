"""Template service — manages Jinja2 reference templates."""

from __future__ import annotations

import json

import jinja2
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.template import Template
from app.schemas.template import TemplateCreate, TemplateUpdate


async def list_templates(
    db: AsyncSession, category: str | None = None
) -> list[Template]:
    stmt = select(Template).order_by(Template.category, Template.name)
    if category:
        stmt = stmt.where(Template.category == category)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_template(db: AsyncSession, template_id: str) -> tuple[Template | None, str | None]:
    tpl = await db.get(Template, template_id)
    if not tpl:
        return None, None

    path = settings.templates_dir / tpl.file_path
    content = path.read_text() if path.exists() else None
    return tpl, content


async def create_template(db: AsyncSession, data: TemplateCreate) -> Template:
    # Write file to disk
    rel_path = f"{data.category}/{data.id.replace('/', '_')}.j2"
    file_path = settings.templates_dir / rel_path
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_text(data.content)

    tpl = Template(
        id=data.id,
        name=data.name,
        category=data.category,
        description=data.description,
        file_path=rel_path,
        variables=json.dumps(data.variables),
    )
    db.add(tpl)
    await db.commit()
    await db.refresh(tpl)
    return tpl


async def update_template(
    db: AsyncSession, template_id: str, data: TemplateUpdate
) -> Template | None:
    tpl = await db.get(Template, template_id)
    if not tpl:
        return None

    if data.name is not None:
        tpl.name = data.name
    if data.description is not None:
        tpl.description = data.description
    if data.variables is not None:
        tpl.variables = json.dumps(data.variables)
    if data.content is not None:
        path = settings.templates_dir / tpl.file_path
        path.write_text(data.content)

    await db.commit()
    await db.refresh(tpl)
    return tpl


async def delete_template(db: AsyncSession, template_id: str) -> bool:
    tpl = await db.get(Template, template_id)
    if not tpl:
        return False

    path = settings.templates_dir / tpl.file_path
    if path.exists():
        path.unlink()

    await db.delete(tpl)
    await db.commit()
    return True


def render_template(template_content: str, variables: dict) -> str:
    """Render a Jinja2 template string with the given variables."""
    env = jinja2.Environment(undefined=jinja2.StrictUndefined)
    tpl = env.from_string(template_content)
    return tpl.render(**variables)
