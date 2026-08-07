"""Unit tests: JSON serialization/deserialization and snapshot/restore (MISSION_STATE §7)."""

import pytest

from backend.core.mission_state import MissionState

SPEC_SAMPLE = {
    "metadata": {
        "mission_id": "MISS-2026-0815-001",
        "incident_text": "Two-floor building collapsed after heavy rainfall. 3 missing persons.",
        "started_at": "2026-08-15T08:00:00Z",
        "updated_at": "2026-08-15T08:00:05Z",
        "environment_id": "scenario_collapse_rain",
        "version": "1.0",
    },
    "status": {"stage": "briefing_ready", "phase": "report", "is_running": False,
               "error_count": 0, "last_error": None},
    "telemetry": [
        {"packet_id": "TELE-1", "mission_id": "MISS-2026-0815-001",
         "ts": "2026-08-15T08:00:01Z", "zone": "north_wall", "sensor_type": "tilt",
         "metric": "tilt_deg", "value": 4.0, "unit": "deg", "confidence": 0.9,
         "source": "simulated"}
    ],
    "environment": {
        "sensors": {"north_wall": {"tilt_deg": 4, "trend": "increasing"}},
        "weather": {"rain": "heavy", "forecast": "more rain expected in 2 hours",
                    "aftershock_probability": "low"},
        "building": {"age_years": 20, "material": "concrete frame", "floors": 2,
                     "occupancy": "residential", "basement": True},
    },
    "risk_report": {"likelihood": "HIGH", "risk_score": 0.9,
                    "hazards": ["Tilt angle 4 degrees exceeds stability threshold"],
                    "recommendation": "Evacuate immediately. Do not enter structure.",
                    "confidence": 0.92, "trend": "increasing", "cycle_id": "CYC-2"},
    "confidence_scores": {"risk_assessment": 0.92, "victim_localization": 0.78,
                          "resource_coordination": 0.88, "knowledge_retrieval": 0.7},
    "summary": {"mission_briefing": {"incident_id": "MISS-2026-0815-001",
                                     "overall_risk": "HIGH",
                                     "priority_zones": ["B2"],
                                     "total_victims_estimated": 2,
                                     "immediate_actions": ["Evacuate all non-essential personnel immediately"],
                                     "resource_status": "Deployed",
                                     "next_update_in": "15 minutes"},
                "needs_human_review": True,
                "generated_at": "2026-08-15T08:00:04Z"},
}


def test_json_round_trip(manager):
    state = manager.state
    state.risk_report = {"likelihood": "HIGH", "risk_score": 0.9}
    state.update_confidence("risk_assessment", 0.92)

    payload = state.to_json()
    restored = MissionState.from_json(payload)

    assert restored.to_dict() == state.to_dict()


def test_from_dict_spec_sample():
    state = MissionState.from_dict(SPEC_SAMPLE)
    assert state.metadata.mission_id == "MISS-2026-0815-001"
    assert state.status.stage == "briefing_ready"
    assert state.risk_report["likelihood"] == "HIGH"
    assert len(state.telemetry) == 1
    assert state.telemetry[0].metric == "tilt_deg"
    assert state.summary is not None
    assert state.summary.needs_human_review is True


def test_from_dict_rejects_unknown_field():
    with pytest.raises(Exception):
        MissionState.from_dict({"metadata": {"mission_id": "MISS-20260815-001"}, "bogus": 1})


def test_snapshot_is_deep_copy(manager):
    state = manager.state
    state.append_evidence("sensor:north_wall", {"tilt_deg": 4}, 0.9)
    snap = state.snapshot()

    state.evidence._replace([])  # sanctioned internal replace to mutate original
    state.risk_report = {"changed": True}

    assert snap["evidence"] != []
    assert "changed" not in snap["risk_report"]
    assert snap["evidence"][0]["source"] == "sensor:north_wall"


def test_restore_preserves_instance_identity(manager):
    state = manager.state
    original_id = id(state)
    state.risk_report = {"likelihood": "HIGH"}
    snap = state.snapshot()

    state.risk_report = {}
    state.status.stage = "completed"
    restored = state.restore(snap)

    assert id(restored) == original_id
    assert restored is state
    assert state.risk_report["likelihood"] == "HIGH"
    assert state.status.stage == "initialized"


def test_restore_pydantic_rejects_invalid_payload(manager):
    state = manager.state
    bad = state.snapshot()
    bad["telemetry"] = [
        {"packet_id": "TELE-1", "mission_id": "MISS-20260815-001", "zone": "z",
         "sensor_type": "tilt", "metric": "tilt_deg", "value": 1.0, "unit": "deg",
         "confidence": 2.0, "source": "simulated"}
    ]
    with pytest.raises(Exception):
        state.restore(bad)


def test_manager_restore_rejects_inconsistent_snapshot(manager):
    state = manager.state
    bad = state.snapshot()
    bad["status"] = {"stage": "briefing_ready", "phase": "ingest", "is_running": False,
                     "error_count": 0, "last_error": None}  # phase does not match stage
    with pytest.raises(Exception):
        manager.restore("system", bad)


def test_manager_snapshot_restore_round_trip(manager):
    state = manager.state
    state.risk_report = {"likelihood": "MEDIUM"}
    state.append_agent_output(
        {
            "agent_name": "risk_assessment",
            "cycle_id": "CYC-1",
            "output": {"likelihood": "MEDIUM"},
            "confidence": 0.7,
            "status": "ok",
        }
    )
    snap = manager.snapshot()
    manager.restore("system", snap)
    assert manager.state.risk_report == {"likelihood": "MEDIUM"}
    assert len(manager.state.agent_outputs) == 1
    assert manager.validate() == []


def test_to_dict_deterministic_order():
    a = MissionState().to_dict()
    b = MissionState().to_dict()
    assert list(a.keys()) == list(b.keys())


def test_dump_contains_all_top_level_sections():
    dumped = MissionState().to_dict()
    for section in (
        "metadata", "status", "telemetry", "environment", "evidence", "tasks",
        "agent_outputs", "risk_report", "victim_map", "resource_allocation",
        "knowledge_results", "confidence_scores", "timeline", "human_decisions",
        "logs", "summary", "assistant_context",
    ):
        assert section in dumped
