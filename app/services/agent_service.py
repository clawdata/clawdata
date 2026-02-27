"""Agent service — CRUD + workspace management."""

from __future__ import annotations

import logging
import shutil
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.agent import Agent
from app.schemas.agent import AgentCreate, AgentUpdate

logger = logging.getLogger(__name__)

# Default workspace markdown files seeded for new agents
_WORKSPACE_FILES = {
    "AGENTS.md": """\
# AGENTS.md — Your Workspace

This folder is home. Treat it that way.

## First Run

If `BOOTSTRAP.md` exists, follow it to learn who you are and who your \
human is. Once done, delete BOOTSTRAP.md — you won't need it again.

## Every Session

Before doing anything else:

1. Read `SOUL.md` — this is who you are.
2. Read `USER.md` — this is who you're helping.
3. Read `memory/` files (today + yesterday) for recent context.
4. If `MEMORY.md` exists, read it for long-term context.

Don't ask permission. Just do it.

## Memory

You wake up fresh each session. These files ARE your continuity:

- **Daily notes:** `memory/YYYY-MM-DD.md` — your notes about what happened each day.
- **Long-term:** `MEMORY.md` — curated insights, decisions, and context worth keeping.

Daily files may contain conversation timestamps left by the system as breadcrumbs. \
Add your own notes alongside them — summaries, decisions, things to remember. \
Do NOT paste full chat logs; session history already lives on the gateway.

### 📝 Write It Down — No "Mental Notes"!

- **Memory is limited** — if you want to remember something, WRITE IT TO A FILE.
- "Mental notes" don't survive session restarts. Files do.
- When someone tells you their name → update `USER.md` immediately.
- When something important happens → add a note to `memory/YYYY-MM-DD.md`.
- When you learn a personal preference → update `USER.md`.
- When you make a decision worth keeping → update `MEMORY.md`.
- **Text > Brain** 📝

## Safety

- Don't exfiltrate private data. Ever.
- Don't run destructive commands without asking.
- When in doubt, ask.
""",
    "SOUL.md": """\
# Persona

You are a senior data engineer. You are precise, pragmatic, and security-conscious.
You prefer convention over configuration. You write clean SQL and well-structured
DAGs. You explain trade-offs clearly.

## Continuity

Each session, you wake up fresh. These files ARE your memory. Read them. \
Update them. They're how you persist.
""",
    "USER.md": """\
# User Profile

- **Name:**
- **What to call them:**
- **Timezone:**
- **Notes:**

## Context

_(Update this as you learn about the person you're helping.)_
""",
    "TOOLS.md": """\
# Tool Notes

- Use `read` to inspect existing project files before making changes.
- Use templates from the `templates/` directory for scaffolding.
- Store durable decisions in `memory/YYYY-MM-DD.md`.
- Update `USER.md` when you learn something about the user.
""",
    "IDENTITY.md": """\
# Identity

Name: ClawData
Emoji: ꩜
Vibe: Helpful data engineering assistant
""",
    "MEMORY.md": """\
# Memory

_Long-term curated memory. Update this with important facts, decisions, and context._
""",
    "HEARTBEAT.md": """\
# Heartbeat

_Scheduled tasks, recurring checks, and cron-style automation._

## How It Works

The heartbeat fires periodically. Use this file to define what should happen \
on each tick — health checks, data freshness monitors, recurring reports, etc.

## Tasks

_(Add scheduled tasks below. Format: description, frequency, what to do.)_
""",
    "BOOTSTRAP.md": """\
# BOOTSTRAP.md — Hello, World

_You just woke up. Time to figure out who you are._

There is no memory yet. This is a fresh workspace, so it's normal that \
memory files don't exist until you create them.

## The Conversation

Start by introducing yourself and asking:

1. **Their name** — What should you call them?
2. **Your name** — What should they call you? (suggest something if they're stuck)
3. **Your vibe** — Formal? Casual? Snarky? Warm?

## IMPORTANT: Save What You Learn

As soon as you learn the user's name or preferences:

1. **Update `USER.md`** immediately with their name and any details.
2. **Update `IDENTITY.md`** with your chosen name, emoji, and vibe.
3. **Update `MEMORY.md`** with a summary of this first conversation.

Do NOT wait until the end. Write to files AS you learn things.

## When You're Done

Delete this file (BOOTSTRAP.md). You don't need it anymore — you're you now.
""",
}


def agent_workspace(agent_id: str) -> Path:
    """Return the canonical userdata workspace path for an agent."""
    return settings.userdata_dir / "agents" / agent_id


async def list_agents(db: AsyncSession) -> list[Agent]:
    result = await db.execute(select(Agent).order_by(Agent.created_at))
    return list(result.scalars().all())


async def get_agent(db: AsyncSession, agent_id: str) -> Agent | None:
    return await db.get(Agent, agent_id)


async def create_agent(db: AsyncSession, data: AgentCreate) -> Agent:
    workspace = agent_workspace(data.id)

    agent = Agent(
        id=data.id,
        name=data.name,
        description=data.description,
        workspace_path=str(workspace),
        model=data.model,
        role=data.role,
        parent_id=data.parent_id,
        emoji=data.emoji,
        source="local",
    )
    db.add(agent)

    # Seed workspace on disk
    _seed_workspace(workspace)

    await db.commit()
    await db.refresh(agent)
    return agent


async def update_agent(db: AsyncSession, agent_id: str, data: AgentUpdate) -> Agent | None:
    agent = await db.get(Agent, agent_id)
    if not agent:
        return None

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(agent, field, value)

    await db.commit()
    await db.refresh(agent)
    return agent


async def delete_agent(db: AsyncSession, agent_id: str) -> bool:
    agent = await db.get(Agent, agent_id)
    if not agent:
        return False

    # Also delete from the OpenClaw gateway if it's a gateway-managed agent
    if agent.source == "openclaw":
        try:
            from app.services.openclaw_lifecycle import delete_openclaw_agent

            result = await delete_openclaw_agent(agent_id, delete_files=True)
            if not result.success:
                logger.warning(
                    "Gateway delete for agent '%s' failed: %s", agent_id, result.message
                )
        except Exception as exc:
            logger.warning("Could not delete agent '%s' from gateway: %s", agent_id, exc)

    # Clean up local workspace directory
    workspace = agent_workspace(agent_id)
    if workspace.exists():
        shutil.rmtree(workspace, ignore_errors=True)

    await db.delete(agent)
    await db.commit()
    return True


async def sync_openclaw_agents(
    db: AsyncSession,
    gateway_agents: list[dict],
) -> list[Agent]:
    """Upsert OpenClaw gateway agents into the local DB.

    ``gateway_agents`` is a list of dicts with keys:
        id, name, emoji, model, is_default, workspace (optional)

    Returns the full list of synced Agent rows.
    """
    synced: list[Agent] = []
    for gw in gateway_agents:
        agent_id = gw["id"]
        existing = await db.get(Agent, agent_id)

        workspace = agent_workspace(agent_id)

        if existing:
            # Update mutable fields from gateway
            existing.name = gw.get("name") or existing.name
            existing.emoji = gw.get("emoji", existing.emoji) or existing.emoji
            if gw.get("model"):
                existing.model = gw["model"]
            existing.openclaw_workspace = gw.get("workspace") or existing.openclaw_workspace
            existing.source = "openclaw"
            existing.is_active = True
            # Ensure workspace dir exists even if record existed before restructure
            if existing.workspace_path != str(workspace):
                _migrate_workspace(Path(existing.workspace_path), workspace)
                existing.workspace_path = str(workspace)
            synced.append(existing)
        else:
            agent = Agent(
                id=agent_id,
                name=gw.get("name") or agent_id,
                description="",
                workspace_path=str(workspace),
                model=gw.get("model") or "anthropic/claude-sonnet-4-5",
                role="agent",
                source="openclaw",
                emoji=gw.get("emoji", ""),
                openclaw_workspace=gw.get("workspace"),
                is_active=True,
            )
            db.add(agent)
            _seed_workspace(workspace)
            synced.append(agent)

    await db.commit()
    for a in synced:
        await db.refresh(a)
    return synced


async def reset_agents(db: AsyncSession) -> None:
    """Delete all agents from the DB and wipe their workspace directories,
    then re-create the default 'main' agent with fresh seed files."""
    # Delete all agent rows from DB
    agents = await list_agents(db)
    for agent in agents:
        await db.delete(agent)
    await db.commit()

    # Wipe the entire agents directory (catches orphans not in DB)
    agents_root = settings.userdata_dir / "agents"
    if agents_root.exists():
        shutil.rmtree(agents_root, ignore_errors=True)

    # Re-create the main agent
    main_ws = agent_workspace("main")
    main = Agent(
        id="main",
        name="ClawData",
        description="",
        workspace_path=str(main_ws),
        model="anthropic/claude-sonnet-4-5",
        role="agent",
        source="local",
        emoji="꩜",
        is_active=True,
    )
    db.add(main)
    _seed_workspace(main_ws)
    await db.commit()
    await db.refresh(main)


def _seed_workspace(workspace: Path) -> None:
    """Create workspace directory and seed default markdown files."""
    workspace.mkdir(parents=True, exist_ok=True)
    (workspace / "memory").mkdir(exist_ok=True)

    for filename, content in _WORKSPACE_FILES.items():
        path = workspace / filename
        if not path.exists():
            path.write_text(content)

    # Ensure the skills directory exists (users add skills manually)
    (workspace / "skills").mkdir(parents=True, exist_ok=True)


def _sync_project_skills_to_workspace(workspace: Path) -> None:
    """Symlink project-level skills into an agent's workspace/skills/ directory.

    Project skills (in ``settings.skills_dir``) are symlinked into the agent's
    workspace so the OpenClaw gateway can resolve them.  Agent-specific skills
    (non-symlinked directories already in the workspace) are left untouched.
    Stale symlinks pointing to removed project skills are cleaned up.
    """
    project_skills = settings.skills_dir.resolve()
    if not project_skills.is_dir():
        return

    ws_skills = workspace / "skills"
    ws_skills.mkdir(parents=True, exist_ok=True)

    # Collect project skill slugs for stale-link cleanup
    project_slugs: set[str] = set()
    for skill_dir in sorted(project_skills.iterdir()):
        if not skill_dir.is_dir() or skill_dir.name.startswith("."):
            continue
        if not (skill_dir / "SKILL.md").is_file():
            continue

        project_slugs.add(skill_dir.name)
        link = ws_skills / skill_dir.name

        if link.is_symlink():
            # Already a symlink — ensure it points to the right place
            if link.resolve() == skill_dir.resolve():
                continue
            link.unlink()
        elif link.exists():
            # Agent has its own (non-symlinked) override — leave it alone
            continue

        link.symlink_to(skill_dir.resolve())
        logger.debug("Symlinked project skill '%s' → %s", skill_dir.name, link)

    # Remove stale symlinks that point to project skills no longer on disk
    for entry in ws_skills.iterdir():
        if entry.is_symlink() and not entry.resolve().exists():
            logger.debug("Removing stale skill symlink: %s", entry.name)
            entry.unlink()


def sync_all_project_skills() -> dict[str, list[str]]:
    """Sync project-level skills into every agent workspace on disk.

    Returns a dict mapping agent_id → list of synced skill slugs.
    """
    agents_root = settings.userdata_dir / "agents"
    if not agents_root.is_dir():
        return {}

    result: dict[str, list[str]] = {}
    for agent_dir in sorted(agents_root.iterdir()):
        if not agent_dir.is_dir() or agent_dir.name.startswith("."):
            continue
        _sync_project_skills_to_workspace(agent_dir)
        # Report what's now linked
        ws_skills = agent_dir / "skills"
        linked = [
            e.name for e in sorted(ws_skills.iterdir())
            if e.is_symlink()
        ] if ws_skills.is_dir() else []
        result[agent_dir.name] = linked

    return result


def _migrate_workspace(old_path: Path, new_path: Path) -> None:
    """Move files from an old workspace location to the new one."""
    if not old_path.exists() or old_path == new_path:
        return
    new_path.mkdir(parents=True, exist_ok=True)
    for item in old_path.iterdir():
        dest = new_path / item.name
        if not dest.exists():
            shutil.move(str(item), str(dest))
    # Remove old dir if now empty
    try:
        old_path.rmdir()
    except OSError:
        pass
