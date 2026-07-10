"""Application settings, loaded from environment variables.

Every value here has a matching entry in .env.example. Locally these come
from a .env file (see docker-compose.yml); in Render/GitHub Actions they
come from the platform's own secrets store — never commit real values.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # --- App ---
    env: str = "development"  # development | staging | production
    api_prefix: str = "/api/v1"
    cors_origins: list[str] = ["http://localhost:3000"]

    # --- Auth ---
    jwt_secret: str = "change-me-in-env"
    jwt_algorithm: str = "HS256"
    jwt_expires_minutes: int = 60 * 24 * 7  # 7 days

    # --- Database (Supabase Postgres + pgvector) ---
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/proforce"

    # --- Redis (Upstash in prod, local redis in dev) ---
    redis_url: str = "redis://localhost:6379/0"

    # --- Object storage (Cloudflare R2, S3-compatible) ---
    r2_account_id: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    r2_bucket_name: str = "proforce-tooling"
    r2_public_base_url: str = ""

    @property
    def is_production(self) -> bool:
        return self.env == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
