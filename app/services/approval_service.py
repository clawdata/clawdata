"""Approval service — track and resolve exec approval requests."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.openclaw import openclaw
from app.models.approval import Approval
from app.schemas.approval import ApprovalResolve


async def list_approvals(
    db: AsyncSession, status: str | None = None
) -> list[Approval]:
    stmt = select(Approval).order_by(Approval.created_at.desc())
    if status:
        stmt = stmt.where(Approval.status == status)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def record_approval_request(
    db: AsyncSession,
    approval_id: str,
    agent_id: str,
    tool_name: str,
    command: str,
) -> Approval:
    """Called when we receive an exec.approval.requested event from OpenClaw."""
    approval = Approval(
        id=approval_id,
        agent_id=agent_id,
        tool_name=tool_name,
        command=command,
    )
    db.add(approval)
    await db.commit()
    await db.refresh(approval)
    return approval


async def resolve_approval(
    db: AsyncSession, approval_id: str, data: ApprovalResolve, resolved_by: str = "api"
) -> Approval | None:
    approval = await db.get(Approval, approval_id)
    if not approval or approval.status != "pending":
        return None

    # Forward to OpenClaw
    await openclaw.resolve_approval(
        approval_id, approved=data.approved, reason=data.reason
    )

    approval.status = "approved" if data.approved else "denied"
    approval.resolved_by = resolved_by
    approval.resolved_at = datetime.now()

    await db.commit()
    await db.refresh(approval)
    return approval
