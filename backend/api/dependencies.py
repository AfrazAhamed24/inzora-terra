"""FastAPI dependency providers (API_SPEC §4.1).

Services are held on ``app`` and resolved via annotations so routes stay thin and testable (a
test can override ``get_mission_service`` to inject a stub). FastAPI resolves these per request.
"""

from __future__ import annotations

from hmac import compare_digest

from fastapi import Request

from backend.api.exceptions import ApiAuthError
from backend.api.services.mission_service import MissionService
from backend.api.services.replay_service import ReplayService
from backend.api.services.stream_service import MissionStreamService
from backend.api.services.telemetry_service import TelemetryService


def get_mission_service(request: Request) -> MissionService:
    return request.app.state.mission_service


def get_telemetry_service(request: Request) -> TelemetryService:
    return request.app.state.telemetry_service


def get_replay_service(request: Request) -> ReplayService:
    return request.app.state.replay_service


def get_stream_service(request: Request) -> MissionStreamService:
    return request.app.state.stream_service


def require_operator(request: Request) -> None:
    """Require operator authorization for state-changing routes.

    Configure ``TERRA_API_OPERATOR_KEY`` in production and send it as
    ``X-Terra-Operator-Key``. When no key is configured, only loopback/test clients
    are allowed so the local demo remains usable without exposing remote mutation.
    """
    settings = request.app.state.settings.api
    configured_key = (settings.operator_key or "").strip()
    supplied_key = (request.headers.get("X-Terra-Operator-Key") or "").strip()

    if configured_key:
        if supplied_key and compare_digest(supplied_key, configured_key):
            return
        raise ApiAuthError("operator authorization required")

    host = request.client.host if request.client else ""
    if host in {"127.0.0.1", "::1", "localhost", "testclient"}:
        return

    raise ApiAuthError("operator authorization is not configured for remote access")
