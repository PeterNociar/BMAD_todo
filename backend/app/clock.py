"""The server clock: the only producer of stored times (AD-7)."""

from collections.abc import Callable
from datetime import UTC, datetime


def _wall() -> datetime:
    return datetime.now(UTC)


class Clock:
    """Callable returning the current UTC time, truncated to milliseconds."""

    def __init__(self, wall: Callable[[], datetime] = _wall) -> None:
        self._wall = wall

    def __call__(self) -> datetime:
        now = self._wall().astimezone(UTC)
        return now.replace(microsecond=now.microsecond - now.microsecond % 1000)
