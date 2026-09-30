from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlmodel import Session

from app.db import get_session
from app.exceptions import ServiceUnavailable
from app.schemas import ErrorResponse

router = APIRouter(tags=["health"])


@router.get(
    "/health",
    responses={503: {"model": ErrorResponse, "description": "Database unreachable"}},
)
def health(session: Annotated[Session, Depends(get_session)]) -> dict[str, str]:
    try:
        session.exec(text("SELECT 1"))
    except SQLAlchemyError as exc:
        # Any DB failure means unhealthy here, wider than the app-wide OperationalError mapping.
        raise ServiceUnavailable() from exc
    return {"status": "ok"}
