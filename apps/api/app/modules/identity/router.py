"""Identity module HTTP interface."""

from fastapi import APIRouter

from app.modules.identity.routes.auth import router as auth_router
from app.modules.identity.routes.github import router as github_router

router = APIRouter()
router.include_router(auth_router)
router.include_router(github_router)
