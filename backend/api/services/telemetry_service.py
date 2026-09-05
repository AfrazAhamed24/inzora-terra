"""TelemetryService: read-only projection of the live telemetry stream.

Reads through ``MissionService``/``MissionStateManager`` — the API never holds its own copy of
the stream. Live updates are consumed by the SSE endpoint, which tails the manager's append-only
telemetry history via ``asyncio`` polling instead of re-implementing the loop.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any, AsyncIterator, Dict

from backend.api.services.mission_service import MissionService


class TelemetryService:
    """Tail the append-only telemetry history of a mission for streaming consumers."""

    def __init__(self, missions: MissionService):
        self._missions = missions

    def latest(self, mission_id: str, *, limit: int = 0) -> Dict[str, Any]:
        """Return the current telemetry batch (+ environment) as JSON-ready data."""
        data = self._missions.telemetry(mission_id)
        if limit and limit > 0:
            data["telemetry"] = data["telemetry"][-limit:]
        data["count"] = len(data["telemetry"])
        return data

    async def tail(self, mission_id: str) -> AsyncIterator[Dict[str, Any]]:
        """Yield every new telemetry packet as it is appended to the manager.

        Non-invasive: the MissionLoop keeps writing through the manager; this generator simply
        observes the append-only list (index cursor) at a small interval. Cancelled when the
        client disconnects.
        """
        seen = 0
        while True:
            session = self._missions.get(mission_id)
            state = session.manager.state
            current = len(state.telemetry)
            if current > seen:
                for packet in state.telemetry[seen:current]:
                    yield {
                        "type": "telemetry",
                        "packet": packet.model_dump(),
                    }
                seen = current
            await asyncio.sleep(0.1)


def sse_encode(event: Dict[str, Any]) -> str:
    """Serialize one dict as an SSE ``data:`` frame (event type included in payload)."""
    return f"data: {json.dumps(event, separators=(',', ':'))}\n\n"