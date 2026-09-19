"""Shared test fixtures — async engine, session, client, and API-key helper."""

import uuid
from collections.abc import AsyncGenerator
from unittest.mock import AsyncMock

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from pydantic import PostgresDsn
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool
from sqlmodel import SQLModel

import app.model_registry  # noqa: F401 — register all tables
import app.modules.delivery.adapters as _integrations
from app.core.config import settings
from app.core.crypto import generate_api_key, hash_api_key
from app.core.database import get_db
from app.core.datetime import utc_now
from app.core.http.dependencies import get_redis_client
from app.main import create_app
from app.modules.credentials.model import ApiKey
from app.modules.credentials.types import ALL_API_KEY_SCOPES
from app.modules.identity.models.user import User
from app.modules.tenancy.lifecycle import create_organization, create_project
from app.modules.tenancy.models.project import Project

TEST_DATABASE_URL = str(
    PostgresDsn.build(
        scheme="postgresql+asyncpg",
        username=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        host=settings.POSTGRES_SERVER,
        port=settings.POSTGRES_PORT,
        path=f"{settings.POSTGRES_DB}_test",
    )
)

test_engine = create_async_engine(TEST_DATABASE_URL, echo=False, poolclass=NullPool)
TestSessionLocal = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)


@pytest_asyncio.fixture(scope="session", loop_scope="session", autouse=True)
async def _create_tables():
    """Create all tables once at the start; drop them at the end.

    Terminates any stale connections left by previously interrupted test runs
    before attempting DROP/CREATE to avoid lock deadlocks.
    """
    async with test_engine.begin() as conn:
        # Kill zombie connections from prior interrupted runs so DROP doesn't hang.
        await conn.exec_driver_sql(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
            "WHERE datname = current_database() AND pid <> pg_backend_pid()"
        )
        await conn.run_sync(SQLModel.metadata.drop_all)
        await conn.run_sync(SQLModel.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.drop_all)
    await test_engine.dispose()


@pytest.fixture(autouse=True)
async def _clean_tables():
    """Truncate all application tables before each test for isolation.

    Truncating before (not after) ensures a clean state even when a previous
    test run crashed before its teardown could complete.
    # No post-yield teardown — the next test's pre-yield truncation handles cleanup.
    """
    async with test_engine.begin() as conn:
        await conn.exec_driver_sql(
            "TRUNCATE system_credentials, system_accounts, admin_users, "
            "refresh_tokens, oauth_accounts, email_addresses, projects, "
            "organization_invitations, organization_memberships, organizations, users, "
            "api_key_usage, audit_logs, alert_rules, suppressions, "
            "notification_logs, dead_letter_messages, notifications, "
            "events, templates, channel_configs, retry_policies, api_keys CASCADE"
        )
    yield


@pytest.fixture(autouse=True)
def _reset_adapter_cache():
    """Clear adapters and prevent ordinary tests from sending external email.

    get_adapter() caches instances in a module-level dict. Without this
    fixture, adapter state from one test (or monkeypatched attributes)
    leaks into subsequent tests in the same process.
    """
    original_email_provider = settings.EMAIL_PROVIDER
    settings.EMAIL_PROVIDER = "mock"
    _integrations._adapter_instances.clear()
    yield
    _integrations._adapter_instances.clear()
    settings.EMAIL_PROVIDER = original_email_provider


@pytest.fixture
async def db() -> AsyncGenerator[AsyncSession, None]:
    """Yield an independent async session for direct DB manipulation in tests."""
    async with TestSessionLocal() as session:
        yield session


@pytest.fixture
def mock_redis() -> AsyncMock:
    redis = AsyncMock()
    redis.get.return_value = None
    redis.getdel.return_value = None
    redis.setex.return_value = True
    redis.delete.return_value = 1
    redis.eval.return_value = 1
    return redis


def _make_app(redis_override: AsyncMock | None = None):
    """Build a test FastAPI app with the DB dependency overridden."""
    import app.core.http.middleware as api_middleware

    test_app = create_app()
    api_middleware.async_session = TestSessionLocal

    async def _override_get_db() -> AsyncGenerator[AsyncSession, None]:
        async with TestSessionLocal() as session:
            yield session

    test_app.dependency_overrides[get_db] = _override_get_db
    if redis_override is not None:

        async def _override_get_redis() -> AsyncGenerator[AsyncMock, None]:
            yield redis_override

        test_app.dependency_overrides[get_redis_client] = _override_get_redis
    return test_app


async def _create_test_project(db: AsyncSession, *, suffix: str) -> tuple[User, Project]:
    owner = User(email=f"owner-{suffix}@example.com", name=f"Owner {suffix}")
    db.add(owner)
    await db.flush()
    organization = await create_organization(
        db,
        owner=owner,
        name=f"Organization {suffix}",
        slug=f"organization-{suffix}",
    )
    project = await create_project(
        db,
        organization=organization,
        creator=owner,
        name=f"Project {suffix}",
        slug=f"project-{suffix}",
    )
    return owner, project


@pytest.fixture
async def client(mock_redis: AsyncMock) -> AsyncGenerator[AsyncClient, None]:
    """Provide an httpx AsyncClient wired to the test FastAPI app."""
    test_app = _make_app(mock_redis)
    transport = ASGITransport(app=test_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    test_app.dependency_overrides.clear()


@pytest.fixture
async def api_key_pair(db: AsyncSession) -> tuple[ApiKey, str]:
    """Insert a test API key and return (model, raw_key)."""
    owner, project = await _create_test_project(db, suffix="a")
    raw_key = generate_api_key()
    key = ApiKey(
        id=uuid.uuid4(),
        project_id=project.id,
        created_by_user_id=owner.id,
        key_hash=hash_api_key(raw_key),
        key_prefix=raw_key[:10],
        name="test-key",
        scopes=list(ALL_API_KEY_SCOPES),
        is_active=True,
        created_at=utc_now(),
    )
    db.add(key)
    await db.commit()
    return key, raw_key


@pytest.fixture
async def api_key_pair_b(db: AsyncSession) -> tuple[ApiKey, str]:
    """Insert a second test API key for isolation tests."""
    owner, project = await _create_test_project(db, suffix="b")
    raw_key = generate_api_key()
    key = ApiKey(
        id=uuid.uuid4(),
        project_id=project.id,
        created_by_user_id=owner.id,
        key_hash=hash_api_key(raw_key),
        key_prefix=raw_key[:10],
        name="test-key-b",
        scopes=list(ALL_API_KEY_SCOPES),
        is_active=True,
        created_at=utc_now(),
    )
    db.add(key)
    await db.commit()
    return key, raw_key


@pytest.fixture
async def auth_client(
    api_key_pair: tuple[ApiKey, str],
) -> AsyncGenerator[AsyncClient, None]:
    """AsyncClient that sends a valid X-API-Key header on every request."""
    _key_model, raw_key = api_key_pair
    test_app = _make_app()
    transport = ASGITransport(app=test_app)
    async with AsyncClient(
        transport=transport,
        base_url="http://test",
        headers={"X-API-Key": raw_key},
    ) as ac:
        yield ac
    test_app.dependency_overrides.clear()


@pytest.fixture
async def auth_client_b(
    api_key_pair_b: tuple[ApiKey, str],
) -> AsyncGenerator[AsyncClient, None]:
    """AsyncClient using a second API key for isolation tests."""
    _key_model, raw_key = api_key_pair_b
    test_app = _make_app()
    transport = ASGITransport(app=test_app)
    async with AsyncClient(
        transport=transport,
        base_url="http://test",
        headers={"X-API-Key": raw_key},
    ) as ac:
        yield ac
    test_app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def _mock_celery_dispatch(monkeypatch):
    """Prevent Celery tasks from being enqueued during tests."""
    monkeypatch.setattr("app.modules.events.service._enqueue_dispatch", lambda *a, **kw: None)
