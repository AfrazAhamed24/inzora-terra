"""Mission CRUD + lifecycle endpoints (API_SPEC §2).

Route handlers are one-liners that delegate to ``MissionService`` — **no business logic lives in
routes**. Responses are projections of the live ``MissionState`` read through the manager.
"""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Body, Depends, status

from backend.api.dependencies import get_mission_service, require_operator
from backend.api.schemas.request import MissionCreateRequest, MissionStartRequest
from backend.api.schemas.response import (
    MissionListResponse,
    MissionResponse,
    MissionSummaryResponse,
)
from backend.api.services.mission_service import MissionService

router = APIRouter(prefix="/missions", tags=["missions"])


@router.post("", response_model=MissionResponse, status_code=status.HTTP_201_CREATED)
async def create_mission(
    body: MissionCreateRequest,
    _operator: None = Depends(require_operator),
    missions: MissionService = Depends(get_mission_service),
) -> MissionResponse:
    session = await missions.create(
        body.incident_text,
        mission_name=body.mission_name or "",
        environment=body.environment_id or "",
    )
    return MissionResponse(**session.to_dict())


@router.get("", response_model=MissionListResponse)
async def list_missions(
    missions: MissionService = Depends(get_mission_service),
) -> MissionListResponse:
    sessions = missions.list()
    return MissionListResponse(
        missions=[MissionResponse(**s.to_dict()) for s in sessions],
        count=len(sessions),
    )


@router.get("/{mission_id}", response_model=MissionResponse)
async def get_mission(
    mission_id: str,
    missions: MissionService = Depends(get_mission_service),
) -> MissionResponse:
    return MissionResponse(**missions.get(mission_id).to_dict())


@router.post("/{mission_id}/start", response_model=MissionResponse)
async def start_mission(
    mission_id: str,
    body: Optional[MissionStartRequest] = Body(default=None),
    _operator: None = Depends(require_operator),
    missions: MissionService = Depends(get_mission_service),
) -> MissionResponse:
    session = await missions.start(mission_id)
    return MissionResponse(**session.to_dict())


@router.post("/{mission_id}/stop", response_model=MissionResponse)
async def stop_mission(
    mission_id: str,
    _operator: None = Depends(require_operator),
    missions: MissionService = Depends(get_mission_service),
) -> MissionResponse:
    session = missions.stop(mission_id)
    return MissionResponse(**session.to_dict())


@router.get("/{mission_id}/summary", response_model=MissionSummaryResponse)
async def mission_summary(
    mission_id: str,
    missions: MissionService = Depends(get_mission_service),
) -> MissionSummaryResponse:
    data = missions.state(mission_id)
    summary = data.get("summary") or {}
    return MissionSummaryResponse(
        mission_id=mission_id,
        stage=data["status"]["stage"],
        generated_at=summary.get("generated_at", ""),
        needs_human_review=bool(summary.get("needs_human_review", False)),
        mission_briefing=summary.get("mission_briefing", {}),
        confidence_scores=summary.get("confidence_scores", {}),
        handoffs=summary.get("handoffs", []),
    )


@router.get("/{mission_id}/timeline")
async def mission_timeline(
    mission_id: str,
    missions: MissionService = Depends(get_mission_service),
) -> List[dict]:
    return missions.timeline(mission_id)
