"""Provider definitions, .env file management, and gateway auth helpers."""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path

from app.schemas.lifecycle import (
    ActionResult,
    EnvEntry,
    EnvListResponse,
    Provider,
    ProvidersResponse,
)

from ._helpers import OPENCLAW_HOME

logger = logging.getLogger(__name__)

# ── Canonical provider list — matches `openclaw onboard` flags ──────

_PROVIDERS: list[dict] = [
    {"id": "openai", "name": "OpenAI", "env_var": "OPENAI_API_KEY",
     "flag": "--openai-api-key",
     "models": [
         "openai/gpt-5.1-codex", "openai/gpt-5.1", "openai/gpt-5.1-mini",
         "openai/gpt-4.1", "openai/gpt-4.1-mini", "openai/gpt-4.1-nano",
         "openai/o3", "openai/o3-mini", "openai/o4-mini",
     ]},
    {"id": "anthropic", "name": "Anthropic", "env_var": "ANTHROPIC_API_KEY",
     "flag": "--anthropic-api-key",
     "models": [
         "anthropic/claude-opus-4-20250514", "anthropic/claude-sonnet-4-20250514",
         "anthropic/claude-haiku-3.5-20241022",
     ]},
    {"id": "google", "name": "Google Gemini", "env_var": "GEMINI_API_KEY",
     "flag": "--gemini-api-key",
     "models": [
         "google/gemini-2.5-pro", "google/gemini-2.5-flash",
         "google/gemini-2.0-flash",
     ]},
    {"id": "mistral", "name": "Mistral", "env_var": "MISTRAL_API_KEY",
     "flag": "--mistral-api-key",
     "models": [
         "mistral/codestral-latest", "mistral/mistral-large-latest",
         "mistral/mistral-medium-latest", "mistral/mistral-small-latest",
     ]},
    {"id": "openrouter", "name": "OpenRouter", "env_var": "OPENROUTER_API_KEY",
     "flag": "--openrouter-api-key",
     "models": ["openrouter/auto"]},
    {"id": "xai", "name": "xAI", "env_var": "XAI_API_KEY",
     "flag": "--xai-api-key",
     "models": ["xai/grok-3", "xai/grok-3-mini", "xai/grok-3-fast"]},
    {"id": "groq", "name": "Groq", "env_var": "GROQ_API_KEY",
     "flag": "",
     "models": ["groq/llama-4-scout-17b", "groq/llama-4-maverick-17b"]},
    {"id": "together", "name": "Together AI", "env_var": "TOGETHER_API_KEY",
     "flag": "--together-api-key",
     "models": ["together/meta-llama/Llama-4-Scout-17B-16E"]},
    {"id": "huggingface", "name": "Hugging Face", "env_var": "HUGGINGFACE_API_KEY",
     "flag": "--huggingface-api-key",
     "models": []},
    {"id": "github-copilot", "name": "GitHub Copilot", "env_var": "",
     "flag": "",
     "models": ["github-copilot/gpt-4.1", "github-copilot/claude-sonnet-4", "github-copilot/o4-mini"]},
]

OPENCLAW_ENV_FILE = OPENCLAW_HOME / ".env"


# ── Value masking ───────────────────────────────────────────────────


def _mask_value(val: str) -> str:
    """Mask a secret value for display: show first 4 and last 4 chars."""
    if len(val) <= 12:
        return "****"
    return val[:4] + "****" + val[-4:]


# ── .env read/write ─────────────────────────────────────────────────


def _read_env_file() -> dict[str, str]:
    """Parse ~/.openclaw/.env into a dict."""
    if not OPENCLAW_ENV_FILE.exists():
        return {}
    result: dict[str, str] = {}
    for line in OPENCLAW_ENV_FILE.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            key, _, value = line.partition("=")
            result[key.strip()] = value.strip()
    return result


def _write_env_file(entries: dict[str, str]) -> None:
    """Write key=value pairs to ~/.openclaw/.env."""
    OPENCLAW_HOME.mkdir(parents=True, exist_ok=True)
    lines = [f"{k}={v}" for k, v in sorted(entries.items())]
    OPENCLAW_ENV_FILE.write_text("\n".join(lines) + "\n")


# ── Provider env-var → id mapping ───────────────────────────────────


def _env_var_to_provider(env_var: str) -> str | None:
    """Map an env var like ANTHROPIC_API_KEY to the provider id 'anthropic'."""
    for p in _PROVIDERS:
        if p["env_var"] and p["env_var"] == env_var:
            return p["id"]
    return None


# ── Gateway agent auth files ────────────────────────────────────────


def _write_agent_auth(provider_id: str, api_key: str, agent_id: str = "main") -> None:
    """Write an API key into the gateway's per-agent auth files.

    Updates both:
      ~/.openclaw/agents/<agent>/agent/auth-profiles.json  (detailed)
      ~/.openclaw/agents/<agent>/agent/auth.json           (simple lookup)
    """
    agent_dir = OPENCLAW_HOME / "agents" / agent_id / "agent"
    agent_dir.mkdir(parents=True, exist_ok=True)

    # 1. Update auth-profiles.json
    profiles_path = agent_dir / "auth-profiles.json"
    if profiles_path.exists():
        try:
            profiles = json.loads(profiles_path.read_text())
        except (json.JSONDecodeError, OSError):
            profiles = {"version": 1, "profiles": {}}
    else:
        profiles = {"version": 1, "profiles": {}}

    profile_id = f"{provider_id}:default"
    profiles.setdefault("profiles", {})[profile_id] = {
        "type": "api_key",
        "provider": provider_id,
        "key": api_key,
    }
    # Clear any cached failure / cooldown state so the gateway retries
    # immediately with the new key instead of circuit-breaking.
    usage = profiles.get("usageStats", {})
    if profile_id in usage:
        del usage[profile_id]
        profiles["usageStats"] = usage

    profiles_path.write_text(json.dumps(profiles, indent=2) + "\n")

    # 2. Update auth.json (simplified lookup)
    auth_path = agent_dir / "auth.json"
    if auth_path.exists():
        try:
            auth = json.loads(auth_path.read_text())
        except (json.JSONDecodeError, OSError):
            auth = {}
    else:
        auth = {}

    auth[provider_id] = {"type": "api_key", "key": api_key}
    auth_path.write_text(json.dumps(auth, indent=2) + "\n")

    logger.info("Wrote %s auth to %s", provider_id, profiles_path)


def _sync_env_to_agent_auth() -> None:
    """Sync all API keys from ~/.openclaw/.env into gateway agent auth files."""
    env = _read_env_file()
    for env_var, value in env.items():
        if not value:
            continue
        provider_id = _env_var_to_provider(env_var)
        if provider_id:
            _write_agent_auth(provider_id, value)


def _remove_agent_auth(provider_id: str, agent_id: str = "main") -> None:
    """Remove a provider's key from gateway auth files."""
    agent_dir = OPENCLAW_HOME / "agents" / agent_id / "agent"

    profiles_path = agent_dir / "auth-profiles.json"
    if profiles_path.exists():
        try:
            profiles = json.loads(profiles_path.read_text())
            profile_id = f"{provider_id}:default"
            if profile_id in profiles.get("profiles", {}):
                del profiles["profiles"][profile_id]
                profiles_path.write_text(json.dumps(profiles, indent=2) + "\n")
        except (json.JSONDecodeError, OSError):
            pass

    auth_path = agent_dir / "auth.json"
    if auth_path.exists():
        try:
            auth = json.loads(auth_path.read_text())
            if provider_id in auth:
                del auth[provider_id]
                auth_path.write_text(json.dumps(auth, indent=2) + "\n")
        except (json.JSONDecodeError, OSError):
            pass


# ── Public API ──────────────────────────────────────────────────────


async def get_providers() -> ProvidersResponse:
    """Return the list of supported providers with their config status."""
    env = _read_env_file()
    shell_env = os.environ

    providers = []
    for p in _PROVIDERS:
        env_var = p["env_var"]
        configured = bool(
            (env_var and env.get(env_var))
            or (env_var and shell_env.get(env_var))
        )
        providers.append(Provider(
            id=p["id"],
            name=p["name"],
            env_var=env_var,
            configured=configured,
            onboard_flag=p["flag"],
            popular_models=p["models"],
        ))
    return ProvidersResponse(providers=providers)


async def get_env_keys() -> EnvListResponse:
    """List all keys in ~/.openclaw/.env with masked values."""
    env = _read_env_file()
    entries = [EnvEntry(key=k, masked_value=_mask_value(v)) for k, v in env.items()]
    return EnvListResponse(entries=entries, path=str(OPENCLAW_ENV_FILE))


async def set_env_key(key: str, value: str) -> ActionResult:
    """Set or update a key in ~/.openclaw/.env, gateway auth files, and secrets manager."""
    env = _read_env_file()
    env[key] = value
    try:
        _write_env_file(env)
        # Also write to gateway's per-agent auth files so the running
        # gateway can resolve the key without a restart.
        provider_id = _env_var_to_provider(key)
        if provider_id and value:
            # Update auth for all agents, not just main
            agents_dir = OPENCLAW_HOME / "agents"
            if agents_dir.is_dir():
                for agent_dir in agents_dir.iterdir():
                    if agent_dir.is_dir():
                        _write_agent_auth(provider_id, value, agent_dir.name)

        # Also create a SecretRef in openclaw.json so the secrets manager
        # knows about this credential (unified system).
        try:
            from app.services import secrets_manager
            field = secrets_manager.env_var_to_credential_field(key)
            if field:
                await secrets_manager.setup_secret_ref(
                    field=field, env_var=key, value=None  # value already in .env
                )
        except Exception as exc:
            logger.debug("SecretRef auto-create for %s skipped: %s", key, exc)

        return ActionResult(success=True, message=f"{key} saved to {OPENCLAW_ENV_FILE}")
    except OSError as exc:
        return ActionResult(success=False, message=str(exc))


async def delete_env_key(key: str) -> ActionResult:
    """Remove a key from ~/.openclaw/.env, gateway auth files, and secrets manager."""
    env = _read_env_file()
    if key not in env:
        return ActionResult(success=False, message=f"{key} not found in .env")
    del env[key]
    try:
        _write_env_file(env)
        # Also remove from gateway auth files
        provider_id = _env_var_to_provider(key)
        if provider_id:
            _remove_agent_auth(provider_id)

        # Also remove the SecretRef from openclaw.json
        try:
            from app.services import secrets_manager
            field = secrets_manager.env_var_to_credential_field(key)
            if field:
                await secrets_manager.remove_ref(field)
        except Exception as exc:
            logger.debug("SecretRef auto-remove for %s skipped: %s", key, exc)

        return ActionResult(success=True, message=f"{key} removed")
    except OSError as exc:
        return ActionResult(success=False, message=str(exc))
