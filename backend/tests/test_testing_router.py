"""AD-14 testing router against the story's I/O matrix (backend rows)."""

import subprocess
import sys
from datetime import UTC, datetime, timedelta

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.clock import Clock
from app.schemas.task import format_timestamp
from tests.conftest import TEST_DATABASE_URL

T = datetime(2026, 9, 30, 12, 0, 0, 500000, tzinfo=UTC)
HOUR_MS = 3_600_000
TEST_ONLY_MODULES = ["app.routers.testing", "app.services.testing_task_service"]


def wire(value: datetime) -> str:
    return format_timestamp(value)


class FixedWall:
    def __init__(self, now: datetime) -> None:
        self.now = now

    def __call__(self) -> datetime:
        return self.now


@pytest.fixture()
def wall(testing_application: FastAPI, testing_client: TestClient) -> FixedWall:
    """Pins the wall time of the test app's one shared clock; `testing_client` restores it."""
    fixed = FixedWall(T)
    testing_application.state.clock = Clock(fixed)
    return fixed


@pytest.fixture()
def api(testing_client: TestClient, wall: FixedWall) -> TestClient:
    return testing_client


def seed(api: TestClient, **body: object) -> dict[str, object]:
    response = api.post("/api/test/tasks", json={"text": "seeded", **body})
    assert response.status_code == 201, response.text
    return response.json()


# --- Gate closed ----------------------------------------------------------------------


@pytest.mark.parametrize(
    ("path", "body"),
    [
        ("/api/test/reset", None),
        ("/api/test/tasks", {"text": "x", "added_ago_ms": 0, "completed_ago_ms": None}),
        ("/api/test/clock", {"offset_ms": HOUR_MS}),
    ],
    ids=["reset", "tasks", "clock"],
)
def test_testing_routes_are_not_found_under_the_default_config(
    client: TestClient, application: FastAPI, path: str, body: object
) -> None:
    response = client.post(path, json=body)

    assert response.status_code == 404
    assert response.json() == {"detail": "Not Found", "code": "not_found"}
    assert application.state.clock.offset_ms == 0


def test_default_app_documents_no_testing_routes(
    client: TestClient,
) -> None:
    paths = client.get("/api/openapi.json").json()["paths"]

    assert not [path for path in paths if path.startswith("/api/test")]


def test_default_app_does_not_import_test_only_code() -> None:
    """Run in a fresh interpreter: the session's test-mode app already imported them here."""
    script = (
        "import sys\n"
        "from app.config import Settings\n"
        "from app.main import create_app\n"
        f"create_app(Settings(_env_file=None, database_url={TEST_DATABASE_URL!r}, app_env='app'))\n"
        "print([m for m in TEST_ONLY_MODULES if m in sys.modules])\n"
    ).replace("TEST_ONLY_MODULES", repr(TEST_ONLY_MODULES))

    result = subprocess.run(
        [sys.executable, "-c", script], capture_output=True, text=True, check=True
    )

    assert result.stdout.strip() == "[]"


def test_testing_routes_are_documented_in_test_mode(api: TestClient) -> None:
    paths = api.get("/api/openapi.json").json()["paths"]

    assert {"/api/test/tasks", "/api/test/reset", "/api/test/clock"} <= set(paths)


# --- Seeding --------------------------------------------------------------------------


def test_seed_aged_task(api: TestClient) -> None:
    body = seed(api, text="  old  ", added_ago_ms=90_000_000, completed_ago_ms=None)

    assert body["text"] == "old"
    assert body["added_at"] == wire(T - timedelta(hours=25))
    assert body["completed_at"] is None
    assert api.get("/api/tasks").json() == [body]


def test_seed_completed_task(api: TestClient) -> None:
    body = seed(api, added_ago_ms=7_200_000, completed_ago_ms=3_600_000)

    assert body["added_at"] == wire(T - timedelta(hours=2))
    assert body["completed_at"] == wire(T - timedelta(hours=1))


def test_seed_without_completed_ago_ms_is_open(api: TestClient) -> None:
    body = seed(api, added_ago_ms=0)

    assert body["completed_at"] is None


def test_seed_completed_ago_equal_to_added_ago_is_allowed(api: TestClient) -> None:
    body = seed(api, added_ago_ms=HOUR_MS, completed_ago_ms=HOUR_MS)

    assert body["completed_at"] == body["added_at"]


@pytest.mark.parametrize(
    ("body", "code"),
    [
        ({"added_ago_ms": -1, "completed_ago_ms": None}, "validation_error"),
        ({"added_ago_ms": HOUR_MS, "completed_ago_ms": -1}, "validation_error"),
        ({"added_ago_ms": HOUR_MS, "completed_ago_ms": HOUR_MS + 1}, "validation_error"),
        ({"added_ago_ms": 1.5, "completed_ago_ms": None}, "validation_error"),
        ({"added_ago_ms": 10**20, "completed_ago_ms": None}, "validation_error"),
        ({"completed_ago_ms": None}, "validation_error"),
        ({"text": "   ", "added_ago_ms": 0}, "validation_error"),
        ({"text": "a" * 2001, "added_ago_ms": 0, "completed_ago_ms": None}, "text_too_long"),
        ({"added_ago_ms": HOUR_MS, "completedAgoMs": 0}, "validation_error"),
    ],
    ids=[
        "negative-added",
        "negative-completed",
        "completed-before-added",
        "float",
        "too-large",
        "missing-added",
        "blank-text",
        "text-too-long",
        "unknown-key",
    ],
)
def test_seed_rejects_invalid_body(api: TestClient, body: dict[str, object], code: str) -> None:
    response = api.post("/api/test/tasks", json={"text": "x", **body})

    assert response.status_code == 422
    assert set(response.json()) == {"detail", "code"}
    assert response.json()["code"] == code
    assert api.get("/api/tasks").json() == []


# --- Clock offset ---------------------------------------------------------------------


def test_offset_applies_to_normal_requests(api: TestClient) -> None:
    response = api.post("/api/test/clock", json={"offset_ms": HOUR_MS})
    assert response.status_code == 204

    task = api.post("/api/tasks", json={"text": "later"}).json()

    assert task["added_at"] == wire(T + timedelta(hours=1))


def test_offset_applies_to_seeding(api: TestClient) -> None:
    api.post("/api/test/clock", json={"offset_ms": HOUR_MS})

    body = seed(api, added_ago_ms=0)

    assert body["added_at"] == wire(T + timedelta(hours=1))


def test_offset_zero_clears_it(api: TestClient) -> None:
    api.post("/api/test/clock", json={"offset_ms": HOUR_MS})

    response = api.post("/api/test/clock", json={"offset_ms": 0})

    assert response.status_code == 204
    assert api.post("/api/tasks", json={"text": "now"}).json()["added_at"] == wire(T)


@pytest.mark.parametrize(
    "body",
    [{}, {"offset_ms": "5"}, {"offset_ms": 10**20}, {"offset_ms": -1}, {"offsetMs": 1}],
    ids=["missing", "string", "too-large", "negative", "unknown-key"],
)
def test_invalid_offset_is_validation_error(api: TestClient, body: object) -> None:
    response = api.post("/api/test/clock", json=body)

    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"


def test_offset_on_the_real_clock_shifts_wall_time(
    testing_client: TestClient, testing_application: FastAPI
) -> None:
    testing_client.post("/api/test/clock", json={"offset_ms": HOUR_MS})
    before = datetime.now(UTC) + timedelta(hours=1) - timedelta(milliseconds=1)

    added_at = testing_client.post("/api/tasks", json={"text": "x"}).json()["added_at"]

    after = datetime.now(UTC) + timedelta(hours=1)
    assert wire(before) <= added_at <= wire(after)
    assert testing_application.state.clock.offset_ms == HOUR_MS


# --- Reset ----------------------------------------------------------------------------


def test_reset_deletes_every_task_and_clears_the_offset(api: TestClient) -> None:
    seed(api, added_ago_ms=HOUR_MS)
    seed(api, added_ago_ms=HOUR_MS, completed_ago_ms=0)
    api.post("/api/tasks", json={"text": "normal"})
    api.post("/api/test/clock", json={"offset_ms": HOUR_MS})

    response = api.post("/api/test/reset")

    assert response.status_code == 204
    assert response.content == b""
    assert api.get("/api/tasks").json() == []
    assert api.post("/api/tasks", json={"text": "now"}).json()["added_at"] == wire(T)
