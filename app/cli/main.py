"""ClawData CLI — manage agents, skills, gateway, and more.

Interactive-first: run `clawdata` with no arguments for a guided menu.

Usage:
    clawdata              → interactive main menu
    clawdata agents       → interactive agent manager
    clawdata skills       → interactive skill browser
    clawdata gateway      → interactive gateway panel
    clawdata templates    → interactive template browser
    clawdata setup        → guided setup wizard
    clawdata status       → quick status overview
    clawdata tui          → launch OpenClaw TUI
"""

from __future__ import annotations

import os
import subprocess
import sys

import click

from app.cli.agents import agents_group
from app.cli.gateway import gateway_group
from app.cli.output import pick_action
from app.cli.setup import setup_command, status_command
from app.cli.skills import skills_group
from app.cli.templates import templates_group

LOGO = r"""
   _____ _                ____        _
  / ____| |              |  _ \      | |
 | |    | | __ ___      _| | | | __ _| |_ __ _
 | |    | |/ _` \ \ /\ / / | | |/ _` | __/ _` |
 | |____| | (_| |\ V  V /| |_| | (_| | || (_| |
  \_____|_|\__,_| \_/\_/ |____/ \__,_|\__\__,_|
"""


@click.group(invoke_without_command=True)
@click.version_option(version="2.0.0", prog_name="ClawData")
@click.pass_context
def cli(ctx):
    """🦞 ClawData — Data engineering assistant CLI.

    Manage agents, skills, templates, and the OpenClaw gateway.
    Run with no subcommand for an interactive menu.
    """
    if ctx.invoked_subcommand is None:
        _interactive_main(ctx)


def _interactive_main(ctx):
    """Show the main interactive menu."""
    click.secho(LOGO, fg="cyan")
    while True:
        action = pick_action(
            [
                ("agents", "Manage agents"),
                ("skills", "Manage skills"),
                ("templates", "Browse templates"),
                ("gateway", "Gateway panel"),
                ("status", "Quick status overview"),
                ("setup", "Run setup wizard"),
                ("tui", "Launch OpenClaw TUI"),
                ("exit", "Exit"),
            ],
            prompt="What would you like to do?",
        )

        if action == "agents":
            ctx.invoke(agents_group)
        elif action == "skills":
            ctx.invoke(skills_group)
        elif action == "templates":
            ctx.invoke(templates_group)
        elif action == "gateway":
            ctx.invoke(gateway_group)
        elif action == "status":
            ctx.invoke(status_command)
        elif action == "setup":
            ctx.invoke(setup_command)
        elif action == "tui":
            ctx.invoke(launch_tui)
        else:
            return


# ── Register sub-commands ─────────────────────────────────────────────
cli.add_command(agents_group)
cli.add_command(skills_group)
cli.add_command(templates_group)
cli.add_command(gateway_group)
cli.add_command(setup_command)
cli.add_command(status_command)


@cli.command("tui")
def launch_tui():
    """Launch the OpenClaw interactive TUI."""
    import shutil

    if not shutil.which("openclaw"):
        click.secho("  ✗ OpenClaw CLI not found — install from https://openclaw.dev", fg="red")
        raise SystemExit(1)

    click.secho("  Launching OpenClaw TUI...", fg="cyan")
    try:
        os.execvp("openclaw", ["openclaw", "tui"])
    except FileNotFoundError:
        click.secho("  ✗ Failed to launch OpenClaw TUI", fg="red")
        raise SystemExit(1)


@cli.group("server")
def server_group():
    """Manage the ClawData backend server."""


@server_group.command("start")
@click.option("--host", default="0.0.0.0", help="Bind host")
@click.option("--port", default=8000, help="Bind port")
@click.option("--reload", "do_reload", is_flag=True, default=True, help="Enable auto-reload")
@click.option("--background", "-b", is_flag=True, help="Run in background")
def server_start(host: str, port: int, do_reload: bool, background: bool):
    """Start the ClawData backend API server."""
    click.secho(f"  Starting ClawData server on {host}:{port}...", fg="cyan")

    if background:
        cmd = [
            sys.executable, "-m", "uvicorn",
            "app.main:app",
            "--host", host,
            "--port", str(port),
        ]
        if do_reload:
            cmd.append("--reload")
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
        click.secho(f"  ✓ Server started in background (PID {proc.pid})", fg="green")
    else:
        import uvicorn
        uvicorn.run(
            "app.main:app",
            host=host,
            port=port,
            reload=do_reload,
        )


@server_group.command("stop")
def server_stop():
    """Stop the ClawData backend API server."""
    import signal

    click.secho("  Stopping ClawData server...", fg="cyan")
    try:
        result = subprocess.run(
            ["lsof", "-ti", ":8000"],
            capture_output=True, text=True,
        )
        pids = result.stdout.strip().split("\n")
        killed = 0
        for pid in pids:
            if pid.strip():
                try:
                    os.kill(int(pid.strip()), signal.SIGTERM)
                    killed += 1
                except (ProcessLookupError, ValueError):
                    pass
        if killed:
            click.secho(f"  ✓ Stopped {killed} process(es)", fg="green")
        else:
            click.secho("  No server process found on port 8000", fg="yellow")
    except Exception as exc:
        click.secho(f"  ✗ Failed to stop server: {exc}", fg="red")


def main():
    """Entry point for the CLI."""
    cli()


if __name__ == "__main__":
    main()
