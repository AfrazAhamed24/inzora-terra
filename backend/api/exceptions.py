"""API exception types and FastAPI-friendly error mapping (API_SPEC §7).

``ApiError`` is the single domain error the API layer raises; each subclass carries an
``http_status`` and a stable ``code`` string. Route/service code raises these; a global
handler in ``middleware.py`` converts them to ``ErrorResponse`` JSON. This keeps the routing
and service JSON plumbing out of business logic.
"""

from __future__ import annotations

from typing import Any, Optional


class ApiError(Exception):
    """Base API error with an HTTP status and a stable machine-readable code."""

    http_status: int = 500
    code: str = "internal_error"

    def __init__(self, detail: str, *, code: Optional[str] = None):
        super().__init__(detail)
        self.detail = detail
        if code:
            self.code = code


class MissionNotFoundError(ApiError):
    http_status = 404
    code = "mission_not_found"


class MissionAlreadyExistsError(ApiError):
    http_status = 409
    code = "mission_already_exists"


class MissionAlreadyStartedError(ApiError):
    http_status = 409
    code = "mission_already_started"


class MissionNotRunningError(ApiError):
    http_status = 409
    code = "mission_not_running"


class MissionTerminalError(ApiError):
    http_status = 409
    code = "mission_terminal"


class MissionValidationError(ApiError):
    http_status = 422
    code = "mission_validation_error"


class AssistantUnavailableError(ApiError):
    http_status = 501
    code = "assistant_unavailable"


class ApiConfigError(ApiError):
    http_status = 500
    code = "api_config_error"


def http_error(status: int) -> Any:
    """Return a FastAPI-compatible dict body for a plain HTTP error."""
    return {"detail": f"HTTP {status}", "code": f"http_{status}", "status_code": status}