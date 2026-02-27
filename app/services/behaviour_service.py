"""Behaviour service — read/write agent workspace markdown files."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.behaviour import BehaviourSnapshot
from app.schemas.behaviour import BEHAVIOUR_FILES, BehaviourFileResponse


async def get_behaviour_file(
    db: AsyncSession, agent_id: str, workspace_path: str, file_name: str
) -> BehaviourFileResponse | None:
    if file_name not in BEHAVIOUR_FILES:
        return None

    path = Path(workspace_path) / file_name
    if not path.exists():
        return BehaviourFileResponse(
            agent_id=agent_id, file_name=file_name, content="", updated_at=None
        )

    return BehaviourFileResponse(
        agent_id=agent_id,
        file_name=file_name,
        content=path.read_text(),
        updated_at=datetime.fromtimestamp(path.stat().st_mtime),
    )


async def update_behaviour_file(
    db: AsyncSession,
    agent_id: str,
    workspace_path: str,
    file_name: str,
    content: str,
) -> BehaviourFileResponse | None:
    if file_name not in BEHAVIOUR_FILES:
        return None

    path = Path(workspace_path) / file_name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)

    # Save snapshot for history
    snapshot = BehaviourSnapshot(
        agent_id=agent_id,
        file_name=file_name,
        content=content,
    )
    db.add(snapshot)
    await db.commit()

    return BehaviourFileResponse(
        agent_id=agent_id,
        file_name=file_name,
        content=content,
        updated_at=datetime.now(),
    )


async def list_behaviour_files(
    agent_id: str, workspace_path: str
) -> list[BehaviourFileResponse]:
    results = []
    for file_name in BEHAVIOUR_FILES:
        path = Path(workspace_path) / file_name
        if path.exists():
            results.append(
                BehaviourFileResponse(
                    agent_id=agent_id,
                    file_name=file_name,
                    content=path.read_text(),
                    updated_at=datetime.fromtimestamp(path.stat().st_mtime),
                )
            )
    return results


async def list_snapshots(
    db: AsyncSession, agent_id: str, file_name: str | None = None
) -> list[BehaviourSnapshot]:
    stmt = (
        select(BehaviourSnapshot)
        .where(BehaviourSnapshot.agent_id == agent_id)
        .order_by(BehaviourSnapshot.created_at.desc())
        .limit(50)
    )
    if file_name:
        stmt = stmt.where(BehaviourSnapshot.file_name == file_name)
    result = await db.execute(stmt)
    return list(result.scalars().all())
