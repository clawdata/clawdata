"""Gateway management CLI — interactive-first.

`clawdata gateway`         → interactive gateway panel
`clawdata gateway status`  → non-interactive status
"""

from __future__ import annotations

import socket

import click

from app.cli.helpers import async_command
from app.cli.output import error, header, info, kv, pick_action, success, table, warn


# ═══════════════════════════════════════════════════════════════════════
# Interactive flow — `clawdata gateway`
# ═══════════════════════════════════════════════════════════════════════


@click.group("gateway", invoke_without_command=True)
@click.pass_context
@async_command
async def gateway_group(ctx):
    """OpenClaw gateway — interactive panel when run without a subcommand."""
    if ctx.invoked_subcommand is not None:
        return
    await _interactive_gateway()


async def _interactive_gateway():
    """Interactive gateway management panel."""
    while True:
        # Show quick status header
        gw_ok = _port_check(18789)
        be_ok = _port_check(8000)

        header("Gateway Panel")
        kv("Gateway", click.style("● running", fg="green") if gw_ok else click.style("○ stopped", fg="red"))
        kv("Backend", click.style("● running", fg="green") if be_ok else click.style("○ stopped", fg="red"))

        action = pick_action(
            [
                ("status", "Full gateway status"),
                ("health", "Health check (all services)"),
                ("logs", "View gateway logs"),
                ("config", "Show OpenClaw config"),
                ("models", "List available models"),
                ("providers", "Check providers"),
                ("back", "← Exit"),
            ],
            prompt="Gateway — what would you like to do?",
        )

        if action == "status":
            await _show_status()
        elif action == "health":
            _show_health()
        elif action == "logs":
            await _show_logs()
        elif action == "config":
            await _show_config()
        elif action == "models":
            await _show_models()
        elif action == "providers":
            await _show_providers()
        else:
            return


def _port_check(port: int) -> bool:
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=2):
            return True
    except OSError:
        return False


async def _show_status():
    from app.services.lifecycle import get_gateway_status

    status = await get_gateway_status()
    header("Gateway Status")
    state = status.get("state", "unknown")
    if state == "running":
        kv("State", click.style("● running", fg="green"))
    elif state == "stopped":
        kv("State", click.style("○ stopped", fg="red"))
    else:
        kv("State", click.style(state, fg="yellow"))
    if status.get("version"):
        kv("Version", status["version"])
    if status.get("port"):
        kv("Port", status["port"])
    if status.get("pid"):
        kv("PID", status["pid"])


def _show_health():
    header("Health Check")
    if _port_check(18789):
        success("Gateway (port 18789) — reachable")
    else:
        error("Gateway (port 18789) — not reachable")
    if _port_check(8000):
        success("Backend (port 8000) — reachable")
    else:
        warn("Backend (port 8000) — not reachable")


async def _show_logs():
    from app.services.lifecycle import get_logs

    lines = 50
    data = await get_logs(lines=lines)
    log_content = data.get("content", "")
    if not log_content:
        warn("No logs available")
        return
    header("Gateway Logs (last 50)")
    click.echo()
    for line in log_content.splitlines()[-lines:]:
        click.echo(f"  {line}")
    click.echo()


async def _show_config():
    from app.services.lifecycle import get_config
    import json

    cfg = await get_config()
    header("OpenClaw Config")
    kv("Path", cfg.get("path", "—"))
    kv("Exists", click.style("yes", fg="green") if cfg.get("exists") else click.style("no", fg="red"))

    config_data = cfg.get("config", {})
    if config_data:
        click.echo()
        for key, value in config_data.items():
            if isinstance(value, dict):
                kv(key, json.dumps(value, indent=2)[:120])
            else:
                kv(key, value)


async def _show_models():
    from app.services.lifecycle import get_models_catalog

    data = await get_models_catalog()
    models = data.get("models", [])
    header(f"Available Models ({len(models)})")
    if not models:
        warn("No models in catalog")
        return
    rows = [[m.get("name", m.get("id", "?")), m.get("provider", "—")] for m in models]
    table(["Model", "Provider"], rows)


async def _show_providers():
    from app.services.lifecycle import get_providers

    try:
        data = await get_providers()
        providers = data.get("providers", [])
        header(f"Providers ({len(providers)})")
        if not providers:
            warn("No providers configured")
            info("Set API keys in ~/.openclaw/.env or via 'openclaw providers'")
            return
        for p in providers:
            name = p.get("name", p.get("id", "?"))
            status = p.get("status", "unknown")
            if status == "configured":
                success(f"{name}")
            else:
                warn(f"{name} ({status})")
    except Exception as exc:
        warn(f"Could not check providers: {exc}")


# ═══════════════════════════════════════════════════════════════════════
# Non-interactive subcommands
# ═══════════════════════════════════════════════════════════════════════


@gateway_group.command("status")
@async_command
async def gateway_status():
    """Show gateway status (non-interactive)."""
    await _show_status()


@gateway_group.command("health")
def gateway_health():
    """Quick health check (non-interactive)."""
    _show_health()


@gateway_group.command("logs")
@click.option("--lines", "-n", default=50, help="Number of log lines")
@async_command
async def gateway_logs(lines: int):
    """Show recent gateway logs (non-interactive)."""
    await _show_logs()


@gateway_group.command("config")
@async_command
async def gateway_config():
    """Show OpenClaw configuration (non-interactive)."""
    await _show_config()


@gateway_group.command("models")
@async_command
async def gateway_models():
    """Show available models (non-interactive)."""
    await _show_models()