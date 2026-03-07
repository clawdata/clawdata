"""Guardrail service — CRUD + policy evaluation."""

from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.guardrail import GuardrailPolicy
from app.schemas.guardrail import GuardrailPolicyCreate, GuardrailPolicyUpdate

logger = logging.getLogger(__name__)


async def list_policies(
    db: AsyncSession, *, agent_id: str | None = None
) -> list[GuardrailPolicy]:
    stmt = select(GuardrailPolicy).order_by(GuardrailPolicy.name)
    if agent_id is not None:
        stmt = stmt.where(GuardrailPolicy.agent_id == agent_id)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_policy(db: AsyncSession, policy_id: str) -> GuardrailPolicy | None:
    return await db.get(GuardrailPolicy, policy_id)


async def create_policy(db: AsyncSession, data: GuardrailPolicyCreate) -> GuardrailPolicy:
    policy = GuardrailPolicy(
        id=str(uuid.uuid4()),
        name=data.name,
        description=data.description,
        agent_id=data.agent_id,
        max_cost_per_run=data.max_cost_per_run,
        max_cost_per_day=data.max_cost_per_day,
        max_tokens_per_message=data.max_tokens_per_message,
        tool_allowlist=data.tool_allowlist,
        tool_denylist=data.tool_denylist,
        require_approval_for=data.require_approval_for,
        max_run_duration_seconds=data.max_run_duration_seconds,
        block_patterns=data.block_patterns,
        redact_patterns=data.redact_patterns,
        allowed_hours=data.allowed_hours,
        allowed_days=data.allowed_days,
        enabled=data.enabled,
    )
    db.add(policy)
    await db.commit()
    await db.refresh(policy)
    return policy


async def update_policy(
    db: AsyncSession, policy_id: str, data: GuardrailPolicyUpdate
) -> GuardrailPolicy | None:
    policy = await db.get(GuardrailPolicy, policy_id)
    if not policy:
        return None

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(policy, field, value)

    await db.commit()
    await db.refresh(policy)
    return policy


async def delete_policy(db: AsyncSession, policy_id: str) -> bool:
    policy = await db.get(GuardrailPolicy, policy_id)
    if not policy:
        return False
    await db.delete(policy)
    await db.commit()
    return True


# ── Policy evaluation ────────────────────────────────────────────────


class GuardrailViolation:
    """A guardrail policy violation."""

    def __init__(self, policy_id: str, rule: str, message: str, action: str = "blocked"):
        self.policy_id = policy_id
        self.rule = rule
        self.message = message
        self.action = action  # blocked | warned | redacted


async def check_pre_action(
    db: AsyncSession,
    *,
    agent_id: str,
    tool_name: str | None = None,
    estimated_cost: float | None = None,
) -> list[GuardrailViolation]:
    """Check guardrails before an action executes. Returns violations."""
    violations: list[GuardrailViolation] = []

    # Get policies for this agent + global policies
    stmt = select(GuardrailPolicy).where(
        GuardrailPolicy.enabled == True,
        (GuardrailPolicy.agent_id == agent_id) | (GuardrailPolicy.agent_id == None),
    )
    result = await db.execute(stmt)
    policies = list(result.scalars().all())

    for policy in policies:
        # Tool denylist check
        if tool_name and policy.tool_denylist and tool_name in policy.tool_denylist:
            violations.append(GuardrailViolation(
                policy_id=policy.id,
                rule="tool_denylist",
                message=f"Tool '{tool_name}' is blocked by policy '{policy.name}'",
            ))

        # Tool allowlist check
        if tool_name and policy.tool_allowlist and tool_name not in policy.tool_allowlist:
            violations.append(GuardrailViolation(
                policy_id=policy.id,
                rule="tool_allowlist",
                message=f"Tool '{tool_name}' is not in allowlist for policy '{policy.name}'",
            ))

        # Cost limit check
        if estimated_cost and policy.max_cost_per_run and estimated_cost > policy.max_cost_per_run:
            violations.append(GuardrailViolation(
                policy_id=policy.id,
                rule="max_cost_per_run",
                message=f"Estimated cost ${estimated_cost:.4f} exceeds limit ${policy.max_cost_per_run:.4f}",
            ))

        # Approval-required check
        if tool_name and policy.require_approval_for and tool_name in policy.require_approval_for:
            violations.append(GuardrailViolation(
                policy_id=policy.id,
                rule="require_approval",
                message=f"Tool '{tool_name}' requires human approval",
                action="approval_required",
            ))

    return violations


def redact_content(content: str, patterns: list[str]) -> str:
    """Redact sensitive patterns from content."""
    result = content
    for pattern in patterns:
        try:
            result = re.sub(pattern, "[REDACTED]", result)
        except re.error:
            logger.warning("Invalid redact pattern: %s", pattern)
    return result
