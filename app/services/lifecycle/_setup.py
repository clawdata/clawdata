"""Setup wizard — onboard, write API keys, set model, start gateway."""

from __future__ import annotations

import logging

from app.schemas.lifecycle import (
    GatewayStartRequest,
    GatewayState,
    SetupRequest,
    SetupResult,
)

from ._helpers import OPENCLAW_CONFIG, _which
from ._providers import OPENCLAW_ENV_FILE, _read_env_file, _write_env_file

logger = logging.getLogger(__name__)


async def run_setup(req: SetupRequest) -> SetupResult:
    """Full setup flow: init config, write API keys, set model, start gateway."""
    from ._helpers import _run
    from ._gateway import get_gateway_status, start_gateway
    from ._models import set_default_model

    steps: list[str] = []
    output_parts: list[str] = []

    oc_path = _which("openclaw")
    if not oc_path:
        return SetupResult(
            success=False,
            message="OpenClaw is not installed. Install it first.",
        )

    # Step 1: onboard
    logger.info("Running openclaw onboard --mode %s ...", req.mode)
    rc, out, err = await _run(
        ["openclaw", "onboard", "--non-interactive", "--accept-risk"],
        timeout=30,
    )
    output_parts.append(f"--- setup ---\n{out}\n{err}".strip())
    if rc == 0:
        steps.append("setup")
    else:
        if OPENCLAW_CONFIG.exists():
            logger.warning(
                "openclaw setup exited %d but config exists — continuing", rc
            )
            steps.append("setup (already configured)")
        else:
            logger.error("openclaw setup exited %d and config missing", rc)
            combined = f"{out}\n{err}".strip()
            return SetupResult(
                success=False,
                message=f"Setup failed (exit {rc}): {combined[:200]}",
                output="\n\n".join(output_parts),
                steps_completed=steps,
            )

    # Step 2: Write API keys
    if req.api_keys:
        env = _read_env_file()
        env.update(req.api_keys)
        _write_env_file(env)
        key_names = list(req.api_keys.keys())
        steps.append(f"api_keys ({', '.join(key_names)})")
        output_parts.append(
            f"--- api keys ---\nWrote {len(req.api_keys)} key(s) to {OPENCLAW_ENV_FILE}"
        )

    # Step 3: Set default model
    if req.default_model:
        r = await set_default_model(req.default_model)
        steps.append(f"model ({req.default_model})")
        output_parts.append(f"--- model ---\n{r.message}")

    # Step 4: Start gateway
    if req.start_gateway:
        gw = await get_gateway_status()
        if gw.state != GatewayState.RUNNING:
            r = await start_gateway(GatewayStartRequest())
            steps.append("gateway_start")
            output_parts.append(f"--- gateway ---\n{r.message}")
        else:
            steps.append("gateway_start (already running)")

    return SetupResult(
        success=True,
        message=f"Setup complete — {len(steps)} steps.",
        output="\n\n".join(output_parts),
        steps_completed=steps,
    )
