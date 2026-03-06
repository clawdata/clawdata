"""Model status, catalog, and default-model management."""

from __future__ import annotations

import json
import logging

from app.schemas.lifecycle import (
    ActionResult,
    GatewayState,
    ModelCatalogEntry,
    ModelCatalogResponse,
    ModelsStatusResponse,
)

from ._config import _read_config, _write_config
from ._helpers import _run, _which

logger = logging.getLogger(__name__)


async def get_models_status() -> ModelsStatusResponse:
    """Run ``openclaw models status`` to get current model config."""
    oc_path = _which("openclaw")
    if not oc_path:
        return ModelsStatusResponse(output="OpenClaw is not installed.")

    rc, out, err = await _run(["openclaw", "models", "status"], timeout=15)
    combined = f"{out}\n{err}".strip()

    current = None
    image = None
    fallbacks: list[str] = []
    for line in combined.splitlines():
        stripped = line.strip()
        low = stripped.lower()
        if current is None and (
            low.startswith("primary") or low.startswith("default")
        ):
            parts = stripped.split(":", 1)
            if len(parts) == 2:
                val = parts[1].strip()
                if val and val != "-":
                    current = val
        elif low.startswith("image model"):
            parts = stripped.split(":", 1)
            if len(parts) == 2:
                val = parts[1].strip()
                if val and val != "-":
                    image = val
        elif low.startswith("fallbacks"):
            parts = stripped.split(":", 1)
            if len(parts) == 2:
                val = parts[1].strip()
                if val and val != "-":
                    fallbacks = [f.strip() for f in val.split(",") if f.strip()]

    if not current:
        cfg = _read_config()
        current = (
            cfg.get("agents", {}).get("defaults", {}).get("model") or {}
        ).get("primary")

    return ModelsStatusResponse(
        current_model=current,
        image_model=image,
        fallbacks=fallbacks or [],
        output=combined,
    )


async def set_default_model(model: str) -> ActionResult:
    """Set the default model via gateway config.patch, CLI, or direct config edit."""
    from ._gateway import get_gateway_status

    # Strategy 1: gateway WS API patch
    gw = await get_gateway_status()
    if gw.state == GatewayState.RUNNING:
        try:
            from app.adapters.openclaw import openclaw as oc_adapter

            await oc_adapter.connect()
            patch = json.dumps(
                {"agents": {"defaults": {"model": {"primary": model}}}}
            )
            await oc_adapter.config_patch(
                patch, note=f"Set default model to {model}"
            )
            logger.info("Model set to %s via gateway config.patch", model)
            return ActionResult(
                success=True, message=f"Default model set to {model}"
            )
        except Exception as exc:
            logger.warning("Gateway config.patch failed, trying CLI: %s", exc)

    # Strategy 2: CLI
    oc_path = _which("openclaw")
    if oc_path:
        rc, out, err = await _run(
            ["openclaw", "models", "set", model], timeout=15
        )
        combined = f"{out}\n{err}".strip()
        if rc == 0:
            return ActionResult(
                success=True,
                message=f"Default model set to {model}",
                output=combined,
            )
        logger.warning(
            "openclaw models set failed (exit %d): %s", rc, combined
        )

    # Strategy 3: direct config write
    try:
        config = _read_config()
        agents = config.setdefault("agents", {})
        defaults = agents.setdefault("defaults", {})
        model_cfg = defaults.setdefault("model", {})
        model_cfg["primary"] = model
        config.pop("model", None)
        _write_config(config)
        return ActionResult(
            success=True,
            message=f"Default model set to {model} (via config)",
        )
    except Exception as exc:
        return ActionResult(
            success=False, message=f"Failed to set model: {exc}"
        )


# ── Model catalog cache ──────────────────────────────────────────────

_model_catalog_cache: ModelCatalogResponse | None = None
_model_catalog_ts: float = 0.0
_MODEL_CATALOG_TTL = 300  # 5 min cache


async def get_models_catalog() -> ModelCatalogResponse:
    """Return the full model catalog from ``openclaw models list --all --json``.

    Results are cached for 5 minutes.
    """
    import time

    global _model_catalog_cache, _model_catalog_ts

    now = time.monotonic()
    if _model_catalog_cache and (now - _model_catalog_ts) < _MODEL_CATALOG_TTL:
        return _model_catalog_cache

    oc_path = _which("openclaw")
    if not oc_path:
        return ModelCatalogResponse(count=0, models=[])

    rc, out, err = await _run(
        ["openclaw", "models", "list", "--all", "--json"], timeout=30
    )
    if rc != 0:
        logger.warning("openclaw models list failed (exit %d): %s", rc, err)
        return ModelCatalogResponse(count=0, models=[])

    try:
        import json as _json

        data = _json.loads(out)
        entries = [
            ModelCatalogEntry(
                key=m["key"],
                name=m.get("name", ""),
                input=m.get("input", "text"),
                context_window=m.get("contextWindow", 0),
                local=m.get("local", False),
                available=m.get("available", False),
                tags=m.get("tags", []),
            )
            for m in data.get("models", [])
        ]
        result = ModelCatalogResponse(count=len(entries), models=entries)
        _model_catalog_cache = result
        _model_catalog_ts = now
        return result
    except Exception as exc:
        logger.error("Failed to parse model catalog: %s", exc)
        return ModelCatalogResponse(count=0, models=[])
