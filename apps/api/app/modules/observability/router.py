"""Observability HTTP composition."""

from fastapi import APIRouter

from app.modules.observability.alerts.router import router as alert_router
from app.modules.observability.analytics.router import router as analytics_router
from app.modules.observability.audit.router import router as audit_router
from app.modules.observability.tenant.router import router as tenant_router
from app.modules.observability.usage.router import router as usage_router

router = APIRouter()
router.include_router(analytics_router)
router.include_router(tenant_router)
router.include_router(alert_router)
router.include_router(audit_router)
router.include_router(usage_router)
