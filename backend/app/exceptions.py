"""Application exceptions: each carries its own HTTP status, AD-5 code and default detail.

Raise these anywhere (services, routers). `app/errors.py` turns any `AppError` into the
`{detail, code}` response, so adding an error means adding a subclass here, not a handler.
"""

from typing import ClassVar

from app.schemas.task import ErrorCode


class AppError(Exception):
    status_code: int = 500
    code: ClassVar[ErrorCode] = "internal_error"
    default_detail: ClassVar[str] = "Internal server error"
    # Server-side faults are logged with their cause; client errors are not.
    log: ClassVar[bool] = True

    def __init__(
        self,
        detail: str | None = None,
        *,
        status_code: int | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        self.detail = detail if detail is not None else self.default_detail
        if status_code is not None:
            self.status_code = status_code
        self.headers = headers
        super().__init__(self.detail)


class ValidationFailed(AppError):
    status_code = 422
    code = "validation_error"
    default_detail = "Request validation failed"
    log = False


class TextTooLong(ValidationFailed):
    code = "text_too_long"
    default_detail = "Text must be at most 2000 characters"


class NotFound(AppError):
    status_code = 404
    code = "not_found"
    default_detail = "Not Found"
    log = False


class TaskNotFound(NotFound):
    """No task has the requested id, or the id is malformed (AD-11)."""

    code = "task_not_found"
    default_detail = "Task not found"


class MethodNotAllowed(AppError):
    status_code = 405
    code = "method_not_allowed"
    default_detail = "Method Not Allowed"
    log = False


class ServiceUnavailable(AppError):
    status_code = 503
    code = "service_unavailable"
    default_detail = "Database unavailable"


class InternalError(AppError):
    pass
