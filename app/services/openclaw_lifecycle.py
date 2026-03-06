"""OpenClaw lifecycle management — backward-compatibility shim.

This module used to be a 2600+ line monolith.  It has been split into a
modular package at ``app.services.lifecycle``.  All public (and commonly-
used private) symbols are re-exported here so that every existing import
continues to work without changes.
"""

# Re-export all public symbols from the lifecycle package.
from app.services.lifecycle import *  # noqa: F401,F403

# Private symbols that external modules import directly.
from app.services.lifecycle import (  # noqa: F401
    _check_port,
    _deep_merge,
    _env_var_to_provider,
    _estimate_cost,
    _load_openclaw_env,
    _mask_value,
    _parse_skill,
    _parse_skill_md,
    _parse_version,
    _PROVIDERS,
    _read_config,
    _read_env_file,
    _remove_agent_auth,
    _run,
    _scan_skills_dir,
    _strip_action_blocks,
    _strip_system_prefix,
    _sync_env_to_agent_auth,
    _version_gte,
    _which,
    _write_agent_auth,
    _write_config,
    _write_env_file,
)
