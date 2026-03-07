"""ClawData v2 configuration — loaded from environment / .env file.

ClawData connects to an externally-managed OpenClaw gateway (or Claude Code
in future). It no longer installs, starts, stops, or mutates OpenClaw config.
"""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

OPENCLAW_HOME = Path.home() / ".openclaw"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="CLAWDATA_", extra="ignore")

    env: str = "development"
    secret_key: str = "change-me"
    database_url: str = "sqlite+aiosqlite:///./clawdata.db"

    # Paths
    templates_dir: Path = Path("templates")
    skills_dir: Path = Path("skills")

    # Runtime backend — "openclaw" or "claude-code" (future)
    runtime: str = "openclaw"

    # OpenClaw gateway connection (user manages the gateway externally)
    openclaw_gateway_host: str = "127.0.0.1"
    openclaw_gateway_port: int = 18789
    openclaw_gateway_token: str = ""

    @property
    def openclaw_ws_url(self) -> str:
        host = "127.0.0.1" if self.openclaw_gateway_host == "0.0.0.0" else self.openclaw_gateway_host
        return f"ws://{host}:{self.openclaw_gateway_port}"

    @property
    def openclaw_home(self) -> Path:
        return OPENCLAW_HOME

    @property
    def openclaw_agents_dir(self) -> Path:
        """Agent workspaces live inside OpenClaw's directory — no mirror."""
        return OPENCLAW_HOME / "agents"


settings = Settings()
