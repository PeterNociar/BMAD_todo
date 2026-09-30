"""AD-5 error contract: every non-2xx response the app produces is `{detail, code}`.

Each `AppError` (app/exceptions.py) carries its own status, code and detail, and one handler
formats it. Framework and library errors are translated into an `AppError` first, so every
response goes through that same handler.
"""

import logging
from collections.abc import Callable
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm.exc import ObjectDeletedError, StaleDataError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.exceptions import (
    AppError,
    InternalError,
    MethodNotAllowed,
    NotFound,
    ServiceUnavailable,
    TaskNotFound,
    TextTooLong,
    ValidationFailed,
)
from app.schemas import ErrorResponse

logger = logging.getLogger(__name__)

_ERROR_REF = "#/components/schemas/ErrorResponse"
_DEFAULT_422_REF = "#/components/schemas/HTTPValidationError"
_HTTP_METHODS = frozenset({"get", "put", "post", "delete", "options", "head", "patch", "trace"})
_FASTAPI_VALIDATION_SCHEMAS = ("HTTPValidationError", "ValidationError")


def error_response(exc: AppError) -> JSONResponse:
    body = ErrorResponse(detail=exc.detail, code=exc.code).model_dump()
    return JSONResponse(status_code=exc.status_code, content=body, headers=exc.headers)


def _handle_app_error(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, AppError)
    if exc.log:
        cause = exc.__cause__ or exc
        logger.error(
            "%s on %s %s", type(exc).__name__, request.method, request.url.path, exc_info=cause
        )
    return error_response(exc)


def _is_path_id_error(error: dict[str, Any]) -> bool:
    return tuple(error.get("loc", ()))[:2] == ("path", "id")


def _from_request_validation(exc: Exception) -> AppError:
    assert isinstance(exc, RequestValidationError)
    errors = list(exc.errors())
    if any(_is_path_id_error(error) for error in errors):
        return TaskNotFound()
    if errors and all(error.get("type") == "text_too_long" for error in errors):
        return TextTooLong(str(errors[0].get("msg", TextTooLong.default_detail)))
    return ValidationFailed()


def _from_http_exception(exc: Exception) -> AppError:
    assert isinstance(exc, StarletteHTTPException)
    detail, headers = str(exc.detail), exc.headers
    if exc.status_code == 404:
        return NotFound(detail, headers=headers)
    if exc.status_code == 405:
        return MethodNotAllowed(detail, headers=headers)
    if exc.status_code >= 500:
        return InternalError(detail, status_code=exc.status_code, headers=headers)
    return ValidationFailed(detail, status_code=exc.status_code, headers=headers)


def _translated(translate: Callable[[Exception], AppError]) -> Callable[..., JSONResponse]:
    def handler(request: Request, exc: Exception) -> JSONResponse:
        app_error = translate(exc)
        app_error.__cause__ = exc
        return _handle_app_error(request, app_error)

    return handler


def install_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(AppError, _handle_app_error)
    app.add_exception_handler(RequestValidationError, _translated(_from_request_validation))
    app.add_exception_handler(StarletteHTTPException, _translated(_from_http_exception))
    # The row was deleted by another session between load and commit (AD-11).
    app.add_exception_handler(StaleDataError, _translated(lambda exc: TaskNotFound()))
    app.add_exception_handler(ObjectDeletedError, _translated(lambda exc: TaskNotFound()))
    app.add_exception_handler(OperationalError, _translated(lambda exc: ServiceUnavailable()))
    app.add_exception_handler(Exception, _translated(lambda exc: InternalError()))
    _install_openapi(app)


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
