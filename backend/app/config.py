"""Application configuration using pydantic-settings.

All settings are loaded from environment variables and/or a .env file.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/notifications"
    DATABASE_URL_SYNC: str = "postgresql://postgres:postgres@localhost:5432/notifications"

    # Application
    APP_ENV: str = "development"
    APP_DEBUG: bool = True
    APP_VERSION: str = "0.1.0"

    # API
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    LOG_LEVEL: str = "info"
    LOG_FORMAT: str = "console"

    # Rate Limiting
    DEFAULT_RATE_LIMIT_PER_MIN: int = 1000
    RATE_LIMIT_WINDOW_SECONDS: int = 60
    MAX_BATCH_SIZE: int = 1000

    # Idempotency
    IDEMPOTENCY_TTL_SECONDS: int = 86400

    # Email (Resend)
    RESEND_API_KEY: str = ""
    EMAIL_FROM_ADDRESS: str = "notifications@yourdomain.com"

    # SMS (Twilio)
    SMS_PROVIDER: str = "mock"
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_FROM_NUMBER: str = ""

    # Webhook
    WEBHOOK_DEFAULT_TIMEOUT_SECONDS: int = 30
    WEBHOOK_MAX_REDIRECTS: int = 3

    # Retry
    RETRY_MAX_RETRIES: int = 5
    RETRY_BASE_DELAY_SECONDS: int = 10
    RETRY_MAX_BACKOFF_SECONDS: int = 600
    RETRY_JITTER_ENABLED: bool = True

    # Redis (Phase 2)
    REDIS_URL: str = "redis://localhost:6379/0"

    @property
    def is_production(self) -> bool:
        return self.APP_ENV == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
