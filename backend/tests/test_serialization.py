"""AD-7 wire format for `TaskRead` timestamps (no database)."""

from datetime import UTC, datetime, timedelta, timezone
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.schemas.task import TaskRead


def dump(added_at: datetime, completed_at: datetime | None = None) -> dict[str, object]:
    task = TaskRead(id=uuid4(), text="t", added_at=added_at, completed_at=completed_at)
    return task.model_dump(mode="json")


def test_whole_second_keeps_milliseconds() -> None:
    body = dump(datetime(2026, 9, 30, 8, 0, 5, tzinfo=UTC))

    assert body["added_at"] == "2026-09-30T08:00:05.000Z"
    assert body["completed_at"] is None


def test_non_utc_input_is_serialized_as_the_same_instant_in_utc() -> None:
    plus_two = timezone(timedelta(hours=2))
    body = dump(
        datetime(2026, 9, 30, 10, 0, 5, 120000, tzinfo=plus_two),
        datetime(2026, 10, 1, 1, 30, 0, 7000, tzinfo=plus_two),
    )

    assert body["added_at"] == "2026-09-30T08:00:05.120Z"
    assert body["completed_at"] == "2026-09-30T23:30:00.007Z"


def test_sub_millisecond_digits_are_dropped() -> None:
    body = dump(datetime(2026, 9, 30, 8, 0, 5, 999999, tzinfo=UTC))

    assert body["added_at"] == "2026-09-30T08:00:05.999Z"


def test_naive_datetime_is_rejected() -> None:
    with pytest.raises(ValidationError):
        TaskRead(id=uuid4(), text="t", added_at=datetime(2026, 9, 30), completed_at=None)
