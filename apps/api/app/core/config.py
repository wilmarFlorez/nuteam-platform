from functools import lru_cache
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", "../../.env"), extra="ignore")

    supabase_url: str
    supabase_anon_key: str = Field(min_length=1)
    allowed_origins: str = "http://localhost:3000"
    environment: Literal["development", "test", "staging", "production"] = "development"
    redis_url: str | None = None
    rate_limit_per_minute: int = Field(default=120, ge=1)
    rate_limit_writes_per_minute: int = Field(default=30, ge=1)
    metrics_token: str = ""
    log_hash_key: str = "local-development-only"
    sentry_dsn: str | None = None

    @model_validator(mode="after")
    def production_configuration(self):
        if "*" in self.cors_origins:
            raise ValueError("CORS requires explicit origins")
        if self.environment in {"staging", "production"}:
            if not self.redis_url or len(self.metrics_token) < 32 or len(self.log_hash_key) < 32:
                raise ValueError("Staging/production require Redis and 32-character metrics/log secrets")
            if not self.cors_origins or any(not origin.startswith("https://") for origin in self.cors_origins):
                raise ValueError("Staging/production require HTTPS CORS origins")
        return self

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
