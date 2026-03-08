"""Job scheduler — executes scheduled tasks.

Integrates with guardrails and audit for governed task execution.
Uses croniter for cron parsing and tracks last-run times for heartbeat tasks.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from datetime import datetime, timezone

from croniter import croniter
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.task import Task
from app.models.task_run import TaskRun

logger = logging.getLogger(__name__)


class JobScheduler:
    """Async task scheduler.

    Uses asyncio tasks with croniter for cron parsing.
    Tracks in-flight tasks to avoid duplicate executions.
    """

    def __init__(self) -> None:
        self._running = False
        self._task: asyncio.Task | None = None
        self._check_interval = 30  # seconds
        self._in_flight: set[str] = set()  # task IDs currently executing

    async def start(self, session_factory) -> None:
        """Start the scheduler loop."""
        if self._running:
            return
        self._running = True
        self._session_factory = session_factory
        self._task = asyncio.create_task(self._loop())
        logger.info("Job scheduler started (interval=%ds)", self._check_interval)

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

    # ── Manual execution (API-triggered) ─────────────────────────────

    async def execute_manual(self, task_id: str) -> TaskRun | None:
        """Execute a task immediately (manual trigger). Returns the TaskRun."""
        if not self._session_factory:
            logger.error("Scheduler not started — cannot execute manual task")
            return None

        return await self._execute_task(task_id, trigger="manual")

    # ── Scheduler loop ───────────────────────────────────────────────

    async def _loop(self) -> None:
        """Main scheduler loop — check for due tasks every interval."""
        while self._running:
            try:
                await self._check_due_tasks()
            except Exception as exc:
                logger.error("Scheduler error: %s", exc)
            await asyncio.sleep(self._check_interval)

    async def _check_due_tasks(self) -> None:
        """Check for tasks that should run now.

        Tasks must be **enabled** and have status ``active`` to be
        considered by the scheduler.
        """
        async with self._session_factory() as db:
            stmt = select(Task).where(
                Task.enabled == True,
                Task.status == "active",
            )
            result = await db.execute(stmt)
            tasks = list(result.scalars().all())

            for task in tasks:
                if task.id in self._in_flight:
                    continue

                # Respect active_hours window
                if not self._within_active_hours(task):
                    continue

                last_run_at = await self._get_last_run_time(db, task.id)
                if self._should_run(task, last_run_at):
                    self._in_flight.add(task.id)
                    asyncio.create_task(self._execute_task_safe(task.id))

    async def _get_last_run_time(self, db: AsyncSession, task_id: str) -> datetime | None:
        """Get the start time of the most recent run for a task."""
        stmt = (
            select(TaskRun.started_at)
            .where(TaskRun.task_id == task_id)
            .order_by(TaskRun.started_at.desc())
            .limit(1)
        )
        result = await db.execute(stmt)
        row = result.scalar_one_or_none()
        return row

    # ── Scheduling logic ─────────────────────────────────────────────

    def _should_run(self, task: Task, last_run_at: datetime | None) -> bool:
        """Determine if a task is due to run based on schedule type."""
        now = datetime.now(timezone.utc)

        if task.schedule_type == "heartbeat" and task.heartbeat_interval:
            return self._should_run_heartbeat(task, last_run_at, now)

        if task.schedule_type == "cron" and task.cron_expression:
            return self._should_run_cron(task, last_run_at, now)

        return False

    def _should_run_heartbeat(
        self, task: Task, last_run_at: datetime | None, now: datetime
    ) -> bool:
        """Check if a heartbeat task is due."""
        interval_secs = self._parse_interval(task.heartbeat_interval or "")
        if interval_secs <= 0:
            return False

        # Never run before → run now
        if last_run_at is None:
            return True

        # Ensure last_run_at is timezone-aware
        if last_run_at.tzinfo is None:
            last_run_at = last_run_at.replace(tzinfo=timezone.utc)

        elapsed = (now - last_run_at).total_seconds()
        return elapsed >= interval_secs

    def _should_run_cron(
        self, task: Task, last_run_at: datetime | None, now: datetime
    ) -> bool:
        """Check if a cron task is due using croniter."""
        try:
            cron = croniter(task.cron_expression, now)
        except (ValueError, KeyError) as exc:
            logger.warning("Invalid cron expression for task %s: %s", task.id, exc)
            return False

        # Get the most recent scheduled time (before now)
        prev_fire = cron.get_prev(datetime).replace(tzinfo=timezone.utc)

        # Never run before → run if we're within the check window of a fire time
        if last_run_at is None:
            # Only fire if the prev fire time is within the last check interval
            age = (now - prev_fire).total_seconds()
            return age <= self._check_interval * 2

        # Ensure last_run_at is timezone-aware
        if last_run_at.tzinfo is None:
            last_run_at = last_run_at.replace(tzinfo=timezone.utc)

        # Fire if there's a scheduled time between last run and now
        return prev_fire > last_run_at

    # ── Active hours ─────────────────────────────────────────────────

    @staticmethod
    def _within_active_hours(task: Task) -> bool:
        """Return True if the current time is within the task's active hours.

        ``active_hours`` is stored as a JSON string, e.g.
        ``{"start": "08:00", "end": "22:00"}``. If unset or invalid the
        task is always eligible.
        """
        if not task.active_hours:
            return True
        try:
            window = json.loads(task.active_hours)
            start_str = window.get("start", "")
            end_str = window.get("end", "")
            if not start_str or not end_str:
                return True

            # Parse HH:MM
            start_h, start_m = (int(x) for x in start_str.split(":"))
            end_h, end_m = (int(x) for x in end_str.split(":"))

            now = datetime.now(timezone.utc)
            now_minutes = now.hour * 60 + now.minute
            start_minutes = start_h * 60 + start_m
            end_minutes = end_h * 60 + end_m

            if start_minutes <= end_minutes:
                return start_minutes <= now_minutes <= end_minutes
            else:
                # Wraps midnight, e.g. 22:00 → 06:00
                return now_minutes >= start_minutes or now_minutes <= end_minutes
        except Exception:
            return True

    # ── Helpers ───────────────────────────────────────────────────────

    @staticmethod
    def _parse_interval(interval: str) -> int:
        """Parse interval string like '30m', '1h', '2h', '5m' → seconds."""
        interval = interval.strip()
        if not interval:
            return 0
        try:
            if interval.endswith("m"):
                return int(interval[:-1]) * 60
            elif interval.endswith("h"):
                return int(interval[:-1]) * 3600
            elif interval.endswith("s"):
                return int(interval[:-1])
            else:
                return int(interval)
        except ValueError:
            return 0

    # ── Execution ────────────────────────────────────────────────────

    async def _execute_task_safe(self, task_id: str) -> None:
        """Wrapper to ensure in-flight tracking is cleaned up."""
        try:
            await self._execute_task(task_id)
        finally:
            self._in_flight.discard(task_id)

    async def _execute_task(
        self, task_id: str, *, trigger: str = "scheduled"
    ) -> TaskRun | None:
        """Execute a single task. Returns the completed TaskRun."""
        from app.adapters.openclaw import openclaw
        from app.services import audit_service

        start_time = time.time()

        async with self._session_factory() as db:
            task = await db.get(Task, task_id)
            if not task:
                return None

            # Create task run record
            run = TaskRun(
                task_id=task_id,
                result="running",
                agent_id=task.agent_id,
                trigger=trigger,
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
                    details={"task_id": task_id, "run_id": run.id, "trigger": trigger},
                )

                # Build contextual message with task metadata
                message = self._build_task_message(task, trigger)

                # Send message to agent
                result = await openclaw.send_message(
                    task.agent_id,
                    message,
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

            return run

    @staticmethod
    def _build_task_message(task: Task, trigger: str) -> str:
        """Wrap the task prompt with contextual metadata.

        This gives the agent awareness that it's executing a scheduled
        task rather than responding to a human message, so the HEARTBEAT.md
        behaviour instructions can guide its response style.
        """
        parts = [f"[Scheduled Task: {task.name}]"]
        if trigger == "manual":
            parts.append("[Trigger: manual]")
        else:
            schedule = (
                f"every {task.heartbeat_interval}"
                if task.schedule_type == "heartbeat"
                else task.cron_expression or "cron"
            )
            parts.append(f"[Trigger: {task.schedule_type} ({schedule})]")
        parts.append("")
        parts.append(task.message)
        return "\n".join(parts)


# Singleton
scheduler = JobScheduler()
