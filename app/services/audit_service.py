"""Audit service — immutable event logging and querying."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog

logger = logging.getLogger(__name__)


async def log_event(
    db: AsyncSession,
    *,
    event_type: str,
    action: str,
    agent_id: str | None = None,
    session_id: str | None = None,
    user_id: str | None = None,
    details: dict | None = None,
    guardrail_id: str | None = None,
    guardrail_action: str | None = None,
    tokens_used: int | None = None,
    estimated_cost: float | None = None,
    model: str | None = None,
) -> AuditLog:
    """Write an immutable audit log entry."""
    entry = AuditLog(
        event_type=event_type,
        action=action,
        agent_id=agent_id,
        session_id=session_id,
        user_id=user_id,
        details=details,
        guardrail_id=guardrail_id,
        guardrail_action=guardrail_action,
        tokens_used=tokens_used,
        estimated_cost=estimated_cost,
        model=model,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry


async def query_logs(
    db: AsyncSession,
    *,
    agent_id: str | None = None,
    session_id: str | None = None,
    event_type: str | None = None,
    start: datetime | None = None,
    end: datetime | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[AuditLog]:
    """Query audit logs with optional filters."""
    stmt = select(AuditLog).order_by(AuditLog.timestamp.desc())

    if agent_id:
        stmt = stmt.where(AuditLog.agent_id == agent_id)
    if session_id:
        stmt = stmt.where(AuditLog.session_id == session_id)
    if event_type:
        stmt = stmt.where(AuditLog.event_type == event_type)
    if start:
        stmt = stmt.where(AuditLog.timestamp >= start)
    if end:
        stmt = stmt.where(AuditLog.timestamp <= end)

    stmt = stmt.offset(offset).limit(limit)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_summary(db: AsyncSession) -> dict:
    """Aggregated audit stats."""
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # Total events
    total_result = await db.execute(select(func.count(AuditLog.id)))
    total_events = total_result.scalar() or 0

    # Events today
    today_result = await db.execute(
        select(func.count(AuditLog.id)).where(AuditLog.timestamp >= today_start)
    )
    events_today = today_result.scalar() or 0

    # Total tokens and cost
    token_result = await db.execute(
        select(func.sum(AuditLog.tokens_used), func.sum(AuditLog.estimated_cost))
    )
    row = token_result.one()
    total_tokens = row[0] or 0
    total_cost = row[1] or 0.0

    # Guardrail triggers
    gr_result = await db.execute(
        select(func.count(AuditLog.id)).where(AuditLog.guardrail_id != None)
    )
    guardrail_triggers = gr_result.scalar() or 0

    # Top agents by event count
    agent_result = await db.execute(
        select(AuditLog.agent_id, func.count(AuditLog.id).label("count"))
        .where(AuditLog.agent_id != None)
        .group_by(AuditLog.agent_id)
        .order_by(func.count(AuditLog.id).desc())
        .limit(10)
    )
    top_agents = [{"agent_id": r[0], "count": r[1]} for r in agent_result.all()]

    # Top event types
    type_result = await db.execute(
        select(AuditLog.event_type, func.count(AuditLog.id).label("count"))
        .group_by(AuditLog.event_type)
        .order_by(func.count(AuditLog.id).desc())
        .limit(10)
    )
    top_types = [{"event_type": r[0], "count": r[1]} for r in type_result.all()]

    return {
        "total_events": total_events,
        "events_today": events_today,
        "total_tokens": total_tokens,
        "total_cost": total_cost,
        "guardrail_triggers": guardrail_triggers,
        "top_agents": top_agents,
        "top_event_types": top_types,
    }
