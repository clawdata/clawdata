"""FastAPI application entrypoint."""

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import init_db
from app.services import openclaw_lifecycle

# ── Logging setup ────────────────────────────────────────────────────
_log_level = os.environ.get("CLAWDATA_LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=_log_level,
    format="%(asctime)s %(levelname)-8s [%(name)s] %(message)s",
    datefmt="%H:%M:%S",
)
logging.getLogger("app.services.chat_service").setLevel(logging.DEBUG)
logging.getLogger("app.adapters.openclaw").setLevel(logging.DEBUG)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ──────────────────────────────────────────────────
    await init_db()

    # Connect to the externally-managed gateway
    from app.adapters.openclaw import openclaw

    try:
        await openclaw.connect()
        logger.info("Connected to OpenClaw gateway")
    except Exception as exc:
        logger.warning("Gateway not reachable (non-fatal): %s", exc)

    # Activate secrets manager (resolve SecretRefs into in-memory snapshot)
    try:
        from app.services.secrets_manager import activate_secrets

        result = await activate_secrets()
        logger.info(
            "Secrets activation: %s (resolved=%d, unresolved=%d)",
            result.state.value,
            result.resolved_count,
            result.unresolved_count,
        )
    except Exception as exc:
        logger.warning("Secrets activation failed (non-fatal): %s", exc)

    # Start job scheduler
    from app.database import async_session
    from app.services.job_scheduler import scheduler

    try:
        await scheduler.start(async_session)
        logger.info("Job scheduler started")
    except Exception as exc:
        logger.warning("Job scheduler failed to start (non-fatal): %s", exc)

    yield

    # ── Shutdown ─────────────────────────────────────────────────
    await scheduler.stop()
    await openclaw.disconnect()


app = FastAPI(
    title="ClawData",
    description="Data engineering assistant — guardrails, audit, and agent orchestration",
    version="2.0.0",
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
from app.routers import agents, approvals, audit, behaviour, chat, connection, guardrails, secrets_manager, skills, tasks, templates

app.include_router(connection.router, prefix="/api/connection", tags=["connection"])
app.include_router(agents.router, prefix="/api/agents", tags=["agents"])
app.include_router(skills.router, prefix="/api/skills", tags=["skills"])
app.include_router(templates.router, prefix="/api/templates", tags=["templates"])
app.include_router(behaviour.router, prefix="/api/behaviour", tags=["behaviour"])
app.include_router(approvals.router, prefix="/api/approvals", tags=["approvals"])
app.include_router(secrets_manager.router, prefix="/api/secrets-manager", tags=["secrets-manager"])
app.include_router(tasks.router, prefix="/api/tasks", tags=["tasks"])
app.include_router(chat.router, prefix="/api/chat", tags=["chat"])
app.include_router(guardrails.router, prefix="/api/guardrails", tags=["guardrails"])
app.include_router(audit.router, prefix="/api/audit", tags=["audit"])


@app.get("/health")
async def health():
    status = await openclaw_lifecycle.get_gateway_status()
    return {
        "status": "ok",
        "service": "clawdata",
        "version": "2.0.0",
        "openclaw": {
            "state": status.get("state", "unknown"),
            "port": status.get("port"),
            "version": status.get("version"),
        },
    }
