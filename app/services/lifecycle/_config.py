"""OpenClaw config file (openclaw.json) management."""

from __future__ import annotations

import json
import logging

from app.schemas.lifecycle import (
    ConfigGetResponse,
    ConfigPatchResponse,
)

from ._helpers import OPENCLAW_CONFIG

logger = logging.getLogger(__name__)


def _read_config() -> dict:
    """Read ~/.openclaw/openclaw.json (JSON5 via json — strict subset)."""
    if not OPENCLAW_CONFIG.exists():
        return {}
    try:
        return json.loads(OPENCLAW_CONFIG.read_text())
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("Failed to read openclaw.json: %s", exc)
        return {}


def _write_config(data: dict) -> None:
    """Write ~/.openclaw/openclaw.json (pretty-printed JSON)."""
    OPENCLAW_CONFIG.parent.mkdir(parents=True, exist_ok=True)
    OPENCLAW_CONFIG.write_text(json.dumps(data, indent=2) + "\n")


def _deep_merge(base: dict, patch: dict) -> dict:
    """Recursively merge patch into base (patch wins on conflicts)."""
    result = base.copy()
    for key, value in patch.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = _deep_merge(result[key], value)
        else:
            result[key] = value
    return result


async def get_config() -> ConfigGetResponse:
    exists = OPENCLAW_CONFIG.exists()
    return ConfigGetResponse(
        path=str(OPENCLAW_CONFIG),
        exists=exists,
        config=_read_config() if exists else {},
    )


async def set_config(config: dict) -> ConfigPatchResponse:
    """Full replace of openclaw.json."""
    try:
        _write_config(config)
        return ConfigPatchResponse(success=True, config=config, message="Config written.")
    except OSError as exc:
        return ConfigPatchResponse(success=False, message=str(exc))


async def patch_config(patch: dict) -> ConfigPatchResponse:
    """Deep-merge patch into existing config."""
    current = _read_config()
    merged = _deep_merge(current, patch)
    try:
        _write_config(merged)
        return ConfigPatchResponse(success=True, config=merged, message="Config patched.")
    except OSError as exc:
        return ConfigPatchResponse(success=False, config=current, message=str(exc))
