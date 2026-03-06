"""Gateway bundled/managed skill operations."""

from __future__ import annotations

import json
import logging

from app.schemas.lifecycle import (
    ActionResult,
    OpenClawSkill,
    SkillConfigCheck,
    SkillInstallOption,
    SkillRequirements,
    SkillsStatusResponse,
)

logger = logging.getLogger(__name__)


def _parse_skill(raw: dict) -> OpenClawSkill:
    """Convert a raw gateway skill dict into an OpenClawSkill schema."""

    def _parse_reqs(d: dict | None) -> SkillRequirements:
        if not d:
            return SkillRequirements()
        return SkillRequirements(
            bins=d.get("bins", []),
            any_bins=d.get("anyBins", []),
            env=d.get("env", []),
            config=d.get("config", []),
            os=d.get("os", []),
        )

    return OpenClawSkill(
        name=raw.get("name", ""),
        description=raw.get("description", ""),
        source=raw.get("source", ""),
        bundled=raw.get("bundled", False),
        skill_key=raw.get("skillKey", ""),
        emoji=raw.get("emoji", ""),
        homepage=raw.get("homepage", ""),
        primary_env=raw.get("primaryEnv"),
        always=raw.get("always", False),
        disabled=raw.get("disabled", False),
        blocked_by_allowlist=raw.get("blockedByAllowlist", False),
        eligible=raw.get("eligible", False),
        requirements=_parse_reqs(raw.get("requirements")),
        missing=_parse_reqs(raw.get("missing")),
        config_checks=[
            SkillConfigCheck(path=c.get("path", ""), satisfied=c.get("satisfied", False))
            for c in raw.get("configChecks", [])
        ],
        install=[
            SkillInstallOption(
                id=i.get("id", ""),
                kind=i.get("kind", ""),
                label=i.get("label", ""),
                bins=i.get("bins", []),
            )
            for i in raw.get("install", [])
        ],
    )


async def list_skills(agent_id: str | None = None) -> SkillsStatusResponse:
    """Fetch skills status from the gateway."""
    from app.adapters.openclaw import openclaw

    try:
        await openclaw.connect()
        raw = await openclaw.skills_status(agent_id)
    except Exception as exc:
        logger.warning("Gateway skills.status failed: %s", exc)
        return SkillsStatusResponse()

    skills = [_parse_skill(s) for s in raw.get("skills", [])]
    return SkillsStatusResponse(skills=skills)


async def install_skill(
    *, name: str, install_id: str, timeout_ms: int | None = None
) -> ActionResult:
    """Install a skill binary via the gateway."""
    from app.adapters.openclaw import openclaw

    try:
        await openclaw.connect()
        result = await openclaw.skills_install(
            name=name, install_id=install_id, timeout_ms=timeout_ms,
        )
        msg = result.get("message", f"Skill '{name}' install started")
        return ActionResult(success=True, message=msg, output=json.dumps(result))
    except Exception as exc:
        return ActionResult(success=False, message=str(exc))


async def update_skill(
    skill_key: str,
    *,
    enabled: bool | None = None,
    api_key: str | None = None,
    env: dict[str, str] | None = None,
) -> ActionResult:
    """Update a skill (enable/disable, set API key, env vars)."""
    from app.adapters.openclaw import openclaw

    try:
        await openclaw.connect()
        await openclaw.skills_update(
            skill_key=skill_key, enabled=enabled, api_key=api_key, env=env,
        )
        return ActionResult(success=True, message=f"Skill '{skill_key}' updated")
    except Exception as exc:
        return ActionResult(success=False, message=str(exc))
