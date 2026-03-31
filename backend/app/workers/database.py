"""Sync database session for Celery workers.

Celery uses prefork concurrency (separate processes, not async).
Workers need a standard synchronous SQLAlchemy session.
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings

sync_engine = create_engine(
    settings.SYNC_DATABASE_URL,
    pool_size=5,
    max_overflow=10,
    pool_pre_ping=True,
)

SyncSessionLocal = sessionmaker(bind=sync_engine, class_=Session, expire_on_commit=False)


def get_sync_session() -> Session:
    """Get a sync database session for worker tasks."""
    return SyncSessionLocal()
