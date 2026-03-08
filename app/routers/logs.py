"""Unified logs endpoint — gateway logs + audit events + config audit."""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.audit import AuditLogEntry, AuditSummary
from app.services import audit_service
from app.services import openclaw_lifecycle as lifecycle

router = APIRouter()

OPENCLAW_HOME = Path.home() / ".openclaw"


# ── Schemas ──────────────────────────────────────────────────────────


class GatewayLogLine(BaseModel):
    line_number: int
    timestamp: str | None = None
    level: str = "INFO"
    message: str
    raw: str


class GatewayLogResponse(BaseModel):
    lines: int
    total_lines: int
    log_file: str | None = None
    entries: list[GatewayLogLine]
    raw_output: str


class ConfigAuditEntry(BaseModel):
    timestamp: str
    source: str
    event: str
    config_path: str | None = None
    result: str | None = None
    gateway_mode_before: str | None = None
    gateway_mode_after: str | None = None
    suspicious: list[str] = []


# ── Gateway logs ─────────────────────────────────────────────────────


def _parse_gateway_log_line(raw_line: str, idx: int) -> GatewayLogLine:
    """Parse a structured JSON gateway log line into a GatewayLogLine.

    OpenClaw tslog structured format:
    - "0": primary message (sometimes JSON-encoded module/runId)
    - "2": human-readable label (preferred when available)
    - "_meta.logLevelName": ERROR|WARN|INFO|DEBUG|SILLY
    - "time": ISO timestamp with timezone
    """
    try:
        data = json.loads(raw_line)
        raw_msg = data.get("0", "")
        human_msg = data.get("2", "")
        meta = data.get("_meta", {})
        level = meta.get("logLevelName", "INFO")
        ts = data.get("time") or meta.get("date", "")

        # Prefer the human-readable field "2" when available,
        # but append key info from field "0" if it looks like module data
        if human_msg:
            message = human_msg
            # If field 0 is a JSON string with a module, add it as context
            try:
                inner = json.loads(raw_msg) if isinstance(raw_msg, str) else raw_msg
                if isinstance(inner, dict) and "module" in inner:
                    message = f'{human_msg}  [{inner["module"]}]'
            except (json.JSONDecodeError, TypeError):
                pass
        else:
            message = raw_msg

        return GatewayLogLine(
            line_number=idx,
            timestamp=ts,
            level=level,
            message=message,
            raw=raw_line,
        )
    except (json.JSONDecodeError, TypeError):
        return GatewayLogLine(
            line_number=idx,
            timestamp=None,
            level="INFO",
            message=raw_line,
            raw=raw_line,
        )

@router.get("/gateway", response_model=GatewayLogResponse)
async def get_gateway_logs(lines: int = Query(200, ge=1, le=10000)):
    """Return parsed OpenClaw gateway log lines."""
    raw_output = await lifecycle.get_logs(lines=lines)

    # Determine which log file was read
    log_file = None
    from datetime import timedelta

    tmp_log_dir = Path("/tmp/openclaw")
    if tmp_log_dir.is_dir():
        today = datetime.now().strftime("%Y-%m-%d")
        f = tmp_log_dir / f"openclaw-{today}.log"
        if f.exists():
            log_file = str(f)
        else:
            yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
            f2 = tmp_log_dir / f"openclaw-{yesterday}.log"
            if f2.exists():
                log_file = str(f2)

    raw_lines = [line for line in raw_output.split("\n") if line.strip()]
    entries = [_parse_gateway_log_line(line, i + 1) for i, line in enumerate(raw_lines)]

    return GatewayLogResponse(
        lines=len(entries),
        total_lines=len(entries),
        log_file=log_file,
        entries=entries,
        raw_output=raw_output,
    )


# ── Config audit (openclaw config changes) ───────────────────────────


@router.get("/config-audit", response_model=list[ConfigAuditEntry])
async def get_config_audit(limit: int = Query(100, ge=1, le=1000)):
    """Return OpenClaw config audit trail from ~/.openclaw/logs/config-audit.jsonl."""
    audit_file = OPENCLAW_HOME / "logs" / "config-audit.jsonl"
    if not audit_file.exists():
        return []

    entries: list[ConfigAuditEntry] = []
    try:
        with open(audit_file) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    data = json.loads(line)
                    entries.append(ConfigAuditEntry(
                        timestamp=data.get("ts", ""),
                        source=data.get("source", "unknown"),
                        event=data.get("event", "unknown"),
                        config_path=data.get("configPath"),
                        result=data.get("result"),
                        gateway_mode_before=data.get("gatewayModeBefore"),
                        gateway_mode_after=data.get("gatewayModeAfter"),
                        suspicious=data.get("suspicious", []),
                    ))
                except (json.JSONDecodeError, TypeError):
                    continue
    except Exception:
        pass

    # Return most recent first, limited
    entries.reverse()
    return entries[:limit]


# ── ClawData audit events ────────────────────────────────────────────


@router.get("/audit", response_model=list[AuditLogEntry])
async def get_audit_logs(
    agent_id: str | None = Query(None),
    session_id: str | None = Query(None),
    event_type: str | None = Query(None),
    start: datetime | None = Query(None),
    end: datetime | None = Query(None),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """Query ClawData audit log entries."""
    return await audit_service.query_logs(
        db,
        agent_id=agent_id,
        session_id=session_id,
        event_type=event_type,
        start=start,
        end=end,
        limit=limit,
        offset=offset,
    )


@router.get("/audit/summary", response_model=AuditSummary)
async def get_audit_summary(db: AsyncSession = Depends(get_db)):
    """Aggregated audit stats."""
    return await audit_service.get_summary(db)
