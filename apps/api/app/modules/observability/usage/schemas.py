"""Usage tracking schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel


class UsageResponse(BaseModel):
    api_key_id: uuid.UUID
    endpoint: str
    hour_bucket: datetime
    request_count: int

    model_config = {"from_attributes": True}
