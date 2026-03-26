"""Shared test fixtures — async engine, session, client, and API-key helper."""

import uuid
from collections.abc import AsyncGenerator

import pytest
from httpx import ASGITransport, AsyncClient
from pydantic import PostgresDsn
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool
from sqlmodel import SQLModel

import app.models  # noqa: F401 — register all tables
from app.config import settings
from app.database import get_db
from app.main import create_app
from app.models.api_key import ApiKey
from app.utils.crypto import generate_api_key, hash_api_key
from app.utils.datetime import utc_now

TEST_DATABASE_URL = str(PostgresDsn.build(
    scheme="postgresql+asyncpg",
    username=settings.POSTGRES_USER,
    password=settings.POSTGRES_PASSWORD,
    host=settings.POSTGRES_SERVER,
    port=settings.POSTGRES_PORT,
    path=f"{settings.POSTGRES_DB}_test",
))

test_engine = create_async_engine(TEST_DATABASE_URL, echo=False, poolclass=NullPool)
TestSessionLocal = async_sessionmaker(
    test_engine, class_=AsyncSession, expire_on_commit=False
)


@pytest.fixture(scope="session", autouse=True)
async def _create_tables():
    """Create all tables once at the start; drop them at the end."""
    async with test_engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.drop_all)
        await conn.run_sync(SQLModel.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.drop_all)
    await test_engine.dispose()


@pytest.fixture(autouse=True)
async def _clean_tables():
    """Truncate all application tables between tests for isolation."""
    yield
    async with test_engine.begin() as conn:
        await conn.exec_driver_sql(
            "TRUNCATE notification_logs, dead_letter_messages, notifications, "
            "events, templates, channel_configs, retry_policies, api_keys CASCADE"
        )


@pytest.fixture
async def db() -> AsyncGenerator[AsyncSession, None]:
    """Yield an independent async session for direct DB manipulation in tests."""
    async with TestSessionLocal() as session:
        yield session


def _make_app():
    """Build a test FastAPI app with the DB dependency overridden."""
    test_app = create_app()

    async def _override_get_db() -> AsyncGenerator[AsyncSession, None]:
        async with TestSessionLocal() as session:
            yield session

    test_app.dependency_overrides[get_db] = _override_get_db
    return test_app


@pytest.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    """Provide an httpx AsyncClient wired to the test FastAPI app."""
    test_app = _make_app()
    transport = ASGITransport(app=test_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    test_app.dependency_overrides.clear()


@pytest.fixture
async def api_key_pair(db: AsyncSession) -> tuple[ApiKey, str]:
    """Insert a test API key and return (model, raw_key)."""
    raw_key = generate_api_key()
    key = ApiKey(
        id=uuid.uuid4(),
        key_hash=hash_api_key(raw_key),
        key_prefix=raw_key[:10],
        name="test-key",
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
