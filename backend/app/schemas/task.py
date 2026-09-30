"""Task request and response schemas."""

from datetime import UTC
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, field_serializer


def format_timestamp(value: AwareDatetime) -> str:
    """AD-7 wire format: fixed-width `YYYY-MM-DDTHH:MM:SS.sssZ` in UTC."""
    utc = value.astimezone(UTC)
    return f"{utc.year:04d}-{utc:%m-%dT%H:%M:%S}.{utc.microsecond // 1000:03d}Z"


class TaskRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    text: str
    added_at: AwareDatetime
    completed_at: AwareDatetime | None

    @field_serializer("added_at")
    def _serialize_added_at(self, value: AwareDatetime) -> str:
        return format_timestamp(value)

    @field_serializer("completed_at")
    def _serialize_completed_at(self, value: AwareDatetime | None) -> str | None:
        return None if value is None else format_timestamp(value)
