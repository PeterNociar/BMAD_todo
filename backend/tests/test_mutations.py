"""AD-3 mutation endpoints against the story's I/O matrix, with a fixed clock (AD-7)."""

from collections.abc import Iterator
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import delete
from sqlalchemy.orm import sessionmaker
from sqlmodel import Session

from app.clock import Clock
from app.db import get_session
from app.deps import get_clock
from app.models.task import Task

T1 = datetime(2026, 9, 30, 8, 0, 0, 123000, tzinfo=UTC)
T2 = datetime(2026, 9, 30, 9, 30, 0, 456000, tzinfo=UTC)
T1_WIRE = "2026-09-30T08:00:00.123Z"
T2_WIRE = "2026-09-30T09:30:00.456Z"


class FixedWall:
    """A settable wall clock for `Clock`, so a test can move time between calls."""

    def __init__(self, now: datetime) -> None:
        self.now = now

    def __call__(self) -> datetime:
        return self.now


@pytest.fixture()
def wall(application: FastAPI, client: TestClient) -> Iterator[FixedWall]:
    fixed = FixedWall(T1)
    application.dependency_overrides[get_clock] = lambda: Clock(fixed)
    yield fixed


@pytest.fixture()
def api(client: TestClient, wall: FixedWall) -> TestClient:
    return client


def add(api: TestClient, text: str = "buy milk") -> dict[str, object]:
    response = api.post("/api/tasks", json={"text": text})
    assert response.status_code == 201
    return response.json()


# --- POST /api/tasks ----------------------------------------------------------------


def test_add_trims_text_and_stamps_clock_time(api: TestClient) -> None:
    response = api.post("/api/tasks", json={"text": "  buy milk  "})

    assert response.status_code == 201
    body = response.json()
    assert set(body) == {"id", "text", "added_at", "completed_at"}
    assert UUID(body["id"]).version == 4
    assert body["text"] == "buy milk"
    assert body["added_at"] == T1_WIRE
    assert body["completed_at"] is None
    assert api.get("/api/tasks").json() == [body]


def test_add_ignores_client_sent_id_and_timestamps(api: TestClient) -> None:
    client_id = str(uuid4())
    response = api.post(
        "/api/tasks",
        json={"text": "x", "id": client_id, "added_at": "2000-01-01T00:00:00.000Z"},
    )

    assert response.status_code == 201
    assert response.json()["id"] != client_id
    assert response.json()["added_at"] == T1_WIRE


def test_add_accepts_exactly_2000_characters_after_trim(api: TestClient) -> None:
    text = "a" * 2000

    body = add(api, f"  {text}  ")

    assert body["text"] == text


def test_add_rejects_2001_characters_as_text_too_long(api: TestClient) -> None:
    response = api.post("/api/tasks", json={"text": "a" * 2001})

    assert response.status_code == 422
    body = response.json()
    assert set(body) == {"detail", "code"}
    assert body["code"] == "text_too_long"
    assert isinstance(body["detail"], str)
    assert api.get("/api/tasks").json() == []


@pytest.mark.parametrize(
    "kwargs",
    [
        {"json": {"text": "   "}},
        {"json": {"text": ""}},
        {"json": {}},
        {"json": {"text": 5}},
        {"json": {"text": None}},
        {"json": {"text": "a\u0000b"}},
        {"json": ["buy milk"]},
        {"content": "not json", "headers": {"content-type": "application/json"}},
        {"content": "text=buy+milk", "headers": {"content-type": "text/plain"}},
        {},
    ],
    ids=[
        "blank",
        "empty",
        "missing",
        "number",
        "null",
        "nul-char",
        "array",
        "bad-json",
        "not-json",
        "none",
    ],
)
def test_add_rejects_invalid_body_as_validation_error(
    api: TestClient, kwargs: dict[str, object]
) -> None:
    response = api.post("/api/tasks", **kwargs)  # type: ignore[arg-type]

    assert response.status_code == 422
    body = response.json()
    assert set(body) == {"detail", "code"}
    assert body["code"] == "validation_error"
    assert api.get("/api/tasks").json() == []


# --- PUT /api/tasks/{id}/tick -------------------------------------------------------


def test_tick_sets_completed_at_to_clock_time(api: TestClient, wall: FixedWall) -> None:
    task = add(api)
    wall.now = T2

    response = api.put(f"/api/tasks/{task['id']}/tick")

    assert response.status_code == 200
    assert response.json() == {**task, "completed_at": T2_WIRE}
    assert api.get("/api/tasks").json() == [response.json()]


def test_tick_twice_keeps_the_first_completed_at(api: TestClient, wall: FixedWall) -> None:
    task = add(api)
    api.put(f"/api/tasks/{task['id']}/tick")
    wall.now = T2

    response = api.put(f"/api/tasks/{task['id']}/tick")

    assert response.status_code == 200
    assert response.json()["completed_at"] == T1_WIRE


# --- PUT /api/tasks/{id}/untick -----------------------------------------------------


def test_untick_clears_completed_at(api: TestClient) -> None:
    task = add(api)
    api.put(f"/api/tasks/{task['id']}/tick")

    response = api.put(f"/api/tasks/{task['id']}/untick")

    assert response.status_code == 200
    assert response.json() == task
    assert api.get("/api/tasks").json() == [task]


def test_untick_open_task_is_unchanged(api: TestClient) -> None:
    task = add(api)

    response = api.put(f"/api/tasks/{task['id']}/untick")

    assert response.status_code == 200
    assert response.json() == task


# --- DELETE /api/tasks/{id} ---------------------------------------------------------


def test_delete_returns_204_and_removes_the_task(api: TestClient) -> None:
    keep = add(api, "keep")
    gone = add(api, "gone")

    response = api.delete(f"/api/tasks/{gone['id']}")

    assert response.status_code == 204
    assert response.content == b""
    assert api.get("/api/tasks").json() == [keep]


def test_delete_twice_is_task_not_found(api: TestClient) -> None:
    task = add(api)
    api.delete(f"/api/tasks/{task['id']}")

    response = api.delete(f"/api/tasks/{task['id']}")

    assert response.status_code == 404
    assert response.json()["code"] == "task_not_found"


# --- Missing and malformed ids ------------------------------------------------------


@pytest.mark.parametrize(
    ("method", "path"),
    [("put", "/api/tasks/{}/tick"), ("put", "/api/tasks/{}/untick"), ("delete", "/api/tasks/{}")],
    ids=["tick", "untick", "delete"],
)
@pytest.mark.parametrize("task_id", [str(uuid4()), "abc"], ids=["unknown-uuid", "malformed"])
def test_missing_or_malformed_id_is_task_not_found(
    api: TestClient, method: str, path: str, task_id: str
) -> None:
    response = api.request(method.upper(), path.format(task_id))

    assert response.status_code == 404
    body = response.json()
    assert set(body) == {"detail", "code"}
    assert body["code"] == "task_not_found"


class DeletedBeforeCommitSession(Session):
    """Deletes every task behind the ORM's back just before the commit flushes."""

    def commit(self) -> None:
        with self.no_autoflush:
            self.execute(delete(Task).execution_options(synchronize_session=False))
        super().commit()


@pytest.mark.parametrize("action", ["tick", "untick"])
def test_task_deleted_between_load_and_commit_is_task_not_found(
    api: TestClient,
    application: FastAPI,
    session_factory: sessionmaker[Session],
    action: str,
) -> None:
    task = add(api)
    if action == "untick":
        api.put(f"/api/tasks/{task['id']}/tick")

    racing_factory = sessionmaker(
        bind=session_factory.kw["bind"],
        class_=DeletedBeforeCommitSession,
        expire_on_commit=False,
        join_transaction_mode="create_savepoint",
    )

    def racing_session() -> Iterator[Session]:
        with racing_factory() as session:
            yield session

    application.dependency_overrides[get_session] = racing_session

    response = api.put(f"/api/tasks/{task['id']}/{action}")

    assert response.status_code == 404
    assert response.json() == {"detail": "Task not found", "code": "task_not_found"}
