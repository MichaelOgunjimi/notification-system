"""Project API Key lifecycle use cases."""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col

from app.core.crypto import generate_api_key, hash_api_key
from app.core.datetime import utc_now
from app.core.pagination import Page
from app.modules.credentials.model import ApiKey
from app.modules.credentials.types import ApiKeyView, CreatedApiKeyView
from app.modules.identity.models.user import User
from app.modules.observability.audit.service import log_action
from app.modules.tenancy.authorization import (
    OrganizationCapability,
    authorize_project,
)
from app.modules.tenancy.errors import TenantResourceNotFoundError


async def create_project_api_key(
    db: AsyncSession,
    *,
    user: User,
    project_id: uuid.UUID,
    name: str,
    description: str | None,
    scopes: list[str],
    rate_limit_per_min: int | None,
    environment: str = "live",
) -> CreatedApiKeyView:
    access = await authorize_project(
        db,
        user_id=user.id,
        project_id=project_id,
        capability=OrganizationCapability.MANAGE_API_KEYS,
    )
    raw_key = generate_api_key()
    api_key = ApiKey(
        project_id=access.project.id,
        created_by_user_id=user.id,
        key_hash=hash_api_key(raw_key),
        key_prefix=raw_key[:10],
        name=name,
        description=description,
        environment=environment,
        scopes=scopes,
        rate_limit_per_min=rate_limit_per_min,
    )
    db.add(api_key)
    await db.flush()
    await db.refresh(api_key)
    await log_action(
        db,
        api_key_id=None,
        organization_id=access.project.organization_id,
        project_id=access.project.id,
        actor_user_id=user.id,
        action="api_key.created",
        resource_type="api_key",
        resource_id=str(api_key.id),
        metadata={
            "name": api_key.name,
            "key_prefix": api_key.key_prefix,
            "scopes": api_key.scopes,
            "environment": api_key.environment,
        },
    )
    await db.commit()
    return CreatedApiKeyView(
        id=api_key.id,
        project_id=access.project.id,
        key=raw_key,
        key_prefix=api_key.key_prefix,
        name=api_key.name,
        description=api_key.description,
        environment=api_key.environment,
        scopes=api_key.scopes,
        is_active=api_key.is_active,
        rate_limit_per_min=api_key.rate_limit_per_min,
        created_at=api_key.created_at,
        updated_at=api_key.updated_at,
        last_used_at=api_key.last_used_at,
        revoked_at=api_key.revoked_at,
    )


def _api_key_view(api_key: ApiKey) -> ApiKeyView:
    return ApiKeyView(
        id=api_key.id,
        project_id=api_key.project_id,
        key_prefix=api_key.key_prefix,
        name=api_key.name,
        description=api_key.description,
        environment=api_key.environment,
        scopes=api_key.scopes,
        is_active=api_key.is_active,
        rate_limit_per_min=api_key.rate_limit_per_min,
        created_at=api_key.created_at,
        updated_at=api_key.updated_at,
        last_used_at=api_key.last_used_at,
        revoked_at=api_key.revoked_at,
    )


async def list_project_api_keys(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    project_id: uuid.UUID,
    page: int,
    per_page: int,
) -> Page[ApiKeyView]:
    await authorize_project(
        db,
        user_id=user_id,
        project_id=project_id,
        capability=OrganizationCapability.MANAGE_API_KEYS,
    )
    total = int(
        (
            await db.execute(
                select(func.count()).select_from(ApiKey).where(col(ApiKey.project_id) == project_id)
            )
        ).scalar()
        or 0
    )
    result = await db.execute(
        select(ApiKey)
        .where(col(ApiKey.project_id) == project_id)
        .order_by(col(ApiKey.is_active).desc(), col(ApiKey.created_at).desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    return Page(
        items=[_api_key_view(api_key) for api_key in result.scalars().all()],
        total=total,
        page=page,
        per_page=per_page,
    )


async def revoke_project_api_key(
    db: AsyncSession,
    *,
    user: User,
    project_id: uuid.UUID,
    api_key_id: uuid.UUID,
) -> None:
    access = await authorize_project(
        db,
        user_id=user.id,
        project_id=project_id,
        capability=OrganizationCapability.MANAGE_API_KEYS,
    )
    result = await db.execute(
        select(ApiKey).where(
            col(ApiKey.id) == api_key_id,
            col(ApiKey.project_id) == project_id,
        )
    )
    api_key = result.scalar_one_or_none()
    if api_key is None:
        raise TenantResourceNotFoundError("API key")

    api_key.is_active = False
    api_key.revoked_at = utc_now()
    api_key.updated_at = api_key.revoked_at
    db.add(api_key)
    await log_action(
        db,
        api_key_id=None,
        organization_id=access.project.organization_id,
        project_id=access.project.id,
        actor_user_id=user.id,
        action="api_key.revoked",
        resource_type="api_key",
        resource_id=str(api_key.id),
        metadata={"name": api_key.name, "key_prefix": api_key.key_prefix},
    )
    await db.commit()


async def update_project_api_key(
    db: AsyncSession,
    *,
    user: User,
    project_id: uuid.UUID,
    api_key_id: uuid.UUID,
    changes: dict[str, object],
) -> ApiKeyView:
    access = await authorize_project(
        db,
        user_id=user.id,
        project_id=project_id,
        capability=OrganizationCapability.MANAGE_API_KEYS,
    )
    api_key = (
        await db.execute(
            select(ApiKey).where(
                col(ApiKey.id) == api_key_id,
                col(ApiKey.project_id) == project_id,
            )
        )
    ).scalar_one_or_none()
    if api_key is None or api_key.revoked_at is not None:
        raise TenantResourceNotFoundError("Active API key")
    previous = {field: getattr(api_key, field) for field in changes}
    for field, value in changes.items():
        setattr(api_key, field, value)
    api_key.updated_at = utc_now()
    db.add(api_key)
    await log_action(
        db,
        api_key_id=None,
        organization_id=access.project.organization_id,
        project_id=access.project.id,
        actor_user_id=user.id,
        action="api_key.updated",
        resource_type="api_key",
        resource_id=str(api_key.id),
        metadata={"previous": previous, "changes": changes},
    )
    await db.commit()
    return _api_key_view(api_key)


async def rotate_project_api_key(
    db: AsyncSession,
    *,
    user: User,
    project_id: uuid.UUID,
    api_key_id: uuid.UUID,
) -> CreatedApiKeyView:
    access = await authorize_project(
        db,
        user_id=user.id,
        project_id=project_id,
        capability=OrganizationCapability.MANAGE_API_KEYS,
    )
    current = (
        await db.execute(
            select(ApiKey).where(
                col(ApiKey.id) == api_key_id,
                col(ApiKey.project_id) == project_id,
                col(ApiKey.revoked_at).is_(None),
            )
        )
    ).scalar_one_or_none()
    if current is None:
        raise TenantResourceNotFoundError("Active API key")
    raw_key = generate_api_key()
    replacement = ApiKey(
        project_id=project_id,
        created_by_user_id=user.id,
        key_hash=hash_api_key(raw_key),
        key_prefix=raw_key[:10],
        name=current.name,
        description=current.description,
        environment=current.environment,
        scopes=list(current.scopes),
        rate_limit_per_min=current.rate_limit_per_min,
        rotated_from_id=current.id,
    )
    now = utc_now()
    current.is_active = False
    current.revoked_at = now
    current.updated_at = now
    db.add_all([current, replacement])
    await db.flush()
    await log_action(
        db,
        api_key_id=None,
        organization_id=access.project.organization_id,
        project_id=project_id,
        actor_user_id=user.id,
        action="api_key.rotated",
        resource_type="api_key",
        resource_id=str(replacement.id),
        metadata={
            "replaced_api_key_id": str(current.id),
            "key_prefix": replacement.key_prefix,
        },
    )
    await db.commit()
    view = _api_key_view(replacement)
    return CreatedApiKeyView(
        id=view.id,
        project_id=view.project_id,
        key=raw_key,
        key_prefix=view.key_prefix,
        name=view.name,
        description=view.description,
        environment=view.environment,
        scopes=view.scopes,
        is_active=view.is_active,
        rate_limit_per_min=view.rate_limit_per_min,
        created_at=view.created_at,
        updated_at=view.updated_at,
        last_used_at=view.last_used_at,
        revoked_at=view.revoked_at,
    )
