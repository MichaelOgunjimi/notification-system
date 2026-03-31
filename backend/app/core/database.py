"""Async database engine and session management.

Uses SQLAlchemy async engine with asyncpg driver and SQLModel metadata.
"""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlmodel import SQLModel

from app.core.config import settings

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    pool_size=5,
    max_overflow=10,
    pool_pre_ping=True,
)

async_session = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Yield an async database session for FastAPI dependency injection."""
    async with async_session() as session:
        yield session


async def init_db() -> None:
    """Create all tables from SQLModel metadata (for tests; use Alembic in production)."""
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
