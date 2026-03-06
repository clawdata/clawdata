"""Low-level helpers: subprocess runner, version parsing, env loading."""

from __future__ import annotations

import asyncio
import logging
import os
import re
import shutil
from pathlib import Path

logger = logging.getLogger(__name__)

# ── Paths ────────────────────────────────────────────────────────────

OPENCLAW_HOME = Path.home() / ".openclaw"
OPENCLAW_CONFIG = OPENCLAW_HOME / "openclaw.json"
OPENCLAW_WORKSPACE = OPENCLAW_HOME / "workspace"
NODE_MIN_MAJOR = 22
DEFAULT_MODEL = "openai/gpt-5.1-codex"


# ── Env file loading ────────────────────────────────────────────────


def _load_openclaw_env() -> dict[str, str]:
    """Read ~/.openclaw/.env and return key-value pairs."""
    dot_env_path = Path.home() / ".openclaw" / ".env"
    extras: dict[str, str] = {}
    if dot_env_path.exists():
        try:
            for line in dot_env_path.read_text().splitlines():
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, _, value = line.partition("=")
                    key = key.strip()
                    value = value.strip().strip("'\"")
                    if key:
                        extras[key] = value
        except Exception as exc:
            logger.warning("Could not load ~/.openclaw/.env: %s", exc)
    return extras


# ── Subprocess runner ───────────────────────────────────────────────


async def _run(
    cmd: list[str],
    *,
    timeout: float = 120.0,
    env_extra: dict | None = None,
) -> tuple[int, str, str]:
    """Run a subprocess and return (returncode, stdout, stderr)."""
    env = os.environ.copy()
    env.update(_load_openclaw_env())
    if env_extra:
        env.update(env_extra)

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
        )
        stdout_bytes, stderr_bytes = await asyncio.wait_for(
            proc.communicate(), timeout=timeout,
        )
        return (
            proc.returncode or 0,
            stdout_bytes.decode(errors="replace").strip(),
            stderr_bytes.decode(errors="replace").strip(),
        )
    except FileNotFoundError:
        return (127, "", f"Command not found: {cmd[0]}")
    except TimeoutError:
        proc.kill()  # type: ignore[possibly-undefined]
        return (1, "", f"Command timed out after {timeout}s")


# ── Version helpers ─────────────────────────────────────────────────


def _parse_version(raw: str) -> str | None:
    """Extract a semver-ish version from a string like 'v22.11.0' or '10.9.2'."""
    m = re.search(r"v?(\d+\.\d+\.\d+)", raw)
    return m.group(1) if m else raw.strip() or None


def _version_gte(version: str, minimum: str) -> bool:
    """True if version >= minimum (simple major.minor.patch comparison)."""
    try:
        v = tuple(int(x) for x in version.split(".")[:3])
        m = tuple(int(x) for x in minimum.split(".")[:3])
        return v >= m
    except (ValueError, AttributeError):
        return False


def _which(name: str) -> str | None:
    return shutil.which(name)


# ── TCP port check ──────────────────────────────────────────────────


async def _check_port(host: str, port: int, timeout: float = 2.0) -> bool:
    """Return True if a TCP connection to host:port succeeds."""
    try:
        _, writer = await asyncio.wait_for(
            asyncio.open_connection(host, port), timeout=timeout,
        )
        writer.close()
        await writer.wait_closed()
        return True
    except (ConnectionRefusedError, OSError, TimeoutError):
        return False
