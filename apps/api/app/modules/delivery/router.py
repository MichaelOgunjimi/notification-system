"""Delivery HTTP composition."""

from fastapi import APIRouter

from app.modules.delivery.dead_letter.router import router as dead_letter_router
from app.modules.delivery.settings.router import router as settings_router

router = APIRouter()
router.include_router(settings_router)
router.include_router(dead_letter_router)
