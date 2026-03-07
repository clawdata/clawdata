"""Job scheduler — executes scheduled tasks via APScheduler.

Integrates with guardrails and audit for governed task execution.
"""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.task import Task
from app.models.task_run import TaskRun

logger = logging.getLogger(__name__)


class JobScheduler:
    """Simple async task scheduler.

    Uses asyncio tasks instead of APScheduler for now (zero extra deps).
    Can be upgraded to APScheduler 4.x later for distributed scheduling.
    """

    def __init__(self) -> None:
        self._running = False
        self._task: asyncio.Task | None = None
        self._check_interval = 60  # seconds

    async def start(self, session_factory) -> None:
        """Start the scheduler loop."""
        if self._running:
            return
        self._running = True
        self._session_factory = session_factory
        self._task = asyncio.create_task(self._loop())
        logger.info("Job scheduler started")

    async def stop(self) -> None:
        """Stop the scheduler."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("Job scheduler stopped")

    async def _loop(self) -> None:
        """Main scheduler loop — check for due tasks every interval."""
        while self._running:
            try:
                await self._check_due_tasks()
            except Exception as exc:
                logger.error("Scheduler error: %s", exc)
            await asyncio.sleep(self._check_interval)

    async def _check_due_tasks(self) -> None:
        """Check for tasks that should run now."""
        async with self._session_factory() as db:
            stmt = select(Task).where(
                Task.enabled == True,
                Task.status == "active",
            )
            result = await db.execute(stmt)
            tasks = list(result.scalars().all())

            for task in tasks:
                if self._should_run(task):
                    asyncio.create_task(self._execute_task(task.id))

    def _should_run(self, task: Task) -> bool:
        """Determine if a task is due to run.

        Basic implementation — checks cron expression against current time.
        TODO: Full cron parsing with croniter.
        """
        # For now, just check heartbeat tasks
        if task.schedule_type == "heartbeat" and task.heartbeat_interval:
            # Parse interval like "30m", "1h", "2h"
            interval = task.heartbeat_interval.strip()
            seconds = 0
            if interval.endswith("m"):
                seconds = int(interval[:-1]) * 60
            elif interval.endswith("h"):
                seconds = int(interval[:-1]) * 3600
            elif interval.endswith("s"):
                seconds = int(interval[:-1])

            if seconds <= 0:
                return False

            # Check against last run time (stored in task_runs)
            # For now, return False — will implement proper tracking later
            return False

        return False

    async def _execute_task(self, task_id: str) -> None:
        """Execute a single task."""
        from app.adapters.openclaw import openclaw
        from app.services import audit_service

        start_time = time.time()

        async with self._session_factory() as db:
            task = await db.get(Task, task_id)
            if not task:
                return

            # Create task run record
            run = TaskRun(
                task_id=task_id,
                result="running",
                agent_id=task.agent_id,
                trigger="scheduled",
            )
            db.add(run)
            await db.commit()
            await db.refresh(run)

            try:
                # Log to audit
                await audit_service.log_event(
                    db,
                    event_type="job.started",
                    action=f"Started task '{task.name}'",
                    agent_id=task.agent_id,
                    details={"task_id": task_id, "run_id": run.id},
                )

                # Send message to agent
                result = await openclaw.send_message(
                    task.agent_id,
                    task.message,
                )

                run_id = result.get("runId")
                output_parts = []

                if run_id:
                    async for event in openclaw.stream_response(task.agent_id, run_id):
                        payload = event.get("payload", {})
                        stream = payload.get("stream")
                        data = payload.get("data", {})

                        if stream == "text":
                            output_parts.append(str(data.get("text", "")))

                duration = time.time() - start_time
                output = "".join(output_parts)

                run.result = "success"
                run.output = output[:10000]  # Truncate long outputs
                run.summary = output[:500] if output else "Completed"
                run.duration_s = duration
                run.finished_at = datetime.now(timezone.utc)

                await audit_service.log_event(
                    db,
                    event_type="job.completed",
                    action=f"Task '{task.name}' completed",
                    agent_id=task.agent_id,
                    details={"task_id": task_id, "run_id": run.id, "duration": duration},
                )

            except Exception as exc:
                duration = time.time() - start_time
                run.result = "failed"
                run.error = str(exc)
                run.duration_s = duration
                run.finished_at = datetime.now(timezone.utc)

                await audit_service.log_event(
                    db,
                    event_type="job.failed",
                    action=f"Task '{task.name}' failed: {exc}",
                    agent_id=task.agent_id,
                    details={"task_id": task_id, "run_id": run.id, "error": str(exc)},
                )

                logger.error("Task '%s' failed: %s", task.name, exc)

            await db.commit()

            # Handle one-shot tasks
            if task.delete_after_run:
                await db.delete(task)
                await db.commit()


# Singleton
scheduler = JobScheduler()
