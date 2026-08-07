"""Unit tests: MissionStateManager (create / read / update / validate / reset / snapshot / restore)
and the permission matrix."""

import pytest

from backend.core.mission_state import MissionState, StateValidationError
from backend.core.permissions import (
    KNOWLEDGE_RETRIEVAL,
    ORCHESTRATOR,
    RISK_ASSESSMENT,
    SIMULATION,
    SYSTEM,
    VICTIM_LOCALIZATION,
    StatePermissionError,
)
from backend.core.state_manager import MissionStateManager


def test_create_sets_identity_and_stage():
    mgr = MissionStateManager()
    state = mgr.create("incident", environment_id="scenario_collapse_rain")
    assert state.metadata.mission_id.startswith("MISS-")
    assert state.metadata.environment_id == "scenario_collapse_rain"
    assert state.status.stage == "initialized"
    assert state.status.phase == "ingest"
    assert state.status.is_running is True
    types = {e.type for e in state.timeline}
    assert "mission_start" in types
    assert "stage_change" in types


def test_create_requires_incident_text():
    mgr = MissionStateManager()
    with pytest.raises(StateValidationError):
        mgr.create("  ")


def test_mission_ids_are_unique():
    mgr = MissionStateManager()
    first = mgr.create("a").metadata.mission_id
    mgr.reset()
    second = mgr.create("b").metadata.mission_id
    assert first != second


def test_read_permissions_enforced():
    mgr = MissionStateManager()
    mgr.create("x")
    mgr.append_evidence(ORCHESTRATOR, "sensor:north_wall", {}, 0.5)

    evidence = mgr.read(RISK_ASSESSMENT, "evidence")
    assert evidence[0]["source"] == "sensor:north_wall"
    with pytest.raises(StatePermissionError):
        mgr.read(RISK_ASSESSMENT, "tasks")


def test_read_returns_deep_copy():
    mgr = MissionStateManager()
    mgr.create("x")
    view = mgr.read(ORCHESTRATOR)
    view["risk_report"] = {"hacked": True}
    assert mgr.state.risk_report == {}


def test_update_permission_denied_for_unowned_report():
    mgr = MissionStateManager()
    mgr.create("x")
    with pytest.raises(StatePermissionError):
        mgr.update(VICTIM_LOCALIZATION, "risk_report", {"likelihood": "HIGH"})


def test_set_report_writes_owned_section():
    mgr = MissionStateManager()
    mgr.create("x")
    mgr.set_report(KNOWLEDGE_RETRIEVAL, {"recommendations": ["do the thing"]})
    assert mgr.state.knowledge_results["recommendations"] == ["do the thing"]


def test_set_report_rejects_non_report_component():
    mgr = MissionStateManager()
    mgr.create("x")
    with pytest.raises(StatePermissionError):
        mgr.set_report(SIMULATION, {"recommendations": []})


def test_update_confidence_enforces_bounds():
    mgr = MissionStateManager()
    mgr.create("x")
    mgr.set_confidence(KNOWLEDGE_RETRIEVAL, "knowledge_retrieval", 0.8)
    with pytest.raises(StateValidationError):
        mgr.set_confidence(KNOWLEDGE_RETRIEVAL, "knowledge_retrieval", 1.2)


def test_update_append_only_field_rejected():
    mgr = MissionStateManager()
    mgr.create("x")
    with pytest.raises(StateValidationError):
        mgr.update(ORCHESTRATOR, "telemetry", [])


def test_append_telemetry_and_evidence_via_manager(manager):
    mgr = manager
    mission = mgr.state.metadata.mission_id
    mgr.append_telemetry(
        ORCHESTRATOR,
        {"packet_id": "TELE-1", "mission_id": mission, "zone": "north_wall",
         "sensor_type": "tilt", "metric": "tilt_deg", "value": 4.0, "unit": "deg",
         "confidence": 0.9, "source": "simulated"},
    )
    mgr.append_evidence(ORCHESTRATOR, "sensor:basement", {"thermal": "heat"}, 0.85)
    assert len(mgr.state.telemetry) == 1
    assert len(mgr.state.evidence) == 1
    assert mgr.validate() == []


def test_simulation_writes_telemetry_but_not_reports(manager):
    mgr = manager
    mission = mgr.state.metadata.mission_id
    mgr.append_telemetry(
        SIMULATION,
        {"packet_id": "TELE-1", "mission_id": mission, "zone": "basement",
         "sensor_type": "thermal", "metric": "temp_c", "value": 36.0, "unit": "c",
         "confidence": 0.8, "source": "simulated"},
    )
    with pytest.raises(StatePermissionError):
        mgr.set_report(SIMULATION, {"recommendations": []})


def test_add_task_dedupe(manager):
    mgr = manager
    mgr.add_task(RISK_ASSESSMENT, "Evacuate structure", priority="HIGH")
    with pytest.raises(StateValidationError):
        mgr.add_task(RISK_ASSESSMENT, "Evacuate structure", priority="HIGH")


def test_hitl_raise_and_resolve_via_manager(manager):
    mgr = manager
    mgr.raise_hitl(
        RISK_ASSESSMENT,
        {"id": "DEC-1", "request_type": "confirm", "summary": "Approve?", "related_agent": "risk_assessment"},
    )
    assert mgr.state.human_decisions[0].status == "pending"
    record = mgr.resolve_hitl(ORCHESTRATOR, "DEC-1", "confirmed", notes="ok")
    assert record.status == "confirmed"
    assert mgr.validate() == []


def test_reset_returns_fresh_state(manager):
    mgr = manager
    mgr.state.risk_report = {"likelihood": "HIGH"}
    mgr.reset()
    fresh = mgr.state
    assert fresh.risk_report == {}
    assert fresh.status.stage == "created"
    assert fresh.metadata.mission_id == ""
    assert fresh.timeline == []


def test_reset_requires_system_or_controller(manager):
    mgr = manager
    with pytest.raises(StatePermissionError):
        mgr.reset(component=RISK_ASSESSMENT)


def test_validate_reports_inconsistency(manager):
    mgr = manager
    mgr.state.status.phase = "done"  # mismatched phase for stage "initialized"
    problems = mgr.validate()
    assert any("phase" in p for p in problems)


def test_snapshot_and_restore_via_manager(manager):
    mgr = manager
    mgr.state.risk_report = {"likelihood": "MEDIUM"}
    mgr.add_timeline(ORCHESTRATOR, {"type": "agent_complete", "message": "done"})
    snap = mgr.snapshot()

    mgr.state.risk_report = {}
    mgr.restore(SYSTEM, snap)

    assert mgr.state.risk_report == {"likelihood": "MEDIUM"}
    assert len(mgr.state.timeline) == len(snap["timeline"])


def test_manager_state_is_live_mission_state():
    mgr = MissionStateManager()
    assert isinstance(mgr.get_state(), MissionState)
    assert mgr.get_state() is mgr.state
