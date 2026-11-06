"""Settings for the PF-AIR MCP server, loaded from environment variables /
a local .env file. Mirrors the pattern in backend/app/core/config.py —
same idea (pydantic-settings, .env locally, real env vars when hosted
later), kept separate because this is a standalone service, not something
that should share config loading with the backend it talks to.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="PFAIR_", extra="ignore")

    base_url: str = "http://localhost:8000"
    api_prefix: str = "/api/v1"

    service_email: str = ""
    service_password: str = ""

    log_file: str = "./logs/tool_calls.log"

    # Per-request timeout to the PF-AIR API. Generous but not unbounded —
    # a hung backend shouldn't hang the MCP tool call (and therefore the
    # whole client conversation) forever.
    request_timeout_seconds: float = 30.0

    @property
    def api_base(self) -> str:
        return f"{self.base_url.rstrip('/')}{self.api_prefix}"


@lru_cache
def get_settings() -> Settings:
    return Settings()
