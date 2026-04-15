"""Audit log schemas."""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class AuditLogResponse(BaseModel):
    id: uuid.UUID
    api_key_id: uuid.UUID | None
    action: str
    resource_type: str
    resource_id: str | None
    metadata: dict[str, Any] = Field(default_factory=dict, validation_alias="metadata_")
    ip_address: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
