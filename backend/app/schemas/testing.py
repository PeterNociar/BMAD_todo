"""Request schemas for the test-only router (AD-14)."""

from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StrictInt

from app.schemas.task import TaskCreate

# About 100 years. The bound keeps datetime arithmetic in range, so an absurd value is a
# 422 `validation_error` rather than an overflow.
MAX_SHIFT_MS = 100 * 365 * 24 * 60 * 60 * 1000

AgoMs = Annotated[StrictInt, Field(ge=0, le=MAX_SHIFT_MS)]


class ClockOffset(BaseModel):
    """`offset_ms` is added to the server clock; 0 clears it. It is never negative, so time
    only moves forward and a later tick can't stamp `completed_at` before `added_at`."""

    model_config = ConfigDict(extra="forbid")

    offset_ms: Annotated[StrictInt, Field(ge=0, le=MAX_SHIFT_MS)]


class TaskSeed(TaskCreate):
    """A task with times relative to the server clock (offset included).

    `text` follows the normal `TaskCreate` rules (AD-12). The rule that `completed_ago_ms`
    is not greater than `added_ago_ms` is checked by `TaskService.seed`. Unknown keys are
    rejected, so a misspelt field can't silently seed an open task.
    """

    model_config = ConfigDict(extra="forbid")

    added_ago_ms: AgoMs
    completed_ago_ms: AgoMs | None = None
