"""Provider and .env file reading — read-only.

v2: No writes to .env or auth files. Users manage keys via `openclaw config`.
"""

from __future__ import annotations

import logging
from pathlib import Path

from app.services.lifecycle._helpers import OPENCLAW_HOME

logger = logging.getLogger(__name__)

# Known providers and their env vars
PROVIDERS = [
    {"id": "openai", "name": "OpenAI", "env_var": "OPENAI_API_KEY", "popular_models": ["openai/gpt-4.1", "openai/gpt-4.1-mini", "openai/o3-mini"]},
    {"id": "anthropic", "name": "Anthropic", "env_var": "ANTHROPIC_API_KEY", "popular_models": ["anthropic/claude-sonnet-4-5", "anthropic/claude-opus-4"]},
    {"id": "google", "name": "Google", "env_var": "GOOGLE_API_KEY", "popular_models": ["google/gemini-2.5-pro", "google/gemini-2.5-flash"]},
    {"id": "xai", "name": "xAI", "env_var": "XAI_API_KEY", "popular_models": ["xai/grok-3"]},
    {"id": "openrouter", "name": "OpenRouter", "env_var": "OPENROUTER_API_KEY", "popular_models": []},
    {"id": "groq", "name": "Groq", "env_var": "GROQ_API_KEY", "popular_models": []},
    {"id": "together", "name": "Together", "env_var": "TOGETHER_API_KEY", "popular_models": []},
]


def _mask_value(v: str) -> str:
    if len(v) <= 8:
        return "****"
    return v[:4] + "****" + v[-4:]


def _read_env_file() -> dict[str, str]:
    """Read ~/.openclaw/.env and return key=value pairs."""
    env_path = OPENCLAW_HOME / ".env"
    if not env_path.exists():
        return {}
    pairs: dict[str, str] = {}
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        pairs[key.strip()] = value.strip().strip('"').strip("'")
    return pairs


async def get_providers() -> dict:
    """List providers and whether their API keys are configured."""
    env = _read_env_file()
    providers = []
    for p in PROVIDERS:
        configured = bool(env.get(p["env_var"]))
        providers.append({**p, "configured": configured})
    return {"providers": providers}


async def get_env_keys() -> dict:
    """List all keys in ~/.openclaw/.env with masked values."""
    env = _read_env_file()
    entries = [{"key": k, "masked_value": _mask_value(v)} for k, v in sorted(env.items())]
    return {"entries": entries, "path": str(OPENCLAW_HOME / ".env")}
