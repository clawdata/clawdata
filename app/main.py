"""FastAPI application entrypoint."""

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import init_db
from app.routers import agents, approvals, behaviour, chat, lifecycle, secrets, skills, templates
from app.services import openclaw_lifecycle

from app.services.openclaw_lifecycle import GatewayState

# ── Logging setup ────────────────────────────────────────────────────
_log_level = os.environ.get("CLAWDATA_LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=_log_level,
    format="%(asctime)s %(levelname)-8s [%(name)s] %(message)s",
    datefmt="%H:%M:%S",
)
# Always show chat-service debug messages so we can trace delegation events
logging.getLogger("app.services.chat_service").setLevel(logging.DEBUG)
logging.getLogger("app.adapters.openclaw").setLevel(logging.DEBUG)

logger = logging.getLogger(__name__)


async def _post_start_bootstrap():
    """After gateway starts: sync auth keys, set agent identity, point workspace, sync skills."""
    from app.adapters.openclaw import openclaw
    from app.services.agent_service import agent_workspace, sync_all_project_skills

    # Give gateway a moment to finish internal init
    await asyncio.sleep(2)

    # Sync any API keys from .env into gateway auth files BEFORE touching agents
    try:
        openclaw_lifecycle._sync_env_to_agent_auth()
        logger.info("Synced .env API keys to gateway agent auth files")
    except Exception as exc:
        logger.warning("Failed to sync env keys to auth files: %s", exc)

    try:
        await openclaw.connect()
        raw = await openclaw.list_agents()
        main_key = raw.get("mainKey", "main")

        # Point gateway's main agent at our userdata workspace & set name
        main_ws = str(agent_workspace("main").resolve())
        logger.info("Setting main agent workspace → %s", main_ws)
        await openclaw.update_agent(
            agent_id=main_key,
            name="ClawData",
            workspace=main_ws,
        )

        # Sync project skills into agent workspace (creates symlinks)
        synced = sync_all_project_skills()
        if synced:
            for aid, slugs in synced.items():
                if slugs:
                    logger.info("Synced %d project skills to agent '%s': %s", len(slugs), aid, slugs)

        # Also sync skills into the OpenClaw agent directory (gateway looks here)
        from app.services.agent_service import _sync_project_skills_to_workspace
        oc_agent_dir = Path.home() / ".openclaw" / "agents" / "main"
        oc_agent_dir.mkdir(parents=True, exist_ok=True)
        _sync_project_skills_to_workspace(oc_agent_dir)
        logger.info("Synced project skills to OpenClaw agent dir: %s", oc_agent_dir / "skills")

        # Set default model if none is configured yet
        try:
            ms = await openclaw_lifecycle.get_models_status()
            if not ms.current_model:
                logger.info("No default model set — configuring openai/gpt-4.1-mini")
                await openclaw_lifecycle.set_default_model("openai/gpt-4.1-mini")
        except Exception as exc:
            logger.warning("Failed to set default model: %s", exc)

        logger.info("Post-start bootstrap complete")
    except Exception as exc:
        logger.warning("Post-start bootstrap failed (non-fatal): %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_db()

    # ── Sync disk templates into DB ──────────────────────────────
    try:
        from app.database import async_session
        from app.services.template_service import sync_templates_from_disk
        async with async_session() as session:
            result = await sync_templates_from_disk(session)
            if result["created"] or result["updated"]:
                logger.info("Template sync: %d created, %d updated",
                            len(result["created"]), len(result["updated"]))
    except Exception as exc:
        logger.warning("Template disk sync failed (non-fatal): %s", exc)

    # ── OpenClaw bootstrap ───────────────────────────────────────
    # 1. Check if openclaw binary exists
    prereqs = await openclaw_lifecycle.check_prerequisites()
    if not prereqs.openclaw.installed:
        if settings.openclaw_auto_install:
            logger.info("OpenClaw not found — auto-installing …")
            from app.schemas.lifecycle import InstallRequest
            r = await openclaw_lifecycle.install_openclaw(InstallRequest())
            if r.success:
                logger.info("OpenClaw installed: %s", r.message)
            else:
                logger.warning("OpenClaw auto-install failed: %s", r.message)
        else:
            logger.info("OpenClaw not installed. Skipping gateway startup.")
    
    # 2. If installed, ensure onboarded (config exists & is clean)
    import json as _json
    config_path = Path.home() / ".openclaw" / "openclaw.json"
    oc_path = openclaw_lifecycle._which("openclaw")
    if oc_path and not config_path.exists():
        logger.info("OpenClaw config not found — creating minimal config …")
        config_path.parent.mkdir(parents=True, exist_ok=True)
        # Get openclaw version for meta section
        _oc_version = None
        try:
            _, _v_out, _ = await openclaw_lifecycle._run(["openclaw", "--version"], timeout=5)
            _oc_version = _v_out.strip() or None
        except Exception:
            pass
        _now = __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat()
        minimal_config: dict = {
            "meta": {
                "lastTouchedVersion": _oc_version or "unknown",
                "lastTouchedAt": _now,
            },
            "gateway": {"mode": "local"},
            "agents": {
                "defaults": {"model": {"primary": "openai/gpt-4.1-mini"}},
            },
        }
        config_path.write_text(_json.dumps(minimal_config, indent=2) + "\n")
        (Path.home() / ".openclaw" / "workspace").mkdir(parents=True, exist_ok=True)
        logger.info("Created %s", config_path)
    elif oc_path and config_path.exists():
        # Clean up invalid root-level keys & ensure required keys exist
        _INVALID_ROOT_KEYS = {"mode", "workspace", "riskAccepted", "model"}
        try:
            cfg = _json.loads(config_path.read_text())
            changed = False
            # Remove bad root-level keys from older versions
            bad_keys = _INVALID_ROOT_KEYS & set(cfg.keys())
            if bad_keys:
                logger.info("Removing invalid root-level config keys: %s", bad_keys)
                for k in bad_keys:
                    cfg.pop(k, None)
                changed = True
            # Ensure meta section exists
            if "meta" not in cfg:
                _oc_version = None
                try:
                    _, _v_out, _ = await openclaw_lifecycle._run(["openclaw", "--version"], timeout=5)
                    _oc_version = _v_out.strip() or None
                except Exception:
                    pass
                _now = __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat()
                cfg["meta"] = {
                    "lastTouchedVersion": _oc_version or "unknown",
                    "lastTouchedAt": _now,
                }
                changed = True
            # Ensure gateway.mode=local is set (required for gateway start)
            gw_cfg = cfg.setdefault("gateway", {})
            if gw_cfg.get("mode") != "local":
                logger.info("Setting gateway.mode=local in config")
                gw_cfg["mode"] = "local"
                changed = True
            # Remove invalid agents.main key if present
            agents_cfg = cfg.get("agents", {})
            if "main" in agents_cfg:
                del agents_cfg["main"]
                changed = True
            if changed:
                config_path.write_text(_json.dumps(cfg, indent=2) + "\n")
        except Exception as exc:
            logger.warning("Failed to clean config: %s", exc)
    
    # 3. Auto-start gateway if configured
    if settings.openclaw_auto_start and oc_path:
        status = await openclaw_lifecycle.get_gateway_status()
        if status.state == GatewayState.RUNNING:
            logger.info("OpenClaw gateway already running (port %d).", status.port)
        elif status.state != GatewayState.NOT_INSTALLED:
            # Force-stop any stale gateway state (PID files from previous runs)
            logger.info("Cleaning up stale gateway state …")
            await openclaw_lifecycle.stop_gateway()
            # Also remove stale PID / lock files that may confuse status checks
            for stale in (Path.home() / ".openclaw").glob("*.pid"):
                logger.info("Removing stale PID file: %s", stale)
                stale.unlink(missing_ok=True)
            for stale in (Path.home() / ".openclaw").glob("*.lock"):
                logger.info("Removing stale lock file: %s", stale)
                stale.unlink(missing_ok=True)
            await asyncio.sleep(1)  # let OS release port

            logger.info("Auto-starting OpenClaw gateway …")
            from app.schemas.lifecycle import GatewayStartRequest
            result = await openclaw_lifecycle.start_gateway(
                GatewayStartRequest(port=settings.openclaw_gateway_port, force=True)
            )
            if result.success:
                logger.info("OpenClaw gateway started: %s", result.message)
            else:
                logger.warning("OpenClaw gateway auto-start failed: %s", result.message)
                if result.output:
                    logger.warning("Gateway log output:\n%s", result.output)

    # 4. Post-start: configure agent identity + sync project skills
    if settings.openclaw_auto_start and oc_path:
        gw = await openclaw_lifecycle.get_gateway_status()
        if gw.state == GatewayState.RUNNING:
            await _post_start_bootstrap()

    yield

    # Shutdown — optionally stop the gateway
    if settings.openclaw_auto_stop:
        logger.info("Stopping OpenClaw gateway …")
        await openclaw_lifecycle.stop_gateway()


app = FastAPI(
    title="ClawData",
    description="Data engineering assistant powered by OpenClaw",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Next.js dev
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers
app.include_router(lifecycle.router, prefix="/api/openclaw", tags=["openclaw"])
app.include_router(agents.router, prefix="/api/agents", tags=["agents"])
app.include_router(skills.router, prefix="/api/skills", tags=["skills"])
app.include_router(templates.router, prefix="/api/templates", tags=["templates"])
app.include_router(behaviour.router, prefix="/api/behaviour", tags=["behaviour"])
app.include_router(approvals.router, prefix="/api/approvals", tags=["approvals"])
app.include_router(secrets.router, prefix="/api/secrets", tags=["secrets"])
app.include_router(chat.router, prefix="/api/chat", tags=["chat"])


@app.get("/health")
async def health():
    gw = await openclaw_lifecycle.get_gateway_status()
    return {
        "status": "ok",
        "service": "clawdata",
        "openclaw": {
            "state": gw.state.value,
            "port": gw.port,
            "version": gw.version,
        },
    }
