"""Task request and response schemas."""

from datetime import UTC
from typing import Literal
from uuid import UUID

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    StrictStr,
    field_serializer,
    field_validator,
)
from pydantic_core import PydanticCustomError

TEXT_MAX_LENGTH = 2000


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


class TaskCreate(BaseModel):
    """AD-12: `text` is trimmed and must be 1-2000 characters after trimming."""

    text: StrictStr

    @field_validator("text")
    @classmethod
    def _trim_and_check_length(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise PydanticCustomError("text_empty", "Text must not be empty")
        if "\x00" in trimmed:
            # Postgres TEXT cannot store NUL; reject it here rather than fail in the DB.
            raise PydanticCustomError("text_nul_character", "Text must not contain NUL")
        if len(trimmed) > TEXT_MAX_LENGTH:
            raise PydanticCustomError(
                "text_too_long",
                "Text must be at most {max_length} characters",
                {"max_length": TEXT_MAX_LENGTH},
            )
        return trimmed


ErrorCode = Literal[
    "text_too_long",
    "validation_error",
    "task_not_found",
    "not_found",
    "method_not_allowed",
    "service_unavailable",
    "internal_error",
]


class ErrorResponse(BaseModel):
    """AD-5: the body of every non-2xx response the app produces."""

    detail: str
    code: ErrorCode
