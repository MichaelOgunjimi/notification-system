"""Tenancy HTTP composition."""

from fastapi import APIRouter

from app.modules.tenancy.invitations.router import (
    acceptance_router as invitation_acceptance_router,
)
from app.modules.tenancy.invitations.router import organization_router as invitation_router
from app.modules.tenancy.members.router import router as member_router
from app.modules.tenancy.organizations.router import router as organization_router
from app.modules.tenancy.projects.router import router as project_router

router = APIRouter()
router.include_router(organization_router)
router.include_router(project_router)
router.include_router(member_router)
router.include_router(invitation_router)
router.include_router(invitation_acceptance_router)
