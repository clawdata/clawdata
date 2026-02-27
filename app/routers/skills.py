"""Skill CRUD endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.skill import SkillCreate, SkillResponse, SkillUpdate
from app.services import skill_service
from app.services.agent_service import sync_all_project_skills

router = APIRouter()


@router.post("/sync")
async def sync_skills():
    """Sync project-level skills into all agent workspaces (symlinks)."""
    result = sync_all_project_skills()
    return {"synced": result}


@router.get("/", response_model=list[SkillResponse])
async def list_skills(
    agent_id: str | None = None, db: AsyncSession = Depends(get_db)
):
    return await skill_service.list_skills(db, agent_id=agent_id)


@router.get("/{skill_id}", response_model=SkillResponse)
async def get_skill(skill_id: str, db: AsyncSession = Depends(get_db)):
    skill, content = await skill_service.get_skill(db, skill_id)
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    resp = SkillResponse.model_validate(skill)
    resp.content = content
    return resp


@router.post("/", response_model=SkillResponse, status_code=201)
async def create_skill(data: SkillCreate, db: AsyncSession = Depends(get_db)):
    return await skill_service.create_skill(db, data)


@router.patch("/{skill_id}", response_model=SkillResponse)
async def update_skill(
    skill_id: str, data: SkillUpdate, db: AsyncSession = Depends(get_db)
):
    skill = await skill_service.update_skill(db, skill_id, data)
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    return skill


@router.delete("/{skill_id}", status_code=204)
async def delete_skill(skill_id: str, db: AsyncSession = Depends(get_db)):
    deleted = await skill_service.delete_skill(db, skill_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Skill not found")
