"""Skill service — manages SKILL.md files on disk + DB metadata."""

from __future__ import annotations

from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.skill import Skill
from app.schemas.skill import SkillCreate, SkillUpdate
from app.utils.markdown import build_skill_md


async def list_skills(db: AsyncSession, agent_id: str | None = None) -> list[Skill]:
    stmt = select(Skill).order_by(Skill.name)
    if agent_id is not None:
        stmt = stmt.where(Skill.agent_id == agent_id)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_skill(db: AsyncSession, skill_id: str) -> tuple[Skill | None, str | None]:
    """Return (skill, skill_md_content)."""
    skill = await db.get(Skill, skill_id)
    if not skill:
        return None, None

    skill_md = Path(skill.skill_path) / "SKILL.md"
    content = skill_md.read_text() if skill_md.exists() else None
    return skill, content


async def create_skill(db: AsyncSession, data: SkillCreate) -> Skill:
    # Decide placement: shared or per-agent
    if data.agent_id:
        base = settings.userdata_dir / "sub" / data.agent_id / "skills"
    else:
        base = settings.skills_dir

    skill_dir = base / data.id
    skill_dir.mkdir(parents=True, exist_ok=True)

    # Write SKILL.md
    md_content = data.content or build_skill_md(name=data.name, description=data.description)
    (skill_dir / "SKILL.md").write_text(md_content)

    skill = Skill(
        id=data.id,
        name=data.name,
        description=data.description,
        agent_id=data.agent_id,
        skill_path=str(skill_dir),
    )
    db.add(skill)
    await db.commit()
    await db.refresh(skill)
    return skill


async def update_skill(db: AsyncSession, skill_id: str, data: SkillUpdate) -> Skill | None:
    skill = await db.get(Skill, skill_id)
    if not skill:
        return None

    for field, value in data.model_dump(exclude_unset=True, exclude={"content"}).items():
        setattr(skill, field, value)

    if data.content is not None:
        skill_md = Path(skill.skill_path) / "SKILL.md"
        skill_md.write_text(data.content)

    await db.commit()
    await db.refresh(skill)
    return skill


async def delete_skill(db: AsyncSession, skill_id: str) -> bool:
    skill = await db.get(Skill, skill_id)
    if not skill:
        return False

    # Remove from disk
    skill_dir = Path(skill.skill_path)
    if skill_dir.exists():
        import shutil

        shutil.rmtree(skill_dir)

    await db.delete(skill)
    await db.commit()
    return True
