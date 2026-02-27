"""Template CRUD + render endpoints."""

import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

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


@router.get("/{template_id:path}", response_model=TemplateResponse)
async def get_template(template_id: str, db: AsyncSession = Depends(get_db)):
    tpl, content = await template_service.get_template(db, template_id)
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")
    resp = TemplateResponse.model_validate(tpl)
    resp.variables = json.loads(tpl.variables) if tpl.variables else []
    resp.content = content
    return resp


@router.post("/", response_model=TemplateResponse, status_code=201)
async def create_template(data: TemplateCreate, db: AsyncSession = Depends(get_db)):
    tpl = await template_service.create_template(db, data)
    resp = TemplateResponse.model_validate(tpl)
    resp.variables = json.loads(tpl.variables) if tpl.variables else []
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
