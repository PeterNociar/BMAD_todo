"""The server clock: the only producer of stored times (AD-7)."""

from collections.abc import Callable
from datetime import UTC, datetime, timedelta


def _wall() -> datetime:
    return datetime.now(UTC)


class Clock:
    """Callable returning the current UTC time, truncated to milliseconds.

    `offset_ms` shifts the time before truncation. The app holds one `Clock` on
    `app.state`, and only the test-mode testing router changes the offset (AD-14).
    """

    def __init__(self, wall: Callable[[], datetime] = _wall, offset_ms: int = 0) -> None:
        self._wall = wall
        self.offset_ms = offset_ms

    def __call__(self) -> datetime:
        now = self._wall().astimezone(UTC) + timedelta(milliseconds=self.offset_ms)
        return now.replace(microsecond=now.microsecond - now.microsecond % 1000)
