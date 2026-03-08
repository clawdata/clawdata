"""Task CRUD + template + run-history endpoints."""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.task import (
    TaskCreate,
    TaskDetailResponse,
    TaskResponse,
    TaskRunCreate,
    TaskRunResponse,
    TaskTemplateResponse,
    TaskUpdate,
)
from app.services import task_service, audit_service
from app.services.heartbeat_sync import sync_heartbeat

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Manual execute ───────────────────────────────────────────────────

@router.post("/{task_id}/execute", response_model=TaskRunResponse)
async def execute_task(task_id: str, db: AsyncSession = Depends(get_db)):
    """Manually trigger immediate execution of a task."""
    task = await task_service.get_task(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    from app.services.job_scheduler import scheduler

    run = await scheduler.execute_manual(task_id)
    if not run:
        raise HTTPException(status_code=500, detail="Task execution failed to start")
    return run


# ── Task templates ───────────────────────────────────────────────────

@router.get("/templates", response_model=list[TaskTemplateResponse])
async def list_templates():
    return task_service.list_task_templates()


@router.get("/templates/{template_id}", response_model=TaskTemplateResponse)
async def get_template(template_id: str):
    t = task_service.get_task_template(template_id)
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    return t


# ── Task CRUD ────────────────────────────────────────────────────────

@router.get("/", response_model=list[TaskResponse])
async def list_tasks(db: AsyncSession = Depends(get_db)):
    return await task_service.list_tasks(db)


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(task_id: str, db: AsyncSession = Depends(get_db)):
    task = await task_service.get_task(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.get("/{task_id}/detail", response_model=TaskDetailResponse)
async def get_task_detail(task_id: str, db: AsyncSession = Depends(get_db)):
    detail = await task_service.get_task_detail(db, task_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Task not found")
    return detail


@router.post("/", response_model=TaskResponse, status_code=201)
async def create_task(data: TaskCreate, db: AsyncSession = Depends(get_db)):
    existing = await task_service.get_task(db, data.id)
    if existing:
        raise HTTPException(status_code=409, detail="Task already exists")
    task = await task_service.create_task(db, data)
    await audit_service.log_event(
        db,
        event_type="task.created",
        action=f"Created task '{data.id}'",
        agent_id=data.agent_id,
        details={
            "name": data.name,
            "schedule_type": data.schedule_type or "cron",
            "cron": data.cron_expression,
        },
    )
    await sync_heartbeat(db, data.agent_id)
    return task


@router.patch("/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: str, data: TaskUpdate, db: AsyncSession = Depends(get_db)
):
    task = await task_service.update_task(db, task_id, data)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    changes = {k: v for k, v in data.model_dump(exclude_unset=True).items()}
    await audit_service.log_event(
        db,
        event_type="task.updated",
        action=f"Updated task '{task_id}'",
        agent_id=task.agent_id,
        details={"changes": changes},
    )
    await sync_heartbeat(db, task.agent_id)
    return task


@router.delete("/{task_id}", status_code=204)
async def delete_task(task_id: str, db: AsyncSession = Depends(get_db)):
    task = await task_service.get_task(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    agent_id = task.agent_id
    await task_service.delete_task(db, task_id)
    await audit_service.log_event(
        db,
        event_type="task.deleted",
        action=f"Deleted task '{task_id}'",
    )
    await sync_heartbeat(db, agent_id)


# ── Task runs ────────────────────────────────────────────────────────

@router.get("/{task_id}/runs", response_model=list[TaskRunResponse])
async def list_runs(
    task_id: str,
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    task = await task_service.get_task(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return await task_service.list_runs(db, task_id, limit=limit)


@router.post("/{task_id}/runs", response_model=TaskRunResponse, status_code=201)
async def create_run(
    task_id: str, data: TaskRunCreate, db: AsyncSession = Depends(get_db)
):
    task = await task_service.get_task(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    data.task_id = task_id
    return await task_service.create_run(db, data)


@router.patch("/runs/{run_id}", response_model=TaskRunResponse)
async def finish_run(
    run_id: int,
    result: str = Query(..., pattern=r"^(success|failed|skipped|timeout)$"),
    summary: str = "",
    output: str = "",
    error: str | None = None,
    duration_s: float | None = None,
    tokens_used: int | None = None,
    db: AsyncSession = Depends(get_db),
):
    run = await task_service.finish_run(
        db, run_id, result=result, summary=summary,
        output=output, error=error, duration_s=duration_s,
        tokens_used=tokens_used,
    )
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return run
