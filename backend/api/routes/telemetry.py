"""Telemetry endpoints: latest snapshot + live SSE stream (API_SPEC §5).

The SSE stream is a thin pass-through over the Mission Engine's own telemetry history: it tails
``MissionStateManager`` via ``TelemetryService.tail`` and re-frames each record as an SSE event.
The API does **not** run the simulation or mutate state; the running MissionLoop does.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from backend.api.dependencies import (
    get_mission_service,
    get_stream_service,
    get_telemetry_service,
)
from backend.api.schemas.response import TelemetryResponse
from backend.api.services.mission_service import MissionService
from backend.api.services.stream_service import MissionStreamService
from backend.api.services.telemetry_service import TelemetryService, sse_encode

router = APIRouter(prefix="/missions/{mission_id}", tags=["telemetry"])


@router.get("/telemetry", response_model=TelemetryResponse)
async def get_telemetry(
    mission_id: str,
    telemetry_service: TelemetryService = Depends(get_telemetry_service),
) -> TelemetryResponse:
    data = telemetry_service.latest(mission_id)
    return TelemetryResponse(
        mission_id=mission_id,
        count=data["count"],
        environment=data["environment"],
        telemetry=data["telemetry"],
    )


@router.get("/stream")
async def stream_mission(
    mission_id: str,
    missions: MissionService = Depends(get_mission_service),
    stream: MissionStreamService = Depends(get_stream_service),
) -> StreamingResponse:
    """SSE stream of live mission data (status, telemetry, agent, timeline, summary, decisions).

    Emits one ``data:`` frame per new record as the running MissionLoop writes to state. The
    generator is cancelled automatically when the client disconnects.
    """

    async def generate():
        yield sse_encode({"type": "connected", "mission_id": mission_id})
        async for record in stream.events(mission_id):
            yield sse_encode(record)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )