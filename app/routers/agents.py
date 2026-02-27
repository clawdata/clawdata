"""Agent CRUD endpoints."""

import subprocess
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.agent import AgentCreate, AgentResponse, AgentUpdate
from app.services import agent_service

router = APIRouter()


@router.get("/", response_model=list[AgentResponse])
async def list_agents(db: AsyncSession = Depends(get_db)):
    return await agent_service.list_agents(db)


@router.get("/{agent_id}", response_model=AgentResponse)
async def get_agent(agent_id: str, db: AsyncSession = Depends(get_db)):
    agent = await agent_service.get_agent(db, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


@router.post("/", response_model=AgentResponse, status_code=201)
async def create_agent(data: AgentCreate, db: AsyncSession = Depends(get_db)):
    existing = await agent_service.get_agent(db, data.id)
    if existing:
        raise HTTPException(status_code=409, detail="Agent already exists")
    return await agent_service.create_agent(db, data)


@router.patch("/{agent_id}", response_model=AgentResponse)
async def update_agent(
    agent_id: str, data: AgentUpdate, db: AsyncSession = Depends(get_db)
):
    agent = await agent_service.update_agent(db, agent_id, data)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


@router.delete("/{agent_id}", status_code=204)
async def delete_agent(agent_id: str, db: AsyncSession = Depends(get_db)):
    deleted = await agent_service.delete_agent(db, agent_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Agent not found")


@router.post("/{agent_id}/open-folder")
async def open_agent_folder(agent_id: str, db: AsyncSession = Depends(get_db)):
    agent = await agent_service.get_agent(db, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    folder = Path(agent.workspace_path).resolve()
    if not folder.is_dir():
        raise HTTPException(status_code=404, detail="Workspace folder not found on disk")
    subprocess.Popen(["open", str(folder)])
    return {"ok": True, "path": str(folder)}
