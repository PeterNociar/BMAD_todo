import logging
from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlmodel import Session

from app.db import get_session
from app.errors import error_response
from app.schemas import ErrorResponse

router = APIRouter(tags=["health"])
logger = logging.getLogger(__name__)


@router.get(
    "/health",
    response_model=None,
    responses={503: {"model": ErrorResponse, "description": "Database unreachable"}},
)
def health(session: Annotated[Session, Depends(get_session)]) -> dict[str, str] | JSONResponse:
    try:
        session.exec(text("SELECT 1"))
    except SQLAlchemyError:
        logger.exception("Health check failed: database unreachable")
        return error_response(503, "service_unavailable", "Database unavailable")
    return {"status": "ok"}
