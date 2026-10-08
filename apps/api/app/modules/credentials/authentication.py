"""Authenticate project API-key credentials."""

import uuid

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col

from app.core.crypto import hash_api_key
from app.modules.credentials.model import ApiKey
from app.modules.credentials.types import ApiKeyScope
from app.modules.tenancy.models.organization import Organization
from app.modules.tenancy.models.project import Project


def api_key_is_usable(api_key: ApiKey) -> bool:
    """Whether a key may authenticate: active and not revoked."""
    return api_key.is_active and api_key.revoked_at is None


def api_key_has_scope(api_key: ApiKey, scope: ApiKeyScope) -> bool:
    """Whether the key was granted ``scope``."""
    return scope.value in set(api_key.scopes)


async def mark_api_key_used(db: AsyncSession, api_key_id: uuid.UUID) -> None:
    """Stamp ``last_used_at`` and commit, exactly as a header-authenticated request does."""
    await db.execute(
        update(ApiKey).where(col(ApiKey.id) == api_key_id).values(last_used_at=func.now())
    )
    await db.commit()


async def get_project_api_key(
    db: AsyncSession, *, project_id: uuid.UUID, api_key_id: uuid.UUID
) -> ApiKey | None:
    """Return the key if it belongs to ``project_id``; it may be inactive or revoked."""
    return (
        await db.execute(
            select(ApiKey).where(col(ApiKey.id) == api_key_id, col(ApiKey.project_id) == project_id)
        )
    ).scalar_one_or_none()


async def validate_api_key(db: AsyncSession, raw_key: str) -> ApiKey | None:
    """Return the active API key represented by ``raw_key``, if any."""
    key_hash = hash_api_key(raw_key)
    result = await db.execute(
        select(ApiKey)
        .join(Project, col(Project.id) == col(ApiKey.project_id))
        .join(Organization, col(Organization.id) == col(Project.organization_id))
        .where(
            col(ApiKey.key_hash) == key_hash,
            col(Project.archived_at).is_(None),
            col(Organization.archived_at).is_(None),
        )
    )
    api_key = result.scalar_one_or_none()
    if api_key is None or not api_key_is_usable(api_key):
        return None

    await mark_api_key_used(db, api_key.id)
    return api_key
