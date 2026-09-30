"""AD-6: `GET /api/tasks` follows the shared `contracts/ordering-cases.json` fixtures."""

import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.models.task import Task

CASES_FILE = Path(__file__).resolve().parents[2] / "contracts" / "ordering-cases.json"
CASES: list[dict[str, Any]] = json.loads(CASES_FILE.read_text())["cases"]
TIMESTAMP = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")


def parse(value: str | None) -> datetime | None:
    return None if value is None else datetime.fromisoformat(value)


@pytest.mark.parametrize("case", CASES, ids=[case["name"] for case in CASES])
def test_list_follows_ordering_case(
    case: dict[str, Any], client: TestClient, db_session: Session
) -> None:
    for task in case["tasks"]:
        db_session.add(
            Task(
                id=UUID(task["id"]),
                text=task["text"],
                added_at=parse(task["added_at"]),
                completed_at=parse(task["completed_at"]),
            )
        )
    db_session.commit()

    response = client.get("/api/tasks")

    assert response.status_code == 200
    body = response.json()
    assert [row["id"] for row in body] == case["expected"]
    by_id = {task["id"]: task for task in case["tasks"]}
    for row in body:
        assert TIMESTAMP.match(row["added_at"])
        assert row["completed_at"] is None or TIMESTAMP.match(row["completed_at"])
        assert row["added_at"] == by_id[row["id"]]["added_at"]
        assert row["completed_at"] == by_id[row["id"]]["completed_at"]


def test_fixture_covers_required_cases() -> None:
    names = {case["name"] for case in CASES}
    assert {
        "mixed_open_and_completed",
        "same_ms_open_tie",
        "completed_tie",
        "cross_group_tie",
        "all_open",
        "all_completed",
        "empty",
    } <= names
    for case in CASES:
        for task in case["tasks"]:
            assert task["id"] == str(UUID(task["id"]))  # lowercase canonical form
