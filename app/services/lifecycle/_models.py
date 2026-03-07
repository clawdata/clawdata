"""Model status and catalog — read-only.

v2: No model mutation. Users manage models via `openclaw config`.
"""

from __future__ import annotations

import json
import logging

from app.services.lifecycle._helpers import OPENCLAW_HOME, _run

logger = logging.getLogger(__name__)


async def get_models_status() -> dict:
    """Get current model configuration from config file."""
    config_path = OPENCLAW_HOME / "openclaw.json"
    if not config_path.exists():
        return {"current_model": None, "image_model": None, "fallbacks": [], "output": ""}

    try:
        cfg = json.loads(config_path.read_text())
        agents = cfg.get("agents", {})
        defaults = agents.get("defaults", {})
        model_cfg = defaults.get("model", {})
        return {
            "current_model": model_cfg.get("primary"),
            "image_model": model_cfg.get("image"),
            "fallbacks": model_cfg.get("fallbacks", []),
            "output": "",
        }
    except Exception as exc:
        return {"current_model": None, "image_model": None, "fallbacks": [], "output": str(exc)}


async def get_models_catalog() -> dict:
    """Get the full model catalog from `openclaw models list --all --json`."""
    try:
        rc, out, err = await _run(["openclaw", "models", "list", "--all", "--json"], timeout=15)
        if rc != 0:
            return {"count": 0, "models": []}
        data = json.loads(out)
        models = data if isinstance(data, list) else data.get("models", [])
        return {"count": len(models), "models": models}
    except Exception as exc:
        logger.warning("Failed to get model catalog: %s", exc)
        return {"count": 0, "models": []}
