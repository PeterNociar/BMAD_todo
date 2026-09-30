import logging
from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlmodel import Session

from app.db import get_session

router = APIRouter(tags=["health"])
logger = logging.getLogger(__name__)


@router.get("/health", response_model=None)
def health(session: Annotated[Session, Depends(get_session)]) -> dict[str, str] | JSONResponse:
    try:
        session.exec(text("SELECT 1"))
    except SQLAlchemyError:
        logger.exception("Health check failed: database unreachable")
        return JSONResponse(
            status_code=503,
            content={"detail": "Database unavailable", "code": "service_unavailable"},
        )
    return {"status": "ok"}
