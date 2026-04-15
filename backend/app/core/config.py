"""Application configuration using pydantic-settings.

All settings are loaded from environment variables and/or a .env file.
"""

from functools import lru_cache
from pathlib import Path

from pydantic import PostgresDsn, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict

# .env lives at project root (one level above backend/)
_ENV_FILE = Path(__file__).resolve().parents[3] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Database
    POSTGRES_SERVER: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "postgres"
    POSTGRES_DB: str = "notification_system"

    @computed_field  # type: ignore[prop-decorator]
    @property
    def DATABASE_URL(self) -> str:  # noqa: N802
        """Async database URL for FastAPI (asyncpg driver)."""
        return str(
            PostgresDsn.build(
                scheme="postgresql+asyncpg",
                username=self.POSTGRES_USER,
                password=self.POSTGRES_PASSWORD,
                host=self.POSTGRES_SERVER,
                port=self.POSTGRES_PORT,
                path=self.POSTGRES_DB,
            )
        )

    @computed_field  # type: ignore[prop-decorator]
    @property
    def SYNC_DATABASE_URL(self) -> str:  # noqa: N802
        """Sync database URL for Alembic migrations (psycopg2 driver)."""
        ssl_mode = (
            "require" if self.POSTGRES_SERVER not in ["localhost", "db", "127.0.0.1"] else "disable"
        )
        return str(
            PostgresDsn.build(
                scheme="postgresql+psycopg2",
                username=self.POSTGRES_USER,
                password=self.POSTGRES_PASSWORD,
                host=self.POSTGRES_SERVER,
                port=self.POSTGRES_PORT,
                path=self.POSTGRES_DB,
                query=f"sslmode={ssl_mode}",
            )
        )

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
    RATE_LIMIT_DEFAULT: int = 100
    RATE_LIMIT_EVENTS: int = 30
    RATE_LIMIT_ENABLED: bool = True
    MAX_BATCH_SIZE: int = 1000
    # 10 MB hard limit on incoming request bodies — prevents OOM from huge batch payloads.
    MAX_REQUEST_BODY_BYTES: int = 10_485_760
    # 64 KB per-field limit on payload and metadata dicts (serialized JSON).
    MAX_PAYLOAD_BYTES: int = 65_536

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

    # Celery / Redis
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/1"

    # Auth
    MASTER_API_KEY: str | None = None

    # CORS — space-separated list of allowed origins
    CORS_ALLOWED_ORIGINS: str = "http://localhost:3000 http://localhost:3001"

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.CORS_ALLOWED_ORIGINS.split() if o.strip()]

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # Flower (Celery monitoring)
    FLOWER_PORT: int = 5555
    FLOWER_USER: str = "admin"
    FLOWER_PASSWORD: str = "admin"

    @property
    def is_production(self) -> bool:
        return self.APP_ENV == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
