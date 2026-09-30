"""Application factory and composition root (AD-21)."""

from fastapi import APIRouter, FastAPI

from app.clock import Clock
from app.config import Settings, get_settings
from app.db import make_engine
from app.errors import install_error_handlers
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
    app.state.clock = Clock()
    api = APIRouter(prefix="/api")
    api.include_router(tasks.router)
    api.include_router(health.router)
    if settings.app_env == "test":
        # AD-14: the testing router is imported and mounted only in test mode.
        from app.routers import testing

        api.include_router(testing.router)
    app.include_router(api)
    install_error_handlers(app)
    return app
