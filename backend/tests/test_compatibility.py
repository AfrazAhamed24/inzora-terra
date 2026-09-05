"""Unit tests: TERRAState compatibility layer (MIGRATION_PLAN Step 2).

These prove the existing agents / orchestrator / CLI keep working against the new MissionState.
"""

import asyncio
import re

from backend.core.gop import TERRAState
from backend.core.mission_state import MissionState


def test_terra_state_is_mission_state_alias():
    assert TERRAState is MissionState


def test_terra_state_construction():
    state = TERRAState()
    assert isinstance(state, MissionState)


def test_legacy_field_accessors():
    state = TERRAState()
    state.incident_id = "MISS-20260815-001"
    state.incident_text = "building collapsed"
    assert state.incident_id == "MISS-20260815-001"
    assert state.incident_text == "building collapsed"
    assert state.metadata.mission_id == "MISS-20260815-001"
    assert state.metadata.incident_text == "building collapsed"


def test_legacy_stage_assignment():
    state = TERRAState()
    state.incident_text = "x"
    state.stage = "initialized"
    assert state.stage == "initialized"
    assert state.status.stage == "initialized"


def test_legacy_pending_confirmations_accessor():
    state = TERRAState()
    state.raise_decision({"id": "DEC-1", "request_type": "confirm", "summary": "s"})
    state.raise_decision({"id": "DEC-2", "request_type": "verify", "summary": "v"})
    assert len(state.pending_confirmations) == 2
    state.resolve_decision("DEC-1", "confirmed")
    assert len(state.pending_confirmations) == 1
    assert state.pending_confirmations[0]["id"] == "DEC-2"


def test_legacy_pending_confirmations_setter():
    state = TERRAState()
    state.pending_confirmations = [
        {"id": "DEC-1", "request_type": "confirm", "summary": "s"}
    ]
    assert state.human_decisions[0].id == "DEC-1"
    assert state.human_decisions[0].status == "pending"


def test_legacy_helper_methods():
    state = TERRAState()
    state.add_evidence("sensor:north_wall", {"tilt_deg": 4}, 0.9)
    state.add_task("Evacuate structure", priority="HIGH", requires_confirmation=True)
    state.update_confidence("risk_assessment", 0.9)
    assert len(state.evidence) == 1
    assert state.tasks[0].description == "Evacuate structure"
    assert state.confidence_scores["risk_assessment"] == 0.9


def test_to_dict_legacy_call_still_available():
    state = TERRAState()
    dumped = state.to_dict()
    assert isinstance(dumped, dict)
    assert "metadata" in dumped and "status" in dumped


def test_cli_flow_runs_unchanged():
    """Replicates backend/run.py's full pipeline against TERRAState to prove no regression."""

    from backend.core.tools import get_building_info, get_sensor_data, get_weather
    from backend.orchestration.orchestrator import Orchestrator

    async def run():
        state = TERRAState()
        state.incident_text = "Two-floor building collapsed after heavy rainfall. 3 missing persons."
        state.stage = "initialized"

        state.add_evidence("sensor:north_wall", get_sensor_data("north_wall"), 0.9)
        state.add_evidence(
            "sensor:basement",
            {"tilt_deg": 2, "trend": "stable", "thermal": "heat signature detected in basement",
             "gpr": "cracks at basement level"},
            0.85,
        )
        state.add_evidence("weather:current", get_weather("current"), 0.85)
        state.add_evidence("building:bld_001", get_building_info("bld_001"), 0.95)
        state.add_evidence(
            "witness:report_001",
            {"source": "neighbor", "last_seen": "basement", "persons": 3},
            0.60,
        )

        orchestrator = Orchestrator()
        orchestrator.state = state
        orchestrator.setup_default_agents()
        briefing = await orchestrator.run(state.incident_text)
        return state, briefing

    state, briefing = asyncio.run(run())

    mb = briefing["mission_briefing"]
    assert mb["overall_risk"] == "HIGH"
    assert mb["total_victims_estimated"] == 3
    assert "B2" in mb["priority_zones"]
    assert state.risk_report["likelihood"] == "HIGH"
    assert state.victim_map["primary_search_zone"] == "B2"
    assert state.rescue_guidance["priority_sequence"]
    # sequential chain: risk(2) + victim(3) + resource(4) + rescue(2) tasks
    assert len(state.tasks) == 11
    assert set(state.confidence_scores.keys()) == {
        "risk_assessment", "victim_localization", "resource_coordination",
        "knowledge_retrieval", "rescue_coordination",
    }
    assert len(briefing["agent_log"]) >= 5


def test_cli_stage_is_spec_canonical_completed():
    state = TERRAState()
    state.incident_text = "x"
    state.stage = "initialized"
    state.add_evidence("sensor:north_wall", {}, 0.5)
    state.stage = "risk_assessed"
    state.stage = "victims_localized"
    state.stage = "resources_allocated"
    state.stage = "knowledge_queried"
    state.stage = "complete"
    assert state.stage == "completed"
    assert state.status.phase == "done"


def test_mission_id_generated_pattern():
    from backend.core.state_manager import MissionStateManager

    mgr = MissionStateManager()
    mission_id = mgr.create("x").metadata.mission_id
    assert re.fullmatch(r"MISS-\d{4}-\d{4}-\d{3}", mission_id)
