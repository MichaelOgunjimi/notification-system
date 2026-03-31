"""Security utilities — hashing, key validation helpers."""

import secrets

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col

from app.models.api_key import ApiKey
from app.utils.crypto import hash_api_key
from app.utils.datetime import utc_now


async def validate_api_key(db: AsyncSession, raw_key: str) -> ApiKey | None:
    """Look up and validate an API key. Returns the ApiKey if valid, None otherwise."""
    key_hash = hash_api_key(raw_key)
    result = await db.execute(select(ApiKey).where(col(ApiKey.key_hash) == key_hash))
    api_key = result.scalar_one_or_none()

    if api_key is None or not api_key.is_active:
        return None

    if api_key.revoked_at is not None:
        return None

    # Commit last_used_at separately — this is observational tracking (like
    # access logging) and should persist regardless of whether the request
    # succeeds. Runs before the route handler, so it doesn't break batch
    # or single-event atomicity.
    api_key.last_used_at = utc_now()
    db.add(api_key)
    await db.commit()
    return api_key


def verify_master_key_value(provided_key: str, master_key: str) -> bool:
    """Constant-time comparison of master key."""
    return secrets.compare_digest(provided_key, master_key)
