"""AD-7 server clock (no database)."""

from datetime import UTC, datetime, timedelta, timezone

from app.clock import Clock


def test_clock_truncates_to_milliseconds() -> None:
    clock = Clock(lambda: datetime(2026, 9, 30, 8, 0, 12, 345678, tzinfo=UTC))

    now = clock()

    assert now == datetime(2026, 9, 30, 8, 0, 12, 345000, tzinfo=UTC)
    assert now.tzinfo is UTC


def test_clock_returns_utc_for_a_non_utc_wall() -> None:
    wall = datetime(2026, 9, 30, 10, 0, 12, 345678, tzinfo=timezone(timedelta(hours=2)))

    now = Clock(lambda: wall)()

    assert now == datetime(2026, 9, 30, 8, 0, 12, 345000, tzinfo=UTC)
    assert now.tzinfo is UTC


def test_default_clock_reads_the_wall_clock() -> None:
    before = datetime.now(UTC) - timedelta(milliseconds=1)

    now = Clock()()

    assert before <= now <= datetime.now(UTC)
    assert now.microsecond % 1000 == 0
    assert now.tzinfo is UTC


def test_offset_is_applied_before_truncation() -> None:
    clock = Clock(lambda: datetime(2026, 9, 30, 8, 0, 12, 345678, tzinfo=UTC), offset_ms=3_600_001)

    assert clock() == datetime(2026, 9, 30, 9, 0, 12, 346000, tzinfo=UTC)


def test_offset_can_be_changed_and_cleared() -> None:
    wall = datetime(2026, 9, 30, 8, 0, 0, tzinfo=UTC)
    clock = Clock(lambda: wall)

    clock.offset_ms = -60_000
    assert clock() == wall - timedelta(minutes=1)

    clock.offset_ms = 0
    assert clock() == wall
