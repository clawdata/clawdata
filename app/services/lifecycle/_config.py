"""OpenClaw config — read-only access to ~/.openclaw/openclaw.json."""

from __future__ import annotations

import json
import logging

from app.services.lifecycle._helpers import OPENCLAW_CONFIG

logger = logging.getLogger(__name__)


def _read_config() -> dict:
    """Read and parse ~/.openclaw/openclaw.json. Returns {} on failure."""
    if not OPENCLAW_CONFIG.exists():
        return {}
    try:
        return json.loads(OPENCLAW_CONFIG.read_text())
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("Failed to read openclaw config: %s", exc)
        return {}


async def get_config() -> dict:
    """Return config metadata for display."""
    cfg = _read_config()
    return {
        "path": str(OPENCLAW_CONFIG),
        "exists": OPENCLAW_CONFIG.exists(),
        "config": cfg,
    }
