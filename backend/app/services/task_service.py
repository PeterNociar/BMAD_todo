"""Task use cases."""

from sqlmodel import Session

from app.models.task import Task


class TaskService:
    def __init__(self, session: Session) -> None:
        self._session = session

    def list(self) -> list[Task]:
        return Task.list_all(self._session)
