"""Agent CRUD endpoints."""

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.agent import AgentCreate, AgentResponse, AgentUpdate
from app.services import agent_service, audit_service

logger = logging.getLogger(__name__)
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
    agent = await agent_service.create_agent(db, data)
    await audit_service.log_event(
        db,
        event_type="agent.created",
        action=f"Created agent '{data.id}'",
        agent_id=data.id,
        details={"name": data.name, "model": data.model, "role": data.role},
    )
    return agent


@router.patch("/{agent_id}", response_model=AgentResponse)
async def update_agent(
    agent_id: str, data: AgentUpdate, db: AsyncSession = Depends(get_db)
):
    agent = await agent_service.update_agent(db, agent_id, data)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    changes = {k: v for k, v in data.model_dump(exclude_unset=True).items()}
    await audit_service.log_event(
        db,
        event_type="agent.updated",
        action=f"Updated agent '{agent_id}'",
        agent_id=agent_id,
        details={"changes": changes},
    )
    return agent


@router.delete("/{agent_id}", status_code=204)
async def delete_agent(agent_id: str, db: AsyncSession = Depends(get_db)):
    deleted = await agent_service.delete_agent(db, agent_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Agent not found")
    await audit_service.log_event(
        db,
        event_type="agent.deleted",
        action=f"Deleted agent '{agent_id}'",
        agent_id=agent_id,
    )


@router.post("/sync")
async def sync_agents(db: AsyncSession = Depends(get_db)):
    """Sync agents from the gateway into the local DB."""
    from app.services import openclaw_lifecycle as lifecycle

    gw_data = await lifecycle.list_openclaw_agents()
    gateway_agents = gw_data.get("agents", [])
    result = await agent_service.sync_agents_from_gateway(db, gateway_agents)
    await audit_service.log_event(
        db,
        event_type="agent.synced",
        action=f"Synced {len(result)} agents from gateway",
        details={"agent_ids": [a.id for a in result]},
    )
    return {"synced": len(result), "agents": [a.id for a in result]}
