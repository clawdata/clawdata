"""Task service — CRUD for scheduled tasks + run history."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import func as sa_func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.task import Task
from app.models.task_run import TaskRun
from app.schemas.task import (
    TaskCreate,
    TaskDetailResponse,
    TaskResponse,
    TaskRunCreate,
    TaskRunResponse,
    TaskTemplateResponse,
    TaskUpdate,
)

logger = logging.getLogger(__name__)


async def list_tasks(db: AsyncSession) -> list[Task]:
    result = await db.execute(select(Task).order_by(Task.created_at.desc()))
    return list(result.scalars().all())


async def get_task(db: AsyncSession, task_id: str) -> Task | None:
    return await db.get(Task, task_id)


async def create_task(db: AsyncSession, data: TaskCreate) -> Task:
    task = Task(**data.model_dump())
    db.add(task)
    await db.commit()
    await db.refresh(task)
    logger.info("Created task %s (%s)", task.id, task.name)
    return task


async def update_task(db: AsyncSession, task_id: str, data: TaskUpdate) -> Task | None:
    task = await db.get(Task, task_id)
    if not task:
        return None
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(task, field, value)
    await db.commit()
    await db.refresh(task)
    return task


async def delete_task(db: AsyncSession, task_id: str) -> bool:
    task = await db.get(Task, task_id)
    if not task:
        return False
    await db.delete(task)
    await db.commit()
    logger.info("Deleted task %s", task_id)
    return True


# ── Task runs ────────────────────────────────────────────────────────

async def list_runs(db: AsyncSession, task_id: str, limit: int = 50) -> list[TaskRun]:
    result = await db.execute(
        select(TaskRun)
        .where(TaskRun.task_id == task_id)
        .order_by(TaskRun.started_at.desc())
        .limit(limit)
    )
    return list(result.scalars().all())


async def create_run(db: AsyncSession, data: TaskRunCreate) -> TaskRun:
    run = TaskRun(**data.model_dump())
    db.add(run)
    await db.commit()
    await db.refresh(run)
    return run


async def finish_run(
    db: AsyncSession,
    run_id: int,
    result: str,
    summary: str = "",
    output: str = "",
    error: str | None = None,
    duration_s: float | None = None,
    tokens_used: int | None = None,
) -> TaskRun | None:
    run = await db.get(TaskRun, run_id)
    if not run:
        return None
    run.result = result
    run.summary = summary
    run.output = output
    run.error = error
    run.duration_s = duration_s
    run.tokens_used = tokens_used
    run.finished_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(run)
    return run


async def get_task_detail(db: AsyncSession, task_id: str) -> TaskDetailResponse | None:
    task = await db.get(Task, task_id)
    if not task:
        return None

    runs = await list_runs(db, task_id, limit=50)

    # Counts
    total_q = await db.execute(
        select(sa_func.count()).where(TaskRun.task_id == task_id)
    )
    total_runs = total_q.scalar() or 0

    success_q = await db.execute(
        select(sa_func.count()).where(TaskRun.task_id == task_id, TaskRun.result == "success")
    )
    success_count = success_q.scalar() or 0

    fail_q = await db.execute(
        select(sa_func.count()).where(TaskRun.task_id == task_id, TaskRun.result == "failed")
    )
    fail_count = fail_q.scalar() or 0

    last_run = runs[0] if runs else None

    return TaskDetailResponse(
        task=TaskResponse.model_validate(task),
        runs=[TaskRunResponse.model_validate(r) for r in runs],
        total_runs=total_runs,
        success_count=success_count,
        fail_count=fail_count,
        last_run=TaskRunResponse.model_validate(last_run) if last_run else None,
    )


# ── Predefined task templates ────────────────────────────────────────

TASK_TEMPLATES: list[TaskTemplateResponse] = [
    TaskTemplateResponse(
        id="check-email",
        name="Check Email",
        description="Periodically scan inbox for urgent emails and surface important messages.",
        icon="mail",
        schedule_type="heartbeat",
        heartbeat_interval="30m",
        session_mode="main",
        message="Check inbox for urgent emails. Summarize anything that needs immediate attention.",
        announce=False,
        category="communication",
    ),
    TaskTemplateResponse(
        id="data-ingestion-databricks",
        name="Data Ingestion (Databricks)",
        description="Run a scheduled data ingestion pipeline into Databricks.",
        icon="database",
        schedule_type="cron",
        cron_expression="0 6 * * *",
        session_mode="isolated",
        message="Run the Databricks data ingestion pipeline. Load new data from source systems, validate schema, and report any failures.",
        announce=True,
        category="data-engineering",
    ),
    TaskTemplateResponse(
        id="morning-briefing",
        name="Morning Briefing",
        description="Generate a daily summary: weather, calendar, top emails, news.",
        icon="sun",
        schedule_type="cron",
        cron_expression="0 7 * * *",
        session_mode="isolated",
        message="Generate today's briefing: weather, calendar, top emails, news summary.",
        announce=True,
        category="productivity",
    ),
    TaskTemplateResponse(
        id="calendar-monitor",
        name="Calendar Monitor",
        description="Watch for upcoming calendar events and alert before meetings.",
        icon="calendar",
        schedule_type="heartbeat",
        heartbeat_interval="30m",
        session_mode="main",
        message="Review calendar for events in the next 2 hours. Alert if any meetings are starting soon.",
        announce=False,
        category="productivity",
    ),
    TaskTemplateResponse(
        id="weekly-analysis",
        name="Weekly Deep Analysis",
        description="Run a comprehensive weekly analysis (codebase, data quality, etc.).",
        icon="bar-chart",
        schedule_type="cron",
        cron_expression="0 9 * * 1",
        session_mode="isolated",
        message="Run a deep weekly analysis: review code changes, data quality metrics, and project health. Generate a comprehensive report.",
        announce=True,
        category="analysis",
    ),
    TaskTemplateResponse(
        id="dbt-run",
        name="dbt Run",
        description="Execute a scheduled dbt build/run.",
        icon="terminal",
        schedule_type="cron",
        cron_expression="0 5 * * *",
        session_mode="isolated",
        message="Execute the dbt build pipeline. Run models, test results, and report any failures.",
        announce=True,
        category="data-engineering",
    ),
    TaskTemplateResponse(
        id="health-check",
        name="Project Health Check",
        description="Background health monitoring for project infrastructure.",
        icon="heart-pulse",
        schedule_type="heartbeat",
        heartbeat_interval="1h",
        session_mode="main",
        message="Perform a project health check: verify services are running, check recent error logs, and report any issues.",
        announce=False,
        category="monitoring",
    ),
    TaskTemplateResponse(
        id="data-quality",
        name="Data Quality Check",
        description="Validate data quality across key tables and pipelines.",
        icon="shield-check",
        schedule_type="cron",
        cron_expression="30 6 * * *",
        session_mode="isolated",
        message="Run data quality checks across key tables. Validate row counts, null rates, schema changes, and freshness. Report anomalies.",
        announce=True,
        category="data-engineering",
    ),
    TaskTemplateResponse(
        id="slack-digest",
        name="Slack/Team Digest",
        description="Summarize unread team messages and highlights.",
        icon="message-circle",
        schedule_type="heartbeat",
        heartbeat_interval="1h",
        session_mode="main",
        message="Review unread Slack messages and team communications. Summarize key discussions and highlight anything needing attention.",
        announce=False,
        category="communication",
    ),
    TaskTemplateResponse(
        id="backup-check",
        name="Backup Verification",
        description="Verify that scheduled backups completed successfully.",
        icon="hard-drive",
        schedule_type="cron",
        cron_expression="0 8 * * *",
        session_mode="isolated",
        message="Verify that all scheduled backups completed successfully. Check backup sizes, timestamps, and integrity. Alert on any failures.",
        announce=True,
        category="monitoring",
    ),
]


def list_task_templates() -> list[TaskTemplateResponse]:
    return TASK_TEMPLATES


def get_task_template(template_id: str) -> TaskTemplateResponse | None:
    for t in TASK_TEMPLATES:
        if t.id == template_id:
            return t
    return None
