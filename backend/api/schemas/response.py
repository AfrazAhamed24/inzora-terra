"""API response schemas (API_SPEC §3).

Responses are projections of the live ``MissionState`` — the API reads through
``MissionStateManager`` (never mutating it) and serializes only the fields each route needs.
Keeping them explicit avoids leaking the whole append-only history into every payload.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class _Resp(BaseModel):
    model_config = ConfigDict(extra="ignore")


class HealthResponse(_Resp):
    status: str = "ok"
    version: str = ""
    active_missions: int = 0
    uptime_seconds: float = 0.0


class VersionResponse(_Resp):
    name: str = "inzora-terra-os"
    version: str = ""
    api_version: str = ""
    api_prefix: str = "/api/v1"


class MissionResponse(_Resp):
    mission_id: str
    stage: str
    phase: str
    is_running: bool
    incident_text: str
    incident_id: str
    environment_id: str = ""
    mission_name: str = ""
    created_at: str = ""
    updated_at: str = ""


class MissionListResponse(_Resp):
    missions: List[MissionResponse] = Field(default_factory=list)
    count: int = 0


class MissionSummaryResponse(_Resp):
    mission_id: str
    stage: str
    generated_at: str = ""
    needs_human_review: bool = False
    mission_briefing: Dict[str, Any] = Field(default_factory=dict)
    confidence_scores: Dict[str, float] = Field(default_factory=dict)
    handoffs: List[Dict[str, Any]] = Field(default_factory=list)


class TelemetryResponse(_Resp):
    mission_id: str
    count: int = 0
    environment: Dict[str, Any] = Field(default_factory=dict)
    telemetry: List[Dict[str, Any]] = Field(default_factory=list)


class ReplayResponse(_Resp):
    mission_id: str
    format: str = "terra-mission-replay/v1"
    seed: Optional[int] = None
    scenario: str = ""
    events: List[Dict[str, Any]] = Field(default_factory=list)


class ErrorResponse(_Resp):
    detail: str = ""
    code: str = ""
    timestamp: str = Field(default_factory=lambda: _now())
    status_code: int = 0


def _now() -> str:
    from backend.core.mission_state import utc_now_iso

    return utc_now_iso()