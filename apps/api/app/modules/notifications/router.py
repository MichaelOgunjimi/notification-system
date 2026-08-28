"""Notification HTTP composition."""

from fastapi import APIRouter

from app.modules.notifications.routes import router as notification_router

router = APIRouter()
router.include_router(notification_router)
