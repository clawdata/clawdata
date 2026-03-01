"""Template CRUD + render + live filesystem browsing endpoints."""

import json
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.schemas.template import (
    TemplateCreate,
    TemplateRender,
    TemplateRenderResponse,
    TemplateResponse,
    TemplateUpdate,
)
from app.services import template_service

router = APIRouter()


# ── Live filesystem browsing ────────────────────────────────────────


def _build_tree(base: Path, rel: Path | None = None) -> list[dict]:
    """Walk the templates directory and return a nested folder/file tree."""
    root = base if rel is None else base / rel
    if not root.exists() or not root.is_dir():
        return []

    entries: list[dict] = []
    for child in sorted(root.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower())):
        # Skip hidden and __pycache__
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
    # Prevent path traversal
    safe = Path(path)
    if ".." in safe.parts:
        raise HTTPException(status_code=400, detail="Invalid path")

    full = settings.templates_dir / safe
    if not full.exists() or not full.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    # Ensure it's actually inside templates dir
    try:
        full.resolve().relative_to(settings.templates_dir.resolve())
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid path")

    content = full.read_text(errors="replace")
    return {"path": str(safe), "name": full.name, "content": content, "size": full.stat().st_size}


@router.get("/", response_model=list[TemplateResponse])
async def list_templates(
    category: str | None = None, db: AsyncSession = Depends(get_db)
):
    templates = await template_service.list_templates(db, category=category)
    results = []
    for t in templates:
        resp = TemplateResponse.model_validate(t)
        resp.variables = json.loads(t.variables) if t.variables else []
        results.append(resp)
    return results


@router.post("/", response_model=TemplateResponse, status_code=201)
async def create_template(data: TemplateCreate, db: AsyncSession = Depends(get_db)):
    tpl = await template_service.create_template(db, data)
    resp = TemplateResponse.model_validate(tpl)
    resp.variables = json.loads(tpl.variables) if tpl.variables else []
    return resp


@router.post("/sync", status_code=200)
async def sync_templates(db: AsyncSession = Depends(get_db)):
    """Re-scan the templates directory and upsert any .j2 files into the DB."""
    result = await template_service.sync_templates_from_disk(db)
    return {
        "created": result["created"],
        "updated": result["updated"],
        "message": f"{len(result['created'])} created, {len(result['updated'])} updated",
    }


@router.get("/{template_id:path}", response_model=TemplateResponse)
async def get_template(template_id: str, db: AsyncSession = Depends(get_db)):
    tpl, content = await template_service.get_template(db, template_id)
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")
    resp = TemplateResponse.model_validate(tpl)
    resp.variables = json.loads(tpl.variables) if tpl.variables else []
    resp.content = content
    return resp


@router.patch("/{template_id:path}", response_model=TemplateResponse)
async def update_template(
    template_id: str, data: TemplateUpdate, db: AsyncSession = Depends(get_db)
):
    tpl = await template_service.update_template(db, template_id, data)
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")
    resp = TemplateResponse.model_validate(tpl)
    resp.variables = json.loads(tpl.variables) if tpl.variables else []
    return resp


@router.delete("/{template_id:path}", status_code=204)
async def delete_template(template_id: str, db: AsyncSession = Depends(get_db)):
    deleted = await template_service.delete_template(db, template_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Template not found")


@router.post("/{template_id:path}/render", response_model=TemplateRenderResponse)
async def render_template(
    template_id: str,
    body: TemplateRender,
    db: AsyncSession = Depends(get_db),
):
    tpl, content = await template_service.get_template(db, template_id)
    if not tpl or not content:
        raise HTTPException(status_code=404, detail="Template not found")

    try:
        rendered = template_service.render_template(content, body.variables)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Render error: {e}")

    return TemplateRenderResponse(template_id=template_id, rendered=rendered)
