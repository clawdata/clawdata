"""Interactive setup wizard for ClawData."""

from __future__ import annotations

import json
import socket
from pathlib import Path

import click

from app.cli.helpers import async_command
from app.cli.output import error, header, info, kv, success, warn

OPENCLAW_HOME = Path.home() / ".openclaw"
OPENCLAW_CONFIG = OPENCLAW_HOME / "openclaw.json"


@click.command("setup")
@async_command
async def setup_command():
    """Interactive setup wizard for ClawData.

    Checks prerequisites, configures providers, and deploys skills.
    """
    click.echo()
    click.secho("  🦞 ClawData Setup", fg="cyan", bold=True)
    click.secho("  ═══════════════════", fg="cyan")
    click.echo()

    # ── Step 1: Check OpenClaw installation ──────────────────────
    header("1. OpenClaw Installation")
    _check_openclaw_installed()

    # ── Step 2: Gateway connectivity ─────────────────────────────
    header("2. Gateway Connectivity")
    gateway_ok = _check_gateway()

    # ── Step 3: Provider configuration ───────────────────────────
    header("3. Provider Configuration")
    await _check_providers()

    # ── Step 4: Agents ───────────────────────────────────────────
    header("4. Agent Setup")
    if gateway_ok:
        await _check_agents()
    else:
        warn("Skipped — gateway not available")

    # ── Step 5: Skills ───────────────────────────────────────────
    header("5. Project Skills")
    _check_project_skills()

    # ── Step 6: Database ─────────────────────────────────────────
    header("6. Database")
    await _check_database()

    # ── Summary ──────────────────────────────────────────────────
    click.echo()
    click.secho("  ══════════════════════════════════════════", fg="cyan")
    success("Setup check complete!")
    click.echo()
    info("Start the backend:   clawdata server start")
    info("Launch the TUI:      clawdata tui")
    info("Open the web app:    cd web && npm run dev")
    click.echo()


def _check_openclaw_installed():
    """Verify OpenClaw CLI is available."""
    import shutil

    if shutil.which("openclaw"):
        success("OpenClaw CLI found")
    else:
        error("OpenClaw CLI not found — install from https://openclaw.dev")
        return

    if OPENCLAW_HOME.exists():
        success(f"OpenClaw home: {OPENCLAW_HOME}")
    else:
        warn(f"OpenClaw home not found at {OPENCLAW_HOME}")

    if OPENCLAW_CONFIG.exists():
        success("openclaw.json exists")
    else:
        warn("openclaw.json not found — run 'openclaw init' first")


def _check_gateway() -> bool:
    """Check if the gateway is listening."""
    try:
        with socket.create_connection(("127.0.0.1", 18789), timeout=2):
            success("Gateway reachable on port 18789")
            return True
    except OSError:
        warn("Gateway not reachable on port 18789")
        info("Start it with: openclaw gateway")
        return False


async def _check_providers():
    """Check configured providers."""
    from app.services.lifecycle import get_providers

    try:
        data = await get_providers()
        providers = data.get("providers", [])
        if providers:
            for p in providers:
                name = p.get("name", p.get("id", "?"))
                status = p.get("status", "unknown")
                if status == "configured":
                    success(f"Provider: {name}")
                else:
                    warn(f"Provider: {name} ({status})")
        else:
            warn("No providers configured")
            info("Set API keys in ~/.openclaw/.env or via 'openclaw providers'")
    except Exception as exc:
        warn(f"Could not check providers: {exc}")


async def _check_agents():
    """Check agents on the gateway."""
    from app.services.lifecycle import list_openclaw_agents

    try:
        data = await list_openclaw_agents()
        agents = data.get("agents", [])
        if agents:
            success(f"{len(agents)} agent(s) found")
            for a in agents:
                tag = " (default)" if a.get("is_default") else ""
                info(f"  {a.get('emoji', '')} {a['id']}{tag}")
        else:
            warn("No agents found — create one with 'clawdata agents create'")
    except Exception:
        warn("Could not list agents from gateway")


def _check_project_skills():
    """Check project skills directory."""
    from app.config import settings

    skills_dir = settings.skills_dir
    if not skills_dir.exists():
        warn(f"Skills directory not found: {skills_dir}")
        return

    from app.services.lifecycle import list_project_skills

    skills = list_project_skills()
    if skills:
        success(f"{len(skills)} project skill(s) available")
        for s in skills:
            info(f"  {s['slug']}: {s['name']}")
    else:
        info("No project skills yet — create one in skills/<name>/SKILL.md")


async def _check_database():
    """Verify DB connectivity."""
    try:
        from app.database import init_db

        await init_db()
        success("Database initialized")
    except Exception as exc:
        error(f"Database error: {exc}")


@click.command("status")
@async_command
async def status_command():
    """Show full system status at a glance."""
    click.echo()
    click.secho("  🦞 ClawData Status", fg="cyan", bold=True)
    click.secho("  ═══════════════════", fg="cyan")

    # Gateway
    header("Gateway")
    from app.services.lifecycle import get_gateway_status

    gw = await get_gateway_status()
    state = gw.get("state", "unknown")
    if state == "running":
        kv("State", click.style("● running", fg="green"))
        if gw.get("version"):
            kv("Version", gw["version"])
    else:
        kv("State", click.style(f"○ {state}", fg="red"))

    # Agents
    header("Agents")
    from app.services.lifecycle import list_openclaw_agents

    try:
        data = await list_openclaw_agents()
        agents = data.get("agents", [])
        kv("Count", len(agents))
        for a in agents:
            tag = click.style(" ★", fg="yellow") if a.get("is_default") else ""
            info(f"{a.get('emoji', '')} {a['id']}{tag} — {a.get('model', '?')}")
    except Exception:
        warn("Could not list agents")

    # Skills
    header("Project Skills")
    from app.services.lifecycle import list_project_skills

    skills = list_project_skills()
    kv("Count", len(skills))

    # Backend
    header("Backend")
    import socket

    try:
        with socket.create_connection(("127.0.0.1", 8000), timeout=2):
            kv("API", click.style("● running (port 8000)", fg="green"))
    except OSError:
        kv("API", click.style("○ not running", fg="red"))

    click.echo()
