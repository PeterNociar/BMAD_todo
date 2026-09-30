"""Dependency providers (AD-20, AD-21)."""

from typing import Annotated

from fastapi import Depends, Request
from sqlmodel import Session

from app.clock import Clock
from app.config import Settings
from app.db import get_session
from app.services.task_service import TaskService


def current_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_clock(request: Request) -> Clock:
    """The app's one shared clock, so a test-mode offset applies to every request."""
    return request.app.state.clock


def get_task_service(
    session: Annotated[Session, Depends(get_session)],
    clock: Annotated[Clock, Depends(get_clock)],
) -> TaskService:
    return TaskService(session, clock)
