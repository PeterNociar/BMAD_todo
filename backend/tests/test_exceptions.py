"""AppError hierarchy: each exception carries its status, code and detail."""

import logging

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.exceptions import (
    AppError,
    InternalError,
    MethodNotAllowed,
    NotFound,
    ServiceUnavailable,
    TaskNotFound,
    TextTooLong,
    ValidationFailed,
)
from app.main import create_app

URL = "postgresql+psycopg://user:secret@example.invalid:5432/todo"


@pytest.mark.parametrize(
    ("error", "status_code", "code", "detail", "logged"),
    [
        (AppError, 500, "internal_error", "Internal server error", True),
        (InternalError, 500, "internal_error", "Internal server error", True),
        (ValidationFailed, 422, "validation_error", "Request validation failed", False),
        (TextTooLong, 422, "text_too_long", "Text must be at most 2000 characters", False),
        (NotFound, 404, "not_found", "Not Found", False),
        (TaskNotFound, 404, "task_not_found", "Task not found", False),
        (MethodNotAllowed, 405, "method_not_allowed", "Method Not Allowed", False),
        (ServiceUnavailable, 503, "service_unavailable", "Database unavailable", True),
    ],
)
def test_defaults(
    error: type[AppError], status_code: int, code: str, detail: str, logged: bool
) -> None:
    exc = error()

    assert (exc.status_code, exc.code, exc.detail, exc.log) == (status_code, code, detail, logged)
    assert exc.headers is None
    assert str(exc) == detail


def test_detail_status_and_headers_can_be_overridden_per_instance() -> None:
    exc = ValidationFailed("nope", status_code=401, headers={"X-Why": "auth"})

    assert (exc.status_code, exc.code, exc.detail, exc.headers) == (
        401,
        "validation_error",
        "nope",
        {"X-Why": "auth"},
    )
    assert ValidationFailed().status_code == 422  # the class default is untouched


class TeapotError(AppError):
    status_code = 418
    code = "validation_error"
    default_detail = "I'm a teapot"
    log = False


@pytest.fixture()
def raising_client() -> TestClient:
    application = create_app(Settings(_env_file=None, database_url=URL, app_env="app"))

    def raise_teapot() -> None:
        raise TeapotError()

    def raise_unavailable() -> None:
        raise ServiceUnavailable() from ConnectionError("db gone")

    application.add_api_route("/api/teapot", raise_teapot)
    application.add_api_route("/api/unavailable", raise_unavailable)
    return TestClient(application, raise_server_exceptions=False)


def test_new_subclass_needs_no_handler_of_its_own(
    raising_client: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.ERROR, logger="app.errors"):
        response = raising_client.get("/api/teapot")

    assert response.status_code == 418
    assert response.json() == {"detail": "I'm a teapot", "code": "validation_error"}
    assert not caplog.records  # client errors are not logged


def test_server_errors_are_logged_with_their_cause(
    raising_client: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.ERROR, logger="app.errors"):
        response = raising_client.get("/api/unavailable")

    assert response.status_code == 503
    assert response.json() == {"detail": "Database unavailable", "code": "service_unavailable"}
    assert any(
        record.exc_info and isinstance(record.exc_info[1], ConnectionError)
        for record in caplog.records
    )
