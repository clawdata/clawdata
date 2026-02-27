"""Approval management endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.approval import ApprovalResolve, ApprovalResponse
from app.services import approval_service

router = APIRouter()


@router.get("/", response_model=list[ApprovalResponse])
async def list_approvals(
    status: str | None = None, db: AsyncSession = Depends(get_db)
):
    return await approval_service.list_approvals(db, status=status)


@router.post("/{approval_id}/resolve", response_model=ApprovalResponse)
async def resolve_approval(
    approval_id: str,
    body: ApprovalResolve,
    db: AsyncSession = Depends(get_db),
):
    approval = await approval_service.resolve_approval(db, approval_id, body)
    if not approval:
        raise HTTPException(status_code=404, detail="Approval not found or already resolved")
    return approval
