"""Guardrail policy CRUD endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.guardrail import (
    GuardrailPolicyCreate,
    GuardrailPolicyResponse,
    GuardrailPolicyUpdate,
)
from app.services import guardrail_service

router = APIRouter()


@router.get("/", response_model=list[GuardrailPolicyResponse])
async def list_policies(db: AsyncSession = Depends(get_db)):
    return await guardrail_service.list_policies(db)


@router.get("/{policy_id}", response_model=GuardrailPolicyResponse)
async def get_policy(policy_id: str, db: AsyncSession = Depends(get_db)):
    policy = await guardrail_service.get_policy(db, policy_id)
    if not policy:
        raise HTTPException(status_code=404, detail="Guardrail policy not found")
    return policy


@router.post("/", response_model=GuardrailPolicyResponse, status_code=201)
async def create_policy(data: GuardrailPolicyCreate, db: AsyncSession = Depends(get_db)):
    return await guardrail_service.create_policy(db, data)


@router.patch("/{policy_id}", response_model=GuardrailPolicyResponse)
async def update_policy(
    policy_id: str, data: GuardrailPolicyUpdate, db: AsyncSession = Depends(get_db)
):
    policy = await guardrail_service.update_policy(db, policy_id, data)
    if not policy:
        raise HTTPException(status_code=404, detail="Guardrail policy not found")
    return policy


@router.delete("/{policy_id}", status_code=204)
async def delete_policy(policy_id: str, db: AsyncSession = Depends(get_db)):
    deleted = await guardrail_service.delete_policy(db, policy_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Guardrail policy not found")
