"""Workspace SKILL.md management — scan, CRUD, symlink deploy."""

from __future__ import annotations

import json
import logging
import os
import re
import shutil
from pathlib import Path

from app.schemas.lifecycle import (
    ActionResult,
    WorkspaceSkill,
    WorkspaceSkillsList,
)

from ._helpers import OPENCLAW_HOME, OPENCLAW_WORKSPACE

logger = logging.getLogger(__name__)

# Project skills dir (repo-level custom skills)
_project_root = Path(__file__).resolve().parent.parent.parent.parent
PROJECT_SKILLS_DIR = _project_root / "skills"

MANAGED_SKILLS_DIR = OPENCLAW_HOME / "skills"


def _parse_skill_md(
    content: str,
    slug: str,
    location: str,
    agent_id: str | None = None,
    path: str = "",
) -> WorkspaceSkill:
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


def _scan_skills_dir(
    directory: Path, location: str, agent_id: str | None = None
) -> list[WorkspaceSkill]:
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
                content,
                slug=entry.name,
                location=location,
                agent_id=agent_id,
                path=str(skill_file),
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


async def update_workspace_skill(
    agent_id: str, slug: str, content: str
) -> WorkspaceSkill:
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
    """Symlink a project skill into an agent's workspace/skills/ directory."""
    from app.adapters.openclaw import openclaw

    src = PROJECT_SKILLS_DIR / slug
    src_file = src / "SKILL.md"
    if not src_file.is_file():
        return ActionResult(
            success=False, message=f"Project skill '{slug}' not found"
        )

    await openclaw.connect()
    files_raw = await openclaw.agent_files_list(agent_id)
    workspace = files_raw.get("workspace", "")
    ws_path = Path(os.path.expanduser(workspace)) if workspace else OPENCLAW_WORKSPACE
    dest = ws_path / "skills" / slug

    if dest.is_symlink():
        if dest.resolve() == src.resolve():
            return ActionResult(
                success=True, message=f"Skill '{slug}' already linked"
            )
        dest.unlink()
    elif dest.exists():
        shutil.rmtree(dest)

    ws_path_skills = ws_path / "skills"
    ws_path_skills.mkdir(parents=True, exist_ok=True)
    dest.symlink_to(src.resolve())

    return ActionResult(
        success=True, message=f"Skill '{slug}' linked for agent '{agent_id}'"
    )


async def unlink_project_skill(agent_id: str, slug: str) -> ActionResult:
    """Remove a symlinked project skill from an agent's workspace."""
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
        return ActionResult(
            success=False, message=f"Skill '{slug}' not found in workspace"
        )

    link.unlink()
    return ActionResult(
        success=True,
        message=f"Skill '{slug}' unlinked from agent '{agent_id}'",
    )


async def sync_workspace_skills(agent_id: str) -> list[str]:
    """Return the list of workspace skill slugs for an agent.

    OpenClaw automatically discovers SKILL.md files placed in the agent's
    workspace/skills/ directory.  Returns list of workspace skill slugs
    found on disk.
    """
    from app.adapters.openclaw import openclaw

    await openclaw.connect()

    disk_slugs: set[str] = set()
    try:
        files_raw = await openclaw.agent_files_list(agent_id)
        workspace = files_raw.get("workspace", "")
        ws_path = (
            Path(os.path.expanduser(workspace)) if workspace else OPENCLAW_WORKSPACE
        )
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
