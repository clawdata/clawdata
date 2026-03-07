"""Audit log query endpoints."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.audit import AuditLogEntry, AuditSummary
from app.services import audit_service

router = APIRouter()


@router.get("/", response_model=list[AuditLogEntry])
async def query_logs(
    agent_id: str | None = Query(None),
    session_id: str | None = Query(None),
    event_type: str | None = Query(None),
    start: datetime | None = Query(None),
    end: datetime | None = Query(None),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    return await audit_service.query_logs(
        db,
        agent_id=agent_id,
        session_id=session_id,
        event_type=event_type,
        start=start,
        end=end,
        limit=limit,
        offset=offset,
    )


@router.get("/summary", response_model=AuditSummary)
async def get_summary(db: AsyncSession = Depends(get_db)):
    return await audit_service.get_summary(db)
