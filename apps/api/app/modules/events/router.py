"""Event HTTP composition."""

from fastapi import APIRouter

from app.modules.events.routes import router as event_router
from app.modules.events.scheduled.router import router as scheduled_router

router = APIRouter()
router.include_router(event_router)
router.include_router(scheduled_router)
