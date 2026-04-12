"""Master-key admin endpoints."""

import uuid
from collections.abc import Awaitable
from datetime import timedelta
from typing import Any, cast

from fastapi import APIRouter, HTTPException, Query, Request, status
from sqlalchemy import func, select, text
from sqlmodel import col

from app.api.deps import MasterKeyDep, SessionDep
from app.core.redis import get_redis
from app.models.api_key import ApiKey
from app.models.audit_log import AuditLog
from app.models.enums import NotificationStatus
from app.models.event import Event
from app.models.notification import Notification
from app.models.template import Template
from app.models.usage import ApiKeyUsage
from app.schemas.admin import (
    AdminAnalyticsResponse,
    AdminHealthResponse,
    AdminKeyStats,
    AdminQueueStat,
    ChannelBreakdown,
    TopKeyVolume,
)
from app.schemas.audit_log import AuditLogResponse
from app.schemas.common import PaginatedResponse
from app.schemas.templates import TemplateCreate, TemplateResponse, TemplateUpdate
from app.schemas.usage import UsageResponse
from app.services import template_service
from app.utils.audit import log_action
from app.utils.datetime import utc_now

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/keys", response_model=list[AdminKeyStats])
async def list_all_keys(
    *,
    db: SessionDep,
    _: MasterKeyDep,
) -> list[AdminKeyStats]:
    event_counts = (
        select(col(Event.api_key_id).label("api_key_id"), func.count().label("event_count"))
        .group_by(col(Event.api_key_id))
        .subquery()
    )
    result = await db.execute(
        select(ApiKey, event_counts.c.event_count)
        .outerjoin(event_counts, event_counts.c.api_key_id == col(ApiKey.id))
        .order_by(col(ApiKey.created_at).desc())
    )
    items: list[AdminKeyStats] = []
    for api_key, event_count in result.all():
        items.append(
            AdminKeyStats(
                id=api_key.id,
                name=api_key.name,
                key_prefix=api_key.key_prefix,
                is_active=api_key.is_active,
                event_count=int(event_count or 0),
                last_used_at=api_key.last_used_at,
            )
        )
    return items


@router.get("/health", response_model=AdminHealthResponse)
async def admin_health(
    *,
    db: SessionDep,
    _: MasterKeyDep,
) -> AdminHealthResponse:
    db_ok = True
    try:
        await db.execute(text("SELECT 1"))
    except Exception:
        db_ok = False

    redis = get_redis()
    redis_ok = True
    try:
        await redis.ping()
    except Exception:
        redis_ok = False

    queue_names = [
        "notifications.high",
        "notifications.medium",
        "notifications.low",
        "notifications.email.high",
        "notifications.email.medium",
        "notifications.email.low",
        "notifications.sms.high",
        "notifications.sms.medium",
        "notifications.sms.low",
        "notifications.webhook.high",
        "notifications.webhook.medium",
        "notifications.webhook.low",
    ]

    queue_stats: list[AdminQueueStat] = []
    for queue in queue_names:
        length = int(await cast(Awaitable[int], redis.llen(queue))) if redis_ok else 0
        queue_stats.append(AdminQueueStat(queue=queue, length=length))

    one_hour_ago = utc_now() - timedelta(hours=1)
    failed_result = await db.execute(
        select(func.count())
        .select_from(Notification)
        .where(
            col(Notification.created_at) >= one_hour_ago,
            col(Notification.status).in_(
                [NotificationStatus.FAILED, NotificationStatus.DEAD_LETTER]
            ),
        )
    )
    failed_count = int(failed_result.scalar() or 0)
    delivered_result = await db.execute(
        select(func.count())
        .select_from(Notification)
        .where(
            col(Notification.created_at) >= one_hour_ago,
            col(Notification.status) == NotificationStatus.DELIVERED,
        )
    )
    delivered_count = int(delivered_result.scalar() or 0)
    total = failed_count + delivered_count
    error_rate = (failed_count / total * 100) if total else 0.0

    return AdminHealthResponse(
        database=db_ok,
        redis=redis_ok,
        queue_lengths=queue_stats,
        recent_error_rate=round(error_rate, 2),
    )


@router.get("/analytics", response_model=AdminAnalyticsResponse)
async def admin_analytics(
    *,
    db: SessionDep,
    _: MasterKeyDep,
) -> AdminAnalyticsResponse:
    total_events = int((await db.execute(select(func.count()).select_from(Event))).scalar() or 0)
    total_notifications = int(
        (await db.execute(select(func.count()).select_from(Notification))).scalar() or 0
    )

    channel_rows = await db.execute(
        select(col(Notification.channel), func.count().label("total"))
        .group_by(col(Notification.channel))
        .order_by(col(Notification.channel))
    )
    per_channel = [
        ChannelBreakdown(channel=str(row.channel), total=int(row.total))
        for row in channel_rows.all()
    ]

    top_rows: Any = await db.execute(
        select(
            col(Event.api_key_id).label("api_key_id"),
            col(ApiKey.name).label("key_name"),
            func.count(col(Notification.id)).label("total_notifications"),
        )
        .join(Notification, col(Notification.event_id) == col(Event.id))
        .join(ApiKey, col(ApiKey.id) == col(Event.api_key_id))
        .group_by(col(Event.api_key_id), col(ApiKey.name))
        .order_by(text("total_notifications DESC"))
        .limit(10)
    )
    top_keys = [
        TopKeyVolume(
            api_key_id=row.api_key_id,
            key_name=row.key_name,
            total_notifications=int(row.total_notifications),
        )
        for row in top_rows.all()
    ]

    return AdminAnalyticsResponse(
        total_events=total_events,
        total_notifications=total_notifications,
        per_channel=per_channel,
        top_keys=top_keys,
    )


@router.get("/audit-log", response_model=PaginatedResponse[AuditLogResponse])
async def admin_audit_log(
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=200),
    api_key_id: uuid.UUID | None = Query(default=None),
    *,
    db: SessionDep,
    _: MasterKeyDep,
) -> PaginatedResponse[AuditLogResponse]:
    filters = []
    if api_key_id:
        filters.append(col(AuditLog.api_key_id) == api_key_id)

    total_result = await db.execute(select(func.count()).select_from(AuditLog).where(*filters))
    total = int(total_result.scalar() or 0)

    offset = (page - 1) * per_page
    result = await db.execute(
        select(AuditLog)
        .where(*filters)
        .order_by(col(AuditLog.created_at).desc())
        .offset(offset)
        .limit(per_page)
    )
    items = [
        AuditLogResponse(
            id=item.id,
            api_key_id=item.api_key_id,
            action=item.action,
            resource_type=item.resource_type,
            resource_id=item.resource_id,
            metadata=item.metadata_,
            ip_address=item.ip_address,
            created_at=item.created_at,
        )
        for item in result.scalars().all()
    ]
    return PaginatedResponse.create(items, total, page, per_page)


@router.get("/templates", response_model=PaginatedResponse[TemplateResponse])
async def admin_list_templates(
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=200),
    *,
    db: SessionDep,
    _: MasterKeyDep,
) -> PaginatedResponse[TemplateResponse]:
    total_result = await db.execute(
        select(func.count()).select_from(Template).where(col(Template.is_active))
    )
    total = int(total_result.scalar() or 0)

    offset = (page - 1) * per_page
    result = await db.execute(
        select(Template)
        .where(col(Template.is_active))
        .order_by(col(Template.created_at).desc())
        .offset(offset)
        .limit(per_page)
    )
    items = [TemplateResponse.model_validate(item) for item in result.scalars().all()]
    return PaginatedResponse.create(items, total, page, per_page)


@router.post("/templates", response_model=TemplateResponse, status_code=status.HTTP_201_CREATED)
async def admin_create_system_template(
    body: TemplateCreate,
    *,
    db: SessionDep,
    _: MasterKeyDep,
    request: Request,
) -> TemplateResponse:
    template = await template_service.create_template(db, body, None)
    await log_action(
        db,
        api_key_id=None,
        action="template.created",
        resource_type="template",
        resource_id=str(template.id),
        metadata={"scope": "system_default", "name": template.name},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return TemplateResponse.model_validate(template)


@router.put("/templates/{template_id}", response_model=TemplateResponse)
async def admin_update_template(
    template_id: uuid.UUID,
    body: TemplateUpdate,
    *,
    db: SessionDep,
    _: MasterKeyDep,
    request: Request,
) -> TemplateResponse:
    result = await db.execute(
        select(Template).where(col(Template.id) == template_id, col(Template.is_active))
    )
    template = result.scalar_one_or_none()
    if template is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")

    updated = await template_service.update_template(db, template, body)
    await log_action(
        db,
        api_key_id=updated.api_key_id,
        action="template.updated",
        resource_type="template",
        resource_id=str(updated.id),
        metadata={"scope": "admin"},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return TemplateResponse.model_validate(updated)


@router.delete("/templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_template(
    template_id: uuid.UUID,
    *,
    db: SessionDep,
    _: MasterKeyDep,
    request: Request,
) -> None:
    result = await db.execute(
        select(Template).where(col(Template.id) == template_id, col(Template.is_active))
    )
    template = result.scalar_one_or_none()
    if template is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")

    await template_service.soft_delete_template(db, template)
    await log_action(
        db,
        api_key_id=template.api_key_id,
        action="template.deleted",
        resource_type="template",
        resource_id=str(template.id),
        metadata={"scope": "admin"},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()


@router.get("/usage", response_model=PaginatedResponse[UsageResponse])
async def admin_usage(
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=100, ge=1, le=200),
    *,
    db: SessionDep,
    _: MasterKeyDep,
) -> PaginatedResponse[UsageResponse]:
    grouped: Any = (
        select(
            col(ApiKeyUsage.api_key_id).label("api_key_id"),
            col(ApiKeyUsage.endpoint).label("endpoint"),
            col(ApiKeyUsage.hour_bucket).label("hour_bucket"),
            func.sum(col(ApiKeyUsage.request_count)).label("request_count"),
        )
        .group_by(
            col(ApiKeyUsage.api_key_id),
            col(ApiKeyUsage.endpoint),
            col(ApiKeyUsage.hour_bucket),
        )
        .order_by(col(ApiKeyUsage.hour_bucket).desc())
    )
    total_result = await db.execute(select(func.count()).select_from(grouped.subquery()))
    total = int(total_result.scalar() or 0)

    offset = (page - 1) * per_page
    result = await db.execute(grouped.offset(offset).limit(per_page))
    items = [
        UsageResponse(
            api_key_id=row.api_key_id,
            endpoint=row.endpoint,
            hour_bucket=row.hour_bucket,
            request_count=int(row.request_count),
        )
        for row in result.all()
    ]
    return PaginatedResponse.create(items, total, page, per_page)
