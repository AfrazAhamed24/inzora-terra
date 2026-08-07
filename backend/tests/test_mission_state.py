"""Unit tests: MissionState creation, mutation, append-only rules, and field validation."""

import re

import pytest
from pydantic import ValidationError

from backend.core.mission_state import (
    AppendOnlyError,
    MissionState,
    StateValidationError,
    utc_now_iso,
)


def test_default_construction_matches_spec(state):
    assert state.metadata.version == "1.0"
    assert state.status.stage == "created"
    assert state.status.phase == "setup"
    assert state.status.is_running is False
    assert state.status.error_count == 0
    assert state.status.last_error is None
    assert state.telemetry == []
    assert state.environment.sensors == {}
    assert state.evidence == []
    assert state.tasks == []
    assert state.agent_outputs == []
    assert state.risk_report == {}
    assert state.victim_map == {}
    assert state.resource_allocation == {}
    assert state.knowledge_results == {}
    assert state.confidence_scores == {}
    assert state.timeline == []
    assert state.human_decisions == []
    assert state.logs == []
    assert state.summary is None
    assert state.assistant_context.session_id == ""


def test_metadata_uses_utc_z_timestamps(state):
    assert state.metadata.started_at.endswith("Z")
    assert state.metadata.updated_at.endswith("Z")
    assert utc_now_iso().endswith("Z")


def test_mission_id_format_validated():
    with pytest.raises(ValidationError):
        MissionState.from_dict({"metadata": {"mission_id": "bad-id"}})
    valid = MissionState.from_dict({"metadata": {"mission_id": "MISS-20260815-001"}})
    assert valid.metadata.mission_id == "MISS-20260815-001"


def test_append_evidence(state):
    state.append_evidence("sensor:north_wall", {"tilt_deg": 4}, 0.9)
    assert len(state.evidence) == 1
    entry = state.evidence[0]
    assert entry.source == "sensor:north_wall"
    assert entry.data == {"tilt_deg": 4}
    assert entry.confidence == 0.9
    assert entry.timestamp.endswith("Z")


def test_append_evidence_rejects_out_of_range_confidence(state):
    with pytest.raises(ValidationError):
        state.append_evidence("sensor:north_wall", {}, 1.5)
    with pytest.raises(ValidationError):
        state.append_evidence("sensor:north_wall", {}, -0.1)


def test_telemetry_packet_confidence_bounds(state):
    with pytest.raises(ValidationError):
        state.append_telemetry(
            {
                "packet_id": "TELE-1",
                "mission_id": "MISS-20260815-001",
                "zone": "basement",
                "sensor_type": "thermal",
                "metric": "temp_c",
                "value": 36.5,
                "unit": "c",
                "confidence": 1.1,
                "source": "simulated",
            }
        )


def test_telemetry_packet_required_fields(state):
    with pytest.raises(ValidationError):
        state.append_telemetry({"packet_id": "TELE-1"})


def test_append_only_enforced_on_telemetry(state):
    state.append_telemetry(
        {
            "packet_id": "TELE-1",
            "mission_id": "MISS-20260815-001",
            "zone": "north_wall",
            "sensor_type": "tilt",
            "metric": "tilt_deg",
            "value": 4.0,
            "unit": "deg",
            "confidence": 0.9,
            "source": "simulated",
        }
    )
    with pytest.raises(AppendOnlyError):
        state.telemetry.pop()
    with pytest.raises(AppendOnlyError):
        state.telemetry[0] = None
    with pytest.raises(AppendOnlyError):
        del state.telemetry[0]
    with pytest.raises(AppendOnlyError):
        state.telemetry.clear()


def test_append_only_enforced_on_evidence(state):
    state.append_evidence("witness:report_001", {"persons": 3}, 0.6)
    with pytest.raises(AppendOnlyError):
        state.evidence.remove(state.evidence[0])
    with pytest.raises(AppendOnlyError):
        state.evidence.insert(0, object())


def test_append_many_bulk(state):
    state.append_telemetry_many(
        [
            {
                "packet_id": "TELE-1",
                "mission_id": "MISS-20260815-001",
                "zone": "north_wall",
                "sensor_type": "tilt",
                "metric": "tilt_deg",
                "value": 4.0,
                "unit": "deg",
                "confidence": 0.9,
                "source": "simulated",
            },
            {
                "packet_id": "TELE-2",
                "mission_id": "MISS-20260815-001",
                "zone": "basement",
                "sensor_type": "gpr",
                "metric": "signal_strength",
                "value": 12.0,
                "unit": "raw",
                "confidence": 0.8,
                "source": "simulated",
            },
        ]
    )
    assert len(state.telemetry) == 2


def test_owned_reports_are_plain_dicts(state):
    state.risk_report = {"likelihood": "HIGH"}
    state.victim_map = {"zones": []}
    state.resource_allocation = {"assignments": []}
    state.knowledge_results = {"recommendations": []}
    assert state.risk_report["likelihood"] == "HIGH"


def test_add_task_and_update_confidence(state):
    state.add_task("Evacuate structure", priority="HIGH", requires_confirmation=True)
    task = state.tasks[0]
    assert task.id == "task_1"
    assert task.priority == "HIGH"
    assert task.requires_confirmation is True
    assert task.confirmed is None
    state.update_confidence("risk_assessment", 0.9)
    assert state.confidence_scores["risk_assessment"] == 0.9


def test_update_confidence_rejects_out_of_range(state):
    with pytest.raises(StateValidationError):
        state.update_confidence("risk_assessment", 1.5)
    with pytest.raises(StateValidationError):
        state.update_confidence("risk_assessment", -0.1)


def test_task_priority_validated(state):
    with pytest.raises(ValidationError):
        state.add_task("bad", priority="URGENT")


def test_hitl_decision_round_trip(state):
    state.raise_decision(
        {
            "id": "DEC-1",
            "request_type": "confirm",
            "summary": "Approve evacuation?",
            "related_agent": "risk_assessment",
        }
    )
    assert state.human_decisions[0].status == "pending"
    resolved = state.resolve_decision("DEC-1", "confirmed", notes="approved")
    assert resolved.status == "confirmed"
    assert resolved.resolved_by == "supervisor"
    assert resolved.resolved_at is not None
    assert resolved.decision_notes == "approved"


def test_resolve_unknown_or_non_pending_decision(state):
    with pytest.raises(StateValidationError):
        state.resolve_decision("DEC-missing", "confirmed")
    state.raise_decision({"id": "DEC-1", "request_type": "verify", "summary": "x"})
    state.resolve_decision("DEC-1", "confirmed")
    with pytest.raises(StateValidationError):
        state.resolve_decision("DEC-1", "confirmed")


def test_logs_bounded_ring_buffer(state):
    for i in range(1100):
        state.append_log({"id": f"LOG-{i}", "message": f"m{i}"})
    assert len(state.logs) == 1000
    assert state.logs[0].id == "LOG-100"
    assert state.logs[-1].id == "LOG-1099"


def test_updated_at_refreshed_on_mutation(state):
    before = state.metadata.updated_at
    state.append_evidence("sensor:north_wall", {}, 0.5)
    assert state.metadata.updated_at >= before


def test_to_dict_is_nested_and_stable_ordered(state):
    state.metadata.mission_id = "MISS-20260815-001"
    state.status.stage = "initialized"
    state.status.phase = "ingest"
    dumped = state.to_dict()
    assert list(dumped.keys())[:2] == ["metadata", "status"]
    assert "mission_id" not in dumped  # nested, not flat
    assert dumped["metadata"]["mission_id"] == "MISS-20260815-001"
    assert dumped["status"]["stage"] == "initialized"
    assert re.fullmatch(r"MISS-\d{8}-\d{3}", dumped["metadata"]["mission_id"])
