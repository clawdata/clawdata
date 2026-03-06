"""OpenClaw lifecycle management — modular package.

All public symbols are re-exported here so that existing imports like
``from app.services.lifecycle import X`` and the compatibility shim in
``app.services.openclaw_lifecycle`` continue to work unchanged.
"""

from __future__ import annotations

# Re-export the GatewayState enum (used by main.py via this module)
from app.schemas.lifecycle import GatewayState  # noqa: F401

# ── helpers (leaf) ───────────────────────────────────────────────────
from ._helpers import (  # noqa: F401
    DEFAULT_MODEL,
    NODE_MIN_MAJOR,
    OPENCLAW_CONFIG,
    OPENCLAW_HOME,
    OPENCLAW_WORKSPACE,
    _check_port,
    _load_openclaw_env,
    _parse_version,
    _run,
    _version_gte,
    _which,
)

# ── config ───────────────────────────────────────────────────────────
from ._config import (  # noqa: F401
    _deep_merge,
    _read_config,
    _write_config,
    get_config,
    patch_config,
    set_config,
)

# ── providers / env ──────────────────────────────────────────────────
from ._providers import (  # noqa: F401
    OPENCLAW_ENV_FILE,
    _PROVIDERS,
    _env_var_to_provider,
    _mask_value,
    _read_env_file,
    _remove_agent_auth,
    _sync_env_to_agent_auth,
    _write_agent_auth,
    _write_env_file,
    delete_env_key,
    get_env_keys,
    get_providers,
    set_env_key,
)

# ── gateway ──────────────────────────────────────────────────────────
from ._gateway import (  # noqa: F401
    check_node,
    check_npm,
    check_openclaw_package,
    check_onboarding,
    check_prerequisites,
    get_full_status,
    get_gateway_status,
    get_health,
    get_logs,
    install_openclaw,
    restart_gateway,
    run_doctor,
    start_gateway,
    stop_gateway,
    uninstall_openclaw,
    update_agent_to_agent_allow,
    update_openclaw,
)

# ── agents ───────────────────────────────────────────────────────────
from ._agents import (  # noqa: F401
    create_openclaw_agent,
    delete_openclaw_agent,
    get_agent_detail,
    get_agent_file,
    get_agent_files,
    list_openclaw_agents,
    reset_all_agents,
    set_agent_file,
    update_openclaw_agent,
)

# ── skills (bundled / managed) ───────────────────────────────────────
from ._skills import (  # noqa: F401
    _parse_skill,
    install_skill,
    list_skills,
    update_skill,
)

# ── workspace skills (SKILL.md) ─────────────────────────────────────
from ._workspace_skills import (  # noqa: F401
    MANAGED_SKILLS_DIR,
    PROJECT_SKILLS_DIR,
    _parse_skill_md,
    _scan_skills_dir,
    create_workspace_skill,
    delete_workspace_skill,
    deploy_project_skill,
    get_workspace_skill,
    list_project_skills,
    list_workspace_skills,
    sync_workspace_skills,
    unlink_project_skill,
    update_workspace_skill,
)

# ── sessions ─────────────────────────────────────────────────────────
from ._sessions import (  # noqa: F401
    _strip_action_blocks,
    _strip_system_prefix,
    delete_session,
    get_agent_sessions,
    get_session_history,
    reset_session,
)

# ── models ───────────────────────────────────────────────────────────
from ._models import (  # noqa: F401
    get_models_catalog,
    get_models_status,
    set_default_model,
)

# ── setup ────────────────────────────────────────────────────────────
from ._setup import run_setup  # noqa: F401

# ── costing ──────────────────────────────────────────────────────────
from ._costing import (  # noqa: F401
    MODEL_PRICING,
    _estimate_cost,
    get_costing_summary,
)
