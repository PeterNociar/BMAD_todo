from datetime import UTC, datetime
from uuid import UUID

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.models.task import Task


def test_list_tasks_empty(client: TestClient) -> None:
    response = client.get("/api/tasks")

    assert response.status_code == 200
    assert response.json() == []


def test_list_tasks_returns_one_row(client: TestClient, db_session: Session) -> None:
    task = Task(
        text="check SSO timeout setting",
        added_at=datetime(2026, 9, 30, 8, 0, tzinfo=UTC),
    )
    db_session.add(task)
    db_session.commit()

    response = client.get("/api/tasks")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    row = body[0]
    assert set(row) == {"id", "text", "added_at", "completed_at"}
    assert UUID(row["id"]) == task.id
    assert row["text"] == "check SSO timeout setting"
    assert row["added_at"] == "2026-09-30T08:00:00.000Z"
    assert row["completed_at"] is None
