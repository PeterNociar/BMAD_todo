"""Application factory and composition root."""

from fastapi import APIRouter, FastAPI

from app.routers import health, tasks


def create_app() -> FastAPI:
    app = FastAPI(
        title="Todo API",
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        redoc_url=None,
    )
    api = APIRouter(prefix="/api")
    api.include_router(tasks.router)
    api.include_router(health.router)
    app.include_router(api)
    return app


app = create_app()
