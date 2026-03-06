"""Token-usage costing estimation across gateway sessions."""

from __future__ import annotations

import logging

from app.schemas.lifecycle import (
    CostingAgentBreakdown,
    CostingModelBreakdown,
    CostingSessionDetail,
    CostingSummary,
)

logger = logging.getLogger(__name__)

# Pricing per 1M tokens (USD) — input / output
MODEL_PRICING: dict[str, tuple[float, float]] = {
    # OpenAI
    "gpt-4.1": (2.00, 8.00),
    "gpt-4.1-mini": (0.40, 1.60),
    "gpt-4.1-nano": (0.10, 0.40),
    "gpt-4o": (2.50, 10.00),
    "gpt-4o-mini": (0.15, 0.60),
    "gpt-5.1-codex": (2.00, 8.00),
    "o3": (10.00, 40.00),
    "o3-mini": (1.10, 4.40),
    "o4-mini": (1.10, 4.40),
    # Anthropic
    "claude-sonnet-4-20250514": (3.00, 15.00),
    "claude-3.5-sonnet": (3.00, 15.00),
    "claude-3-haiku": (0.25, 1.25),
    "claude-3-opus": (15.00, 75.00),
    # Google
    "gemini-2.5-pro": (1.25, 10.00),
    "gemini-2.5-flash": (0.15, 0.60),
    "gemini-2.0-flash": (0.10, 0.40),
}

_DEFAULT_PRICING = (2.00, 8.00)


def _estimate_cost(
    model: str | None, input_tokens: int, output_tokens: int
) -> float:
    """Estimate USD cost for the given token counts."""
    if not model:
        pricing = _DEFAULT_PRICING
    else:
        pricing = MODEL_PRICING.get(model)
        if pricing is None:
            for key in MODEL_PRICING:
                if model.startswith(key):
                    pricing = MODEL_PRICING[key]
                    break
        if pricing is None:
            pricing = _DEFAULT_PRICING

    input_cost, output_cost = pricing
    return round(
        (input_tokens * input_cost + output_tokens * output_cost) / 1_000_000,
        6,
    )


async def get_costing_summary() -> CostingSummary:
    """Aggregate token usage and estimated costs across all gateway sessions."""
    from app.adapters.openclaw import openclaw

    await openclaw.connect()
    sessions_raw = await openclaw.get_all_sessions_for_costing(limit=500)

    total_input = 0
    total_output = 0
    total_tokens = 0
    total_cost = 0.0

    models: dict[str, CostingModelBreakdown] = {}
    agents: dict[str, CostingAgentBreakdown] = {}
    session_details: list[CostingSessionDetail] = []

    for s in sessions_raw:
        inp = s.get("inputTokens", 0)
        out = s.get("outputTokens", 0)
        tot = s.get("totalTokens", 0)
        model = s.get("model") or "unknown"
        provider = s.get("modelProvider") or "unknown"

        cost = _estimate_cost(model, inp, out)

        total_input += inp
        total_output += out
        total_tokens += tot
        total_cost += cost

        # By model
        model_key = f"{provider}/{model}"
        if model_key not in models:
            models[model_key] = CostingModelBreakdown(
                model=model, provider=provider
            )
        mb = models[model_key]
        mb.input_tokens += inp
        mb.output_tokens += out
        mb.total_tokens += tot
        mb.session_count += 1
        mb.estimated_cost_usd += cost

        # By agent
        key = s.get("key", "")
        parts = key.split(":")
        agent_id = parts[1] if len(parts) > 1 else "unknown"
        if agent_id not in agents:
            agents[agent_id] = CostingAgentBreakdown(agent_id=agent_id)
        ab = agents[agent_id]
        ab.input_tokens += inp
        ab.output_tokens += out
        ab.total_tokens += tot
        ab.session_count += 1
        ab.estimated_cost_usd += cost

        session_details.append(
            CostingSessionDetail(
                session_key=key,
                session_id=s.get("sessionId", ""),
                agent_id=agent_id,
                model=model,
                provider=provider,
                input_tokens=inp,
                output_tokens=out,
                total_tokens=tot,
                estimated_cost_usd=round(cost, 6),
                title=s.get("derivedTitle"),
                updated_at=s.get("updatedAt"),
            )
        )

    for mb in models.values():
        mb.estimated_cost_usd = round(mb.estimated_cost_usd, 6)
    for ab in agents.values():
        ab.estimated_cost_usd = round(ab.estimated_cost_usd, 6)

    session_details.sort(key=lambda x: x.updated_at or 0, reverse=True)

    return CostingSummary(
        total_input_tokens=total_input,
        total_output_tokens=total_output,
        total_tokens=total_tokens,
        total_estimated_cost_usd=round(total_cost, 6),
        session_count=len(sessions_raw),
        by_model=sorted(
            models.values(),
            key=lambda m: m.estimated_cost_usd,
            reverse=True,
        ),
        by_agent=sorted(
            agents.values(),
            key=lambda a: a.estimated_cost_usd,
            reverse=True,
        ),
        sessions=session_details,
    )
