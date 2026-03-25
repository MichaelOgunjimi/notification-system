# Implementation Plan

## Phase 1: Foundation (FastAPI + PostgreSQL + SQLModel)

This phase sets up the basic FastAPI project with PostgreSQL, SQLModel, and a synchronous API. No queues, no Redis, no Celery, no workers — those are Phase 2+. The goal is a working API that can accept events, create notification records, manage templates, and authenticate via API keys.

**Conventions:**
- All Python commands use `uv` (e.g., `uv run pytest`, `uv sync`)
- Async SQLModel/SQLAlchemy with `asyncpg` driver
- UUID primary keys, UTC timestamps on all models
- All routes under `/api/v1/`
- FastAPI app factory pattern
- Structured logging with `structlog` from day one

---

### 1.1: Project Scaffolding

- ⬜ **Create `backend/pyproject.toml`** → `backend/pyproject.toml`
  - Python 3.12 project managed by `uv`
  - Dependencies: `fastapi`, `uvicorn[standard]`, `sqlmodel`, `asyncpg`, `alembic`, `pydantic-settings`, `structlog`, `resend`, `twilio`, `httpx`, `bcrypt`, `python-dotenv`
  - Dev dependencies: `pytest`, `pytest-asyncio`, `httpx` (for test client), `pytest-cov`, `ruff`
  - Project metadata: name = `notification-system`, version = `0.1.0`

- ⬜ **Create backend directory structure** → `backend/app/`
  - Create all `__init__.py` files for packages:
    ```
    backend/app/__init__.py
    backend/app/api/__init__.py
    backend/app/api/v1/__init__.py
    backend/app/models/__init__.py
    backend/app/schemas/__init__.py
    backend/app/services/__init__.py
    backend/app/utils/__init__.py
    backend/tests/__init__.py
    backend/tests/test_api/__init__.py
    ```
  - Note: `workers/`, `adapters/` directories are Phase 2+ — don't create them yet
  - Note: `services/` directory is created but only `event_service.py` and `template_service.py` are populated in this phase

- ⬜ **Create `.gitignore`** → `.gitignore`
  - Python: `__pycache__/`, `*.pyc`, `.venv/`, `*.egg-info/`
  - uv: `.python-version` (if local)
  - Environment: `.env`
  - IDE: `.idea/`, `.vscode/`, `*.swp`
  - Docker: `.docker/`
  - Testing: `.coverage`, `htmlcov/`, `.pytest_cache/`
  - OS: `.DS_Store`, `Thumbs.db`
  - Alembic: don't ignore `alembic/versions/` (migrations are committed)

- ⬜ **Create `Makefile`** → `Makefile`
  - `make install` → `cd backend && uv sync`
  - `make dev` → `cd backend && uv run uvicorn app.main:app --reload --port 8000`
  - `make test` → `cd backend && uv run pytest -v`
  - `make lint` → `cd backend && uv run ruff check .`
  - `make format` → `cd backend && uv run ruff format .`
  - `make migrate` → `cd backend && uv run alembic upgrade head`
  - `make migration` → `cd backend && uv run alembic revision --autogenerate -m "$(msg)"`
  - `make seed` → `cd backend && uv run python -m scripts.seed`
  - `make docker-up` → `docker compose up -d`
  - `make docker-down` → `docker compose down`

- ⬜ **Create `.env.example`** → `.env.example`
  - `DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/notifications`
  - `DATABASE_URL_SYNC=postgresql://postgres:postgres@localhost:5432/notifications` (for Alembic)
  - `APP_ENV=development`
  - `APP_DEBUG=true`
  - `APP_VERSION=0.1.0`
  - `API_HOST=0.0.0.0`
  - `API_PORT=8000`
  - `LOG_LEVEL=DEBUG`
  - `LOG_FORMAT=json`
  - `RESEND_API_KEY=re_xxxxxxxxxxxx`
  - `RESEND_FROM_EMAIL=notifications@example.com`
  - `TWILIO_ACCOUNT_SID=ACxxxxxxxx`
  - `TWILIO_AUTH_TOKEN=xxxxxxxx`
  - `TWILIO_FROM_NUMBER=+15551234567`
  - `WEBHOOK_DEFAULT_TIMEOUT=30`
  - `WEBHOOK_MAX_REDIRECTS=3`
  - `DEFAULT_RATE_LIMIT_PER_MIN=1000`
  - `MAX_BATCH_SIZE=1000`
  - Phase 2+ placeholders (commented out): `REDIS_URL`, `CELERY_BROKER_URL`, `CELERY_RESULT_BACKEND`

---

### 1.2: Configuration & Database Setup

- ⬜ **Create config module** → `backend/app/config.py`
  - Use `pydantic-settings` `BaseSettings` with `model_config = SettingsConfigDict(env_file=".env")`
  - Settings class with typed fields for all env vars listed above
  - Nested config groups: `DatabaseSettings`, `AppSettings`, `EmailSettings`, `SmsSettings`, `WebhookSettings`
  - Singleton pattern: `get_settings()` function with `@lru_cache`
  - Validation: `DATABASE_URL` must start with `postgresql+asyncpg://`

- ⬜ **Create database module** → `backend/app/database.py`
  - `create_async_engine()` from `sqlalchemy.ext.asyncio` with `asyncpg` driver
  - `async_sessionmaker` for `AsyncSession`
  - `get_session()` async generator for FastAPI dependency injection (yields `AsyncSession`)
  - Pool configuration: `pool_size=5`, `max_overflow=10`, `pool_pre_ping=True`
  - `init_db()` function for creating tables (used in tests, not production — use Alembic for prod)
  - Depends on: `app/config.py`

- ⬜ **Create structured logging setup** → `backend/app/utils/logging.py`
  - Configure `structlog` with JSON renderer for production, console renderer for development
  - Processors: add timestamp, log level, add `request_id` context
  - `get_logger()` function for use throughout the app
  - Logging config driven by `LOG_LEVEL` and `LOG_FORMAT` from settings

- ⬜ **Create utility modules** → `backend/app/utils/crypto.py`, `backend/app/utils/datetime.py`
  - `crypto.py`: `hash_api_key(key: str) -> str` using bcrypt, `verify_api_key(key: str, hash: str) -> bool`, `generate_api_key() -> str` (generates `nk_` prefixed random key)
  - `datetime.py`: `utc_now() -> datetime` helper, ensure consistent timezone handling

---

### 1.3: Database Models

All models use `SQLModel` with `table=True`. Each model is in its own file under `backend/app/models/`. The `__init__.py` re-exports all models for convenient imports and ensures Alembic discovers them.

- ⬜ **Create ApiKey model** → `backend/app/models/api_key.py`
  - Fields: `id` (UUID PK), `key_hash` (str, unique), `key_prefix` (str, 10 chars), `name` (str), `description` (optional str), `rate_limit_per_min` (optional int), `is_active` (bool, default True), `last_used_at` (optional datetime), `created_at` (datetime), `revoked_at` (optional datetime)
  - Indexes: `key_hash`, `key_prefix`, `is_active`
  - No FK dependencies — build this first

- ⬜ **Create Template model** → `backend/app/models/template.py`
  - Fields: `id` (UUID PK), `name` (str), `channel` (str, CHECK email/sms/webhook), `subject` (optional str), `body` (str), `variables` (JSON, default []), `version` (int, default 1), `is_active` (bool, default True), `metadata` (optional JSON), `created_by` (optional UUID FK → api_keys.id), `created_at`, `updated_at`
  - Indexes: `name`, `channel`, `is_active`
  - Unique constraint: `(name, channel)` where `is_active = true`
  - Depends on: `ApiKey` model (FK)

- ⬜ **Create Event model** → `backend/app/models/event.py`
  - Fields: `id` (UUID PK), `event_type` (str), `priority` (str, CHECK high/medium/low, default "medium"), `status` (str, CHECK accepted/processing/completed/partial_failure, default "accepted"), `template_id` (optional UUID FK → templates.id), `payload` (JSON), `metadata` (optional JSON), `api_key_id` (UUID FK → api_keys.id), `idempotency_key` (optional str), `batch_id` (optional UUID), `recipient_count` (int, default 1), `created_at`, `updated_at`
  - Indexes: `event_type`, `status`, `created_at DESC`, `api_key_id`, `batch_id`
  - Composite unique: `(api_key_id, idempotency_key)` where `idempotency_key IS NOT NULL`
  - Depends on: `ApiKey`, `Template` models (FKs)

- ⬜ **Create Notification model** → `backend/app/models/notification.py`
  - Fields: `id` (UUID PK), `event_id` (UUID FK → events.id), `channel` (str, CHECK email/sms/webhook), `status` (str, CHECK pending/queued/processing/delivered/failed/dead_letter/cancelled, default "pending"), `priority` (str, default "medium"), `recipient_user_id` (str), `recipient_address` (str), `webhook_secret` (optional str), `rendered_subject` (optional str), `rendered_body` (optional str), `retry_count` (int, default 0), `max_retries` (int, default 5), `next_retry_at` (optional datetime), `celery_task_id` (optional str), `provider_response` (optional JSON), `error_message` (optional str), `created_at`, `queued_at`, `processing_started_at`, `delivered_at`, `failed_at`, `updated_at`
  - Indexes: `event_id`, `status`, `channel`, `created_at DESC`, `celery_task_id`, composite `(channel, status)`
  - Depends on: `Event` model (FK)

- ⬜ **Create NotificationLog model** → `backend/app/models/notification_log.py`
  - Fields: `id` (UUID PK), `notification_id` (UUID FK → notifications.id), `previous_status` (optional str), `new_status` (str), `worker_id` (optional str), `error_type` (optional str), `error_message` (optional str), `provider_response` (optional JSON), `metadata` (optional JSON), `created_at`
  - Indexes: `notification_id`, `created_at DESC`
  - Depends on: `Notification` model (FK)

- ⬜ **Create DeadLetterMessage model** → `backend/app/models/dead_letter.py`
  - Fields: `id` (UUID PK), `notification_id` (UUID FK → notifications.id, unique), `channel` (str), `recipient_address` (str), `event_payload` (JSON), `error_type` (str), `error_message` (str), `retry_count` (int), `retry_history` (JSON), `status` (str, CHECK active/retried/discarded, default "active"), `failed_at` (datetime), `retried_at` (optional datetime), `discarded_at` (optional datetime), `created_at`, `updated_at`
  - Indexes: `notification_id`, `channel`, `status`, `failed_at DESC`
  - Depends on: `Notification` model (FK)

- ⬜ **Create RetryPolicy model** → `backend/app/models/retry_policy.py`
  - Fields: `id` (UUID PK), `channel` (str, unique, CHECK email/sms/webhook), `max_retries` (int, default 5), `base_delay_seconds` (int, default 10), `max_backoff_seconds` (int, default 600), `jitter_enabled` (bool, default True), `retry_on_timeout` (bool, default True), `retry_on_5xx` (bool, default True), `retry_on_4xx` (bool, default False), `created_at`, `updated_at`
  - Standalone model — no FKs

- ⬜ **Create ChannelConfig model** → `backend/app/models/channel_config.py`
  - Fields: `id` (UUID PK), `channel` (str, unique, CHECK email/sms/webhook), `is_enabled` (bool, default True), `rate_limit_per_min` (optional int), `config` (JSON), `created_at`, `updated_at`
  - Standalone model — no FKs

- ⬜ **Create models `__init__.py`** → `backend/app/models/__init__.py`
  - Import and re-export all 8 models
  - This ensures Alembic's `target_metadata` picks up all tables

- ⬜ **Set up Alembic** → `backend/alembic/`, `backend/alembic.ini`
  - `uv run alembic init alembic` inside `backend/`
  - Edit `alembic.ini`: set `sqlalchemy.url` to use `DATABASE_URL_SYNC` env var
  - Edit `alembic/env.py`: import all models, set `target_metadata = SQLModel.metadata`, configure async support
  - Note: Alembic migrations use the **sync** PostgreSQL driver (`psycopg2` or `pg8000`), not `asyncpg`
  - Add `psycopg2-binary` (or `psycopg[binary]`) to dev dependencies for Alembic sync driver

- ⬜ **Generate initial migration** → `backend/alembic/versions/xxxx_initial_schema.py`
  - Run `uv run alembic revision --autogenerate -m "initial schema"`
  - Review the generated migration for correctness (indexes, constraints, etc.)
  - Run `uv run alembic upgrade head` to verify it applies cleanly
  - Depends on: all 8 models + Alembic setup

---

### 1.4: Pydantic Schemas

Request/response schemas are separate from SQLModel table models. All schemas live in `backend/app/schemas/`.

- ⬜ **Create common schemas** → `backend/app/schemas/common.py`
  - `PaginationParams`: `page` (int, default 1, ge=1), `page_size` (int, default 25, ge=1, le=100)
  - `PaginatedResponse[T]` (generic): `items` (list[T]), `total` (int), `page` (int), `page_size` (int), `pages` (int)
  - `ErrorResponse`: `detail` (str), `error_code` (optional str), `timestamp` (datetime)
  - `HealthCheckResponse`: `status` (str), `timestamp` (datetime), `version` (str), `uptime_seconds` (int), `checks` (dict)
  - `MessageResponse`: `message` (str) — for simple success responses

- ⬜ **Create event schemas** → `backend/app/schemas/events.py`
  - `RecipientSchema`: `user_id` (str), `channels` (list[Literal["email","sms","webhook"]]), `email` (optional EmailStr), `phone` (optional str), `webhook_url` (optional HttpUrl), `webhook_secret` (optional str) — with validators ensuring channel-required fields
  - `EventCreateRequest`: `event_type` (str), `recipients` (list[RecipientSchema], min 1), `priority` (Literal, default "medium"), `template_id` (optional UUID), `payload` (dict), `metadata` (optional dict)
  - `EventCreateResponse`: `event_id` (UUID), `notification_ids` (list[UUID]), `status` (str = "accepted"), `created_at` (datetime)
  - `BatchEventCreateResponse`: extends `EventCreateResponse` with `batch_id` (UUID), `notification_count` (int)
  - `EventDetailResponse`: full event with `notification_summary` (dict of status counts) and `notifications` list
  - `EventListResponse`: inherits `PaginatedResponse[EventSummary]`

- ⬜ **Create notification schemas** → `backend/app/schemas/notifications.py`
  - `NotificationResponse`: all fields from `Notification` model (mapped to response-safe types)
  - `NotificationListParams`: extends `PaginationParams` with `status` (optional str), `channel` (optional str), `event_type` (optional str), `created_after` (optional datetime), `created_before` (optional datetime), `sort_by` (str, default "created_at"), `sort_order` (Literal["asc","desc"], default "desc")
  - `NotificationDetailResponse`: `NotificationResponse` plus `logs` (list of log entries)

- ⬜ **Create template schemas** → `backend/app/schemas/templates.py`
  - `TemplateVariableSchema`: `name` (str), `type` (Literal["string","number","boolean"]), `required` (bool), `default` (optional Any)
  - `TemplateCreateRequest`: `name` (str), `channel` (Literal), `subject` (optional str), `body` (str), `variables` (list[TemplateVariableSchema], default []), `metadata` (optional dict)
  - `TemplateUpdateRequest`: all fields optional (partial update)
  - `TemplateResponse`: `template_id` (UUID), `name`, `channel`, `subject`, `body`, `variables`, `version`, `is_active`, `created_at`, `updated_at`
  - `TemplateCreateResponse`: `template_id`, `name`, `channel`, `version`, `created_at`

- ⬜ **Create settings schemas** → `backend/app/schemas/settings.py`
  - `ApiKeyCreateRequest`: `name` (str), `description` (optional str), `rate_limit_override` (optional int)
  - `ApiKeyCreateResponse`: `key_id` (UUID), `api_key` (str — plaintext, shown once), `name` (str), `created_at` (datetime)
  - `ApiKeyListItem`: `key_id` (UUID), `key_prefix` (str), `name` (str), `description` (optional str), `is_active` (bool), `last_used_at` (optional datetime), `created_at` (datetime)
  - `ApiKeyListResponse`: `items` (list[ApiKeyListItem])

- ⬜ **Create schemas `__init__.py`** → `backend/app/schemas/__init__.py`
  - Re-export commonly used schemas for convenient imports

---

### 1.5: API Endpoints

All route modules go under `backend/app/api/v1/`. Each module defines a `router = APIRouter(...)` with appropriate prefix and tags.

- ⬜ **Create FastAPI app factory** → `backend/app/main.py`
  - `create_app() -> FastAPI` factory function
  - Configure `lifespan` async context manager for startup/shutdown (DB engine setup/teardown)
  - Include v1 router at `/api/v1`
  - Add CORS middleware (allow all origins in dev)
  - Configure `structlog` on startup
  - Set `title`, `version`, `description` for OpenAPI docs
  - Depends on: `config.py`, `database.py`, `utils/logging.py`

- ⬜ **Create v1 aggregate router** → `backend/app/api/v1/router.py`
  - Import and include all sub-routers: `health`, `events`, `notifications`, `templates`, `settings`
  - Each sub-router has its own prefix: `/health`, `/events`, `/notifications`, `/templates`, `/settings`

- ⬜ **Create dependency injection module** → `backend/app/api/deps.py`
  - `get_db()` — async generator yielding `AsyncSession` (re-export from `database.py`)
  - `get_current_api_key()` — extracts `X-API-Key` header, validates against DB, returns `ApiKey` model instance. Raises `401` if missing/invalid. Updates `last_used_at`.
  - `get_settings()` — returns app settings singleton
  - Depends on: `database.py`, `config.py`, `models/api_key.py`, `utils/crypto.py`

- ⬜ **Create health endpoint** → `backend/app/api/v1/health.py`
  - `GET /health/` — aggregate health check: pings PostgreSQL (via `SELECT 1`), returns status, version, uptime, check latencies. Returns 200 if healthy, 503 if degraded. For Phase 1, only checks PostgreSQL (no Redis/Celery checks yet).
  - `GET /health/ready` — readiness probe (DB is reachable)
  - `GET /health/live` — liveness probe (process is alive, always returns 200)
  - Note: No auth required on health endpoints
  - Depends on: `database.py`, `config.py`

- ⬜ **Create event service** → `backend/app/services/event_service.py`
  - `create_event(session, event_data, api_key) -> (Event, list[Notification])` — business logic:
    1. Create `Event` record from request data
    2. For each recipient × channel combination, create a `Notification` record with status `"pending"`
    3. For each notification, create an initial `NotificationLog` entry (status change: `null → pending`)
    4. Return the event and list of created notifications
  - No queue dispatch — that's Phase 2
  - Depends on: models (`Event`, `Notification`, `NotificationLog`)

- ⬜ **Create events endpoint** → `backend/app/api/v1/events.py`
  - `POST /events/` — accepts `EventCreateRequest`, calls `event_service.create_event()`, returns `EventCreateResponse` with 202 status
  - `POST /events/batch` — same as single but generates a `batch_id`, accepts up to `MAX_BATCH_SIZE` recipients
  - Auth required via `Depends(get_current_api_key)`
  - Depends on: `deps.py`, `schemas/events.py`, `services/event_service.py`

- ⬜ **Create notifications endpoint** → `backend/app/api/v1/notifications.py`
  - `GET /notifications/` — list notifications with filters and pagination (status, channel, date range, sort). Query directly with SQLModel `select()`.
  - `GET /notifications/{notification_id}` — get single notification with its logs
  - Auth required
  - Depends on: `deps.py`, `schemas/notifications.py`, models

- ⬜ **Create template service** → `backend/app/services/template_service.py`
  - CRUD operations for templates: `create_template()`, `get_template()`, `list_templates()`, `update_template()`, `delete_template()` (soft delete — sets `is_active = false`)
  - On update: increment `version` number
  - Depends on: `models/template.py`

- ⬜ **Create templates endpoint** → `backend/app/api/v1/templates.py`
  - `POST /templates/` — create template, return 201
  - `GET /templates/` — list active templates with pagination
  - `GET /templates/{template_id}` — get single template
  - `PUT /templates/{template_id}` — update template (increments version)
  - `DELETE /templates/{template_id}` — soft-delete (set `is_active = false`)
  - Auth required
  - Depends on: `deps.py`, `schemas/templates.py`, `services/template_service.py`

- ⬜ **Create settings endpoint** → `backend/app/api/v1/settings.py`
  - `POST /settings/api-keys` — create new API key: generate random key, hash with bcrypt, store hash + prefix, return plaintext key once
  - `GET /settings/api-keys` — list all API keys (without hashes)
  - Auth required (existing key needed to create new keys)
  - Depends on: `deps.py`, `schemas/settings.py`, `utils/crypto.py`, `models/api_key.py`

---

### 1.6: Authentication Middleware

- ⬜ **Implement API key authentication** → `backend/app/api/deps.py` (already created in 1.5, add auth logic)
  - `get_current_api_key(x_api_key: str = Header(...))` dependency:
    1. If header is missing → `HTTPException(401, "Missing API key")`
    2. Extract key prefix (first 8 chars)
    3. Query `ApiKey` table by `key_prefix` where `is_active = true`
    4. For each candidate, `verify_api_key(provided_key, candidate.key_hash)`
    5. If no match → `HTTPException(401, "Invalid API key")`
    6. Update `last_used_at = utc_now()` on the matching key
    7. Return the `ApiKey` model instance
  - Note: Using prefix-based lookup + bcrypt verify is more efficient than scanning all keys
  - Depends on: `utils/crypto.py`, `models/api_key.py`, `database.py`

- ⬜ **Add request ID middleware** → `backend/app/api/middleware.py`
  - Middleware that reads `X-Request-ID` header (or generates a UUID if absent)
  - Binds request ID to `structlog` context for the request lifecycle
  - Adds `X-Request-ID` to response headers
  - Depends on: `utils/logging.py`

---

### 1.7: Docker Compose

- ⬜ **Create API Dockerfile** → `backend/Dockerfile`
  - Multi-stage build: `python:3.12-slim` base
  - Install `uv` via `pip install uv` or copy from official image
  - Copy `pyproject.toml` and `uv.lock`, run `uv sync --frozen`
  - Copy application code
  - Expose port 8000
  - CMD: `uv run uvicorn app.main:app --host 0.0.0.0 --port 8000`
  - Health check: `curl -f http://localhost:8000/api/v1/health/live`

- ⬜ **Create `docker-compose.yml`** → `docker-compose.yml`
  - **postgres** service:
    - Image: `postgres:16-alpine`
    - Environment: `POSTGRES_DB=notifications`, `POSTGRES_USER=postgres`, `POSTGRES_PASSWORD=postgres`
    - Port: `5432:5432`
    - Volume: `postgres_data:/var/lib/postgresql/data`
    - Health check: `pg_isready -U postgres`
  - **api** service:
    - Build from `backend/Dockerfile`
    - Port: `8000:8000`
    - Environment: `DATABASE_URL`, all app config
    - Depends on: `postgres` (condition: service_healthy)
    - Volume mount: `./backend:/app` (for dev hot-reload)
    - Command override for dev: `uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload`
    - Health check: `curl -f http://localhost:8000/api/v1/health/live`
  - **No Redis, no workers** — those are Phase 2
  - Named volume: `postgres_data`

---

### 1.8: Seed Script

- ⬜ **Create seed script** → `backend/scripts/seed.py`
  - Runnable via `uv run python -m scripts.seed` (from `backend/`)
  - Creates:
    1. A default API key (prints plaintext key to console on first run)
    2. Sample templates: `order_confirmation` (email), `shipping_update` (sms), `webhook_delivery` (webhook)
    3. Sample retry policies for all 3 channels
    4. Sample channel configs for all 3 channels
    5. A few sample events and notifications for testing/demo
  - Idempotent: checks if seed data already exists before inserting
  - Uses async SQLModel session
  - Depends on: all models, `database.py`, `config.py`, `utils/crypto.py`

---

### 1.9: Tests

All tests in `backend/tests/`. Use `pytest` + `pytest-asyncio` + `httpx.AsyncClient` as the FastAPI test client.

- ⬜ **Create test configuration** → `backend/tests/conftest.py`
  - Fixtures:
    - `test_engine` — create async SQLAlchemy engine pointing to a test database (SQLite in-memory or separate Postgres DB via env var)
    - `test_session` — async session factory, yields session, rolls back after each test
    - `test_app` — FastAPI app instance with dependency overrides (swap real DB session for test session)
    - `client` — `httpx.AsyncClient` wrapping the test app
    - `api_key_header` — creates a test API key in the DB and returns the `X-API-Key` header dict for authenticated requests
  - Note: Use SQLite for fast local tests or Postgres (via Docker) for CI

- ⬜ **Create health endpoint tests** → `backend/tests/test_api/test_health.py`
  - Test `GET /api/v1/health/` returns 200 with status "healthy" and `postgresql` check
  - Test `GET /api/v1/health/ready` returns 200
  - Test `GET /api/v1/health/live` returns 200
  - No auth required on health endpoints

- ⬜ **Create event endpoint tests** → `backend/tests/test_api/test_events.py`
  - Test `POST /api/v1/events/` with valid payload → 202, returns `event_id` and `notification_ids`
  - Test creates correct number of notifications (1 notification per recipient × channel)
  - Test with missing required fields → 422
  - Test without API key → 401
  - Test with invalid API key → 401
  - Test email recipient without `email` field → 422
  - Test batch event creates multiple notifications

- ⬜ **Create notification endpoint tests** → `backend/tests/test_api/test_notifications.py`
  - Test `GET /api/v1/notifications/` returns paginated list
  - Test `GET /api/v1/notifications/{id}` returns notification with logs
  - Test filtering by status, channel
  - Test 404 for non-existent notification ID
  - Test auth required

- ⬜ **Create template endpoint tests** → `backend/tests/test_api/test_templates.py`
  - Test full CRUD cycle: create → read → update → delete
  - Test `POST /api/v1/templates/` returns 201 with template data
  - Test `GET /api/v1/templates/` returns paginated list
  - Test `GET /api/v1/templates/{id}` returns single template
  - Test `PUT /api/v1/templates/{id}` increments version
  - Test `DELETE /api/v1/templates/{id}` soft-deletes (sets `is_active = false`)
  - Test 404 for non-existent template ID
  - Test auth required

- ⬜ **Create API key auth tests** → `backend/tests/test_api/test_auth.py`
  - Test request with valid API key → 200/202
  - Test request with missing `X-API-Key` header → 401
  - Test request with invalid/random API key → 401
  - Test request with revoked API key → 401
  - Test `POST /api/v1/settings/api-keys` creates new key
  - Test `GET /api/v1/settings/api-keys` lists keys without exposing hashes

---

### Dependency Graph

Build order — each sub-phase depends on the ones above it:

```
1.1 Scaffolding
 └─► 1.2 Config & Database
      └─► 1.3 Models
           ├─► 1.4 Schemas (can be parallel with Alembic setup in 1.3)
           └─► Alembic initial migration (end of 1.3)
                └─► 1.5 API Endpoints + 1.6 Auth (parallel)
                     └─► 1.7 Docker Compose
                          └─► 1.8 Seed Script
                               └─► 1.9 Tests
```

### What's NOT in Phase 1

These are explicitly deferred to later phases:
- ❌ Redis — no caching, no pub/sub, no rate limiting storage
- ❌ Celery — no task queue, no workers, no async processing
- ❌ Delivery adapters — no Resend, Twilio, or webhook HTTP calls
- ❌ Idempotency key checking — no Redis for deduplication
- ❌ Rate limiting middleware — no sliding window counters
- ❌ WebSocket endpoint — no real-time updates
- ❌ Dead letter management endpoints — models exist but no DLQ API
- ❌ Analytics endpoints — models exist but no analytics queries
- ❌ Frontend dashboard — backend only in Phase 1
- ❌ Template rendering (Jinja2) — templates are stored but not rendered yet
- ❌ Retry logic — no exponential backoff, no dead-letter routing

### Definition of Done — Phase 1

Phase 1 is complete when:
1. `docker compose up` starts PostgreSQL + API server
2. API server starts and `GET /api/v1/health/` returns healthy
3. Seed script populates the database with test data
4. All CRUD operations work for templates
5. Event submission creates notifications with status "pending" in the database
6. API key authentication works (valid key passes, missing/invalid key returns 401)
7. All tests pass: `uv run pytest -v` shows green
8. Alembic migrations apply cleanly on a fresh database
