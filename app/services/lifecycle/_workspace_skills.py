"""Workspace skill management — project SKILL.md files.

v2: Skills live in the ``skills/`` directory of each agent's workspace.
The gateway WS protocol only supports standard workspace files (IDENTITY.md,
SOUL.md, etc.), so skill files are read/written directly on the filesystem.
"""

from __future__ import annotations

import logging
import re
import shutil
from pathlib import Path

from app.config import settings
from app.services.lifecycle._helpers import resolve_agent_workspace

logger = logging.getLogger(__name__)

_FENCE_RE = re.compile(
    r"^`{3,}\s*skill\s*\n(.*?)\n`{3,}\s*$",
    re.DOTALL | re.MULTILINE,
)


def _strip_skill_fence(content: str) -> str:
    """Remove ```` ```skill ... ``` ```` code-fence wrapper if present.

    Some project SKILL.md files wrap the entire body in a fenced code block
    (e.g. `````skill … ````).  OpenClaw expects plain front-matter so we
    strip the fence before writing to the workspace.
    """
    m = _FENCE_RE.search(content)
    return m.group(1).strip() + "\n" if m else content


def _parse_skill_md(content: str) -> dict:
    """Extract metadata from a SKILL.md file."""
    # Strip any code-fence wrapper first so headings are visible
    clean = _strip_skill_fence(content)
    meta: dict = {"content": clean}

    # Try to extract name from first heading
    for line in clean.splitlines():
        line = line.strip()
        if line.startswith("# "):
            meta["name"] = line[2:].strip()
            break

    # Extract description from first paragraph after heading
    lines = clean.splitlines()
    in_desc = False
    desc_lines = []
    for line in lines:
        if line.strip().startswith("# "):
            in_desc = True
            continue
        if in_desc:
            if line.strip() == "" and desc_lines:
                break
            if line.strip().startswith("#"):
                break
            if line.strip():
                desc_lines.append(line.strip())
    meta["description"] = " ".join(desc_lines) if desc_lines else ""

    return meta


def _scan_skills_dir(skills_dir: Path) -> list[dict]:
    """Scan a directory for SKILL.md files and return metadata."""
    if not skills_dir.is_dir():
        return []

    skills = []
    for entry in sorted(skills_dir.iterdir()):
        if not entry.is_dir() or entry.name.startswith("."):
            continue
        skill_md = entry / "SKILL.md"
        if not skill_md.is_file():
            continue

        content = skill_md.read_text(errors="replace")
        meta = _parse_skill_md(content)

        skills.append({
            "name": meta.get("name", entry.name),
            "slug": entry.name,
            "description": meta.get("description", ""),
            "metadata": {},
            "content": content,
            "location": "project",
            "agent_id": None,
            "path": str(entry),
            "is_symlink": False,
        })

    return skills


def list_project_skills() -> list[dict]:
    """List project-level skills from the skills/ directory."""
    return _scan_skills_dir(settings.skills_dir)


async def list_workspace_skills(agent_id: str) -> dict:
    """List skills visible to an agent: project skills + agent workspace skills.

    Workspace skills are read directly from the agent's workspace/skills/
    directory on disk (the gateway doesn't expose non-standard files via WS).
    """
    project = list_project_skills()

    # Scan agent workspace for custom skills
    workspace_skills = []
    try:
        ws_path = await resolve_agent_workspace(agent_id)
        skills_dir = ws_path / "skills"
        if skills_dir.is_dir():
            for entry in sorted(skills_dir.iterdir()):
                if not entry.is_dir() or entry.name.startswith("."):
                    continue
                skill_md = entry / "SKILL.md"
                if not skill_md.is_file():
                    continue
                content = skill_md.read_text(errors="replace")
                meta = _parse_skill_md(content)
                workspace_skills.append({
                    "name": meta.get("name", entry.name),
                    "slug": entry.name,
                    "description": meta.get("description", ""),
                    "metadata": {},
                    "content": content,
                    "location": "workspace",
                    "agent_id": agent_id,
                    "path": str(skill_md),
                    "is_symlink": entry.is_symlink(),
                })
    except Exception as exc:
        logger.warning("Failed to scan workspace skills for %s: %s", agent_id, exc)

    return {
        "workspace_skills": workspace_skills,
        "project_skills": project,
        "managed_skills": [],
    }


async def get_workspace_skill(agent_id: str, slug: str) -> dict:
    """Get a specific skill by slug, checking workspace then project."""
    # Check agent workspace first (filesystem)
    try:
        ws_path = await resolve_agent_workspace(agent_id)
        skill_md = ws_path / "skills" / slug / "SKILL.md"
        if skill_md.is_file():
            content = skill_md.read_text(errors="replace")
            meta = _parse_skill_md(content)
            return {
                "name": meta.get("name", slug),
                "slug": slug,
                "description": meta.get("description", ""),
                "metadata": {},
                "content": content,
                "location": "workspace",
                "agent_id": agent_id,
                "path": str(skill_md),
                "is_symlink": False,
            }
    except Exception:
        pass

    # Fall back to project skills
    skill_dir = settings.skills_dir / slug
    skill_md = skill_dir / "SKILL.md"
    if skill_md.is_file():
        content = skill_md.read_text(errors="replace")
        meta = _parse_skill_md(content)
        return {
            "name": meta.get("name", slug),
            "slug": slug,
            "description": meta.get("description", ""),
            "metadata": {},
            "content": content,
            "location": "project",
            "agent_id": None,
            "path": str(skill_dir),
            "is_symlink": False,
        }

    raise FileNotFoundError(f"Skill '{slug}' not found")


async def create_workspace_skill(
    agent_id: str,
    *,
    name: str,
    description: str = "",
    instructions: str = "",
) -> dict:
    """Create a new custom skill in the agent workspace (filesystem)."""
    slug = re.sub(r"[^a-z0-9-]", "-", name.lower()).strip("-")

    content = f"# {name}\n\n"
    if description:
        content += f"{description}\n\n"
    if instructions:
        content += f"## Instructions\n\n{instructions}\n"

    ws_path = await resolve_agent_workspace(agent_id)
    skill_dir = ws_path / "skills" / slug
    skill_dir.mkdir(parents=True, exist_ok=True)
    (skill_dir / "SKILL.md").write_text(content)

    meta = _parse_skill_md(content)
    return {
        "name": meta.get("name", slug),
        "slug": slug,
        "description": meta.get("description", ""),
        "metadata": {},
        "content": content,
        "location": "workspace",
        "agent_id": agent_id,
        "path": str(skill_dir / "SKILL.md"),
        "is_symlink": False,
    }


async def update_workspace_skill(agent_id: str, slug: str, content: str) -> dict:
    """Update the SKILL.md content for a workspace skill (filesystem)."""
    ws_path = await resolve_agent_workspace(agent_id)
    skill_md = ws_path / "skills" / slug / "SKILL.md"

    if not skill_md.parent.is_dir():
        skill_md.parent.mkdir(parents=True, exist_ok=True)
    skill_md.write_text(content)

    meta = _parse_skill_md(content)
    return {
        "name": meta.get("name", slug),
        "slug": slug,
        "description": meta.get("description", ""),
        "metadata": {},
        "content": content,
        "location": "workspace",
        "agent_id": agent_id,
        "path": str(skill_md),
        "is_symlink": False,
    }


async def delete_workspace_skill(agent_id: str, slug: str) -> dict:
    """Delete a workspace skill by removing its directory from disk."""
    ws_path = await resolve_agent_workspace(agent_id)
    skill_dir = ws_path / "skills" / slug

    if skill_dir.is_dir():
        shutil.rmtree(skill_dir)
    return {"success": True, "message": f"Skill '{slug}' deleted"}


async def deploy_project_skill(agent_id: str, slug: str) -> dict:
    """Copy a project-level skill into the agent workspace (filesystem)."""
    skill_dir = settings.skills_dir / slug
    skill_md = skill_dir / "SKILL.md"
    if not skill_md.is_file():
        return {"success": False, "message": f"Project skill '{slug}' not found"}

    raw = skill_md.read_text(errors="replace")
    # Strip code-fence wrapper so OpenClaw can parse the front-matter
    content = _strip_skill_fence(raw)

    ws_path = await resolve_agent_workspace(agent_id)
    target_dir = ws_path / "skills" / slug
    target_dir.mkdir(parents=True, exist_ok=True)
    (target_dir / "SKILL.md").write_text(content)

    return {"success": True, "message": f"Skill '{slug}' deployed to agent workspace"}


async def unlink_project_skill(agent_id: str, slug: str) -> dict:
    """Remove a deployed project skill from the agent workspace."""
    return await delete_workspace_skill(agent_id, slug)
