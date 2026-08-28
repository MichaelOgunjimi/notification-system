"""Shared persistence helpers for tests that use synchronous worker sessions."""

import uuid

from sqlalchemy.orm import Session

from app.core.datetime import utc_now
from app.modules.credentials.model import ApiKey
from app.modules.credentials.types import ALL_API_KEY_SCOPES
from app.modules.identity.models.user import User
from app.modules.tenancy.models.organization import (
    Organization,
    OrganizationMembership,
    OrganizationRole,
)
from app.modules.tenancy.models.project import Project


def create_sync_project_api_key(session: Session, *, name: str) -> ApiKey:
    """Create a complete tenant hierarchy and one project API key."""
    identity = uuid.uuid4().hex
    owner = User(email=f"owner-{identity}@example.com", name="Worker Test Owner")
    session.add(owner)
    session.flush()

    organization = Organization(
        name="Worker Test Organization",
        slug=f"worker-{identity}",
        created_by_user_id=owner.id,
    )
    session.add(organization)
    session.flush()
    session.add(
        OrganizationMembership(
            organization_id=organization.id,
            user_id=owner.id,
            role=OrganizationRole.OWNER,
        )
    )

    project = Project(
        organization_id=organization.id,
        name="Worker Test Project",
        slug="default",
        created_by_user_id=owner.id,
    )
    session.add(project)
    session.flush()

    api_key = ApiKey(
        project_id=project.id,
        created_by_user_id=owner.id,
        key_hash=f"testhash_{identity}",
        key_prefix="test_pref",
        name=name,
        scopes=list(ALL_API_KEY_SCOPES),
        is_active=True,
        created_at=utc_now(),
    )
    session.add(api_key)
    session.flush()
    return api_key
