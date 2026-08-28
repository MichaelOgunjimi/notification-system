"""Authentication for internal workers and other trusted system clients."""

from dataclasses import dataclass

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col

from app.core.crypto import hash_api_key
from app.core.datetime import utc_now
from app.modules.admin.system_accounts.model import SystemAccount, SystemCredential
from app.modules.admin.types import SystemPermission


@dataclass(frozen=True, slots=True)
class SystemPrincipal:
    account: SystemAccount
    credential: SystemCredential
    permissions: frozenset[SystemPermission]


async def authenticate_system_credential(
    db: AsyncSession,
    *,
    raw_key: str,
    required_permission: SystemPermission | None = None,
) -> SystemPrincipal:
    row = (
        await db.execute(
            select(SystemCredential, SystemAccount)
            .join(SystemAccount, col(SystemAccount.id) == col(SystemCredential.system_account_id))
            .where(
                col(SystemCredential.key_hash) == hash_api_key(raw_key),
                col(SystemCredential.is_active).is_(True),
                col(SystemAccount.is_active).is_(True),
            )
        )
    ).one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid system credential",
        )
    credential, account = row
    permissions = frozenset(
        SystemPermission(value)
        for value in credential.permissions
        if value in SystemPermission._value2member_map_
    )
    if required_permission is not None and required_permission not in permissions:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"System permission required: {required_permission.value}",
        )
    credential.last_used_at = utc_now()
    db.add(credential)
    await db.commit()
    return SystemPrincipal(account=account, credential=credential, permissions=permissions)
