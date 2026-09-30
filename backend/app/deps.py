"""Dependency providers (AD-20)."""

from typing import Annotated

from fastapi import Depends
from sqlmodel import Session

from app.db import get_session
from app.services.task_service import TaskService


def get_task_service(session: Annotated[Session, Depends(get_session)]) -> TaskService:
    return TaskService(session)
