"""Test-only seeding and clock router (AD-14).

`create_app` imports and mounts this module only when `settings.app_env == "test"`, so under
the default config every `/api/test/*` path is `404 not_found`.
"""

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Response, status
from sqlmodel import Session

from app.clock import Clock
from app.db import get_session
from app.deps import get_clock
from app.models.task import Task
from app.schemas import ClockOffset, ErrorResponse, TaskRead, TaskSeed
from app.services.testing_task_service import TestingTaskService

_INVALID: dict[int | str, dict[str, Any]] = {
    422: {
        "model": ErrorResponse,
        "description": "Invalid body (`text_too_long` or `validation_error`)",
    },
}

ClockDep = Annotated[Clock, Depends(get_clock)]


def get_testing_task_service(
    session: Annotated[Session, Depends(get_session)], clock: ClockDep
) -> TestingTaskService:
    return TestingTaskService(session, clock)


TestingTaskServiceDep = Annotated[TestingTaskService, Depends(get_testing_task_service)]

router = APIRouter(prefix="/test", tags=["testing"])


@router.post(
    "/clock", status_code=status.HTTP_204_NO_CONTENT, response_class=Response, responses=_INVALID
)
def set_clock_offset(body: ClockOffset, clock: ClockDep) -> None:
    clock.offset_ms = body.offset_ms


@router.post(
    "/tasks", response_model=TaskRead, status_code=status.HTTP_201_CREATED, responses=_INVALID
)
def seed_task(body: TaskSeed, service: TestingTaskServiceDep) -> Task:
    return service.seed(body.text, body.added_ago_ms, body.completed_ago_ms)


@router.post("/reset", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def reset(service: TestingTaskServiceDep, clock: ClockDep) -> None:
    clock.offset_ms = 0
    service.remove_all()
