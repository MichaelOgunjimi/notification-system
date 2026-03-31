"""Notification query endpoints — GET /notifications, GET /notifications/{id}."""

import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query, status

from app.api.deps import ApiKeyDep, SessionDep
from app.models.enums import NotificationChannel, NotificationStatus
from app.schemas.common import PaginatedResponse
from app.schemas.notifications import (
    NotificationDetailResponse,
    NotificationListParams,
    NotificationLogResponse,
    NotificationResponse,
)
from app.services import notification_service

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=PaginatedResponse[NotificationResponse])
async def list_notifications(
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
    status_filter: NotificationStatus | None = Query(default=None, alias="status"),
    channel: NotificationChannel | None = Query(default=None),
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
    recipient: str | None = Query(default=None),
    *,
    db: SessionDep,
    api_key: ApiKeyDep,
) -> PaginatedResponse[NotificationResponse]:
    filters = NotificationListParams(
        status=status_filter,
        channel=channel,
        date_from=date_from,
        date_to=date_to,
        recipient=recipient,
    )
    items, total = await notification_service.list_notifications(
        db, filters, page, per_page, api_key_id=api_key.id
    )
    response_items = [
        NotificationResponse(
            id=n.id,
            event_id=n.event_id,
            channel=n.channel,
            recipient=n.recipient_address,
            status=n.status,
            retry_count=n.retry_count,
            created_at=n.created_at,
            updated_at=n.updated_at,
            delivered_at=n.delivered_at,
        )
        for n in items
    ]
    return PaginatedResponse.create(response_items, total, page, per_page)


@router.get("/{notification_id}", response_model=NotificationDetailResponse)
async def get_notification(
    notification_id: uuid.UUID,
    *,
    db: SessionDep,
    api_key: ApiKeyDep,
) -> NotificationDetailResponse:
    notification = await notification_service.get_notification(
        db, notification_id, api_key_id=api_key.id
    )
    if notification is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")

    logs = await notification_service.get_notification_logs(
        db, notification_id, api_key_id=api_key.id
    )
    log_responses = [
        NotificationLogResponse(
            id=log.id,
            status=log.new_status,
            message=log.error_message,
            attempt_number=idx + 1,
            created_at=log.created_at,
        )
        for idx, log in enumerate(logs)
    ]
    return NotificationDetailResponse(
        id=notification.id,
        event_id=notification.event_id,
        channel=notification.channel,
        recipient=notification.recipient_address,
        status=notification.status,
        priority=notification.priority,
        recipient_user_id=notification.recipient_user_id,
        rendered_subject=notification.rendered_subject,
        rendered_body=notification.rendered_body,
        retry_count=notification.retry_count,
        max_retries=notification.max_retries,
        error_message=notification.error_message,
        created_at=notification.created_at,
        updated_at=notification.updated_at,
        delivered_at=notification.delivered_at,
        logs=log_responses,
    )
