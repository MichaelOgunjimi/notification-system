"""Audit logging helper."""

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog


async def log_action(
    db: AsyncSession,
    *,
    api_key_id: uuid.UUID | None,
    action: str,
    resource_type: str,
    resource_id: str | None = None,
    metadata: dict[str, Any] | None = None,
    ip_address: str | None = None,
) -> None:
    entry = AuditLog(
        api_key_id=api_key_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        metadata_=metadata or {},
        ip_address=ip_address,
    )
    db.add(entry)
    await db.flush()
