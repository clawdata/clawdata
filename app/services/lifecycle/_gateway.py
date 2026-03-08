"""Gateway health, status, and log retrieval — read-only.

v2: No install/start/stop/restart. User manages the gateway externally.
"""

from __future__ import annotations

import logging
from enum import StrEnum
from pathlib import Path

from app.services.lifecycle._helpers import OPENCLAW_HOME, OPENCLAW_CONFIG, _run

logger = logging.getLogger(__name__)


class GatewayState(StrEnum):
    UNKNOWN = "unknown"
    NOT_INSTALLED = "not_installed"
    STOPPED = "stopped"
    RUNNING = "running"
    ERROR = "error"


async def _is_gateway_listening(port: int = 18789) -> bool:
    """Quick TCP probe — does NOT depend on the WS adapter."""
    import socket

    try:
        with socket.create_connection(("127.0.0.1", port), timeout=2):
            return True
    except OSError:
        return False


async def get_gateway_status() -> dict:
    """Check if the gateway is reachable and report its state.

    Uses a raw TCP socket probe so it works even when the WS adapter
    has a stale connection (e.g. after a gateway restart outside our control).
    """
    if await _is_gateway_listening():
        # Try to get version via the adapter, but don't fail if WS is stale
        version = None
        try:
            from app.adapters.openclaw import openclaw
            health = await openclaw.get_health()
            version = health.get("version")
        except Exception:
            pass
        return {
            "state": GatewayState.RUNNING,
            "port": 18789,
            "version": version,
            "pid": None,
            "uptime_seconds": None,
            "error": None,
        }
    return {
        "state": GatewayState.STOPPED,
        "port": 18789,
        "version": None,
        "pid": None,
        "uptime_seconds": None,
        "error": "Gateway not reachable",
    }


async def get_health() -> dict:
    """Ask the running gateway for its health snapshot."""
    from app.adapters.openclaw import openclaw

    try:
        raw = await openclaw.get_health()
        return {"healthy": True, "raw": raw, "error": None}
    except Exception as exc:
        return {"healthy": False, "raw": {}, "error": str(exc)}


async def _check_command(cmd: str) -> dict:
    """Run ``<cmd> --version`` and return install info."""
    import shutil

    path = shutil.which(cmd)
    if not path:
        return {"installed": False, "version": None, "path": None}
    try:
        rc, out, _ = await _run([cmd, "--version"], timeout=5)
        version = out.strip().split()[-1] if rc == 0 and out.strip() else None
        # node --version gives "v22.x.x", strip the leading v
        if version and version.startswith("v"):
            version = version[1:]
        return {"installed": True, "version": version, "path": path}
    except Exception:
        return {"installed": True, "version": None, "path": path}


async def get_full_status() -> dict:
    """Return the ``FullStatus`` payload the frontend setup wizard expects.

    Checks Node.js, npm, openclaw CLI prerequisites and gateway state.
    """
    import json as _json
    from datetime import datetime, timezone

    # Prerequisites
    node_info = await _check_command("node")
    node_ver = node_info.get("version") or ""
    node_major = 0
    try:
        node_major = int(node_ver.split(".")[0])
    except (ValueError, IndexError):
        pass
    node_status = {
        **node_info,
        "meets_minimum": node_major >= 22,
        "minimum_version": "22.0.0",
    }

    npm_status = await _check_command("npm")
    oc_info = await _check_command("openclaw")
    openclaw_status = {
        **oc_info,
        "latest_version": None,
        "update_available": False,
    }

    prereqs_ready = (
        node_status["meets_minimum"]
        and npm_status["installed"]
        and openclaw_status["installed"]
    )

    # Gateway
    gw = await get_gateway_status()

    # Config / workspace
    config_path = str(OPENCLAW_CONFIG) if OPENCLAW_CONFIG.exists() else None
    workspace_path = None
    if config_path:
        try:
            cfg = _json.loads(OPENCLAW_CONFIG.read_text())
            ws = cfg.get("agents", {}).get("defaults", {}).get("workspace", "")
            if ws:
                workspace_path = ws
        except Exception:
            pass
    if not workspace_path:
        workspace_path = str(OPENCLAW_HOME / "workspace")

    return {
        "prerequisites": {
            "node": node_status,
            "npm": npm_status,
            "openclaw": openclaw_status,
            "ready": prereqs_ready,
        },
        "gateway": gw,
        "config_path": config_path,
        "workspace_path": workspace_path,
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }


async def get_logs(*, lines: int = 100) -> str:
    """Return recent gateway log lines.

    OpenClaw stores structured JSON logs at /tmp/openclaw/openclaw-YYYY-MM-DD.log
    Falls back to ~/.openclaw/gateway.log for older versions.
    """
    from datetime import datetime as _dt, timedelta

    # Try /tmp/openclaw/ first (modern OpenClaw)
    tmp_log_dir = Path("/tmp/openclaw")
    if tmp_log_dir.is_dir():
        # Get today's + yesterday's log files (most recent first)
        today = _dt.now().strftime("%Y-%m-%d")
        yesterday = (_dt.now() - timedelta(days=1)).strftime("%Y-%m-%d")
        candidates = [
            tmp_log_dir / f"openclaw-{today}.log",
            tmp_log_dir / f"openclaw-{yesterday}.log",
        ]
        # Also check for any log files sorted by mtime
        all_logs = sorted(tmp_log_dir.glob("openclaw-*.log"), key=lambda p: p.stat().st_mtime, reverse=True)
        for f in all_logs:
            if f not in candidates:
                candidates.append(f)

        for log_file in candidates:
            if log_file.exists() and log_file.stat().st_size > 0:
                try:
                    rc, out, _ = await _run(["tail", f"-{lines}", str(log_file)], timeout=10)
                    if rc == 0 and out.strip():
                        return out
                except Exception:
                    continue

    # Fallback: legacy ~/.openclaw/gateway.log
    legacy = OPENCLAW_HOME / "gateway.log"
    if legacy.exists():
        try:
            rc, out, _ = await _run(["tail", f"-{lines}", str(legacy)], timeout=5)
            return out if rc == 0 else "(failed to read logs)"
        except Exception:
            return "(failed to read logs)"

    return "(no log file found — gateway may not have started yet)"


async def check_onboarding() -> dict:
    """Quick check: is the gateway reachable and configured?

    Validates:
    - openclaw.json exists and is parseable
    - workspace path from config exists on disk
    - sessions directory exists for default agent
    - API keys are configured
    - gateway is reachable
    """
    import json as _json

    config_path = OPENCLAW_HOME / "openclaw.json"
    env_path = OPENCLAW_HOME / ".env"

    config_exists = config_path.exists()
    config_valid = False
    workspace_path = OPENCLAW_HOME / "workspace"
    workspace_exists = False
    sessions_ok = False
    issues: list[str] = []

    if config_exists:
        try:
            cfg = _json.loads(config_path.read_text())
            config_valid = True

            # Resolve workspace from config — agents.defaults.workspace
            ws = cfg.get("agents", {}).get("defaults", {}).get("workspace", "")
            if ws:
                workspace_path = Path(ws)
            workspace_exists = workspace_path.is_dir()
            if not workspace_exists:
                issues.append(f"Workspace not found: {workspace_path}")

            # Check sessions directory for default agent
            sessions_dir = OPENCLAW_HOME / "agents" / "main" / "sessions"
            sessions_ok = sessions_dir.is_dir()
            if not sessions_ok:
                issues.append(f"Sessions directory missing: {sessions_dir}")

        except (_json.JSONDecodeError, OSError) as exc:
            issues.append(f"Config parse error: {exc}")
    else:
        issues.append("openclaw.json not found — run: openclaw configure")

    # Check if any API keys are configured
    any_api_key = False
    if env_path.exists():
        content = env_path.read_text()
        any_api_key = bool(content.strip())
    if not any_api_key:
        issues.append("No API keys configured in ~/.openclaw/.env")

    status = await get_gateway_status()
    gateway_running = status.get("state") == GatewayState.RUNNING
    if not gateway_running:
        issues.append("Gateway not running — run: openclaw gateway")

    return {
        "config_exists": config_exists,
        "config_valid": config_valid,
        "workspace_exists": workspace_exists,
        "workspace_path": str(workspace_path),
        "sessions_ok": sessions_ok,
        "gateway_token_set": bool(status.get("version")),
        "any_channel_configured": any_api_key,
        "any_api_key_configured": any_api_key,
        "gateway_running": gateway_running,
        "onboarded": config_exists and config_valid and workspace_exists and gateway_running,
        "issues": issues,
    }
