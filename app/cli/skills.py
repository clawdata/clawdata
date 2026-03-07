"""Skill management CLI — interactive-first.

`clawdata skills`          → pick agent, toggle skills on/off
`clawdata skills list`     → non-interactive listing (for scripting)
`clawdata skills deploy`   → non-interactive deploy
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
# Interactive flow — `clawdata skills`
# ═══════════════════════════════════════════════════════════════════════


@click.group("skills", invoke_without_command=True)
@click.pass_context
@async_command
async def skills_group(ctx):
    """Manage skills — interactive browser when run without a subcommand."""
    if ctx.invoked_subcommand is not None:
        return
    await _interactive_skills()


async def _interactive_skills():
    """Pick an agent, then toggle project skills on/off with a checklist."""
    from app.services.lifecycle import (
        deploy_project_skill,
        list_openclaw_agents,
        list_project_skills,
        list_workspace_skills,
        unlink_project_skill,
    )

    # ── Get agents ────────────────────────────────────────────────
    data = await list_openclaw_agents()
    agents = data.get("agents", [])

    if not agents:
        warn("No agents found — is the gateway running?")
        return

    # If only one agent, auto-select it
    if len(agents) == 1:
        agent = agents[0]
        agent_id = agent["id"]
        info(f"Agent: {agent.get('emoji', '')} {agent_id}")
    else:
        header("Select an agent")
        items = [
            {
                "id": a["id"],
                "name": f"{a.get('emoji', '')} {a['id']}{'  ★' if a.get('is_default') else ''}".strip(),
                "description": a.get("model") or "",
            }
            for a in agents
        ]
        action, item = pick(items, label_key="name", prompt="Agent (#) or [b]ack")
        if action != "select" or not item:
            return
        agent_id = item["id"]
        agent = next(a for a in agents if a["id"] == agent_id)

    # ── Get project skills + current deployments ──────────────────
    project_skills = list_project_skills()
    if not project_skills:
        warn("No project skills found in skills/ directory")
        return

    ws_data = await list_workspace_skills(agent_id)
    deployed_slugs = {s["slug"] for s in ws_data.get("workspace_skills", [])}

    header(f"Skills for {agent.get('emoji', '')} {agent_id}")
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

    # ── Compute diff ──────────────────────────────────────────────
    to_deploy = selected_slugs - deployed_slugs
    to_remove = deployed_slugs - selected_slugs

    if not to_deploy and not to_remove:
        info("No changes")
        return

    # Show summary
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

    # ── Apply changes ─────────────────────────────────────────────
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

    click.echo()


# ═══════════════════════════════════════════════════════════════════════
# Non-interactive subcommands (scripting / CI)
# ═══════════════════════════════════════════════════════════════════════


@skills_group.command("list")
@click.option("--agent", "agent_id", default=None, help="List skills for a specific agent")
@click.option("--project", is_flag=True, help="List project-level skills only")
@async_command
async def list_skills(agent_id: str | None, project: bool):
    """List available skills (non-interactive)."""
    if project or not agent_id:
        from app.services.lifecycle import list_project_skills

        skills = list_project_skills()
        header(f"Project Skills ({len(skills)})")
        if not skills:
            warn("No project skills found in skills/ directory")
        else:
            rows = [[s["slug"], s["name"], s.get("description", "")[:60]] for s in skills]
            table(["Slug", "Name", "Description"], rows)

    if agent_id:
        from app.services.lifecycle import list_workspace_skills

        data = await list_workspace_skills(agent_id)
        ws_skills = data.get("workspace_skills", [])
        header(f"Workspace Skills for '{agent_id}' ({len(ws_skills)})")
        if not ws_skills:
            info("No workspace skills")
        else:
            rows = [
                [s["slug"], s["name"], "symlink" if s.get("is_symlink") else "local", s.get("description", "")[:50]]
                for s in ws_skills
            ]
            table(["Slug", "Name", "Source", "Description"], rows)


@skills_group.command("show")
@click.argument("slug")
@click.option("--agent", "agent_id", default=None, help="Agent workspace")
@async_command
async def show_skill(slug: str, agent_id: str | None):
    """Show a skill's content (non-interactive)."""
    if agent_id:
        from app.services.lifecycle import get_workspace_skill

        try:
            skill = await get_workspace_skill(agent_id, slug)
        except FileNotFoundError:
            error(f"Skill '{slug}' not found for agent '{agent_id}'")
            return
    else:
        from app.config import settings

        skill_md = settings.skills_dir / slug / "SKILL.md"
        if not skill_md.is_file():
            error(f"Project skill '{slug}' not found")
            return
        content = skill_md.read_text(errors="replace")
        skill = {"name": slug, "slug": slug, "content": content, "location": "project", "path": str(skill_md.parent)}

    header(f"Skill: {skill['name']}")
    kv("Slug", skill["slug"])
    kv("Location", skill.get("location", "—"))
    click.echo()
    for line in skill.get("content", "").splitlines():
        click.echo(f"    {line}")
    click.echo()


@skills_group.command("deploy")
@click.argument("slug")
@click.option("--agent", "agent_id", required=True, help="Target agent ID")
@async_command
async def deploy_skill(slug: str, agent_id: str):
    """Deploy a project skill to an agent (non-interactive)."""
    from app.services.lifecycle import deploy_project_skill

    result = await deploy_project_skill(agent_id, slug)
    if result.get("success"):
        success(result["message"])
    else:
        error(result.get("message", "Unknown error"))


@skills_group.command("undeploy")
@click.argument("slug")
@click.option("--agent", "agent_id", required=True, help="Target agent ID")
@click.option("--yes", "-y", is_flag=True, help="Skip confirmation")
@async_command
async def undeploy_skill(slug: str, agent_id: str, yes: bool):
    """Remove a deployed skill from an agent (non-interactive)."""
    if not yes:
        click.confirm(f"Remove skill '{slug}' from agent '{agent_id}'?", abort=True)

    from app.services.lifecycle import unlink_project_skill

    result = await unlink_project_skill(agent_id, slug)
    if result.get("success"):
        success(f"Skill '{slug}' removed")
    else:
        error(result.get("message", "Unknown error"))