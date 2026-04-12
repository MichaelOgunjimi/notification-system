"""Schemas package — Pydantic request/response models."""

from app.schemas.common import (
    ErrorResponse,
    HealthResponse,
    PaginatedResponse,
    PaginationParams,
)
from app.schemas.events import (
    EventBatchCreate,
    EventCreate,
    EventDetailResponse,
    EventResponse,
    RecipientCreate,
)
from app.schemas.notifications import (
    NotificationDetailResponse,
    NotificationListParams,
    NotificationLogResponse,
    NotificationResponse,
)
from app.schemas.settings import (
    ApiKeyCreate,
    ApiKeyCreateResponse,
    ApiKeyResponse,
)
from app.schemas.templates import (
    TemplateCreate,
    TemplateResponse,
    TemplateUpdate,
)

__all__ = [
    "ApiKeyCreate",
    "ApiKeyCreateResponse",
    "ApiKeyResponse",
    "ErrorResponse",
    "EventBatchCreate",
    "EventCreate",
    "EventDetailResponse",
    "EventResponse",
    "HealthResponse",
    "NotificationDetailResponse",
    "NotificationListParams",
    "NotificationLogResponse",
    "NotificationResponse",
    "PaginatedResponse",
    "PaginationParams",
    "RecipientCreate",
    "TemplateCreate",
    "TemplateResponse",
    "TemplateUpdate",
]
