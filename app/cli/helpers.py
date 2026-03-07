"""Async helpers for CLI commands that need the event loop or DB sessions."""

from __future__ import annotations

import asyncio
import functools
from typing import Any, Callable

import click

from app.database import async_session, init_db


def async_command(f: Callable) -> Callable:
    """Decorator to run an async click command function."""

    @functools.wraps(f)
    def wrapper(*args: Any, **kwargs: Any) -> Any:
        return asyncio.run(f(*args, **kwargs))

    return wrapper


async def get_db_session():
    """Get an async DB session for direct CLI usage."""
    await init_db()
    async with async_session() as session:
        yield session


async def run_with_db(coro_factory):
    """Run an async function that needs a DB session.

    Usage:
        result = await run_with_db(lambda db: my_service_fn(db, ...))
    """
    await init_db()
    async with async_session() as db:
        return await coro_factory(db)
