"""Agent service — metadata CRUD.

The gateway is the source of truth for agent identity/workspace.
ClawData maintains a metadata overlay (guardrail config, tags, etc.).
"""

from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent import Agent
from app.schemas.agent import AgentCreate, AgentUpdate

logger = logging.getLogger(__name__)


async def list_agents(db: AsyncSession) -> list[Agent]:
    result = await db.execute(select(Agent).order_by(Agent.created_at))
    return list(result.scalars().all())


async def get_agent(db: AsyncSession, agent_id: str) -> Agent | None:
    return await db.get(Agent, agent_id)


async def create_agent(db: AsyncSession, data: AgentCreate) -> Agent:
    agent = Agent(
        id=data.id,
        name=data.name,
        description=data.description,
        model=data.model,
        role=data.role,
        parent_id=data.parent_id,
        emoji=data.emoji,
        guardrail_policy_id=data.guardrail_policy_id,
        tags=data.tags,
    )
    db.add(agent)
    await db.commit()
    await db.refresh(agent)
    return agent


async def update_agent(db: AsyncSession, agent_id: str, data: AgentUpdate) -> Agent | None:
    agent = await db.get(Agent, agent_id)
    if not agent:
        return None

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(agent, field, value)

    await db.commit()
    await db.refresh(agent)
    return agent


async def delete_agent(db: AsyncSession, agent_id: str) -> bool:
    agent = await db.get(Agent, agent_id)
    if not agent:
        return False

    await db.delete(agent)
    await db.commit()
    return True


async def sync_agents_from_gateway(
    db: AsyncSession,
    gateway_agents: list[dict],
) -> list[Agent]:
    """Upsert gateway agents into the local DB as metadata overlays.

    This is a lightweight sync -- it creates rows for new agents and
    updates names/emoji for existing ones. It never touches the gateway.
    """
    synced: list[Agent] = []
    for gw in gateway_agents:
        agent_id = gw["id"]
        existing = await db.get(Agent, agent_id)

        if existing:
            existing.name = gw.get("name") or existing.name
            existing.emoji = gw.get("emoji", existing.emoji) or existing.emoji
            if gw.get("model"):
                existing.model = gw["model"]
            existing.is_active = True
            synced.append(existing)
        else:
            agent = Agent(
                id=agent_id,
                name=gw.get("name") or agent_id,
                description="",
                model=gw.get("model") or "anthropic/claude-sonnet-4-5",
                role="agent",
                emoji=gw.get("emoji", ""),
                is_active=True,
            )
            db.add(agent)
            synced.append(agent)

    # Mark agents no longer on gateway as inactive
    gateway_ids = {gw["id"] for gw in gateway_agents}
    all_agents = await list_agents(db)
    for agent in all_agents:
        if agent.id not in gateway_ids:
            agent.is_active = False

    await db.commit()
    for a in synced:
        await db.refresh(a)
    return synced
