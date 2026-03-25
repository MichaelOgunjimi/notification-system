"""Common schemas — PaginatedResponse, ErrorResponse, HealthCheckResponse."""

import math
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class PaginationParams(BaseModel):
    page: int = Field(default=1, ge=1)
    per_page: int = Field(default=20, ge=1, le=100)


class PaginatedResponse[T](BaseModel):
    items: list[T]
    total: int
    page: int
    per_page: int
    total_pages: int

    @classmethod
    def create(
        cls, items: list[Any], total: int, page: int, per_page: int
    ) -> "PaginatedResponse[Any]":
        return cls(
            items=items,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=math.ceil(total / per_page) if per_page > 0 else 0,
        )


class ErrorResponse(BaseModel):
    status_code: int
    message: str
    detail: str | None = None


class HealthResponse(BaseModel):
    status: str
    version: str
    database: bool
    timestamp: datetime
