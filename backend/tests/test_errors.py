"""AD-5 error contract: framework errors, DB down, unhandled errors and the OpenAPI schema."""

import logging
from collections.abc import Iterator
from typing import Any
from uuid import uuid4

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError
from sqlmodel import Session

from app.config import Settings
from app.db import get_session
from app.main import create_app
from tests.conftest import TEST_DATABASE_URL


class UnreachableSession(Session):
    """A session whose every database round trip fails as if Postgres were down."""

    def _refuse(self, *args: Any, **kwargs: Any) -> Any:
        raise OperationalError("SELECT 1", {}, Exception("connection refused"))

    exec = _refuse  # type: ignore[assignment]
    execute = _refuse  # type: ignore[assignment]
    get = _refuse  # type: ignore[assignment]
    flush = _refuse  # type: ignore[assignment]
    commit = _refuse  # type: ignore[assignment]


@pytest.fixture()
def db_down(client: TestClient, application: FastAPI) -> TestClient:
    def broken_session() -> Iterator[Session]:
        with UnreachableSession() as session:
            yield session

    application.dependency_overrides[get_session] = broken_session
    return client


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        ("POST", "/api/tasks", {"text": "buy milk"}),
        ("PUT", f"/api/tasks/{uuid4()}/tick", None),
        ("PUT", f"/api/tasks/{uuid4()}/untick", None),
        ("DELETE", f"/api/tasks/{uuid4()}", None),
        ("GET", "/api/tasks", None),
    ],
    ids=["add", "tick", "untick", "delete", "list"],
)
def test_db_down_is_service_unavailable(
    db_down: TestClient, method: str, path: str, body: dict[str, str] | None
) -> None:
    response = db_down.request(method, path, json=body)

    assert response.status_code == 503
    assert response.json() == {"detail": "Database unavailable", "code": "service_unavailable"}


def test_unknown_route_is_not_found(client: TestClient) -> None:
    response = client.get("/api/nope")

    assert response.status_code == 404
    body = response.json()
    assert set(body) == {"detail", "code"}
    assert body["code"] == "not_found"


def test_wrong_method_is_method_not_allowed(client: TestClient) -> None:
    response = client.patch("/api/tasks")

    assert response.status_code == 405
    body = response.json()
    assert set(body) == {"detail", "code"}
    assert body["code"] == "method_not_allowed"
    assert "GET" in response.headers["allow"]


def test_unhandled_error_is_internal_error_without_traceback(
    caplog: pytest.LogCaptureFixture,
) -> None:
    app = create_app(Settings(_env_file=None, database_url=TEST_DATABASE_URL))

    def boom() -> None:
        raise RuntimeError("secret internals")

    app.add_api_route("/api/boom", boom)

    with (
        caplog.at_level(logging.ERROR, logger="app.errors"),
        TestClient(app, raise_server_exceptions=False) as client,
    ):
        response = client.get("/api/boom")

    assert response.status_code == 500
    assert response.json() == {"detail": "Internal server error", "code": "internal_error"}
    assert "secret internals" not in response.text
    assert "Traceback" not in response.text
    assert any(
        record.exc_info and isinstance(record.exc_info[1], RuntimeError)
        for record in caplog.records
    )


def test_docs_page_is_served(client: TestClient) -> None:
    response = client.get("/api/docs")

    assert response.status_code == 200
    assert "/api/openapi.json" in response.text


def test_openapi_error_responses_use_the_error_schema(client: TestClient) -> None:
    response = client.get("/api/openapi.json")

    assert response.status_code == 200
    assert "HTTPValidationError" not in response.text
    schema = response.json()
    assert set(schema["components"]["schemas"]["ErrorResponse"]["properties"]) == {
        "detail",
        "code",
    }
    error_statuses = 0
    for path_item in schema["paths"].values():
        for operation in path_item.values():
            for status, declared in operation["responses"].items():
                if int(status) >= 400:
                    error_statuses += 1
                    ref = declared["content"]["application/json"]["schema"]["$ref"]
                    assert ref == "#/components/schemas/ErrorResponse"
    post = schema["paths"]["/api/tasks"]["post"]["responses"]
    assert {"422", "503", "500"} <= set(post)
    tick = schema["paths"]["/api/tasks/{id}/tick"]["put"]
    assert "404" in tick["responses"]
    assert tick["parameters"][0]["schema"]["format"] == "uuid"
    for path, method in [
        ("/api/tasks/{id}/tick", "put"),
        ("/api/tasks/{id}/untick", "put"),
        ("/api/tasks/{id}", "delete"),
    ]:
        assert "422" not in schema["paths"][path][method]["responses"]
    codes = schema["components"]["schemas"]["ErrorResponse"]["properties"]["code"]["enum"]
    assert set(codes) == {
        "text_too_long",
        "validation_error",
        "task_not_found",
        "not_found",
        "method_not_allowed",
        "service_unavailable",
        "internal_error",
    }
    assert error_statuses > 0


@pytest.mark.parametrize(("status", "code"), [(401, "validation_error"), (502, "internal_error")])
def test_other_http_exceptions_map_by_status_class(status: int, code: str) -> None:
    app = create_app(Settings(_env_file=None, database_url=TEST_DATABASE_URL))

    def raise_http() -> None:
        raise HTTPException(status_code=status, detail="nope")

    app.add_api_route("/api/raise", raise_http)

    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get("/api/raise")

    assert response.status_code == status
    assert response.json() == {"detail": "nope", "code": code}
