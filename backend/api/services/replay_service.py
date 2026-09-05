"""ReplayService: exposes the recorded replay artifact of a completed mission.

The recorder is written by the MissionLoop itself (Phase 1C); the API only retrieves the
snapshot produced by the engine — no replay logic is re-implemented here.
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from backend.api.exceptions import MissionNotFoundError
from backend.api.services.mission_service import MissionService


class ReplayService:
    """Read-only access to per-mission replay artifacts."""

    def __init__(self, missions: MissionService):
        self._missions = missions

    def replay(self, mission_id: str) -> Dict[str, Any]:
        session = self._missions.get(mission_id)
        if session.recorder is None:
            raise MissionNotFoundError(f"no replay recording for mission {mission_id}")
        return session.recorder.snapshot()