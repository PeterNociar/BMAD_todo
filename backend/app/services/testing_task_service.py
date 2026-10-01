"""Test-only task use cases (AD-14).

Only `app.routers.testing` imports this module, and `create_app` imports that router only
when `settings.app_env == "test"`, so none of this is loaded in a normal app.
"""

from datetime import timedelta

from sqlalchemy import delete

from app.exceptions import ValidationFailed
from app.models.task import Task
from app.services.task_service import TaskService


class TestingTaskService(TaskService):
    __test__ = False  # not a pytest test class

    def seed(self, text: str, added_ago_ms: int, completed_ago_ms: int | None) -> Task:
        """A task whose times are the clock's now minus each `*_ago_ms`."""
        if completed_ago_ms is not None and completed_ago_ms > added_ago_ms:
            raise ValidationFailed("completed_ago_ms must not be greater than added_ago_ms")
        now = self._clock()
        task = Task(text=text, added_at=now - timedelta(milliseconds=added_ago_ms))
        if completed_ago_ms is not None:
            task.completed_at = now - timedelta(milliseconds=completed_ago_ms)
        return self._save(task)

    def remove_all(self) -> None:
        """Delete every task."""
        self._session.exec(delete(Task))  # type: ignore[call-overload]
        self._session.commit()
