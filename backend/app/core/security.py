"""Security utilities — hashing, key validation helpers."""

import secrets

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col

from app.models.api_key import ApiKey
from app.utils.crypto import hash_api_key


async def validate_api_key(db: AsyncSession, raw_key: str) -> ApiKey | None:
    """Look up and validate an API key. Returns the ApiKey if valid, None otherwise."""
    key_hash = hash_api_key(raw_key)
    result = await db.execute(select(ApiKey).where(col(ApiKey.key_hash) == key_hash))
    api_key = result.scalar_one_or_none()

    if api_key is None or not api_key.is_active:
        return None

    if api_key.revoked_at is not None:
        return None

    # Atomic UPDATE — avoids the read-modify-write race where two concurrent
    # requests both read the old timestamp, both write it back, and one update
    # is silently lost. A single UPDATE SET last_used_at = NOW() is serialised
    # by the database and is also cheaper (no extra SELECT round-trip).
    await db.execute(
        update(ApiKey).where(col(ApiKey.id) == api_key.id).values(last_used_at=func.now())
    )
    await db.commit()
    return api_key


def verify_master_key_value(provided_key: str, master_key: str) -> bool:
    """Constant-time comparison of master key."""
    try:
        return secrets.compare_digest(provided_key, master_key)
    except TypeError:
        return False
