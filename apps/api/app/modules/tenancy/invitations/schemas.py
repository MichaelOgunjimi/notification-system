"""Organization invitation HTTP schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr

from app.modules.tenancy.models.organization import OrganizationRole


class OrganizationInvitationCreate(BaseModel):
    email: EmailStr
    role: OrganizationRole = OrganizationRole.MEMBER


class OrganizationInvitationAccept(BaseModel):
    token: str


class OrganizationInvitationPreview(BaseModel):
    """Unauthenticated view of a pending invitation, keyed by its token."""

    organization_name: str
    role: OrganizationRole
    inviter_name: str
    expires_at: datetime


class OrganizationInvitationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    email: str
    role: OrganizationRole
    invited_by_user_id: uuid.UUID
    expires_at: datetime
    accepted_at: datetime | None
    revoked_at: datetime | None
    created_at: datetime
