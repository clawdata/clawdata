"""Template service — manages Jinja2 reference templates."""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path

import jinja2
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.template import Template
from app.schemas.template import TemplateCreate, TemplateUpdate

logger = logging.getLogger(__name__)


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


# ── Frontmatter parsing ────────────────────────────────────────────

_FRONTMATTER_RE = re.compile(
    r"\{#---\s*\n(.*?)\n\s*---#\}", re.DOTALL
)


def _parse_frontmatter(content: str) -> dict[str, str | list[str]]:
    """Parse YAML-like frontmatter from a Jinja2 comment block.

    Format:
        {#---
        name: Staging Model
        description: Generate a dbt staging model from a source table
        variables: source_name, table_name, columns
        ---#}
    """
    m = _FRONTMATTER_RE.search(content)
    if not m:
        return {}

    meta: dict[str, str | list[str]] = {}
    for line in m.group(1).splitlines():
        line = line.strip()
        if not line or ":" not in line:
            continue
        key, _, value = line.partition(":")
        key = key.strip().lower()
        value = value.strip()
        if key == "variables":
            meta[key] = [v.strip() for v in value.split(",") if v.strip()]
        else:
            meta[key] = value
    return meta


def _infer_category(rel_path: str) -> str:
    """Infer template category from directory name."""
    parts = Path(rel_path).parts
    if len(parts) > 1:
        cat = parts[0].lower()
        if cat in ("dbt", "airflow", "sql"):
            return cat
    return "custom"


def _humanize_name(filename: str) -> str:
    """Convert a filename like 'staging_model.sql.j2' → 'Staging Model'."""
    name = filename.replace(".j2", "").replace(".sql", "").replace(".py", "").replace(".yml", "")
    return name.replace("_", " ").replace("-", " ").title()


# ── Disk → DB sync ─────────────────────────────────────────────────

async def sync_templates_from_disk(db: AsyncSession) -> dict[str, list[str]]:
    """Scan the templates directory for .j2 files and upsert into the DB.

    Returns dict with 'created' and 'updated' lists of template IDs.
    """
    templates_dir = settings.templates_dir
    if not templates_dir.exists():
        return {"created": [], "updated": []}

    created: list[str] = []
    updated: list[str] = []

    for j2_file in sorted(templates_dir.rglob("*.j2")):
        rel = j2_file.relative_to(templates_dir)
        rel_str = str(rel)

        # Build template ID from path: e.g. dbt/staging_model
        tpl_id = str(rel.with_suffix("").with_suffix(""))  # strip .sql.j2 → dbt/staging_model

        content = j2_file.read_text()
        meta = _parse_frontmatter(content)

        category = str(meta.get("category", "")) or _infer_category(rel_str)
        name = str(meta.get("name", "")) or _humanize_name(j2_file.name)
        description = str(meta.get("description", ""))
        variables: list[str] = meta.get("variables", []) if isinstance(meta.get("variables"), list) else []

        existing = await db.get(Template, tpl_id)
        if existing:
            # Update if metadata changed
            changed = False
            if existing.name != name:
                existing.name = name
                changed = True
            if existing.description != description:
                existing.description = description
                changed = True
            if existing.file_path != rel_str:
                existing.file_path = rel_str
                changed = True
            new_vars = json.dumps(variables)
            if existing.variables != new_vars:
                existing.variables = new_vars
                changed = True
            if existing.category != category:
                existing.category = category
                changed = True
            if changed:
                updated.append(tpl_id)
        else:
            tpl = Template(
                id=tpl_id,
                name=name,
                category=category,
                description=description,
                file_path=rel_str,
                variables=json.dumps(variables),
            )
            db.add(tpl)
            created.append(tpl_id)

    if created or updated:
        await db.commit()

    if created:
        logger.info("Synced %d new templates from disk: %s", len(created), created)
    if updated:
        logger.info("Updated %d templates from disk: %s", len(updated), updated)

    return {"created": created, "updated": updated}
