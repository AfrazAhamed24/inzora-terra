"""Unit tests: mission lifecycle state machine (MISSION_LIFECYCLE.md)."""

import pytest

from backend.core.lifecycle import (
    STAGES,
    can_transition,
    normalize_stage,
    phase_for,
    rollback,
    set_stage,
)
from backend.core.mission_state import MissionState, StateValidationError


def run_to_completed(state):
    """Advance a state through the full canonical lifecycle to ``completed``."""
    state.metadata.incident_text = "x"
    set_stage(state, "initialized")
    state.append_evidence("sensor:north_wall", {}, 0.5)
    set_stage(state, "evidence_ingested")
    set_stage(state, "risk_assessed")
    set_stage(state, "victims_localized")
    set_stage(state, "resources_allocated")
    set_stage(state, "knowledge_queried")
    set_stage(state, "briefing_ready")
    set_stage(state, "completed")


def test_full_forward_sequence(state):
    state.metadata.incident_text = "collapse"
    set_stage(state, "initialized")
    state.append_evidence("sensor:north_wall", {"tilt_deg": 4}, 0.9)
    set_stage(state, "evidence_ingested")
    set_stage(state, "risk_assessed")
    set_stage(state, "victims_localized")
    set_stage(state, "resources_allocated")
    set_stage(state, "knowledge_queried")
    set_stage(state, "briefing_ready")
    set_stage(state, "completed")

    assert state.status.stage == "completed"
    assert state.status.phase == "done"
    stage_changes = [e for e in state.timeline if e.type == "stage_change"]
    assert len(stage_changes) == 8  # one per real transition


def test_phase_derived_for_every_stage():
    for stage in STAGES:
        assert phase_for(stage) in {"setup", "ingest", "assess", "coordinate", "report",
                                    "review", "done"}


def test_terminal_stages_are_immutable(state):
    run_to_completed(state)
    assert state.status.stage == "completed"
    with pytest.raises(StateValidationError):
        set_stage(state, "initialized")
    with pytest.raises(StateValidationError):
        set_stage(state, "aborted")


def test_legacy_complete_alias_normalizes():
    assert normalize_stage("complete") == "completed"


def test_legacy_alias_via_set_stage(state):
    state.metadata.incident_text = "x"
    set_stage(state, "initialized")
    state.append_evidence("sensor:north_wall", {}, 0.5)
    set_stage(state, "evidence_ingested")
    set_stage(state, "risk_assessed")
    set_stage(state, "knowledge_queried")
    set_stage(state, "complete")
    assert state.status.stage == "completed"


def test_guard_initialized_requires_incident_text(state):
    # incident_text is empty -> transition to initialized must be rejected
    with pytest.raises(StateValidationError):
        set_stage(state, "initialized")


def test_guard_evidence_ingested_requires_evidence(state):
    state.metadata.incident_text = "x"
    set_stage(state, "initialized")
    with pytest.raises(StateValidationError):
        set_stage(state, "evidence_ingested")
    state.append_evidence("sensor:north_wall", {}, 0.5)
    set_stage(state, "evidence_ingested")
    assert state.status.stage == "evidence_ingested"


def test_guard_completed_requires_no_pending_decisions(state):
    state.metadata.incident_text = "x"
    set_stage(state, "initialized")
    state.append_evidence("sensor:north_wall", {}, 0.5)
    set_stage(state, "evidence_ingested")
    set_stage(state, "risk_assessed")
    set_stage(state, "victims_localized")
    set_stage(state, "resources_allocated")
    set_stage(state, "knowledge_queried")
    set_stage(state, "briefing_ready")

    state.raise_decision({"id": "DEC-1", "request_type": "verify", "summary": "check"})
    with pytest.raises(StateValidationError):
        set_stage(state, "completed")

    state.resolve_decision("DEC-1", "confirmed")
    set_stage(state, "completed")
    assert state.status.stage == "completed"


def test_invalid_forward_jump_rejected(state):
    state.metadata.incident_text = "x"
    set_stage(state, "initialized")
    with pytest.raises(StateValidationError):
        set_stage(state, "briefing_ready")


def test_unknown_stage_rejected(state):
    with pytest.raises(StateValidationError):
        set_stage(state, "not_a_stage")


def test_can_transition_sibling_l1_orders():
    state = type("S", (), {"metadata": type("M", (), {"incident_text": "x"})(),
                           "evidence": [], "human_decisions": [],
                           "status": type("St", (), {"stage": "evidence_ingested"})()})()
    assert can_transition(state, "risk_assessed")
    state.status.stage = "risk_assessed"
    assert can_transition(state, "victims_localized")
    state.status.stage = "victims_localized"
    assert can_transition(state, "risk_assessed")


def test_abort_and_error_from_any_running_state(state):
    state.metadata.incident_text = "x"
    set_stage(state, "initialized")
    set_stage(state, "aborted")
    assert state.status.stage == "aborted"

    state2 = MissionState()
    state2.metadata.incident_text = "x"
    set_stage(state2, "initialized")
    set_stage(state2, "errored")
    assert state2.status.stage == "errored"


def test_rollback_rules(state):
    state.metadata.incident_text = "x"
    set_stage(state, "initialized")
    state.append_evidence("sensor:north_wall", {}, 0.5)
    set_stage(state, "evidence_ingested")
    set_stage(state, "risk_assessed")
    set_stage(state, "victims_localized")
    set_stage(state, "resources_allocated")

    # valid rollback
    rollback(state, "risk_assessed")
    assert state.status.stage == "risk_assessed"
    assert state.timeline[-1].type == "re_run"

    # cannot roll back to the same or a later stage
    with pytest.raises(StateValidationError):
        rollback(state, "victims_localized")

    # cannot roll back below evidence_ingested
    with pytest.raises(StateValidationError):
        rollback(state, "initialized")

    # evidence_ingested is the rollback floor and is allowed
    rollback(state, "evidence_ingested")
    assert state.status.stage == "evidence_ingested"
