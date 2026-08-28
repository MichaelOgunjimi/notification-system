"""API usage model — hourly bucketed request counters."""

import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, UniqueConstraint
from sqlmodel import Field, SQLModel


class ApiKeyUsage(SQLModel, table=True):
    __tablename__ = "api_key_usage"
    __table_args__ = (
        UniqueConstraint(
            "api_key_id",
            "endpoint",
            "method",
            "status_code",
            "hour_bucket",
            name="uq_api_key_usage_bucket",
        ),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    api_key_id: uuid.UUID = Field(foreign_key="api_keys.id", index=True)
    endpoint: str
    method: str
    status_code: int
    hour_bucket: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))
    request_count: int = Field(default=1)
