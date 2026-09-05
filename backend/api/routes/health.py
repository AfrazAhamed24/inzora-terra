"""Health + version endpoints (API_SPEC §2)."""

from __future__ import annotations

import time

from fastapi import APIRouter, Depends

from backend.api import __version__
from backend.api.dependencies import get_mission_service
from backend.api.schemas.response import HealthResponse, VersionResponse
from backend.api.services.mission_service import MissionService
from backend.core.config import app_settings

router = APIRouter(tags=["system"])

_START = time.monotonic()


@router.get("/health", response_model=HealthResponse)
async def health(missions: MissionService = Depends(get_mission_service)) -> HealthResponse:
    return HealthResponse(
        status="ok",
        version=__version__,
        active_missions=missions.count(),
        uptime_seconds=round(time.monotonic() - _START, 2),
    )


@router.get("/version", response_model=VersionResponse)
async def version() -> VersionResponse:
    return VersionResponse(
        version=__version__,
        api_version="v1",
        api_prefix=f"http://{app_settings.api.host}:{app_settings.api.port}",
    )