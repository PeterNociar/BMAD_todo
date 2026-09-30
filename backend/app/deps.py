"""Dependency providers (AD-20, AD-21)."""

from typing import Annotated

from fastapi import Depends, Request
from sqlmodel import Session

from app.config import Settings
from app.db import get_session
from app.services.task_service import TaskService


def current_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_task_service(session: Annotated[Session, Depends(get_session)]) -> TaskService:
    return TaskService(session)
