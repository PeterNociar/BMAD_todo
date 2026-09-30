from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Response, status

from app.deps import get_task_service
from app.models.task import Task
from app.schemas import ErrorResponse, TaskCreate, TaskRead
from app.services.task_service import TaskService

# AD-5: every error response is `{detail, code}`.
_UNAVAILABLE: dict[int | str, dict[str, Any]] = {
    503: {"model": ErrorResponse, "description": "Database unavailable (`service_unavailable`)"},
    500: {"model": ErrorResponse, "description": "Unexpected error (`internal_error`)"},
}
_INVALID_TEXT: dict[int | str, dict[str, Any]] = {
    422: {
        "model": ErrorResponse,
        "description": "Invalid text (`text_too_long` or `validation_error`)",
    },
}
_NOT_FOUND: dict[int | str, dict[str, Any]] = {
    404: {
        "model": ErrorResponse,
        "description": "No task with this id, or a malformed id (`task_not_found`)",
    },
}

TaskServiceDep = Annotated[TaskService, Depends(get_task_service)]

router = APIRouter(prefix="/tasks", tags=["tasks"], responses=_UNAVAILABLE)


@router.get("", response_model=list[TaskRead])
def list_tasks(service: TaskServiceDep) -> list[Task]:
    return service.list()


@router.post(
    "",
    response_model=TaskRead,
    status_code=status.HTTP_201_CREATED,
    responses=_INVALID_TEXT,
)
def add_task(body: TaskCreate, service: TaskServiceDep) -> Task:
    return service.add(body.text)


@router.put("/{id}/tick", response_model=TaskRead, responses=_NOT_FOUND)
def tick_task(id: UUID, service: TaskServiceDep) -> Task:
    return service.tick(id)


@router.put("/{id}/untick", response_model=TaskRead, responses=_NOT_FOUND)
def untick_task(id: UUID, service: TaskServiceDep) -> Task:
    return service.untick(id)


@router.delete(
    "/{id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    responses=_NOT_FOUND,
)
def delete_task(id: UUID, service: TaskServiceDep) -> None:
    service.remove(id)
