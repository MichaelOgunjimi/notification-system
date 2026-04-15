"""V1 aggregate router — includes all sub-routers under /api/v1."""

from fastapi import APIRouter

from app.api.v1.admin import router as admin_router
from app.api.v1.alerts import router as alerts_router
from app.api.v1.analytics import router as analytics_router
from app.api.v1.audit_log import router as audit_log_router
from app.api.v1.auth import router as auth_router
from app.api.v1.dead_letter import router as dead_letter_router
from app.api.v1.events import router as events_router
from app.api.v1.health import router as health_router
from app.api.v1.notifications import router as notifications_router
from app.api.v1.settings import router as settings_router
from app.api.v1.suppressions import router as suppressions_router
from app.api.v1.templates import router as templates_router
from app.api.v1.usage import router as usage_router

api_v1_router = APIRouter()
api_v1_router.include_router(auth_router)
api_v1_router.include_router(health_router)
api_v1_router.include_router(analytics_router)
api_v1_router.include_router(events_router)
api_v1_router.include_router(notifications_router)
api_v1_router.include_router(templates_router)
api_v1_router.include_router(settings_router)
api_v1_router.include_router(dead_letter_router)
api_v1_router.include_router(suppressions_router)
api_v1_router.include_router(alerts_router)
api_v1_router.include_router(audit_log_router)
api_v1_router.include_router(usage_router)
api_v1_router.include_router(admin_router)
