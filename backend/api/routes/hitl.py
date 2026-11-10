"""Human-in-the-Loop decision endpoints (Phase 2B).

The Mission Engine parks at ``awaiting_confirmation`` until a supervisor resolves the
pending decisions. These routes expose that gate: list what is pending and approve or
override a decision. Route handlers stay thin — all logic lives in ``HitlGate``.
"""

from __future__ import annotations

from typing import Any, Dict, List

from fastapi import APIRouter, Depends

from backend.api.dependencies import get_mission_service, require_operator
from backend.api.exceptions import ApiError
from backend.api.schemas.request import DecisionResolveRequest
from backend.api.services.mission_service import MissionService
from backend.orchestration.hitl import HitlError

router = APIRouter(prefix="/missions/{mission_id}/decisions", tags=["hitl"])


@router.get("")
def list_decisions(
    mission_id: str,
    missions: MissionService = Depends(get_mission_service),
) -> List[Dict[str, Any]]:
    """Return the decisions currently awaiting human resolution."""
    session = missions.get(mission_id)
    return session.hitl.pending() if session.hitl else []


@router.post("/{decision_id}/resolve")
def resolve_decision(
    mission_id: str,
    decision_id: str,
    body: DecisionResolveRequest,
    _operator: None = Depends(require_operator),
    missions: MissionService = Depends(get_mission_service),
) -> Dict[str, Any]:
    """Resolve a pending decision as an authorized operator."""
    session = missions.get(mission_id)
    if session.hitl is None:
        raise ApiError("HITL gate is not available for this mission", code="hitl_unavailable")
    try:
        if body.action == "approve":
            return session.hitl.approve(
                decision_id, resolved_by="operator", notes=body.notes
            )
        return session.hitl.override(
            decision_id, resolved_by="operator", notes=body.notes
        )
    except HitlError as exc:
        raise ApiError(str(exc), code="hitl_resolution_error") from exc
