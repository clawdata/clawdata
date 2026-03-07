"""Template filesystem browsing endpoints.

v2: Templates are read directly from disk — no DB sync or Jinja rendering.
"""

from pathlib import Path

from fastapi import APIRouter, HTTPException, Query

from app.config import settings

router = APIRouter()


def _build_tree(base: Path, rel: Path | None = None) -> list[dict]:
    """Walk the templates directory and return a nested folder/file tree."""
    root = base if rel is None else base / rel
    if not root.exists() or not root.is_dir():
        return []

    entries: list[dict] = []
    for child in sorted(root.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower())):
        if child.name.startswith(".") or child.name == "__pycache__":
            continue
        rel_path = str(child.relative_to(base))
        if child.is_dir():
            entries.append(
                {
                    "name": child.name,
                    "path": rel_path,
                    "type": "folder",
                    "children": _build_tree(base, child.relative_to(base)),
                }
            )
        else:
            entries.append(
                {
                    "name": child.name,
                    "path": rel_path,
                    "type": "file",
                    "size": child.stat().st_size,
                }
            )
    return entries


@router.get("/browse")
async def browse_templates():
    """Return the live folder/file tree of the templates directory."""
    tree = _build_tree(settings.templates_dir)
    return {"root": str(settings.templates_dir), "tree": tree}


@router.get("/browse/file")
async def read_template_file(path: str = Query(..., description="Relative path within templates dir")):
    """Read the raw content of a file in the templates directory."""
    safe = Path(path)
    if ".." in safe.parts:
        raise HTTPException(status_code=400, detail="Invalid path")

    full = settings.templates_dir / safe
    if not full.exists() or not full.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    try:
        full.resolve().relative_to(settings.templates_dir.resolve())
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid path")

    content = full.read_text(errors="replace")
    return {"path": str(safe), "name": full.name, "content": content, "size": full.stat().st_size}
