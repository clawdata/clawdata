"""Prerequisite checks, gateway lifecycle (start/stop/restart), health & doctor."""

from __future__ import annotations

import asyncio
import json
import logging
import os
from pathlib import Path

from app.config import settings
from app.schemas.lifecycle import (
    ActionResult,
    DoctorResult,
    FullStatus,
    GatewayStartRequest,
    GatewayState,
    GatewayStatus,
    HealthResult,
    InstallRequest,
    InstallResult,
    NodeStatus,
    NpmStatus,
    OnboardingStatus,
    OpenClawPackage,
    PrerequisiteStatus,
    UninstallResult,
    UpdateRequest,
    UpdateResult,
)

from ._config import _read_config
from ._helpers import (
    OPENCLAW_CONFIG,
    OPENCLAW_HOME,
    OPENCLAW_WORKSPACE,
    NODE_MIN_MAJOR,
    _check_port,
    _load_openclaw_env,
    _parse_version,
    _run,
    _version_gte,
    _which,
)
from ._providers import _PROVIDERS, _read_env_file

logger = logging.getLogger(__name__)


# ── Prerequisite checks ─────────────────────────────────────────────


async def check_node() -> NodeStatus:
    path = _which("node")
    if not path:
        return NodeStatus()

    rc, out, _ = await _run(["node", "--version"])
    version = _parse_version(out) if rc == 0 else None
    meets = _version_gte(version, f"{NODE_MIN_MAJOR}.0.0") if version else False
    return NodeStatus(installed=True, version=version, path=path, meets_minimum=meets)


async def check_npm() -> NpmStatus:
    path = _which("npm")
    if not path:
        return NpmStatus()

    rc, out, _ = await _run(["npm", "--version"])
    version = _parse_version(out) if rc == 0 else None
    return NpmStatus(installed=True, version=version, path=path)


async def check_openclaw_package() -> OpenClawPackage:
    path = _which("openclaw")
    if not path:
        return OpenClawPackage()

    # Installed version
    rc, out, _ = await _run(["openclaw", "--version"])
    version = _parse_version(out) if rc == 0 else None

    # Latest version on npm
    rc2, out2, _ = await _run(["npm", "view", "openclaw", "version"], timeout=15)
    latest = _parse_version(out2) if rc2 == 0 else None

    update = False
    if version and latest:
        update = not _version_gte(version, latest)

    return OpenClawPackage(
        installed=True,
        version=version,
        path=path,
        latest_version=latest,
        update_available=update,
    )


async def check_prerequisites() -> PrerequisiteStatus:
    node, npm, oc = await asyncio.gather(
        check_node(), check_npm(), check_openclaw_package(),
    )
    ready = node.meets_minimum and npm.installed and oc.installed
    return PrerequisiteStatus(node=node, npm=npm, openclaw=oc, ready=ready)


# ── Gateway status ──────────────────────────────────────────────────


async def get_gateway_status() -> GatewayStatus:
    """Check if the gateway process is running."""
    oc_path = _which("openclaw")
    if not oc_path:
        return GatewayStatus(state=GatewayState.NOT_INSTALLED)

    rc, out, err = await _run(["openclaw", "gateway", "status", "--json"], timeout=10)

    if rc != 0:
        # Gateway might not be running
        combined = f"{out} {err}".lower()
        if "not running" in combined or "unreachable" in combined or "econnrefused" in combined:
            return GatewayStatus(state=GatewayState.STOPPED, port=settings.openclaw_gateway_port)
        return GatewayStatus(
            state=GatewayState.ERROR,
            error=err or out or "Unknown error",
            port=settings.openclaw_gateway_port,
        )

    # Try to parse JSON output
    port = settings.openclaw_gateway_port
    pid = None
    uptime = None
    version = None
    try:
        data = json.loads(out)
        raw_port = data.get("port", port)
        port = raw_port if isinstance(raw_port, int) else (
            raw_port.get("port", port)
            if isinstance(raw_port, dict) else port
        )
        pid = data.get("pid")
        uptime = data.get("uptimeMs", 0) / 1000 if data.get("uptimeMs") else None
        version = data.get("version")
    except json.JSONDecodeError:
        pass

    # Always verify the gateway is actually listening on the port
    connect_host = "127.0.0.1" if settings.openclaw_gateway_host == "0.0.0.0" else settings.openclaw_gateway_host
    if await _check_port(connect_host, port):
        return GatewayStatus(
            state=GatewayState.RUNNING,
            pid=pid,
            port=port,
            uptime_seconds=uptime,
            version=version,
        )
    else:
        logger.warning("openclaw status reports running but port %d is not reachable", port)
        return GatewayStatus(state=GatewayState.STOPPED, port=port)


# ── Full status ─────────────────────────────────────────────────────


async def get_full_status() -> FullStatus:
    prereqs, gw = await asyncio.gather(check_prerequisites(), get_gateway_status())
    return FullStatus(
        prerequisites=prereqs,
        gateway=gw,
        config_path=str(OPENCLAW_CONFIG) if OPENCLAW_CONFIG.exists() else None,
        workspace_path=str(OPENCLAW_WORKSPACE) if OPENCLAW_WORKSPACE.exists() else None,
    )


# ── Install / Uninstall / Update ────────────────────────────────────


async def install_openclaw(req: InstallRequest) -> InstallResult:
    """Install OpenClaw via npm."""
    import shutil

    node = await check_node()
    if not node.meets_minimum:
        found = f"Found {node.version or 'none'}" if node.installed else "Node.js not found."
        return InstallResult(
            success=False,
            message=f"Node.js >= {NODE_MIN_MAJOR} required. {found}",
        )

    npm_path = _which("npm")
    if not npm_path:
        return InstallResult(success=False, message="npm not found on PATH.")

    pkg = f"openclaw@{req.version}"
    logger.info("Installing %s globally via npm …", pkg)

    rc, out, err = await _run(["npm", "install", "-g", pkg], timeout=300)
    combined = f"{out}\n{err}".strip()

    if rc != 0:
        return InstallResult(
            success=False,
            message=f"npm install failed (exit {rc})",
            output=combined,
        )

    # Verify installation
    oc = await check_openclaw_package()
    if not oc.installed:
        return InstallResult(
            success=False,
            message="Install succeeded but openclaw not found on PATH.",
            output=combined,
        )

    result = InstallResult(
        success=True,
        version_installed=oc.version,
        message=f"OpenClaw {oc.version} installed successfully.",
        output=combined,
    )

    # Optionally install daemon (launchd/systemd)
    if req.install_daemon:
        rc2, out2, err2 = await _run(["openclaw", "gateway", "install"], timeout=30)
        if rc2 != 0:
            result.message += f" (daemon install warning: {err2 or out2})"
        else:
            result.message += " Gateway daemon service installed."

    return result


async def uninstall_openclaw() -> UninstallResult:
    """Uninstall OpenClaw globally via npm."""
    import shutil

    oc = await check_openclaw_package()
    if not oc.installed:
        return UninstallResult(success=False, message="OpenClaw is not already installed.")

    # Stop gateway first if running
    gw = await get_gateway_status()
    if gw.state == GatewayState.RUNNING:
        logger.info("Stopping gateway before uninstall …")
        await stop_gateway()
        await asyncio.sleep(1)

    # Resolve the global node_modules path so we can force-clean on ENOTEMPTY
    _, prefix_out, _ = await _run(["npm", "prefix", "-g"], timeout=10)
    global_modules = Path(prefix_out.strip()) / "lib" / "node_modules" / "openclaw"

    logger.info("Uninstalling OpenClaw globally via npm …")
    rc, out, err = await _run(
        ["npm", "uninstall", "-g", "openclaw", "--force"], timeout=120
    )
    combined = f"{out}\n{err}".strip()

    # npm ENOTEMPTY bug: force-remove the leftover directory and retry once
    if rc != 0 and "ENOTEMPTY" in err:
        logger.warning("Hit npm ENOTEMPTY bug — removing leftover dir and retrying …")
        if global_modules.exists():
            shutil.rmtree(global_modules, ignore_errors=True)
        rc2, out2, err2 = await _run(
            ["npm", "uninstall", "-g", "openclaw", "--force"], timeout=120
        )
        combined += f"\n--- retry after manual cleanup ---\n{out2}\n{err2}".strip()
        rc = rc2

    if rc != 0:
        oc_check = await check_openclaw_package()
        if not oc_check.installed:
            return UninstallResult(
                success=True,
                message="OpenClaw uninstalled (manual cleanup required).",
                output=combined,
            )
        return UninstallResult(
            success=False,
            message=f"npm uninstall failed (exit {rc})",
            output=combined,
        )

    # Verify removal
    oc2 = await check_openclaw_package()
    if oc2.installed:
        return UninstallResult(
            success=False,
            message="Uninstall ran but openclaw is still on PATH.",
            output=combined,
        )

    return UninstallResult(
        success=True,
        message="OpenClaw uninstalled successfully.",
        output=combined,
    )


async def update_openclaw(req: UpdateRequest) -> UpdateResult:
    """Update OpenClaw to latest on the given channel."""
    oc = await check_openclaw_package()
    if not oc.installed:
        return UpdateResult(success=False, message="OpenClaw is not installed.")

    previous = oc.version
    tag = "latest" if req.channel == "stable" else req.channel
    logger.info("Updating OpenClaw to %s …", tag)

    rc, out, err = await _run(["npm", "install", "-g", f"openclaw@{tag}"], timeout=300)
    combined = f"{out}\n{err}".strip()

    if rc != 0:
        return UpdateResult(
            success=False,
            previous_version=previous,
            message=f"Update failed (exit {rc})",
            output=combined,
        )

    oc2 = await check_openclaw_package()
    return UpdateResult(
        success=True,
        previous_version=previous,
        new_version=oc2.version,
        message=f"Updated from {previous} to {oc2.version}.",
        output=combined,
    )


# ── Gateway control ─────────────────────────────────────────────────


async def start_gateway(req: GatewayStartRequest) -> ActionResult:
    """Start the OpenClaw gateway process."""
    oc_path = _which("openclaw")
    if not oc_path:
        return ActionResult(success=False, message="OpenClaw is not installed.")

    cmd = ["openclaw", "gateway", "--port", str(req.port)]
    if req.verbose:
        cmd.append("--verbose")
    if req.force:
        cmd.append("--force")

    env_extra: dict[str, str] = {}
    if settings.openclaw_gateway_token:
        env_extra["OPENCLAW_GATEWAY_TOKEN"] = settings.openclaw_gateway_token

    logger.info("Starting OpenClaw gateway: %s", " ".join(cmd))

    # Start as a background process (detached)
    log_path = Path.home() / ".openclaw" / "gateway.log"
    try:
        env = os.environ.copy()
        env.update(env_extra)

        # Load secrets from ~/.openclaw/.env so the gateway can resolve
        # SecretRefs that point to env vars (e.g. OPENAI_API_KEY)
        env.update(_load_openclaw_env())

        log_path.parent.mkdir(parents=True, exist_ok=True)
        # Truncate log on each start attempt
        log_path.write_text("")
        log_file = open(log_path, "a")
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=log_file,
            stderr=log_file,
            env=env,
            start_new_session=True,  # detach from parent
        )
    except FileNotFoundError:
        return ActionResult(success=False, message="openclaw binary not found on PATH.")

    # Give it a brief moment then check if the process already exited
    await asyncio.sleep(1)
    exit_code = proc.returncode
    if exit_code is not None:
        log_file.close()
        tail = log_path.read_text() if log_path.exists() else ""
        logger.error("Gateway process exited immediately with code %d", exit_code)
        if tail:
            logger.error("Gateway log output:\n%s", tail)
        return ActionResult(
            success=False,
            message=f"Gateway exited immediately (code={exit_code}).",
            output=tail or "No gateway log output captured.",
        )

    # Poll for TCP readiness — gateway may take a few seconds in Docker
    connect_host = "127.0.0.1" if settings.openclaw_gateway_host == "0.0.0.0" else settings.openclaw_gateway_host
    for attempt in range(10):
        await asyncio.sleep(2)
        # Check if process is still alive
        if proc.returncode is not None:
            log_file.close()
            tail = log_path.read_text() if log_path.exists() else ""
            logger.error("Gateway process died (code=%s) on attempt %d", proc.returncode, attempt + 1)
            if tail:
                logger.error("Gateway log output:\n%s", tail)
            return ActionResult(
                success=False,
                message=f"Gateway process died (code={proc.returncode}).",
                output=tail or "No gateway log output captured.",
            )
        # Direct TCP check (bypass status command which may read stale PID files)
        if await _check_port(connect_host, req.port):
            log_file.close()
            # Push skill env vars so tools can use credentials immediately
            try:
                from app.services.chat_service import sync_skill_env_to_gateway
                await sync_skill_env_to_gateway()
            except Exception as exc:
                logger.debug("Post-start skill env sync failed: %s", exc)
            msg = f"Gateway started (pid={proc.pid}, port={req.port})."
            return ActionResult(success=True, message=msg)
        logger.debug("Gateway not yet listening on port %d (attempt %d/10)", req.port, attempt + 1)

    log_file.close()
    # Timed out waiting for the gateway to listen
    tail = log_path.read_text() if log_path.exists() else ""
    if tail:
        logger.error("Gateway failed to start within timeout. Log output:\n%s", tail)
    else:
        logger.error("Gateway failed to start within timeout. No log output captured.")

    return ActionResult(
        success=False,
        message=f"Gateway process spawned (pid={proc.pid}) but port {req.port} never became reachable.",
        output=tail or "No gateway log output captured.",
    )


async def stop_gateway() -> ActionResult:
    """Stop the OpenClaw gateway."""
    oc_path = _which("openclaw")
    if not oc_path:
        return ActionResult(success=False, message="OpenClaw is not installed.")

    rc, out, err = await _run(["openclaw", "gateway", "stop"], timeout=15)
    combined = f"{out}\n{err}".strip()

    if rc == 0:
        return ActionResult(success=True, message="Gateway stopped.", output=combined)
    return ActionResult(success=False, message=f"Stop failed (exit {rc}).", output=combined)


async def restart_gateway() -> ActionResult:
    """Restart the OpenClaw gateway (stop + start to pick up fresh .env)."""
    stop_result = await stop_gateway()
    if not stop_result.success:
        logger.warning("Stop during restart failed: %s — trying start anyway", stop_result.message)

    await asyncio.sleep(1)  # let the port free up

    return await start_gateway(GatewayStartRequest(force=True))


# ── Health & doctor ─────────────────────────────────────────────────


async def get_health() -> HealthResult:
    """Ask the running gateway for a health snapshot."""
    oc_path = _which("openclaw")
    if not oc_path:
        return HealthResult(healthy=False, error="OpenClaw is not installed.")

    rc, out, err = await _run(["openclaw", "health", "--json"], timeout=15)

    if rc != 0:
        return HealthResult(healthy=False, error=err or out or "Health check failed.")

    try:
        data = json.loads(out)
        return HealthResult(healthy=True, raw=data)
    except json.JSONDecodeError:
        err_msg = None if rc == 0 else "Non-JSON response"
        return HealthResult(
            healthy=rc == 0, raw={"stdout": out}, error=err_msg,
        )


async def run_doctor(*, fix: bool = False) -> DoctorResult:
    """Run `openclaw doctor` to diagnose issues."""
    oc_path = _which("openclaw")
    if not oc_path:
        return DoctorResult(success=False, issues=["OpenClaw is not installed."])

    cmd = ["openclaw", "doctor"]
    if fix:
        cmd.append("--fix")

    rc, out, err = await _run(cmd, timeout=60)
    combined = f"{out}\n{err}".strip()

    # Parse issues/fixes from output (best-effort)
    lines = combined.splitlines()
    issues = [
        ln for ln in lines
        if "✗" in ln or "error" in ln.lower() or "warn" in ln.lower()
    ]
    fixes = [
        ln for ln in lines
        if "✓" in ln or "fixed" in ln.lower() or "repaired" in ln.lower()
    ]

    return DoctorResult(success=rc == 0, issues=issues, fixes_applied=fixes, output=combined)


# ── Onboarding ──────────────────────────────────────────────────────


async def check_onboarding() -> OnboardingStatus:
    config_exists = OPENCLAW_CONFIG.exists()
    workspace_exists = OPENCLAW_WORKSPACE.exists()

    config = _read_config() if config_exists else {}
    token_set = bool(
        os.environ.get("OPENCLAW_GATEWAY_TOKEN")
        or config.get("gateway", {}).get("auth", {}).get("token")
    )
    channels = config.get("channels", {})
    any_channel = bool(channels) and any(
        isinstance(v, dict) for v in channels.values()
    )

    # Check if at least one LLM provider API key is configured
    env = _read_env_file()
    shell_env = os.environ
    any_api_key = any(
        bool(env.get(p["env_var"]) or shell_env.get(p["env_var"]))
        for p in _PROVIDERS
        if p["env_var"]
    )

    onboarded = config_exists and workspace_exists and token_set and any_api_key

    return OnboardingStatus(
        config_exists=config_exists,
        workspace_exists=workspace_exists,
        gateway_token_set=token_set,
        any_channel_configured=any_channel,
        any_api_key_configured=any_api_key,
        onboarded=onboarded,
    )


# ── Logs ────────────────────────────────────────────────────────────


async def get_logs(lines: int = 100) -> str:
    """Return recent gateway log lines."""
    oc_path = _which("openclaw")
    if not oc_path:
        return "OpenClaw is not installed."

    rc, out, err = await _run(["openclaw", "logs", "--lines", str(lines)], timeout=10)
    return out or err or "No log output."


# ── Agent-to-agent delegation ───────────────────────────────────────


async def update_agent_to_agent_allow(agent_id: str, linked_ids: list[str]) -> ActionResult:
    """Update per-agent subagents.allowAgents so *agent_id* can delegate to *linked_ids*."""
    from app.adapters.openclaw import openclaw
    from ._config import _write_config

    config = _read_config()

    agents_list = config.get("agents", {}).get("list", [])
    normalized = agent_id.lower()
    found = False
    for entry in agents_list:
        if (entry.get("id") or "").lower() == normalized:
            if linked_ids:
                entry.setdefault("subagents", {})["allowAgents"] = linked_ids
            else:
                sub = entry.get("subagents", {})
                sub.pop("allowAgents", None)
                if not sub:
                    entry.pop("subagents", None)
            found = True
            break

    if not found:
        return ActionResult(success=False, message=f"Agent '{agent_id}' not found in config")

    tools = config.get("tools", {})
    if linked_ids:
        tools["agentToAgent"] = {"enabled": True, "allow": linked_ids}
        tools.setdefault("sessions", {})["visibility"] = "all"
    else:
        tools.pop("agentToAgent", None)
    if tools:
        config["tools"] = tools
    else:
        config.pop("tools", None)

    try:
        _write_config(config)
    except OSError as exc:
        return ActionResult(success=False, message=f"Failed to write config: {exc}")

    # Hot-reload via gateway config.patch
    try:
        await openclaw.connect()
        patch = {}
        if config.get("agents"):
            patch["agents"] = config["agents"]
        if config.get("tools"):
            patch["tools"] = config["tools"]
        raw = json.dumps(patch)
        await openclaw.config_patch(raw, note="Update agent delegation allow-list")
    except Exception as exc:
        logger.warning("Gateway config.patch failed (config file already updated): %s", exc)

    return ActionResult(
        success=True,
        message=f"Agent-to-agent delegation updated: {linked_ids or 'none'}",
    )
