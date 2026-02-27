"""Secret service — encrypted key-value store."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.secret import Secret
from app.schemas.secret import SecretCreate, SecretUpdate
from app.utils.crypto import decrypt, encrypt


async def list_secrets(db: AsyncSession, agent_id: str | None = None) -> list[Secret]:
    stmt = select(Secret).order_by(Secret.id)
    if agent_id is not None:
        stmt = stmt.where(Secret.agent_id == agent_id)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_secret(db: AsyncSession, secret_id: str) -> Secret | None:
    return await db.get(Secret, secret_id)


async def create_secret(db: AsyncSession, data: SecretCreate) -> Secret:
    secret = Secret(
        id=data.id,
        description=data.description,
        encrypted_value=encrypt(data.value),
        agent_id=data.agent_id,
    )
    db.add(secret)
    await db.commit()
    await db.refresh(secret)
    return secret


async def update_secret(db: AsyncSession, secret_id: str, data: SecretUpdate) -> Secret | None:
    secret = await db.get(Secret, secret_id)
    if not secret:
        return None

    if data.description is not None:
        secret.description = data.description
    if data.value is not None:
        secret.encrypted_value = encrypt(data.value)

    await db.commit()
    await db.refresh(secret)
    return secret


async def delete_secret(db: AsyncSession, secret_id: str) -> bool:
    secret = await db.get(Secret, secret_id)
    if not secret:
        return False

    await db.delete(secret)
    await db.commit()
    return True


async def get_decrypted_value(db: AsyncSession, secret_id: str) -> str | None:
    """Decrypt and return the secret value (internal use only — never expose via API)."""
    secret = await db.get(Secret, secret_id)
    if not secret:
        return None
    return decrypt(secret.encrypted_value)
