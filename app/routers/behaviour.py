"""Behaviour endpoints — read/write agent workspace markdown files."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.behaviour import (
    BEHAVIOUR_FILES,
    BehaviourFileResponse,
    BehaviourSnapshotResponse,
    BehaviourUpdate,
)
from app.services import agent_service, behaviour_service

router = APIRouter()


@router.get("/{agent_id}", response_model=list[BehaviourFileResponse])
async def list_behaviour_files(agent_id: str, db: AsyncSession = Depends(get_db)):
    agent = await agent_service.get_agent(db, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return await behaviour_service.list_behaviour_files(agent_id, agent.workspace_path)


@router.get("/{agent_id}/{file_name}", response_model=BehaviourFileResponse)
async def get_behaviour_file(
    agent_id: str, file_name: str, db: AsyncSession = Depends(get_db)
):
    if file_name not in BEHAVIOUR_FILES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file. Must be one of: {', '.join(BEHAVIOUR_FILES)}",
        )
    agent = await agent_service.get_agent(db, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    result = await behaviour_service.get_behaviour_file(
        db, agent_id, agent.workspace_path, file_name
    )
    if result is None:
        raise HTTPException(status_code=404, detail="File not found")
    return result


@router.put("/{agent_id}/{file_name}", response_model=BehaviourFileResponse)
async def update_behaviour_file(
    agent_id: str,
    file_name: str,
    body: BehaviourUpdate,
    db: AsyncSession = Depends(get_db),
):
    if file_name not in BEHAVIOUR_FILES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file. Must be one of: {', '.join(BEHAVIOUR_FILES)}",
        )
    agent = await agent_service.get_agent(db, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    result = await behaviour_service.update_behaviour_file(
        db, agent_id, agent.workspace_path, file_name, body.content
    )
    if result is None:
        raise HTTPException(status_code=400, detail="Update failed")
    return result


@router.get("/{agent_id}/snapshots/", response_model=list[BehaviourSnapshotResponse])
async def list_snapshots(
    agent_id: str, file_name: str | None = None, db: AsyncSession = Depends(get_db)
):
    return await behaviour_service.list_snapshots(db, agent_id, file_name)
