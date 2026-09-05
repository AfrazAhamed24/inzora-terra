"""Global API middleware: request-id correlation, CORS, and exception handling.

Logging policy (LOGGING_SPEC §6): the API does **not** create a new logger. Request/response
cycles are correlated through the existing structured-log sink where a mission is involved
(``EventSink.log`` on the owning manager); otherwise the standard library ``logging``
namespace ``inzora.api`` is used — the same configured level as the rest of the runtime.
"""

from __future__ import annotations

import logging
import time
import uuid

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware

from backend.api.exceptions import ApiError
from backend.api.schemas.response import ErrorResponse
from backend.core.mission_state import utc_now_iso

log = logging.getLogger("inzora.api")


def install_middleware(app: FastAPI, *, cors_origins: list[str]) -> None:
    """Register CORS + exception handlers on the app (call from ``create_app``)."""
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def request_id_middleware(request: Request, call_next):  # type: ignore[no-untyped-def]
        """Attach a per-request correlation id; log a structured access line."""
        request.state.request_id = f"REQ-{uuid.uuid4().hex[:8]}"
        start = time.perf_counter()
        response = await call_next(request)
        elapsed_ms = (time.perf_counter() - start) * 1000
        log.info(
            "%s %s -> %s (%d) [%s] %.1fms",
            request.method,
            request.url.path,
            response.status_code,
            response.status_code,
            request.state.request_id,
            elapsed_ms,
        )
        response.headers["X-Request-Id"] = request.state.request_id
        return response

    @app.exception_handler(ApiError)
    async def api_error_handler(request: Request, exc: ApiError) -> JSONResponse:  # noqa: ARG001
        body = ErrorResponse(
            detail=exc.detail,
            code=exc.code,
            status_code=exc.http_status,
            timestamp=utc_now_iso(),
        ).model_dump()
        return JSONResponse(status_code=exc.http_status, content=body)

    @app.exception_handler(Exception)
    async def unhandled_handler(request: Request, exc: Exception) -> JSONResponse:  # noqa: ARG001
        """Last-resort handler: never leak stack traces, always structured JSON."""
        log.exception("unhandled error on %s %s", request.method, request.url.path)
        body = ErrorResponse(
            detail="internal server error",
            code="internal_error",
            status_code=500,
            timestamp=utc_now_iso(),
        ).model_dump()
        return JSONResponse(status_code=500, content=body)