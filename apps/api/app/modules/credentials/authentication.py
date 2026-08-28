"""Authenticate project API-key credentials."""

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col

from app.core.crypto import hash_api_key
from app.modules.credentials.model import ApiKey
from app.modules.tenancy.models.organization import Organization
from app.modules.tenancy.models.project import Project


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
    if api_key is None or not api_key.is_active or api_key.revoked_at is not None:
        return None

    await db.execute(
        update(ApiKey).where(col(ApiKey.id) == api_key.id).values(last_used_at=func.now())
    )
    await db.commit()
    return api_key
