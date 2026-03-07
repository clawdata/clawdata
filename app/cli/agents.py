"""Agent management CLI — interactive-first.

`clawdata agents`          → interactive agent manager
`clawdata agents list`     → non-interactive listing
"""

from __future__ import annotations

import click

from app.cli.helpers import async_command, run_with_db
from app.cli.output import (
    checklist,
    confirm,
    error,
    header,
    info,
    kv,
    pick,
    pick_action,
    success,
    table,
    warn,
)


# ═══════════════════════════════════════════════════════════════════════
# Interactive flow — `clawdata agents`
# ═══════════════════════════════════════════════════════════════════════


@click.group("agents", invoke_without_command=True)
@click.pass_context
@async_command
async def agents_group(ctx):
    """Manage agents — interactive browser when run without a subcommand."""
    if ctx.invoked_subcommand is not None:
        return
    await _interactive_agents()


async def _interactive_agents():
    """Main interactive agent manager."""
    while True:
        from app.services.lifecycle import list_openclaw_agents

        data = await list_openclaw_agents()
        agents = data.get("agents", [])

        if not agents:
            header("No Agents Found")
            warn("Gateway returned 0 agents — is it running?")
            action = pick_action(
                [
                    ("create", "Create a new agent"),
                    ("sync", "Sync agents from gateway"),
                    ("back", "← Exit"),
                ],
                prompt="What would you like to do?",
            )
        else:
            header(f"Agents ({len(agents)})")

            items = []
            for a in agents:
                emoji = a.get("emoji", "")
                default = " ★" if a.get("is_default") else ""
                model = a.get("model") or "—"
                items.append({
                    "id": a["id"],
                    "name": f"{emoji} {a['id']}{default}".strip(),
                    "description": model,
                    "_raw": a,
                })

            action, item = pick(
                items,
                label_key="name",
                prompt="Select an agent (#) or action",
                extra_actions=[
                    ("c", "Create new agent"),
                    ("s", "Sync from gateway"),
                ],
            )

            if action == "select" and item:
                await _agent_detail(item["_raw"])
                continue
            elif action == "c":
                action = "create"
            elif action == "s":
                action = "sync"
            else:
                return

        if action == "create":
            await _interactive_create_agent()
        elif action == "sync":
            await _do_sync()
        elif action in ("back", "b"):
            return


async def _agent_detail(agent: dict):
    """Show detail for a single agent and offer actions."""
    agent_id = agent["id"]
    header(f"Agent: {agent.get('emoji', '')} {agent_id}")
    kv("Model", agent.get("model") or "—")
    kv("Default", click.style("yes ★", fg="yellow") if agent.get("is_default") else "no")

    skills = agent.get("skills", [])
    if skills:
        kv("Skills", ", ".join(skills))
    else:
        kv("Skills", click.style("none", fg="bright_black"))

    # Try to get extended detail
    try:
        from app.services.lifecycle import get_agent_detail

        detail = await get_agent_detail(agent_id)
        if detail.get("workspace"):
            kv("Workspace", detail["workspace"])
        sessions = detail.get("sessions", [])
        if sessions:
            kv("Sessions", len(sessions))
    except Exception:
        pass

    while True:
        action = pick_action(
            [
                ("skills", "Manage skills for this agent"),
                ("files", "View agent files"),
                ("sessions", "View sessions"),
                ("delete", "Delete this agent"),
                ("back", "← Back to agent list"),
            ],
            prompt="Action",
        )

        if action == "skills":
            await _manage_agent_skills(agent_id)
        elif action == "files":
            await _view_agent_files(agent_id)
        elif action == "sessions":
            await _view_agent_sessions(agent_id)
        elif action == "delete":
            await _delete_agent(agent_id)
            return  # Go back to list after delete
        else:
            return


async def _manage_agent_skills(agent_id: str):
    """Toggle skills on/off for a specific agent via checklist."""
    from app.services.lifecycle import (
        deploy_project_skill,
        list_project_skills,
        list_workspace_skills,
        unlink_project_skill,
    )

    project_skills = list_project_skills()
    if not project_skills:
        warn("No project skills found in skills/ directory")
        return

    data = await list_workspace_skills(agent_id)
    deployed_slugs = {s["slug"] for s in data.get("workspace_skills", [])}

    header(f"Skills for '{agent_id}'")
    info("Toggle skills with their number, then press [d] to apply")

    items = [
        {
            "id": s["slug"],
            "name": s["name"],
            "description": s.get("description", "")[:60],
        }
        for s in project_skills
    ]

    selected = checklist(items, checked=deployed_slugs)
    selected_slugs = {s["id"] for s in selected}

    to_deploy = selected_slugs - deployed_slugs
    to_remove = deployed_slugs - selected_slugs

    if not to_deploy and not to_remove:
        info("No changes")
        return

    click.echo()
    if to_deploy:
        for slug in sorted(to_deploy):
            click.echo(f"    {click.style('+', fg='green', bold=True)} {slug}")
    if to_remove:
        for slug in sorted(to_remove):
            click.echo(f"    {click.style('-', fg='red', bold=True)} {slug}")

    click.echo()
    if not confirm(f"Apply {len(to_deploy)} deploy(s) and {len(to_remove)} removal(s)?"):
        info("Cancelled")
        return

    for slug in sorted(to_deploy):
        result = await deploy_project_skill(agent_id, slug)
        if result.get("success"):
            success(f"Deployed '{slug}'")
        else:
            error(f"Deploy '{slug}': {result.get('message', 'failed')}")

    for slug in sorted(to_remove):
        result = await unlink_project_skill(agent_id, slug)
        if result.get("success"):
            success(f"Removed '{slug}'")
        else:
            error(f"Remove '{slug}': {result.get('message', 'failed')}")


async def _view_agent_files(agent_id: str):
    """View the files in an agent's workspace."""
    try:
        from app.services.lifecycle import get_agent_files

        data = await get_agent_files(agent_id)
        files = data.get("files", [])
        header(f"Files for '{agent_id}'")
        if not files:
            info("No files")
            return
        for f in files:
            name = f.get("name", "?")
            size = f.get("size", "")
            icon = "📄" if not name.endswith("/") else "📁"
            click.echo(f"    {icon} {name}  {click.style(str(size), fg='bright_black')}")
        click.echo()
    except Exception as exc:
        error(f"Could not list files: {exc}")


async def _view_agent_sessions(agent_id: str):
    """View sessions for an agent."""
    try:
        from app.services.lifecycle import get_agent_sessions

        data = await get_agent_sessions(agent_id)
        sessions = data.get("sessions", [])
        header(f"Sessions for '{agent_id}' ({len(sessions)})")
        if not sessions:
            info("No sessions")
            return
        for s in sessions:
            sid = s.get("id", "?")[:12]
            msgs = s.get("message_count", s.get("messages", "?"))
            click.echo(f"    {click.style(sid, fg='cyan')}  messages: {msgs}")
        click.echo()
    except Exception as exc:
        error(f"Could not list sessions: {exc}")


async def _interactive_create_agent():
    """Interactively create a new agent."""
    header("Create a New Agent")

    agent_id = click.prompt(click.style("  Agent ID (lowercase, hyphens)", fg="cyan"))
    name = click.prompt(click.style("  Display name", fg="cyan"), default=agent_id)
    model = click.prompt(click.style("  Model", fg="cyan"), default="anthropic/claude-sonnet-4-5")
    emoji = click.prompt(click.style("  Emoji (optional)", fg="cyan"), default="")

    click.echo()
    info(f"Creating agent '{agent_id}' ({name})...")

    from app.services.lifecycle import create_agent as gw_create

    result = await gw_create({
        "id": agent_id,
        "name": name,
        "model": model,
        "emoji": emoji,
    })

    if result.get("success"):
        success(f"Agent '{agent_id}' created on gateway")
        # Also sync to DB
        await _do_sync()
    else:
        error(f"Failed: {result.get('message')}")


async def _delete_agent(agent_id: str):
    """Delete an agent after confirmation."""
    if not confirm(f"Delete agent '{agent_id}'? This cannot be undone"):
        return

    from app.services.lifecycle import delete_agent as gw_delete

    result = await gw_delete(agent_id)
    if result.get("success"):
        success(f"Agent '{agent_id}' deleted from gateway")
    else:
        error(f"Gateway: {result.get('message')}")

    # Also remove from DB
    from app.services import agent_service

    try:
        await run_with_db(lambda db: agent_service.delete_agent(db, agent_id))
    except Exception:
        pass


async def _do_sync():
    """Sync agents from gateway to local DB."""
    from app.services import agent_service
    from app.services.lifecycle import list_openclaw_agents
    from app.database import async_session, init_db

    data = await list_openclaw_agents()
    gateway_agents = data.get("agents", [])

    if not gateway_agents:
        warn("No agents on gateway")
        return

    await init_db()
    async with async_session() as db:
        synced = await agent_service.sync_agents_from_gateway(db, gateway_agents)

    success(f"Synced {len(synced)} agents: {', '.join(a.id for a in synced)}")


# ═══════════════════════════════════════════════════════════════════════
# Non-interactive subcommands (scripting / CI)
# ═══════════════════════════════════════════════════════════════════════


@agents_group.command("list")
@click.option("--gateway", is_flag=True, help="List from gateway (live) instead of DB")
@async_command
async def list_agents(gateway: bool):
    """List all registered agents (non-interactive)."""
    if gateway:
        from app.services.lifecycle import list_openclaw_agents

        data = await list_openclaw_agents()
        agents = data.get("agents", [])
        header(f"Gateway Agents ({len(agents)})")
        if not agents:
            warn("No agents found on gateway")
            return
        rows = [
            [
                click.style("★", fg="yellow") if a.get("is_default") else " ",
                a["id"],
                a.get("emoji") or "",
                a.get("name", ""),
                a.get("model") or "—",
            ]
            for a in agents
        ]
        table(["", "ID", "", "Name", "Model"], rows)
    else:
        from app.services import agent_service

        agents = await run_with_db(lambda db: agent_service.list_agents(db))
        header(f"Agents ({len(agents)})")
        if not agents:
            warn("No agents in database — run 'clawdata agents sync' first")
            return
        rows = [
            [
                click.style("●", fg="green") if a.is_active else click.style("○", fg="red"),
                a.id,
                a.emoji or "",
                a.name,
                a.model,
                a.role,
            ]
            for a in agents
        ]
        table(["", "ID", "", "Name", "Model", "Role"], rows)


@agents_group.command("show")
@click.argument("agent_id")
@async_command
async def show_agent(agent_id: str):
    """Show details for a specific agent (non-interactive)."""
    from app.services.lifecycle import get_agent_detail

    detail = await get_agent_detail(agent_id)
    if not detail or detail.get("error"):
        error(f"Agent '{agent_id}' not found")
        return
    header(f"Agent: {agent_id}")
    kv("Name", detail.get("name", "—"))
    kv("Emoji", detail.get("emoji", "—"))
    kv("Model", detail.get("model", "—"))
    kv("Workspace", detail.get("workspace", "—"))
    skills = detail.get("skills", [])
    kv("Skills", ", ".join(skills) if skills else "none")
    sessions = detail.get("sessions", [])
    kv("Sessions", len(sessions))


@agents_group.command("create")
@click.option("--id", "agent_id", required=True, help="Agent ID (lowercase, hyphens)")
@click.option("--name", required=True, help="Display name")
@click.option("--model", default="anthropic/claude-sonnet-4-5", help="Model to use")
@click.option("--emoji", default="", help="Agent emoji")
@async_command
async def create_agent(agent_id: str, name: str, model: str, emoji: str):
    """Create a new agent (non-interactive)."""
    from app.services.lifecycle import create_agent as gw_create

    result = await gw_create({"id": agent_id, "name": name, "model": model, "emoji": emoji})
    if result.get("success"):
        success(f"Agent '{agent_id}' created")
    else:
        error(f"Failed: {result.get('message')}")


@agents_group.command("delete")
@click.argument("agent_id")
@click.option("--yes", "-y", is_flag=True, help="Skip confirmation")
@async_command
async def delete_agent_cmd(agent_id: str, yes: bool):
    """Delete an agent (non-interactive)."""
    if not yes:
        click.confirm(f"Delete agent '{agent_id}'?", abort=True)
    from app.services.lifecycle import delete_agent as gw_delete

    result = await gw_delete(agent_id)
    if result.get("success"):
        success(f"Agent '{agent_id}' deleted")
    else:
        error(f"Failed: {result.get('message')}")


@agents_group.command("sync")
@async_command
async def sync_agents():
    """Sync agents from gateway to local DB (non-interactive)."""
    await _do_sync()