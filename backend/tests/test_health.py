from collections.abc import Iterator
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError
from sqlmodel import Session

from app.db import get_session


class UnreachableSession(Session):
    def exec(self, *args: Any, **kwargs: Any) -> Any:
        raise OperationalError("SELECT 1", {}, Exception("connection refused"))


def test_health_ok(client: TestClient) -> None:
    response = client.get("/api/health")

    assert response.status_code == 200


def test_health_db_down_returns_503(client: TestClient, application: FastAPI) -> None:
    def broken_session() -> Iterator[Session]:
        with UnreachableSession() as session:
            yield session

    application.dependency_overrides[get_session] = broken_session

    response = client.get("/api/health")

    assert response.status_code == 503
    assert response.json() == {"detail": "Database unavailable", "code": "service_unavailable"}
