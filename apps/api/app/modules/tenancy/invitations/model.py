"""Organization invitation persistence model."""

import uuid
from datetime import datetime

from sqlalchemy import UniqueConstraint
from sqlmodel import Field, SQLModel

from app.core.datetime import utc_now
from app.modules.tenancy.models.organization import OrganizationRole


class OrganizationInvitation(SQLModel, table=True):
    __tablename__ = "organization_invitations"
    __table_args__ = (
        UniqueConstraint(
            "organization_id",
            "email",
            name="uq_organization_invitations_organization_email",
        ),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    organization_id: uuid.UUID = Field(foreign_key="organizations.id", index=True)
    email: str = Field(max_length=320, index=True)
    role: OrganizationRole = Field(default=OrganizationRole.MEMBER)
    token_hash: str = Field(max_length=64, unique=True, index=True)
    invited_by_user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    expires_at: datetime
    accepted_at: datetime | None = None
    revoked_at: datetime | None = None
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now, sa_column_kwargs={"onupdate": utc_now})
