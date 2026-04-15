"""Master-key admin endpoints."""

import uuid
from collections.abc import Awaitable
from typing import Any, cast

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlmodel import col, func

from app.api.deps import MASTER_KEY_ID, MasterKeyDep, SessionDep
from app.core.redis import get_redis
from app.models.api_key import ApiKey
from app.models.audit_log import AuditLog
from app.models.enums import NotificationStatus
from app.models.event import Event
from app.models.notification import Notification
from app.models.template import Template
from app.models.usage import ApiKeyUsage
from app.schemas.audit_log import AuditLogResponse
from app.schemas.common import PaginatedResponse
from app.schemas.templates import TemplateCreate, TemplateResponse, TemplateUpdate
from app.schemas.usage import UsageResponse
from app.services import template_service

router = APIRouter(prefix="/admin", tags=["admin"])


class AdminKeyStats(BaseModel):
    id: uuid.UUID
    name: str
    key_prefix: str
    is_active: bool
    event_count: int
    last_used_at: str | None


class AdminQueueLength(BaseModel):
    queue: str
    length: int


class AdminHealthResponse(BaseModel):
    database: bool
    redis: bool
    queue_lengths: list[AdminQueueLength]
    recent_error_rate: float


class AdminChannelBreakdown(BaseModel):
    channel: str
    total: int


class AdminTopKey(BaseModel):
    api_key_id: uuid.UUID
    key_name: str
    total_notifications: int


class AdminAnalyticsResponse(BaseModel):
    total_events: int
    total_notifications: int
    per_channel: list[AdminChannelBreakdown]
    top_keys: list[AdminTopKey]


@router.get("/keys", response_model=list[AdminKeyStats])
async def list_admin_keys(*, db: SessionDep, _: MasterKeyDep) -> list[AdminKeyStats]:
    result: Any = await db.execute(
        select(
            col(ApiKey.id).label("id"),
            col(ApiKey.name).label("name"),
            col(ApiKey.key_prefix).label("key_prefix"),
            col(ApiKey.is_active).label("is_active"),
            col(ApiKey.last_used_at).label("last_used_at"),
            func.count(col(Event.id)).label("event_count"),
        )
        .select_from(ApiKey)
        .outerjoin(Event, col(Event.api_key_id) == col(ApiKey.id))
        .where(col(ApiKey.id) != MASTER_KEY_ID)
        .group_by(
            col(ApiKey.id),
            col(ApiKey.name),
            col(ApiKey.key_prefix),
            col(ApiKey.is_active),
            col(ApiKey.last_used_at),
        )
        .order_by(col(ApiKey.created_at).desc())
    )
    rows = result.all()
    return [
        AdminKeyStats(
            id=row.id,
            name=row.name,
            key_prefix=row.key_prefix,
            is_active=row.is_active,
            event_count=int(row.event_count or 0),
            last_used_at=row.last_used_at.isoformat() if row.last_used_at else None,
        )
        for row in rows
    ]


@router.get("/health", response_model=AdminHealthResponse)
async def get_admin_health(*, db: SessionDep, _: MasterKeyDep) -> AdminHealthResponse:
    database_ok = True
    try:
        await db.execute(text("SELECT 1"))
    except Exception:
        database_ok = False

    redis_ok = True
    queue_lengths: list[AdminQueueLength] = []
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
    try:
        redis_client = get_redis()
        await redis_client.ping()
        for queue_name in queue_names:
            length = int(await cast(Awaitable[int], redis_client.llen(queue_name)))
            queue_lengths.append(AdminQueueLength(queue=queue_name, length=int(length)))
    except Exception:
        redis_ok = False
        queue_lengths = []

    recent_total = (
        await db.execute(
            select(func.count())
            .select_from(Notification)
            .where(col(Notification.created_at) >= func.now() - text("INTERVAL '1 hour'"))
        )
    ).scalar() or 0
    recent_failed = (
        await db.execute(
            select(func.count())
            .select_from(Notification)
            .where(
                col(Notification.created_at) >= func.now() - text("INTERVAL '1 hour'"),
                col(Notification.status) == NotificationStatus.FAILED,
            )
        )
    ).scalar() or 0
    recent_error_rate = float(recent_failed) / max(1, int(recent_total))

    return AdminHealthResponse(
        database=database_ok,
        redis=redis_ok,
        queue_lengths=queue_lengths,
        recent_error_rate=recent_error_rate,
    )


@router.get("/analytics", response_model=AdminAnalyticsResponse)
async def get_admin_analytics(*, db: SessionDep, _: MasterKeyDep) -> AdminAnalyticsResponse:
    total_events = int((await db.execute(select(func.count()).select_from(Event))).scalar() or 0)
    total_notifications = int(
        (await db.execute(select(func.count()).select_from(Notification))).scalar() or 0
    )

    per_channel_rows: Any = (
        await db.execute(
            select(
                col(Notification.channel).label("channel"),
                func.count(col(Notification.id)).label("total"),
            )
            .select_from(Notification)
            .group_by(col(Notification.channel))
            .order_by(col(Notification.channel))
        )
    ).all()
    per_channel = [
        AdminChannelBreakdown(channel=str(row.channel), total=int(row.total or 0))
        for row in per_channel_rows
    ]

    top_key_rows: Any = (
        await db.execute(
            select(
                col(Event.api_key_id).label("api_key_id"),
                col(ApiKey.name).label("key_name"),
                func.count(col(Notification.id)).label("total_notifications"),
            )
            .select_from(Notification)
            .join(Event, col(Notification.event_id) == col(Event.id))
            .join(ApiKey, col(Event.api_key_id) == col(ApiKey.id))
            .group_by(col(Event.api_key_id), col(ApiKey.name))
            .order_by(func.count(col(Notification.id)).desc())
            .limit(5)
        )
    ).all()
    top_keys = [
        AdminTopKey(
            api_key_id=row.api_key_id,
            key_name=row.key_name,
            total_notifications=int(row.total_notifications or 0),
        )
        for row in top_key_rows
    ]

    return AdminAnalyticsResponse(
        total_events=total_events,
        total_notifications=total_notifications,
        per_channel=per_channel,
        top_keys=top_keys,
    )


@router.get("/audit-log", response_model=PaginatedResponse[AuditLogResponse])
async def list_admin_audit_log(
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=200),
    api_key_id: uuid.UUID | None = Query(default=None),
    action: str | None = Query(default=None),
    *,
    db: SessionDep,
    _: MasterKeyDep,
) -> PaginatedResponse[AuditLogResponse]:
    """List all audit log entries (master key only).

    Optionally filter by api_key_id or action.
    """
    from sqlmodel import func as sqlfunc

    query = select(AuditLog)
    if api_key_id is not None:
        query = query.where(col(AuditLog.api_key_id) == api_key_id)
    if action is not None:
        query = query.where(col(AuditLog.action) == action)
    total = int(
        (await db.execute(select(sqlfunc.count()).select_from(query.subquery()))).scalar() or 0
    )
    offset = (page - 1) * per_page
    rows = (
        (
            await db.execute(
                query.order_by(col(AuditLog.created_at).desc()).offset(offset).limit(per_page)
            )
        )
        .scalars()
        .all()
    )
    return PaginatedResponse.create(
        [AuditLogResponse.model_validate(r) for r in rows], total, page, per_page
    )


@router.get("/usage", response_model=PaginatedResponse[UsageResponse])
async def list_admin_usage(
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=200),
    api_key_id: uuid.UUID | None = Query(default=None),
    endpoint: str | None = Query(default=None),
    *,
    db: SessionDep,
    _: MasterKeyDep,
) -> PaginatedResponse[UsageResponse]:
    """List usage records across all keys (master key only).

    Optionally filter by api_key_id or endpoint.
    """
    from sqlmodel import func as sqlfunc

    query = select(ApiKeyUsage)
    if api_key_id is not None:
        query = query.where(col(ApiKeyUsage.api_key_id) == api_key_id)
    if endpoint is not None:
        query = query.where(col(ApiKeyUsage.endpoint) == endpoint)
    total = int(
        (await db.execute(select(sqlfunc.count()).select_from(query.subquery()))).scalar() or 0
    )
    offset = (page - 1) * per_page
    rows = (
        (
            await db.execute(
                query.order_by(col(ApiKeyUsage.hour_bucket).desc()).offset(offset).limit(per_page)
            )
        )
        .scalars()
        .all()
    )
    return PaginatedResponse.create(
        [UsageResponse.model_validate(r) for r in rows], total, page, per_page
    )


@router.get("/templates", response_model=PaginatedResponse[TemplateResponse])
async def admin_list_templates(
    page: int = 1,
    per_page: int = 20,
    *,
    db: SessionDep,
    _: MasterKeyDep,
) -> PaginatedResponse[TemplateResponse]:
    total = int(
        (
            await db.execute(
                select(func.count()).select_from(Template).where(col(Template.is_active))
            )
        ).scalar()
        or 0
    )
    offset = (page - 1) * per_page
    items = (
        (
            await db.execute(
                select(Template)
                .where(col(Template.is_active))
                .order_by(col(Template.created_at).desc())
                .offset(offset)
                .limit(per_page)
            )
        )
        .scalars()
        .all()
    )
    return PaginatedResponse.create(
        [TemplateResponse.model_validate(item) for item in items], total, page, per_page
    )


@router.post("/templates", response_model=TemplateResponse, status_code=201)
async def admin_create_template(
    body: TemplateCreate,
    *,
    db: SessionDep,
    _: MasterKeyDep,
) -> TemplateResponse:
    item = await template_service.create_template(db, body, api_key_id=None)
    await db.commit()
    await db.refresh(item)
    return TemplateResponse.model_validate(item)


@router.put("/templates/{template_id}", response_model=TemplateResponse)
async def admin_update_template(
    template_id: uuid.UUID,
    body: TemplateUpdate,
    *,
    db: SessionDep,
    _: MasterKeyDep,
) -> TemplateResponse:
    template = (
        await db.execute(
            select(Template).where(col(Template.id) == template_id, col(Template.is_active))
        )
    ).scalar_one_or_none()
    if template is None:
        raise HTTPException(status_code=404, detail="Template not found")
    updated = await template_service.update_template(db, template, body)
    await db.commit()
    return TemplateResponse.model_validate(updated)


@router.delete("/templates/{template_id}", status_code=204)
async def admin_delete_template(
    template_id: uuid.UUID,
    *,
    db: SessionDep,
    _: MasterKeyDep,
) -> None:
    template = (
        await db.execute(
            select(Template).where(col(Template.id) == template_id, col(Template.is_active))
        )
    ).scalar_one_or_none()
    if template is None:
        raise HTTPException(status_code=404, detail="Template not found")
    await template_service.soft_delete_template(db, template)
    await db.commit()
