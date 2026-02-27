"""OpenClaw lifecycle management — install, configure, start/stop, health.

This service wraps the OpenClaw CLI to give the FastAPI instance full control
over the OpenClaw runtime.  Every public method is async-safe and returns
structured data via the schemas in app.schemas.lifecycle.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import shutil
from pathlib import Path

from app.config import settings
from app.schemas.lifecycle import (
    ActionResult,
    AgentDetail,
    AgentFile,
    AgentFilesResponse,
    ConfigGetResponse,
    ConfigPatchResponse,
    CostingAgentBreakdown,
    CostingModelBreakdown,
    CostingSessionDetail,
    CostingSummary,
    DoctorResult,
    EnvEntry,
    EnvListResponse,
    FullStatus,
    GatewayStartRequest,
    GatewayState,
    GatewayStatus,
    HealthResult,
    InstallRequest,
    InstallResult,
    ModelCatalogEntry,
    ModelCatalogResponse,
    ModelSetRequest,
    ModelsStatusResponse,
    NodeStatus,
    NpmStatus,
    OnboardingStatus,
    OpenClawAgent,
    OpenClawAgentsList,
    OpenClawPackage,
    OpenClawSkill,
    PrerequisiteStatus,
    Provider,
    ProvidersResponse,
    SessionEntry,
    SessionsResponse,
    SetupRequest,
    SetupResult,
    SkillConfigCheck,
    SkillInstallOption,
    SkillRequirements,
    SkillsStatusResponse,
    UninstallResult,
    UpdateRequest,
    UpdateResult,
    WorkspaceSkill,
    WorkspaceSkillsList,
)

logger = logging.getLogger(__name__)

# ── Paths ────────────────────────────────────────────────────────────

OPENCLAW_HOME = Path.home() / ".openclaw"
OPENCLAW_CONFIG = OPENCLAW_HOME / "openclaw.json"
OPENCLAW_WORKSPACE = OPENCLAW_HOME / "workspace"
NODE_MIN_MAJOR = 22


# ── Helpers ──────────────────────────────────────────────────────────


async def _run(
    cmd: list[str],
    *,
    timeout: float = 120.0,
    env_extra: dict | None = None,
) -> tuple[int, str, str]:
    """Run a subprocess and return (returncode, stdout, stderr)."""
    env = os.environ.copy()
    if env_extra:
        env.update(env_extra)

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
        )
        stdout_bytes, stderr_bytes = await asyncio.wait_for(
            proc.communicate(), timeout=timeout,
        )
        return (
            proc.returncode or 0,
            stdout_bytes.decode(errors="replace").strip(),
            stderr_bytes.decode(errors="replace").strip(),
        )
    except FileNotFoundError:
        return (127, "", f"Command not found: {cmd[0]}")
    except TimeoutError:
        proc.kill()  # type: ignore[possibly-undefined]
        return (1, "", f"Command timed out after {timeout}s")


def _parse_version(raw: str) -> str | None:
    """Extract a semver-ish version from a string like 'v22.11.0' or '10.9.2'."""
    m = re.search(r"v?(\d+\.\d+\.\d+)", raw)
    return m.group(1) if m else raw.strip() or None


def _version_gte(version: str, minimum: str) -> bool:
    """True if version >= minimum (simple major.minor.patch comparison)."""
    try:
        v = tuple(int(x) for x in version.split(".")[:3])
        m = tuple(int(x) for x in minimum.split(".")[:3])
        return v >= m
    except (ValueError, AttributeError):
        return False


def _which(name: str) -> str | None:
    return shutil.which(name)


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


# ── Gateway status ───────────────────────────────────────────────────


async def _check_port(host: str, port: int, timeout: float = 2.0) -> bool:
    """Return True if a TCP connection to host:port succeeds."""
    try:
        _, writer = await asyncio.wait_for(
            asyncio.open_connection(host, port), timeout=timeout,
        )
        writer.close()
        await writer.wait_closed()
        return True
    except (ConnectionRefusedError, OSError, TimeoutError):
        return False


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


# ── Full status ──────────────────────────────────────────────────────


async def get_full_status() -> FullStatus:
    prereqs, gw = await asyncio.gather(check_prerequisites(), get_gateway_status())
    return FullStatus(
        prerequisites=prereqs,
        gateway=gw,
        config_path=str(OPENCLAW_CONFIG) if OPENCLAW_CONFIG.exists() else None,
        workspace_path=str(OPENCLAW_WORKSPACE) if OPENCLAW_WORKSPACE.exists() else None,
    )


# ── Install ──────────────────────────────────────────────────────────


async def install_openclaw(req: InstallRequest) -> InstallResult:
    """Install OpenClaw via npm."""
    # Check Node first
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


# ── Uninstall ────────────────────────────────────────────────────


async def uninstall_openclaw() -> UninstallResult:
    """Uninstall OpenClaw globally via npm."""
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
        # One more fallback: if the package dir is already gone the uninstall
        # "fails" but the package is actually removed.
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


# ── Update ───────────────────────────────────────────────────────────


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
    """Restart the OpenClaw gateway."""
    oc_path = _which("openclaw")
    if not oc_path:
        return ActionResult(success=False, message="OpenClaw is not installed.")

    rc, out, err = await _run(["openclaw", "gateway", "restart"], timeout=30)
    combined = f"{out}\n{err}".strip()

    if rc == 0:
        return ActionResult(success=True, message="Gateway restarted.", output=combined)
    return ActionResult(success=False, message=f"Restart failed (exit {rc}).", output=combined)


# ── Health & doctor ──────────────────────────────────────────────────


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


# ── Config management ────────────────────────────────────────────────


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


async def update_agent_to_agent_allow(agent_id: str, linked_ids: list[str]) -> ActionResult:
    """Update per-agent subagents.allowAgents so *agent_id* can delegate to *linked_ids*.

    This patches the agent entry in openclaw.json agents.list[] to set:
        subagents.allowAgents = linked_ids
    And also sets tools.agentToAgent so the tool is available.
    Then hot-reloads the gateway config via config.patch.
    """
    from app.adapters.openclaw import openclaw

    config = _read_config()

    # 1) Update the per-agent entry's subagents.allowAgents
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

    # 2) Also set top-level tools.agentToAgent so the tool is enabled
    tools = config.get("tools", {})
    if linked_ids:
        tools["agentToAgent"] = {"enabled": True, "allow": linked_ids}
        # Allow main agent to read sub-agent session history (announce results)
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

    # Hot-reload via gateway config.patch so gateway picks up changes immediately
    try:
        await openclaw.connect()
        # Patch both the agent entry and tools section
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


# ── Onboarding check ────────────────────────────────────────────────


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


# ── Logs ─────────────────────────────────────────────────────────────


async def get_logs(lines: int = 100) -> str:
    """Return recent gateway log lines."""
    oc_path = _which("openclaw")
    if not oc_path:
        return "OpenClaw is not installed."

    rc, out, err = await _run(["openclaw", "logs", "--lines", str(lines)], timeout=10)
    return out or err or "No log output."


# ── Providers ────────────────────────────────────────────────────────

# Canonical provider list — matches `openclaw onboard` flags
_PROVIDERS: list[dict] = [
    {"id": "openai", "name": "OpenAI", "env_var": "OPENAI_API_KEY",
     "flag": "--openai-api-key",
     "models": [
         "openai/gpt-5.1-codex", "openai/gpt-5.1", "openai/gpt-5.1-mini",
         "openai/gpt-4.1", "openai/gpt-4.1-mini", "openai/gpt-4.1-nano",
         "openai/o3", "openai/o3-mini", "openai/o4-mini",
     ]},
    {"id": "anthropic", "name": "Anthropic", "env_var": "ANTHROPIC_API_KEY",
     "flag": "--anthropic-api-key",
     "models": [
         "anthropic/claude-opus-4-20250514", "anthropic/claude-sonnet-4-20250514",
         "anthropic/claude-haiku-3.5-20241022",
     ]},
    {"id": "google", "name": "Google Gemini", "env_var": "GEMINI_API_KEY",
     "flag": "--gemini-api-key",
     "models": [
         "google/gemini-2.5-pro", "google/gemini-2.5-flash",
         "google/gemini-2.0-flash",
     ]},
    {"id": "mistral", "name": "Mistral", "env_var": "MISTRAL_API_KEY",
     "flag": "--mistral-api-key",
     "models": [
         "mistral/codestral-latest", "mistral/mistral-large-latest",
         "mistral/mistral-medium-latest", "mistral/mistral-small-latest",
     ]},
    {"id": "openrouter", "name": "OpenRouter", "env_var": "OPENROUTER_API_KEY",
     "flag": "--openrouter-api-key",
     "models": ["openrouter/auto"]},
    {"id": "xai", "name": "xAI", "env_var": "XAI_API_KEY",
     "flag": "--xai-api-key",
     "models": ["xai/grok-3", "xai/grok-3-mini", "xai/grok-3-fast"]},
    {"id": "groq", "name": "Groq", "env_var": "GROQ_API_KEY",
     "flag": "",
     "models": ["groq/llama-4-scout-17b", "groq/llama-4-maverick-17b"]},
    {"id": "together", "name": "Together AI", "env_var": "TOGETHER_API_KEY",
     "flag": "--together-api-key",
     "models": ["together/meta-llama/Llama-4-Scout-17B-16E"]},
    {"id": "huggingface", "name": "Hugging Face", "env_var": "HUGGINGFACE_API_KEY",
     "flag": "--huggingface-api-key",
     "models": []},
    {"id": "github-copilot", "name": "GitHub Copilot", "env_var": "",
     "flag": "",
     "models": ["github-copilot/gpt-4.1", "github-copilot/claude-sonnet-4", "github-copilot/o4-mini"]},
]

OPENCLAW_ENV_FILE = OPENCLAW_HOME / ".env"


def _mask_value(val: str) -> str:
    """Mask a secret value for display: show first 4 and last 4 chars."""
    if len(val) <= 12:
        return "****"
    return val[:4] + "****" + val[-4:]


def _read_env_file() -> dict[str, str]:
    """Parse ~/.openclaw/.env into a dict."""
    if not OPENCLAW_ENV_FILE.exists():
        return {}
    result: dict[str, str] = {}
    for line in OPENCLAW_ENV_FILE.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            key, _, value = line.partition("=")
            result[key.strip()] = value.strip()
    return result


def _write_env_file(entries: dict[str, str]) -> None:
    """Write key=value pairs to ~/.openclaw/.env."""
    OPENCLAW_HOME.mkdir(parents=True, exist_ok=True)
    lines = [f"{k}={v}" for k, v in sorted(entries.items())]
    OPENCLAW_ENV_FILE.write_text("\n".join(lines) + "\n")


# ── Provider env-var → id mapping ────────────────────────────────────

def _env_var_to_provider(env_var: str) -> str | None:
    """Map an env var like ANTHROPIC_API_KEY to the provider id 'anthropic'."""
    for p in _PROVIDERS:
        if p["env_var"] and p["env_var"] == env_var:
            return p["id"]
    return None


def _write_agent_auth(provider_id: str, api_key: str, agent_id: str = "main") -> None:
    """Write an API key into the gateway's per-agent auth files.

    Updates both:
      ~/.openclaw/agents/<agent>/agent/auth-profiles.json  (detailed)
      ~/.openclaw/agents/<agent>/agent/auth.json           (simple lookup)
    """
    agent_dir = OPENCLAW_HOME / "agents" / agent_id / "agent"
    agent_dir.mkdir(parents=True, exist_ok=True)

    # 1. Update auth-profiles.json
    profiles_path = agent_dir / "auth-profiles.json"
    if profiles_path.exists():
        try:
            profiles = json.loads(profiles_path.read_text())
        except (json.JSONDecodeError, OSError):
            profiles = {"version": 1, "profiles": {}}
    else:
        profiles = {"version": 1, "profiles": {}}

    profile_id = f"{provider_id}:default"
    profiles.setdefault("profiles", {})[profile_id] = {
        "type": "api_key",
        "provider": provider_id,
        "key": api_key,
    }
    profiles_path.write_text(json.dumps(profiles, indent=2) + "\n")

    # 2. Update auth.json (simplified lookup)
    auth_path = agent_dir / "auth.json"
    if auth_path.exists():
        try:
            auth = json.loads(auth_path.read_text())
        except (json.JSONDecodeError, OSError):
            auth = {}
    else:
        auth = {}

    auth[provider_id] = {"type": "api_key", "key": api_key}
    auth_path.write_text(json.dumps(auth, indent=2) + "\n")

    logger.info("Wrote %s auth to %s", provider_id, profiles_path)


def _sync_env_to_agent_auth() -> None:
    """Sync all API keys from ~/.openclaw/.env into gateway agent auth files."""
    env = _read_env_file()
    for env_var, value in env.items():
        if not value:
            continue
        provider_id = _env_var_to_provider(env_var)
        if provider_id:
            _write_agent_auth(provider_id, value)


def _remove_agent_auth(provider_id: str, agent_id: str = "main") -> None:
    """Remove a provider's key from gateway auth files."""
    agent_dir = OPENCLAW_HOME / "agents" / agent_id / "agent"

    profiles_path = agent_dir / "auth-profiles.json"
    if profiles_path.exists():
        try:
            profiles = json.loads(profiles_path.read_text())
            profile_id = f"{provider_id}:default"
            if profile_id in profiles.get("profiles", {}):
                del profiles["profiles"][profile_id]
                profiles_path.write_text(json.dumps(profiles, indent=2) + "\n")
        except (json.JSONDecodeError, OSError):
            pass

    auth_path = agent_dir / "auth.json"
    if auth_path.exists():
        try:
            auth = json.loads(auth_path.read_text())
            if provider_id in auth:
                del auth[provider_id]
                auth_path.write_text(json.dumps(auth, indent=2) + "\n")
        except (json.JSONDecodeError, OSError):
            pass


async def list_openclaw_agents() -> OpenClawAgentsList:
    """Fetch live agent list from the gateway and sync to local DB."""
    from app.adapters.openclaw import openclaw

    try:
        await openclaw.connect()
        raw = await openclaw.list_agents()
    except Exception as exc:
        logger.warning("Gateway agent list failed, falling back to config: %s", exc)
        return _agents_from_config()

    default_id = raw.get("defaultId", "main")
    agents: list[OpenClawAgent] = []
    sync_payload: list[dict] = []

    # Read config for per-agent model info
    cfg = _read_config()
    cfg_agents = {a.get("id"): a for a in cfg.get("agents", {}).get("list", [])}
    default_model = (cfg.get("agents", {}).get("defaults", {}).get("model") or {}).get("primary")

    for a in raw.get("agents", []):
        ident = a.get("identity") or {}
        agent_id = a.get("id", "")
        name = a.get("name") or ident.get("name") or agent_id
        # Override "main" with "ClawData" for the default agent
        if name == agent_id and agent_id in ("main", default_id):
            name = "ClawData"
        emoji = ident.get("emoji", "")

        # Resolve model from config
        cfg_agent = cfg_agents.get(agent_id, {})
        model_val = cfg_agent.get("model")
        if isinstance(model_val, dict):
            model = model_val.get("primary") or default_model
        else:
            model = model_val or default_model

        # Resolve workspace skills from disk
        agent_skills: list[str] = []
        try:
            # Prefer workspace from gateway response, then config, then global fallback
            ws = a.get("workspace", "") or cfg_agent.get("workspace", "")
            if ws:
                ws_path = Path(os.path.expanduser(ws))
            else:
                ws_path = OPENCLAW_WORKSPACE
            for s in _scan_skills_dir(ws_path / "skills", "workspace", agent_id):
                agent_skills.append(s.slug)
        except Exception:
            pass

        agents.append(OpenClawAgent(
            id=agent_id,
            name=name,
            emoji=emoji,
            skills=agent_skills,
            is_default=agent_id == default_id,
        ))

        sync_payload.append({
            "id": agent_id,
            "name": name,
            "emoji": emoji,
            "model": model,
            "is_default": agent_id == default_id,
            "workspace": a.get("workspace"),
        })

    if not agents:
        agents.append(OpenClawAgent(id="main", name="ClawData", emoji="꩜", is_default=True))
        sync_payload.append({"id": "main", "name": "ClawData", "emoji": "꩜", "model": default_model})

    # Sync to local DB (fire-and-forget, don't block response on failure)
    try:
        await _sync_agents_to_db(sync_payload)
    except Exception as exc:
        logger.warning("Agent sync to local DB failed: %s", exc)

    return OpenClawAgentsList(
        default_id=default_id,
        main_key=raw.get("mainKey", "main"),
        scope=raw.get("scope", ""),
        agents=agents,
    )


async def _sync_agents_to_db(gateway_agents: list[dict]) -> None:
    """Sync gateway agent data into the local SQLite database."""
    from app.database import async_session
    from app.services.agent_service import sync_openclaw_agents

    async with async_session() as db:
        await sync_openclaw_agents(db, gateway_agents)


def _agents_from_config() -> OpenClawAgentsList:
    """Fallback: read agents from openclaw.json when gateway is unavailable."""
    config = _read_config()
    agents_cfg = config.get("agents", {})
    raw_list = agents_cfg.get("list", [])

    agents: list[OpenClawAgent] = []
    for a in raw_list:
        ident = a.get("identity", {})
        agent_id = a.get("id", "")
        # Scan workspace skills from disk
        agent_skills: list[str] = []
        try:
            ws = a.get("workspace", "")
            if ws:
                ws_path = Path(os.path.expanduser(ws))
            else:
                ws_path = OPENCLAW_WORKSPACE
            for s in _scan_skills_dir(ws_path / "skills", "workspace", agent_id):
                agent_skills.append(s.slug)
        except Exception:
            pass
        agents.append(OpenClawAgent(
            id=agent_id,
            name=ident.get("name", agent_id),
            emoji=ident.get("emoji", ""),
            skills=agent_skills,
        ))

    if not agents:
        agents.append(OpenClawAgent(id="main", name="ClawData", emoji="꩜", is_default=True))

    return OpenClawAgentsList(default_id="main", main_key="main", agents=agents)


async def reset_all_agents() -> ActionResult:
    """Reset everything: remove non-main agents from the gateway,
    wipe all local agent data, and re-seed the main agent."""
    from app.adapters.openclaw import openclaw
    from app.database import async_session
    from app.services.agent_service import agent_workspace, reset_agents, _WORKSPACE_FILES

    errors: list[str] = []

    # 1. Delete non-main agents from the gateway
    try:
        await openclaw.connect()
        raw = await openclaw.list_agents()
        main_key = raw.get("mainKey", "main")
        for a in raw.get("agents", []):
            aid = a.get("id", "")
            if aid and aid != main_key:
                try:
                    await openclaw.delete_agent(aid, delete_files=False)
                except Exception as exc:
                    errors.append(f"gateway delete {aid}: {exc}")
    except Exception as exc:
        errors.append(f"gateway list: {exc}")

    # 2. Reset main agent identity on the gateway
    try:
        await openclaw.connect()
        main_ws = str(agent_workspace("main").resolve())
        await openclaw.update_agent(
            agent_id=main_key, name="ClawData", workspace=main_ws
        )
        # Patch openclaw.json to reset the identity config
        # AND remove non-main agent entries so they don't reappear after restart
        try:
            cfg = _read_config()
            agent_list = cfg.get("agents", {}).get("list", [])
            # Keep only the main agent entry, remove all others
            cfg["agents"]["list"] = [
                a for a in agent_list if a.get("id") == main_key
            ]
            for a in cfg["agents"]["list"]:
                if a.get("id") == main_key:
                    a["name"] = "ClawData"
                    a["workspace"] = main_ws
                    a["identity"] = {"name": "ClawData", "emoji": "꩜"}
                    # Remove stale subagents/linked config
                    a.pop("subagents", None)
            _write_config(cfg)
        except Exception:
            pass
    except Exception as exc:
        errors.append(f"gateway reset main: {exc}")

    # 3. Disable all enabled gateway skills (clean slate)
    #    Only disable *bundled* gateway skills (source != workspace/project).
    #    For workspace skills, we remove their config entries so auto-discovery
    #    isn't blocked by an explicit enabled=false in the config.
    try:
        await openclaw.connect()
        gw_status = await openclaw.skills_status()
        bundled_to_disable = []
        ws_entries_to_remove = []
        for s in gw_status.get("skills", []):
            skill_key = s.get("name") or s.get("slug", "")
            source = s.get("source", "")
            if not skill_key:
                continue
            if not s.get("disabled", True):
                if "bundled" in source or "managed" in source:
                    bundled_to_disable.append(skill_key)
                else:
                    # Workspace/project skill — remove config entry instead of disabling
                    ws_entries_to_remove.append(skill_key)
        for sk in bundled_to_disable:
            try:
                await openclaw.skills_update(skill_key=sk, enabled=False)
                logger.info("Disabled bundled gateway skill '%s' during reset", sk)
            except Exception as exc:
                errors.append(f"disable skill {sk}: {exc}")
        # Remove workspace skill entries from config so they don't block auto-discovery
        if ws_entries_to_remove:
            try:
                cfg = _read_config()
                entries = cfg.get("skills", {}).get("entries", {})
                for sk in ws_entries_to_remove:
                    entries.pop(sk, None)
                _write_config(cfg)
                logger.info("Removed workspace skill config entries: %s", ws_entries_to_remove)
            except Exception as exc:
                errors.append(f"remove ws skill entries: {exc}")
    except Exception as exc:
        errors.append(f"gateway skills disable: {exc}")

    # 4. Wipe local DB + workspace dirs, re-seed main
    try:
        async with async_session() as db:
            await reset_agents(db)
    except Exception as exc:
        errors.append(f"local reset: {exc}")

    # 5. Restart the gateway so it reloads identity from disk
    try:
        await restart_gateway()
        # Give the gateway time to come back up before re-syncing
        import asyncio
        await asyncio.sleep(4)
        await openclaw.disconnect()
    except Exception:
        pass

    # 6. Push all workspace .md files to the gateway so they stay in sync
    try:
        await openclaw.connect()
        for filename, content in _WORKSPACE_FILES.items():
            try:
                await openclaw.agent_files_set(main_key, filename, content)
            except Exception as exc:
                errors.append(f"gateway set {filename}: {exc}")
        logger.info("Pushed %d workspace files to gateway for main agent", len(_WORKSPACE_FILES))
    except Exception as exc:
        errors.append(f"gateway push workspace files: {exc}")

    # 7. Re-sync from gateway to merge gateway state with local DB
    try:
        await list_openclaw_agents()
    except Exception:
        pass

    if errors:
        return ActionResult(success=True, message=f"Reset done with warnings: {'; '.join(errors)}")
    return ActionResult(success=True, message="All agents reset. Main agent re-created.")


async def create_openclaw_agent(
    *, name: str, workspace: str | None = None, emoji: str | None = None, avatar: str | None = None
) -> ActionResult:
    """Create a new agent via the gateway.

    The workspace is always placed inside the project's userdata/agents/{slug}/
    directory so that all agent data stays version-controllable.
    """
    import re as _re
    from app.adapters.openclaw import openclaw
    from app.services.agent_service import agent_workspace

    # Derive slug from name
    slug = _re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "agent"
    resolved_workspace = str(agent_workspace(slug).resolve())

    try:
        await openclaw.connect()
        result = await openclaw.create_agent(
            name=name, workspace=resolved_workspace, emoji=emoji, avatar=avatar
        )
        agent_id = result.get("agentId", slug)

        # Sync the new agent into the local DB
        try:
            await _sync_agents_to_db([{
                "id": agent_id,
                "name": name,
                "emoji": emoji or "",
                "model": None,
                "workspace": resolved_workspace,
            }])
        except Exception:
            pass

        return ActionResult(success=True, message=f"Agent '{agent_id}' created")
    except Exception as exc:
        return ActionResult(success=False, message=str(exc))


async def update_openclaw_agent(
    agent_id: str,
    *,
    name: str | None = None,
    model: str | None = None,
    workspace: str | None = None,
    avatar: str | None = None,
) -> ActionResult:
    """Update an existing agent via the gateway.

    When the name changes we also patch IDENTITY.md so the agent's
    runtime persona stays in sync with the gateway metadata.
    """
    from app.adapters.openclaw import openclaw

    try:
        await openclaw.connect()
        await openclaw.update_agent(
            agent_id=agent_id, name=name, model=model,
            workspace=workspace, avatar=avatar,
        )

        # Keep IDENTITY.md in sync when the name changes
        if name:
            try:
                raw = await openclaw.agent_files_get(agent_id, "IDENTITY.md")
                content = (raw.get("file") or raw).get("content", "")
                if content:
                    import re
                    updated = re.sub(
                        r"(\*\*Name:\*\*)\s*.*",
                        rf"\1 {name}",
                        content,
                    )
                    if updated != content:
                        await openclaw.agent_files_set(agent_id, "IDENTITY.md", updated)
                else:
                    # File is empty / missing – write a minimal identity
                    await openclaw.agent_files_set(
                        agent_id,
                        "IDENTITY.md",
                        f"# IDENTITY.md - Who Am I?\n\n- **Name:** {name}\n",
                    )
            except Exception:
                pass  # non-critical; gateway name is already updated

            # Reset all sessions so the agent picks up the new identity
            try:
                sessions_raw = await openclaw.sessions_list_full(agent_id, limit=50)
                for s in sessions_raw.get("sessions", []):
                    key = s.get("key")
                    if key:
                        await openclaw.sessions_reset(key)
            except Exception:
                pass  # non-critical

        return ActionResult(success=True, message=f"Agent '{agent_id}' updated")
    except Exception as exc:
        return ActionResult(success=False, message=str(exc))


async def delete_openclaw_agent(
    agent_id: str, *, delete_files: bool = True
) -> ActionResult:
    """Delete an agent via the gateway."""
    from app.adapters.openclaw import openclaw

    try:
        await openclaw.connect()
        await openclaw.delete_agent(agent_id, delete_files=delete_files)
        return ActionResult(success=True, message=f"Agent '{agent_id}' deleted")
    except Exception as exc:
        return ActionResult(success=False, message=str(exc))


# ── Skills ───────────────────────────────────────────────────────────


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


async def get_providers() -> ProvidersResponse:
    """Return the list of supported providers with their config status."""
    env = _read_env_file()
    shell_env = os.environ

    providers = []
    for p in _PROVIDERS:
        env_var = p["env_var"]
        configured = bool(
            (env_var and env.get(env_var))
            or (env_var and shell_env.get(env_var))
        )
        providers.append(Provider(
            id=p["id"],
            name=p["name"],
            env_var=env_var,
            configured=configured,
            onboard_flag=p["flag"],
            popular_models=p["models"],
        ))
    return ProvidersResponse(providers=providers)


async def get_env_keys() -> EnvListResponse:
    """List all keys in ~/.openclaw/.env with masked values."""
    env = _read_env_file()
    entries = [EnvEntry(key=k, masked_value=_mask_value(v)) for k, v in env.items()]
    return EnvListResponse(entries=entries, path=str(OPENCLAW_ENV_FILE))


async def set_env_key(key: str, value: str) -> ActionResult:
    """Set or update a key in ~/.openclaw/.env and gateway auth files."""
    env = _read_env_file()
    env[key] = value
    try:
        _write_env_file(env)
        # Also write to gateway's per-agent auth files so the running
        # gateway can resolve the key without a restart.
        provider_id = _env_var_to_provider(key)
        if provider_id and value:
            _write_agent_auth(provider_id, value)
        return ActionResult(success=True, message=f"{key} saved to {OPENCLAW_ENV_FILE}")
    except OSError as exc:
        return ActionResult(success=False, message=str(exc))


async def delete_env_key(key: str) -> ActionResult:
    """Remove a key from ~/.openclaw/.env and gateway auth files."""
    env = _read_env_file()
    if key not in env:
        return ActionResult(success=False, message=f"{key} not found in .env")
    del env[key]
    try:
        _write_env_file(env)
        # Also remove from gateway auth files
        provider_id = _env_var_to_provider(key)
        if provider_id:
            _remove_agent_auth(provider_id)
        return ActionResult(success=True, message=f"{key} removed")
    except OSError as exc:
        return ActionResult(success=False, message=str(exc))


# ── Models ───────────────────────────────────────────────────────────


async def get_models_status() -> ModelsStatusResponse:
    """Run `openclaw models status` to get current model config."""
    oc_path = _which("openclaw")
    if not oc_path:
        return ModelsStatusResponse(output="OpenClaw is not installed.")

    rc, out, err = await _run(["openclaw", "models", "status"], timeout=15)
    combined = f"{out}\n{err}".strip()

    # Parse primary model from output (look for "Primary" or "Default" line)
    current = None
    image = None
    fallbacks: list[str] = []
    for line in combined.splitlines():
        stripped = line.strip()
        low = stripped.lower()
        # Match lines like "Default       : openai/gpt-4.1"
        # Must START with the keyword to avoid matching auth lines containing "default"
        if current is None and (low.startswith("primary") or low.startswith("default")):
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

    # If CLI didn't return a model, try reading from config as fallback
    if not current:
        cfg = _read_config()
        current = (cfg.get("agents", {}).get("defaults", {}).get("model") or {}).get("primary")

    return ModelsStatusResponse(
        current_model=current,
        image_model=image,
        fallbacks=fallbacks or [],
        output=combined,
    )


async def set_default_model(model: str) -> ActionResult:
    """Set the default model via gateway config.patch, CLI, or direct config edit."""

    # Strategy 1: If gateway is running, patch via the gateway WS API
    # This ensures the in-memory config is updated immediately.
    gw = await get_gateway_status()
    if gw.state == GatewayState.RUNNING:
        try:
            from app.adapters.openclaw import openclaw as oc_adapter
            await oc_adapter.connect()
            patch = json.dumps({
                "agents": {"defaults": {"model": {"primary": model}}}
            })
            await oc_adapter.config_patch(patch, note=f"Set default model to {model}")
            logger.info("Model set to %s via gateway config.patch", model)
            return ActionResult(success=True, message=f"Default model set to {model}")
        except Exception as exc:
            logger.warning("Gateway config.patch failed, trying CLI: %s", exc)

    # Strategy 2: Try CLI
    oc_path = _which("openclaw")
    if oc_path:
        rc, out, err = await _run(["openclaw", "models", "set", model], timeout=15)
        combined = f"{out}\n{err}".strip()
        if rc == 0:
            return ActionResult(success=True, message=f"Default model set to {model}", output=combined)
        logger.warning("openclaw models set failed (exit %d): %s", rc, combined)

    # Strategy 3: Fallback — write directly to config file using the correct nested path
    # OpenClaw expects: { "agents": { "defaults": { "model": { "primary": "..." } } } }
    try:
        config = _read_config()
        agents = config.setdefault("agents", {})
        defaults = agents.setdefault("defaults", {})
        model_cfg = defaults.setdefault("model", {})
        model_cfg["primary"] = model
        # Remove any stale root-level "model" key that older code may have written
        config.pop("model", None)
        _write_config(config)
        return ActionResult(success=True, message=f"Default model set to {model} (via config)")
    except Exception as exc:
        return ActionResult(success=False, message=f"Failed to set model: {exc}")


# ── Model catalog cache ──────────────────────────────────────────────

_model_catalog_cache: ModelCatalogResponse | None = None
_model_catalog_ts: float = 0.0
_MODEL_CATALOG_TTL = 300  # 5 min cache


async def get_models_catalog() -> ModelCatalogResponse:
    """Return the full model catalog from `openclaw models list --all --json`.

    Results are cached for 5 minutes to avoid repeated CLI calls.
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


# ── Setup wizard ─────────────────────────────────────────────────────


async def run_setup(req: SetupRequest) -> SetupResult:
    """Full setup flow: init config, write API keys, set model, start gateway."""
    steps: list[str] = []
    output_parts: list[str] = []

    oc_path = _which("openclaw")
    if not oc_path:
        return SetupResult(success=False, message="OpenClaw is not installed. Install it first.")

    # Step 1: Run `openclaw onboard --non-interactive --accept-risk`
    logger.info("Running openclaw onboard --mode %s ...", req.mode)
    rc, out, err = await _run(
        ["openclaw", "onboard", "--non-interactive", "--accept-risk"],
        timeout=30,
    )
    output_parts.append(f"--- setup ---\n{out}\n{err}".strip())
    if rc == 0:
        steps.append("setup")
    else:
        # Setup may fail if already configured — only continue if config exists
        if OPENCLAW_CONFIG.exists():
            logger.warning("openclaw setup exited %d but config exists — continuing", rc)
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

    # Step 2: Write API keys to ~/.openclaw/.env
    if req.api_keys:
        env = _read_env_file()
        env.update(req.api_keys)
        _write_env_file(env)
        key_names = list(req.api_keys.keys())
        steps.append(f"api_keys ({', '.join(key_names)})")
        output_parts.append(f"--- api keys ---\nWrote {len(req.api_keys)} key(s) to {OPENCLAW_ENV_FILE}")

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


# ── Agent detail ─────────────────────────────────────────────────────


async def get_agent_detail(agent_id: str) -> AgentDetail:
    """Get comprehensive agent info: profile, files, skills, sessions."""
    from app.adapters.openclaw import openclaw

    await openclaw.connect()

    # Fetch all data in parallel-ish (sequential but fast gateway calls)
    agents_raw = await openclaw.list_agents()
    default_id = agents_raw.get("defaultId", "main")
    agent_entry = None
    for a in agents_raw.get("agents", []):
        if a.get("id") == agent_id:
            agent_entry = a
            break

    ident = (agent_entry or {}).get("identity") or {}
    # Prefer top-level name (updated via agents.update) over identity.name
    # (which is a cached parse of IDENTITY.md and may be stale)
    name = (agent_entry or {}).get("name") or ident.get("name") or agent_id
    emoji = ident.get("emoji", "")

    # Files
    files_raw = await openclaw.agent_files_list(agent_id)
    workspace = files_raw.get("workspace", "")
    files = [
        AgentFile(
            name=f.get("name", ""),
            path=f.get("path", ""),
            missing=f.get("missing", False),
            size=f.get("size"),
            updated_at_ms=f.get("updatedAtMs"),
        )
        for f in files_raw.get("files", [])
    ]

    # Skills for this agent
    skills_raw = await openclaw.skills_status(agent_id)
    skills = [_parse_skill(s) for s in skills_raw.get("skills", [])]

    # Sessions for this agent
    sessions_raw = await openclaw.sessions_list_full(agent_id, limit=20)
    sessions = [
        SessionEntry(
            key=s.get("key", ""),
            kind=s.get("kind", ""),
            display_name=s.get("displayName", ""),
            channel=s.get("lastChannel") or s.get("channel", ""),
            updated_at=s.get("updatedAt"),
            session_id=s.get("sessionId", ""),
            model_provider=s.get("modelProvider", ""),
            model=s.get("model", ""),
            input_tokens=s.get("inputTokens", 0),
            output_tokens=s.get("outputTokens", 0),
            total_tokens=s.get("totalTokens", 0),
            derived_title=s.get("derivedTitle", ""),
            last_message_preview=s.get("lastMessagePreview", ""),
        )
        for s in sessions_raw.get("sessions", [])
    ]

    # Model from config
    cfg = _read_config()
    agent_model = None
    for a in cfg.get("agents", {}).get("list", []):
        if a.get("id") == agent_id:
            agent_model = (a.get("model") or {}).get("primary") if isinstance(a.get("model"), dict) else a.get("model")
            break
    if not agent_model:
        agent_model = (cfg.get("agents", {}).get("defaults", {}).get("model") or {}).get("primary")

    # Best-effort sync this agent's detail to local DB
    try:
        await _sync_agents_to_db([{
            "id": agent_id,
            "name": name,
            "emoji": emoji,
            "model": agent_model,
            "is_default": agent_id == default_id,
            "workspace": workspace,
        }])
    except Exception:
        pass

    return AgentDetail(
        id=agent_id,
        name=name,
        emoji=emoji,
        model=agent_model,
        is_default=agent_id == default_id,
        workspace=workspace,
        source="openclaw",
        files=files,
        skills=skills,
        sessions=sessions,
    )


async def get_agent_files(agent_id: str) -> AgentFilesResponse:
    """List workspace files for an agent."""
    from app.adapters.openclaw import openclaw

    await openclaw.connect()
    raw = await openclaw.agent_files_list(agent_id)
    return AgentFilesResponse(
        agent_id=agent_id,
        workspace=raw.get("workspace", ""),
        files=[
            AgentFile(
                name=f.get("name", ""),
                path=f.get("path", ""),
                missing=f.get("missing", False),
                size=f.get("size"),
                updated_at_ms=f.get("updatedAtMs"),
            )
            for f in raw.get("files", [])
        ],
    )


async def get_agent_file(agent_id: str, name: str) -> AgentFile:
    """Get a single workspace file with its content."""
    from app.adapters.openclaw import openclaw

    await openclaw.connect()
    raw = await openclaw.agent_files_get(agent_id, name)
    f = raw.get("file", {})
    return AgentFile(
        name=f.get("name", name),
        path=f.get("path", ""),
        missing=f.get("missing", False),
        size=f.get("size"),
        updated_at_ms=f.get("updatedAtMs"),
        content=f.get("content"),
    )


async def set_agent_file(agent_id: str, name: str, content: str) -> ActionResult:
    """Write content to a workspace file."""
    from app.adapters.openclaw import openclaw

    try:
        await openclaw.connect()
        await openclaw.agent_files_set(agent_id, name, content)
        return ActionResult(success=True, message=f"File '{name}' saved")
    except Exception as exc:
        return ActionResult(success=False, message=str(exc))


async def get_agent_sessions(agent_id: str) -> SessionsResponse:
    """List sessions for an agent."""
    from app.adapters.openclaw import openclaw

    try:
        await openclaw.connect()
    except (ConnectionRefusedError, ConnectionError, OSError) as exc:
        logger.warning("Gateway not reachable for sessions: %s", exc)
        return SessionsResponse(count=0, sessions=[])
    raw = await openclaw.sessions_list_full(agent_id, limit=50)
    sessions = [
        SessionEntry(
            key=s.get("key", ""),
            kind=s.get("kind", ""),
            display_name=s.get("displayName", ""),
            channel=s.get("lastChannel") or s.get("channel", ""),
            updated_at=s.get("updatedAt"),
            session_id=s.get("sessionId", ""),
            model_provider=s.get("modelProvider", ""),
            model=s.get("model", ""),
            input_tokens=s.get("inputTokens", 0),
            output_tokens=s.get("outputTokens", 0),
            total_tokens=s.get("totalTokens", 0),
            derived_title=s.get("derivedTitle", ""),
            last_message_preview=s.get("lastMessagePreview", ""),
        )
        for s in raw.get("sessions", [])
    ]
    return SessionsResponse(count=raw.get("count", len(sessions)), sessions=sessions)


async def reset_session(key: str) -> ActionResult:
    """Reset a session (clear history)."""
    from app.adapters.openclaw import openclaw

    try:
        await openclaw.connect()
        await openclaw.sessions_reset(key)
        return ActionResult(success=True, message=f"Session reset")
    except Exception as exc:
        return ActionResult(success=False, message=str(exc))


async def delete_session(key: str) -> ActionResult:
    """Delete a session."""
    from app.adapters.openclaw import openclaw

    try:
        await openclaw.connect()
        await openclaw.sessions_delete(key)
        return ActionResult(success=True, message=f"Session deleted")
    except Exception as exc:
        return ActionResult(success=False, message=str(exc))


# ── Workspace skills (SKILL.md) ─────────────────────────────────────

# Project skills dir (repo-level custom skills)
# Walk up from this file to find the project root's `skills/` folder
_project_root = Path(__file__).resolve().parent.parent.parent
PROJECT_SKILLS_DIR = _project_root / "skills"

MANAGED_SKILLS_DIR = OPENCLAW_HOME / "skills"


def _parse_skill_md(content: str, slug: str, location: str, agent_id: str | None = None, path: str = "") -> WorkspaceSkill:
    """Parse a SKILL.md file into a WorkspaceSkill."""
    import yaml  # PyYAML

    name = slug
    description = ""
    metadata: dict = {}

    # Parse YAML frontmatter (---\n...\n---)
    if content.startswith("---"):
        parts = content.split("---", 2)
        if len(parts) >= 3:
            frontmatter_raw = parts[1]
            try:
                fm = yaml.safe_load(frontmatter_raw)
                if isinstance(fm, dict):
                    name = str(fm.get("name", slug))
                    description = str(fm.get("description", "")).strip()
                    raw_meta = fm.get("metadata")
                    if isinstance(raw_meta, dict):
                        metadata = raw_meta
                    elif isinstance(raw_meta, str):
                        try:
                            metadata = json.loads(raw_meta)
                        except (json.JSONDecodeError, ValueError):
                            pass
            except yaml.YAMLError:
                # Fallback: best-effort line-by-line parse
                for line in frontmatter_raw.strip().splitlines():
                    line = line.strip()
                    if line.startswith("name:"):
                        name = line[5:].strip().strip('"').strip("'")
                    elif line.startswith("description:"):
                        description = line[12:].strip().strip('"').strip("'")

    return WorkspaceSkill(
        name=name,
        slug=slug,
        description=description,
        metadata=metadata,
        content=content,
        location=location,
        agent_id=agent_id,
        path=path,
    )


def _scan_skills_dir(directory: Path, location: str, agent_id: str | None = None) -> list[WorkspaceSkill]:
    """Scan a directory for skill folders containing SKILL.md."""
    skills: list[WorkspaceSkill] = []
    if not directory.is_dir():
        return skills
    for entry in sorted(directory.iterdir()):
        if not entry.is_dir() or entry.name.startswith("."):
            continue
        skill_file = entry / "SKILL.md"
        if skill_file.is_file():
            content = skill_file.read_text(encoding="utf-8", errors="replace")
            ws = _parse_skill_md(
                content, slug=entry.name, location=location,
                agent_id=agent_id, path=str(skill_file),
            )
            ws.is_symlink = entry.is_symlink()
            skills.append(ws)
    return skills


def list_project_skills() -> list[WorkspaceSkill]:
    """List project-level skills from the skills/ directory."""
    return _scan_skills_dir(PROJECT_SKILLS_DIR, "project")


async def list_workspace_skills(agent_id: str) -> WorkspaceSkillsList:
    """List workspace, project, and managed skills for an agent."""
    from app.adapters.openclaw import openclaw

    await openclaw.connect()
    files_raw = await openclaw.agent_files_list(agent_id)
    workspace = files_raw.get("workspace", "")
    ws_path = Path(os.path.expanduser(workspace)) if workspace else OPENCLAW_WORKSPACE
    ws_skills_dir = ws_path / "skills"

    workspace_skills = _scan_skills_dir(ws_skills_dir, "workspace", agent_id)
    project_skills = _scan_skills_dir(PROJECT_SKILLS_DIR, "project")
    managed_skills = _scan_skills_dir(MANAGED_SKILLS_DIR, "managed")

    return WorkspaceSkillsList(
        workspace_skills=workspace_skills,
        project_skills=project_skills,
        managed_skills=managed_skills,
    )


async def get_workspace_skill(agent_id: str, slug: str) -> WorkspaceSkill:
    """Get a specific workspace skill by slug."""
    from app.adapters.openclaw import openclaw

    await openclaw.connect()
    files_raw = await openclaw.agent_files_list(agent_id)
    workspace = files_raw.get("workspace", "")
    ws_path = Path(os.path.expanduser(workspace)) if workspace else OPENCLAW_WORKSPACE
    skill_file = ws_path / "skills" / slug / "SKILL.md"

    if not skill_file.is_file():
        raise FileNotFoundError(f"Skill '{slug}' not found in workspace")

    content = skill_file.read_text(encoding="utf-8", errors="replace")
    return _parse_skill_md(content, slug, "workspace", agent_id, str(skill_file))


async def create_workspace_skill(
    agent_id: str,
    name: str,
    description: str = "",
    instructions: str = "",
    metadata: dict | None = None,
) -> WorkspaceSkill:
    """Create a new SKILL.md in the agent's workspace/skills/ directory."""
    from app.adapters.openclaw import openclaw

    await openclaw.connect()
    files_raw = await openclaw.agent_files_list(agent_id)
    workspace = files_raw.get("workspace", "")
    ws_path = Path(os.path.expanduser(workspace)) if workspace else OPENCLAW_WORKSPACE

    # Slugify the name
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    if not slug:
        slug = "custom-skill"

    skill_dir = ws_path / "skills" / slug
    skill_dir.mkdir(parents=True, exist_ok=True)
    skill_file = skill_dir / "SKILL.md"

    # Build frontmatter
    meta_json = json.dumps(metadata) if metadata else '{"openclaw": {"always": true}}'
    content = f"""---
name: {name}
description: {description}
metadata: {meta_json}
---

# {name}

{instructions or 'Add instructions here.'}
"""

    skill_file.write_text(content, encoding="utf-8")
    return _parse_skill_md(content, slug, "workspace", agent_id, str(skill_file))


async def update_workspace_skill(agent_id: str, slug: str, content: str) -> WorkspaceSkill:
    """Update SKILL.md content for a workspace skill."""
    from app.adapters.openclaw import openclaw

    await openclaw.connect()
    files_raw = await openclaw.agent_files_list(agent_id)
    workspace = files_raw.get("workspace", "")
    ws_path = Path(os.path.expanduser(workspace)) if workspace else OPENCLAW_WORKSPACE
    skill_file = ws_path / "skills" / slug / "SKILL.md"

    if not skill_file.parent.is_dir():
        raise FileNotFoundError(f"Skill '{slug}' not found in workspace")

    skill_file.write_text(content, encoding="utf-8")
    return _parse_skill_md(content, slug, "workspace", agent_id, str(skill_file))


async def delete_workspace_skill(agent_id: str, slug: str) -> ActionResult:
    """Delete a workspace skill directory."""
    from app.adapters.openclaw import openclaw

    await openclaw.connect()
    files_raw = await openclaw.agent_files_list(agent_id)
    workspace = files_raw.get("workspace", "")
    ws_path = Path(os.path.expanduser(workspace)) if workspace else OPENCLAW_WORKSPACE
    skill_dir = ws_path / "skills" / slug

    if not skill_dir.is_dir():
        return ActionResult(success=False, message=f"Skill '{slug}' not found")

    shutil.rmtree(skill_dir)
    return ActionResult(success=True, message=f"Skill '{slug}' deleted")


async def deploy_project_skill(agent_id: str, slug: str) -> ActionResult:
    """Symlink a project skill into an agent's workspace/skills/ directory.

    Per OpenClaw docs, workspace skills (highest precedence) live in
    <workspace>/skills/. This creates a symlink from the agent's workspace
    back to the project's skills/ folder so edits stay in sync.
    """
    from app.adapters.openclaw import openclaw

    src = PROJECT_SKILLS_DIR / slug
    src_file = src / "SKILL.md"
    if not src_file.is_file():
        return ActionResult(success=False, message=f"Project skill '{slug}' not found")

    await openclaw.connect()
    files_raw = await openclaw.agent_files_list(agent_id)
    workspace = files_raw.get("workspace", "")
    ws_path = Path(os.path.expanduser(workspace)) if workspace else OPENCLAW_WORKSPACE
    dest = ws_path / "skills" / slug

    if dest.is_symlink():
        # Already symlinked — update target if needed
        if dest.resolve() == src.resolve():
            return ActionResult(success=True, message=f"Skill '{slug}' already linked")
        dest.unlink()
    elif dest.exists():
        # Agent has a local override — remove it to replace with symlink
        shutil.rmtree(dest)

    ws_path_skills = ws_path / "skills"
    ws_path_skills.mkdir(parents=True, exist_ok=True)
    dest.symlink_to(src.resolve())

    # No gateway enable needed — OpenClaw auto-discovers workspace SKILL.md files.
    # Calling skills_update here would accidentally enable bundled gateway tools
    # that share a name with workspace skills (e.g. "weather").

    return ActionResult(success=True, message=f"Skill '{slug}' linked for agent '{agent_id}'")


async def unlink_project_skill(agent_id: str, slug: str) -> ActionResult:
    """Remove a symlinked project skill from an agent's workspace.

    Only removes symlinks — agent-owned (non-symlinked) skills are not removed.
    Use delete_workspace_skill for those.
    """
    from app.adapters.openclaw import openclaw

    await openclaw.connect()
    files_raw = await openclaw.agent_files_list(agent_id)
    workspace = files_raw.get("workspace", "")
    ws_path = Path(os.path.expanduser(workspace)) if workspace else OPENCLAW_WORKSPACE
    link = ws_path / "skills" / slug

    if not link.is_symlink():
        if link.exists():
            return ActionResult(
                success=False,
                message=f"Skill '{slug}' is agent-owned, not a symlink. Use delete instead.",
            )
        return ActionResult(success=False, message=f"Skill '{slug}' not found in workspace")

    link.unlink()
    return ActionResult(success=True, message=f"Skill '{slug}' unlinked from agent '{agent_id}'")



async def sync_workspace_skills(agent_id: str) -> list[str]:
    """Return the list of workspace skill slugs for an agent.

    This no longer auto-enables gateway skills.  OpenClaw automatically
    discovers SKILL.md files placed in the agent's workspace/skills/
    directory.  Previously this function scanned project-level skill dirs
    and enabled every matching gateway entry, which accidentally turned on
    bundled gateway tools (e.g. the weather API) that shared a name with
    a workspace SKILL.md.

    Returns list of workspace skill slugs found on disk.
    """
    from app.adapters.openclaw import openclaw

    await openclaw.connect()

    # Only scan the agent's own workspace skills directory
    disk_slugs: set[str] = set()
    try:
        files_raw = await openclaw.agent_files_list(agent_id)
        workspace = files_raw.get("workspace", "")
        ws_path = Path(os.path.expanduser(workspace)) if workspace else OPENCLAW_WORKSPACE
        for s in _scan_skills_dir(ws_path / "skills", "workspace", agent_id):
            disk_slugs.add(s.slug)
    except Exception:
        try:
            userdata_ws = _project_root / "userdata" / "agents" / agent_id / "skills"
            for s in _scan_skills_dir(userdata_ws, "workspace", agent_id):
                disk_slugs.add(s.slug)
        except Exception:
            pass

    return sorted(disk_slugs)


# ── Costing ──────────────────────────────────────────────────────────

# Pricing per 1M tokens (USD) — input / output
# Source: published API pricing pages as of 2026-02.
MODEL_PRICING: dict[str, tuple[float, float]] = {
    # OpenAI
    "gpt-4.1": (2.00, 8.00),
    "gpt-4.1-mini": (0.40, 1.60),
    "gpt-4.1-nano": (0.10, 0.40),
    "gpt-4o": (2.50, 10.00),
    "gpt-4o-mini": (0.15, 0.60),
    "gpt-5.1-codex": (2.00, 8.00),
    "o3": (10.00, 40.00),
    "o3-mini": (1.10, 4.40),
    "o4-mini": (1.10, 4.40),
    # Anthropic
    "claude-sonnet-4-20250514": (3.00, 15.00),
    "claude-3.5-sonnet": (3.00, 15.00),
    "claude-3-haiku": (0.25, 1.25),
    "claude-3-opus": (15.00, 75.00),
    # Google
    "gemini-2.5-pro": (1.25, 10.00),
    "gemini-2.5-flash": (0.15, 0.60),
    "gemini-2.0-flash": (0.10, 0.40),
}

# Fallback price when model is not in the table
_DEFAULT_PRICING = (2.00, 8.00)  # conservative estimate


def _estimate_cost(model: str | None, input_tokens: int, output_tokens: int) -> float:
    """Estimate USD cost for the given token counts."""
    if not model:
        pricing = _DEFAULT_PRICING
    else:
        # Try exact match first, then prefix match
        pricing = MODEL_PRICING.get(model)
        if pricing is None:
            for key in MODEL_PRICING:
                if model.startswith(key):
                    pricing = MODEL_PRICING[key]
                    break
        if pricing is None:
            pricing = _DEFAULT_PRICING

    input_cost, output_cost = pricing
    return round(
        (input_tokens * input_cost + output_tokens * output_cost) / 1_000_000, 6
    )


async def get_costing_summary() -> CostingSummary:
    """Aggregate token usage and estimated costs across all gateway sessions."""
    from app.adapters.openclaw import openclaw

    await openclaw.connect()
    sessions_raw = await openclaw.get_all_sessions_for_costing(limit=500)

    total_input = 0
    total_output = 0
    total_tokens = 0
    total_cost = 0.0

    models: dict[str, CostingModelBreakdown] = {}
    agents: dict[str, CostingAgentBreakdown] = {}
    session_details: list[CostingSessionDetail] = []

    for s in sessions_raw:
        inp = s.get("inputTokens", 0)
        out = s.get("outputTokens", 0)
        tot = s.get("totalTokens", 0)
        model = s.get("model") or "unknown"
        provider = s.get("modelProvider") or "unknown"

        cost = _estimate_cost(model, inp, out)

        total_input += inp
        total_output += out
        total_tokens += tot
        total_cost += cost

        # By model
        model_key = f"{provider}/{model}"
        if model_key not in models:
            models[model_key] = CostingModelBreakdown(
                model=model, provider=provider
            )
        mb = models[model_key]
        mb.input_tokens += inp
        mb.output_tokens += out
        mb.total_tokens += tot
        mb.session_count += 1
        mb.estimated_cost_usd += cost

        # By agent
        key = s.get("key", "")
        parts = key.split(":")
        agent_id = parts[1] if len(parts) > 1 else "unknown"
        if agent_id not in agents:
            agents[agent_id] = CostingAgentBreakdown(agent_id=agent_id)
        ab = agents[agent_id]
        ab.input_tokens += inp
        ab.output_tokens += out
        ab.total_tokens += tot
        ab.session_count += 1
        ab.estimated_cost_usd += cost

        # Session detail
        session_details.append(
            CostingSessionDetail(
                session_key=key,
                session_id=s.get("sessionId", ""),
                agent_id=agent_id,
                model=model,
                provider=provider,
                input_tokens=inp,
                output_tokens=out,
                total_tokens=tot,
                estimated_cost_usd=round(cost, 6),
                title=s.get("derivedTitle"),
                updated_at=s.get("updatedAt"),
            )
        )

    # Round model/agent costs
    for mb in models.values():
        mb.estimated_cost_usd = round(mb.estimated_cost_usd, 6)
    for ab in agents.values():
        ab.estimated_cost_usd = round(ab.estimated_cost_usd, 6)

    # Sort sessions by most recent first
    session_details.sort(key=lambda x: x.updated_at or 0, reverse=True)

    return CostingSummary(
        total_input_tokens=total_input,
        total_output_tokens=total_output,
        total_tokens=total_tokens,
        total_estimated_cost_usd=round(total_cost, 6),
        session_count=len(sessions_raw),
        by_model=sorted(models.values(), key=lambda m: m.estimated_cost_usd, reverse=True),
        by_agent=sorted(agents.values(), key=lambda a: a.estimated_cost_usd, reverse=True),
        sessions=session_details,
    )
