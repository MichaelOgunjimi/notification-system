"""Suppression service helpers for API and worker paths."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session
from sqlmodel import col

from app.models.enums import NotificationChannel
from app.models.suppression import Suppression


async def is_suppressed_async(
    db: AsyncSession,
    *,
    api_key_id: uuid.UUID,
    channel: NotificationChannel,
    recipient: str,
) -> bool:
    result = await db.execute(
        select(col(Suppression.id)).where(
            col(Suppression.api_key_id) == api_key_id,
            col(Suppression.channel) == channel,
            col(Suppression.recipient) == recipient,
        )
    )
    return result.scalar_one_or_none() is not None


def is_suppressed(
    db: Session,
    *,
    api_key_id: uuid.UUID,
    channel: NotificationChannel,
    recipient: str,
) -> bool:
    result = db.execute(
        select(col(Suppression.id)).where(
            col(Suppression.api_key_id) == api_key_id,
            col(Suppression.channel) == channel,
            col(Suppression.recipient) == recipient,
        )
    )
    return result.scalar_one_or_none() is not None
