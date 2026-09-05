"""Briefing generator: aggregates owned reports + confidence into the mission summary.

Implements ORCHESTRATOR.md §7 and MISSION_STATE.md §4.12. ``BriefingGenerator`` is the L3 node
of the dependency graph: it reads the owned reports (plus ``confidence_scores``) from the live
state and produces a ``MissionSummary``, which the executor persists via
``MissionStateManager.set_summary``.
"""

from __future__ import annotations

from typing import Any, Dict, List

from backend.core.mission_state import MissionState, MissionSummary, utc_now_iso
from backend.orchestration.context import ExecutionContext

__all__ = ["BriefingGenerator", "aggregate_confidence"]

_SEVERITY = {"LOW": 0, "MEDIUM": 1, "HIGH": 2, "CRITICAL": 3}


def aggregate_confidence(state: MissionState) -> float:
    """Mean of all per-agent confidence scores (0.0 when none recorded)."""
    scores = [
        s for s in state.confidence_scores.values()
        if isinstance(s, (int, float)) and not isinstance(s, bool)
    ]
    if not scores:
        return 0.0
    return round(sum(scores) / len(scores), 3)


def _worst_risk(state: MissionState) -> str:
    """Worst risk likelihood across the risk report and victim zone priorities."""
    candidates: List[str] = []
    likelihood = state.risk_report.get("likelihood")
    if likelihood:
        candidates.append(str(likelihood).upper())
    for zone in state.victim_map.get("zones", []):
        priority = str(zone.get("priority", "")).upper()
        if priority in _SEVERITY:
            candidates.append(priority)
    if not candidates:
        return "LOW"
    return max(candidates, key=lambda c: _SEVERITY.get(c, 0))


def collect_handoffs(state: MissionState) -> List[Dict[str, Any]]:
    """Aggregate ``next_handoff`` metadata declared by completed agents (AGENT_CONTRACT.md).

    Each entry links the producing agent, its cycle, and the declared handoff target so the
    briefing surfaces the orchestration flow without changing mission behaviour.
    """
    handoffs: List[Dict[str, Any]] = []
    for output in state.agent_outputs:
        payload = output.output
        if isinstance(payload, dict) and isinstance(payload.get("next_handoff"), dict):
            handoffs.append(
                {
                    "agent": output.agent_name,
                    "cycle_id": output.cycle_id,
                    "next_handoff": payload["next_handoff"],
                }
            )
    return handoffs


class BriefingGenerator:
    """Produces the mission briefing (``MissionSummary``) from the mission state.

    Used as a node handler by the GraphExecutor: ``await generator(ctx)`` returns the summary as
    a plain dict (JSON-ready, accepted by ``MissionSummary``).
    """

    async def __call__(self, context: ExecutionContext) -> Dict[str, Any]:
        return self.build(context.state)

    def build(self, state: MissionState) -> Dict[str, Any]:
        victim_map = state.victim_map
        priority_zones = [
            z["zone"] for z in victim_map.get("zones", [])
            if z.get("priority") == "HIGH"
        ]
        knowledge = state.knowledge_results
        resources = state.resource_allocation
        rescue = state.rescue_guidance
        pending = sum(1 for d in state.human_decisions if d.status == "pending")

        mission_briefing = {
            "incident_id": state.metadata.mission_id or "INC-2026-001",
            "overall_risk": _worst_risk(state),
            "priority_zones": priority_zones,
            "total_victims_estimated": victim_map.get("total_victims_estimated", 0),
            "immediate_actions": knowledge.get("recommendations", [])[:3],
            "resource_status": "Deployed" if resources.get("assignments") else "Pending",
            "next_update_in": "15 minutes",
            "overall_confidence": aggregate_confidence(state),
            "rescue_guidance": {
                "summary": rescue.get("summary", ""),
                "entry_clearance": rescue.get("entry_clearance", "HOLD"),
                "priority_sequence": rescue.get("priority_sequence", []),
                "objectives": rescue.get("objectives", []),
                "extraction_guidance": rescue.get("extraction_guidance", []),
                "safety_constraints": rescue.get("safety_constraints", []),
                "triage_notes": rescue.get("triage_notes", []),
                "comms_guidance": rescue.get("comms_guidance", ""),
            },
        }
        return MissionSummary(
            mission_briefing=mission_briefing,
            confidence_scores=dict(state.confidence_scores),
            needs_human_review=pending > 0,
            handoffs=collect_handoffs(state),
            generated_at=utc_now_iso(),
        ).model_dump()
