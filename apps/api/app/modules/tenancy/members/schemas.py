"""Organization member HTTP schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.modules.tenancy.models.organization import OrganizationRole


class OrganizationMemberResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    email: str
    name: str
    role: OrganizationRole
    joined_at: datetime


class OrganizationMemberUpdate(BaseModel):
    role: OrganizationRole
