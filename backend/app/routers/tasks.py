from typing import Annotated

from fastapi import APIRouter, Depends

from app.deps import get_task_service
from app.models.task import Task
from app.services.task_service import TaskService

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("", response_model=list[Task])
def list_tasks(service: Annotated[TaskService, Depends(get_task_service)]) -> list[Task]:
    return service.list()
