"""Replay endpoints (API_SPEC §6): expose the recorded mission artifact."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from backend.api.dependencies import get_replay_service
from backend.api.schemas.response import ReplayResponse
from backend.api.services.replay_service import ReplayService

router = APIRouter(prefix="/missions/{mission_id}", tags=["replay"])


@router.get("/replay", response_model=ReplayResponse)
async def get_replay(
    mission_id: str,
    replay: ReplayService = Depends(get_replay_service),
) -> ReplayResponse:
    snap = replay.replay(mission_id)
    return ReplayResponse(
        mission_id=mission_id,
        format=snap["format"],
        seed=snap.get("seed"),
        scenario=snap.get("scenario", ""),
        events=snap.get("events", []),
    )