"""Application factory and composition root (AD-21)."""

from fastapi import APIRouter, FastAPI

from app.config import Settings, get_settings
from app.db import make_engine
from app.routers import health, tasks


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings if settings is not None else get_settings()
    app = FastAPI(
        title="Todo API",
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        redoc_url=None,
    )
    app.state.settings = settings
    app.state.engine = make_engine(settings.database_url)
    api = APIRouter(prefix="/api")
    api.include_router(tasks.router)
    api.include_router(health.router)
    app.include_router(api)
    return app
