"""Task use cases."""

from uuid import UUID

from sqlmodel import Session

from app.clock import Clock
from app.exceptions import TaskNotFound
from app.models.task import Task


class TaskService:
    def __init__(self, session: Session, clock: Clock) -> None:
        self._session = session
        self._clock = clock

    def list(self) -> list[Task]:
        return Task.list_ordered(self._session)

    def add(self, text: str) -> Task:
        task = Task(text=text, added_at=self._clock())
        return self._save(task)

    def tick(self, task_id: UUID) -> Task:
        """Idempotent: a repeated tick keeps the first `completed_at`."""
        task = self._get(task_id)
        if task.completed_at is not None:
            return task
        task.completed_at = self._clock()
        return self._save(task)

    def untick(self, task_id: UUID) -> Task:
        """Idempotent: unticking an open task leaves it unchanged."""
        task = self._get(task_id)
        if task.completed_at is None:
            return task
        task.completed_at = None
        return self._save(task)

    def remove(self, task_id: UUID) -> None:
        task = self._get(task_id)
        self._session.delete(task)
        self._session.commit()

    def _get(self, task_id: UUID) -> Task:
        task = Task.get_by_id(self._session, task_id)
        if task is None:
            raise TaskNotFound()
        return task

    def _save(self, task: Task) -> Task:
        self._session.add(task)
        self._session.commit()
        self._session.refresh(task)
        return task
