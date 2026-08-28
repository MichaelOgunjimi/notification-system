"""Internal system-account and credential lifecycle."""

import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col

from app.core.crypto import generate_system_key, hash_api_key
from app.core.datetime import utc_now
from app.modules.admin.dependencies import AdminPrincipal
from app.modules.admin.system_accounts.model import SystemAccount, SystemCredential
from app.modules.observability.audit.service import log_action


async def list_system_accounts(db: AsyncSession) -> list[SystemAccount]:
    result = await db.execute(select(SystemAccount).order_by(col(SystemAccount.created_at)))
    return list(result.scalars().all())


async def create_system_account(
    db: AsyncSession,
    *,
    actor: AdminPrincipal,
    name: str,
    slug: str,
    description: str | None,
) -> SystemAccount:
    account = SystemAccount(
        name=name,
        slug=slug,
        description=description,
        created_by_admin_user_id=actor.admin.id,
    )
    db.add(account)
    try:
        await db.flush()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="System account slug already exists",
        ) from exc
    await log_action(
        db,
        api_key_id=None,
        actor_user_id=actor.user.id,
        action="system_account.created",
        resource_type="system_account",
        resource_id=str(account.id),
        metadata={"name": name, "slug": slug},
    )
    await db.commit()
    return account


async def update_system_account(
    db: AsyncSession,
    *,
    actor: AdminPrincipal,
    system_account_id: uuid.UUID,
    changes: dict[str, object],
) -> SystemAccount:
    account = await db.get(SystemAccount, system_account_id)
    if account is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="System account not found",
        )
    for field, value in changes.items():
        setattr(account, field, value)
    account.updated_at = utc_now()
    db.add(account)
    await log_action(
        db,
        api_key_id=None,
        actor_user_id=actor.user.id,
        action="system_account.updated",
        resource_type="system_account",
        resource_id=str(account.id),
        metadata={"changes": changes},
    )
    await db.commit()
    return account


async def list_system_credentials(
    db: AsyncSession,
    *,
    system_account_id: uuid.UUID,
) -> list[SystemCredential]:
    result = await db.execute(
        select(SystemCredential)
        .where(col(SystemCredential.system_account_id) == system_account_id)
        .order_by(col(SystemCredential.created_at).desc())
    )
    return list(result.scalars().all())


async def create_system_credential(
    db: AsyncSession,
    *,
    actor: AdminPrincipal,
    system_account_id: uuid.UUID,
    name: str,
    permissions: list[str],
) -> tuple[SystemCredential, str]:
    account = await db.get(SystemAccount, system_account_id)
    if account is None or not account.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="System account not found",
        )
    raw_key = generate_system_key()
    credential = SystemCredential(
        system_account_id=account.id,
        name=name,
        key_hash=hash_api_key(raw_key),
        key_prefix=raw_key[:12],
        permissions=permissions,
    )
    db.add(credential)
    try:
        await db.flush()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="System credential name already exists",
        ) from exc
    await log_action(
        db,
        api_key_id=None,
        actor_user_id=actor.user.id,
        action="system_credential.created",
        resource_type="system_credential",
        resource_id=str(credential.id),
        metadata={"system_account_id": str(account.id), "permissions": permissions},
    )
    await db.commit()
    return credential, raw_key


async def revoke_system_credential(
    db: AsyncSession,
    *,
    actor: AdminPrincipal,
    system_account_id: uuid.UUID,
    credential_id: uuid.UUID,
) -> None:
    credential = (
        await db.execute(
            select(SystemCredential).where(
                col(SystemCredential.id) == credential_id,
                col(SystemCredential.system_account_id) == system_account_id,
            )
        )
    ).scalar_one_or_none()
    if credential is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Credential not found")
    credential.is_active = False
    credential.revoked_at = utc_now()
    db.add(credential)
    await log_action(
        db,
        api_key_id=None,
        actor_user_id=actor.user.id,
        action="system_credential.revoked",
        resource_type="system_credential",
        resource_id=str(credential.id),
    )
    await db.commit()
