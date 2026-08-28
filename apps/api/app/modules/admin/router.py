"""Platform administration HTTP composition."""

from fastapi import APIRouter

from app.modules.admin.operations.router import router as operations_router
from app.modules.admin.system_accounts.router import router as system_accounts_router
from app.modules.admin.users.router import router as users_router

router = APIRouter()
router.include_router(operations_router)
router.include_router(users_router)
router.include_router(system_accounts_router)
