"""ClawData configuration — loaded from environment / .env file."""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="CLAWDATA_", extra="ignore")

    env: str = "development"
    secret_key: str = "change-me"
    database_url: str = "sqlite+aiosqlite:///./clawdata.db"

    # Paths (relative to project root)
    templates_dir: Path = Path("templates")
    skills_dir: Path = Path("skills")
    userdata_dir: Path = Path("userdata")

    # OpenClaw gateway
    openclaw_gateway_host: str = "127.0.0.1"
    openclaw_gateway_port: int = 18789
    openclaw_gateway_token: str = ""

    # OpenClaw lifecycle management
    openclaw_auto_start: bool = True  # start gateway on FastAPI startup
    openclaw_auto_stop: bool = False  # stop gateway on FastAPI shutdown
    openclaw_auto_install: bool = False  # npm install openclaw if missing

    @property
    def openclaw_ws_url(self) -> str:
        # Gateway binds to 0.0.0.0 but we connect via localhost
        host = "127.0.0.1" if self.openclaw_gateway_host == "0.0.0.0" else self.openclaw_gateway_host
        return f"ws://{host}:{self.openclaw_gateway_port}"


settings = Settings()
