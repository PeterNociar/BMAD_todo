"""AD-5 error contract: every non-2xx response the app produces is `{detail, code}`."""

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm.exc import ObjectDeletedError, StaleDataError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.schemas import ErrorCode, ErrorResponse
from app.services.task_service import TaskNotFound

logger = logging.getLogger(__name__)

_ERROR_REF = "#/components/schemas/ErrorResponse"
_DEFAULT_422_REF = "#/components/schemas/HTTPValidationError"
_HTTP_METHODS = frozenset({"get", "put", "post", "delete", "options", "head", "patch", "trace"})
_FASTAPI_VALIDATION_SCHEMAS = ("HTTPValidationError", "ValidationError")


def error_response(
    status_code: int, code: ErrorCode, detail: str, headers: dict[str, str] | None = None
) -> JSONResponse:
    body = ErrorResponse(detail=detail, code=code).model_dump()
    return JSONResponse(status_code=status_code, content=body, headers=headers)


def _is_path_id_error(error: dict[str, Any]) -> bool:
    return tuple(error.get("loc", ()))[:2] == ("path", "id")


def _request_validation(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)
    errors = list(exc.errors())
    if any(_is_path_id_error(error) for error in errors):
        return error_response(404, "task_not_found", "Task not found")
    if errors and all(error.get("type") == "text_too_long" for error in errors):
        return error_response(422, "text_too_long", str(errors[0].get("msg", "Text too long")))
    return error_response(422, "validation_error", "Request validation failed")


def _task_not_found(request: Request, exc: Exception) -> JSONResponse:
    return error_response(404, "task_not_found", "Task not found")


def _database_unavailable(request: Request, exc: Exception) -> JSONResponse:
    logger.error("Database unavailable", exc_info=exc)
    return error_response(503, "service_unavailable", "Database unavailable")


def _http_exception(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, StarletteHTTPException)
    status_code = exc.status_code
    code: ErrorCode
    if status_code == 404:
        code = "not_found"
    elif status_code == 405:
        code = "method_not_allowed"
    elif status_code >= 500:
        code = "internal_error"
    else:
        code = "validation_error"
    return error_response(status_code, code, str(exc.detail), headers=exc.headers)


def _unhandled(request: Request, exc: Exception) -> JSONResponse:
    logger.error("Unhandled error on %s %s", request.method, request.url.path, exc_info=exc)
    return error_response(500, "internal_error", "Internal server error")


def _is_default_422(response: dict[str, Any] | None) -> bool:
    if response is None:
        return False
    schema = response.get("content", {}).get("application/json", {}).get("schema", {})
    return schema.get("$ref") == _DEFAULT_422_REF


def _only_path_id(operation: dict[str, Any]) -> bool:
    parameters = operation.get("parameters", [])
    return "requestBody" not in operation and all(
        parameter.get("in") == "path" and parameter.get("name") == "id" for parameter in parameters
    )


def install_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(RequestValidationError, _request_validation)
    app.add_exception_handler(TaskNotFound, _task_not_found)
    # The row was deleted by another session between load and commit (AD-11).
    app.add_exception_handler(StaleDataError, _task_not_found)
    app.add_exception_handler(ObjectDeletedError, _task_not_found)
    app.add_exception_handler(OperationalError, _database_unavailable)
    app.add_exception_handler(StarletteHTTPException, _http_exception)
    app.add_exception_handler(Exception, _unhandled)
    _install_openapi(app)


def _install_openapi(app: FastAPI) -> None:
    """Swap FastAPI's default 422 `HTTPValidationError` for the AD-5 `ErrorResponse`."""

    def openapi() -> dict[str, Any]:
        if app.openapi_schema is not None:
            return app.openapi_schema
        schema = FastAPI.openapi(app)  # FastAPI's own generator; caches on app.openapi_schema
        components = schema.setdefault("components", {}).setdefault("schemas", {})
        components["ErrorResponse"] = ErrorResponse.model_json_schema()
        for path_item in schema.get("paths", {}).values():
            for method, operation in path_item.items():
                if method not in _HTTP_METHODS:
                    continue
                responses = operation.get("responses", {})
                if not _is_default_422(responses.get("422")):
                    continue
                if _only_path_id(operation):
                    # A malformed path id is answered with 404 `task_not_found`, never 422.
                    del responses["422"]
                else:
                    responses["422"] = {
                        "description": "Validation error (`validation_error`)",
                        "content": {"application/json": {"schema": {"$ref": _ERROR_REF}}},
                    }
        for name in _FASTAPI_VALIDATION_SCHEMAS:
            components.pop(name, None)
        app.openapi_schema = schema
        return schema

    app.openapi = openapi  # type: ignore[method-assign]
