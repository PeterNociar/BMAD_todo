"""Task use cases."""

from sqlmodel import Session

from app.clock import Clock
from app.models.task import Task


class TaskService:
    def __init__(self, session: Session, clock: Clock) -> None:
        self._session = session
        self._clock = clock

    def list(self) -> list[Task]:
        return Task.list_ordered(self._session)
