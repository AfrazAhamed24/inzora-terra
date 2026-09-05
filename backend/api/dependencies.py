"""FastAPI dependency providers (API_SPEC §4.1).

Services are held on ``app`` and resolved via annotations so routes stay thin and testable (a
test can override ``get_mission_service`` to inject a stub). FastAPI resolves these per request.
"""

from __future__ import annotations

from fastapi import Request

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