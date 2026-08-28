"""Technical HTTP dependencies shared across modules."""

from collections.abc import AsyncGenerator
from typing import Annotated

from fastapi import Depends
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.redis import get_redis

SessionDep = Annotated[AsyncSession, Depends(get_db)]


async def get_redis_client() -> AsyncGenerator[Redis, None]:
    yield get_redis()


RedisDep = Annotated[Redis, Depends(get_redis_client)]
