"""Application composition root for HTTP module routers."""

from fastapi import APIRouter

from app.core.http.health import router as health_router
from app.modules.admin.router import router as admin_router
from app.modules.credentials.router import router as project_api_keys_router
from app.modules.delivery.router import router as delivery_router
from app.modules.events.router import router as events_router
from app.modules.identity.router import router as identity_router
from app.modules.notifications.router import router as notifications_router
from app.modules.observability.router import router as observability_router
from app.modules.suppressions.router import router as suppressions_router
from app.modules.templates.router import router as templates_router
from app.modules.tenancy.router import router as organizations_router

api_v1_router = APIRouter()
api_v1_router.include_router(identity_router)
api_v1_router.include_router(health_router)
api_v1_router.include_router(events_router)
api_v1_router.include_router(notifications_router)
api_v1_router.include_router(organizations_router)
api_v1_router.include_router(project_api_keys_router)
api_v1_router.include_router(templates_router)
api_v1_router.include_router(delivery_router)
api_v1_router.include_router(suppressions_router)
api_v1_router.include_router(observability_router)
api_v1_router.include_router(admin_router)
