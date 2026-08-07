"""Unit tests: Human-in-the-Loop gate (Phase 1C, MISSION_LIFECYCLE.md §6, AGENTS.md §HITL).

Covers pause/resume, raise/resolve/approve/override/timeout, the ``awaiting_confirmation``
lifecycle branch, summary ``needs_human_review`` consistency, and the wait-for-resolution
mechanism the mission loop uses.
"""

import asyncio

import pytest

from backend.core.permissions import ORCHESTRATOR
from backend.core.state_manager import MissionStateManager
from backend.orchestration.briefing import BriefingGenerator
from backend.orchestration.hitl import HitlError, HitlGate, timeout_status_for
from backend.orchestration.events import EventSink


def _mission_at_briefing() -> MissionStateManager:
    """A manager whose mission is at ``briefing_ready`` (where HITL can pause)."""
    mgr = MissionStateManager()
    mgr.create("Two-floor building collapsed after heavy rainfall.")
    mgr.append_evidence(ORCHESTRATOR, "sensor:north_wall", {"tilt_deg": 4.0}, 0.9)
    mgr.set_summary(ORCHESTRATOR, BriefingGenerator().build(mgr.state))
    mgr.advance(ORCHESTRATOR, "evidence_ingested")
    mgr.advance(ORCHESTRATOR, "risk_assessed")
    mgr.advance(ORCHESTRATOR, "victims_localized")
    mgr.advance(ORCHESTRATOR, "resources_allocated")
    mgr.advance(ORCHESTRATOR, "knowledge_queried")
    mgr.advance(ORCHESTRATOR, "briefing_ready")
    return mgr


def make_gate(**kwargs):
    mgr = _mission_at_briefing()
    gate = HitlGate(mgr, timeout=kwargs.pop("timeout", 5.0),
                    timeout_action=kwargs.pop("timeout_action", "escalate"))
    return mgr, gate


# ---------------------------------------------------------------------------
# Raise / pause
# ---------------------------------------------------------------------------


def test_raise_decision_moves_to_awaiting_confirmation():
    mgr, gate = make_gate()
    record = gate.raise_decision(
        request_type="approve",
        summary="Critical risk — approve deployment",
        related_agent="risk_assessment",
    )
    assert record["status"] == "pending"
    assert mgr.state.status.stage == "awaiting_confirmation"
    assert gate.is_paused()
    assert len(gate.pending()) == 1


def test_raise_decision_marks_summary_needs_human_review():
    mgr, gate = make_gate()
    gate.raise_decision(request_type="verify", summary="verify sensor drift")
    assert mgr.state.summary.needs_human_review is True


def test_pause_requires_review_phase():
    mgr, gate = make_gate()
    gate.raise_decision(request_type="approve", summary="approve")
    # already paused -> no-op, stays awaiting_confirmation
    gate.pause()
    assert mgr.state.status.stage == "awaiting_confirmation"


# ---------------------------------------------------------------------------
# Resolve / approve / override
# ---------------------------------------------------------------------------


def test_approve_resolves_decision_and_completes():
    mgr, gate = make_gate()
    record = gate.raise_decision(request_type="approve", summary="approve deployment")
    resolved = gate.approve(record["id"], resolved_by="supervisor", notes="go ahead")
    assert resolved["status"] == "confirmed"
    assert resolved["resolved_by"] == "supervisor"
    assert not gate.pending()
    assert not gate.is_paused()
    assert mgr.state.status.stage == "completed"
    assert mgr.state.summary.needs_human_review is False


def test_override_resolves_as_overridden():
    mgr, gate = make_gate()
    record = gate.raise_decision(request_type="approve", summary="approve")
    resolved = gate.override(record["id"], notes="field override")
    assert resolved["status"] == "overridden"


def test_resolve_unknown_decision_raises():
    _, gate = make_gate()
    with pytest.raises(Exception):
        gate.resolve("DEC-999", "confirmed")


def test_resume_with_pending_decision_raises():
    mgr, gate = make_gate()
    gate.raise_decision(request_type="verify", summary="verify")
    with pytest.raises(HitlError):
        gate.resume()


def test_decision_events_are_emitted():
    mgr, gate = make_gate()
    record = gate.raise_decision(request_type="verify", summary="verify data")
    gate.approve(record["id"])
    decision_events = [e for e in mgr.state.timeline if e.type == "decision"]
    assert len(decision_events) == 2  # raise + resolve


# ---------------------------------------------------------------------------
# Timeout (MISSION_LIFECYCLE §6.4, CONFIGURATION_SPEC §3.5)
# ---------------------------------------------------------------------------


def test_timeout_status_for_action():
    assert timeout_status_for("escalate") == "overridden"
    assert timeout_status_for("reject") == "timeout"


def test_wait_for_resolution_times_out_and_escalates():
    mgr, gate = make_gate(timeout=0.1, timeout_action="escalate")
    gate.raise_decision(request_type="approve", summary="approve")

    async def main():
        return await gate.wait_for_resolution()

    decision_id = asyncio.run(main())
    assert decision_id is not None
    assert mgr.state.status.stage == "completed"
    assert mgr.state.human_decisions[-1].status == "overridden"


def test_wait_for_resolution_returns_on_approve():
    mgr, gate = make_gate()
    record = gate.raise_decision(request_type="approve", summary="approve")

    async def main():
        async def resolve_later():
            await asyncio.sleep(0.05)
            gate.approve(record["id"])

        task = asyncio.create_task(resolve_later())
        result = await asyncio.wait_for(gate.wait_for_resolution(), timeout=2.0)
        task.cancel()
        return result

    assert asyncio.run(main()) == record["id"]


def test_timeout_reject_blocks_mission():
    mgr, gate = make_gate(timeout=0.1, timeout_action="reject")
    gate.raise_decision(request_type="approve", summary="approve")

    async def main():
        return await gate.wait_for_resolution()

    asyncio.run(main())
    # reject -> the decision is marked 'timeout' and the mission is NOT completed
    assert mgr.state.human_decisions[-1].status == "timeout"
    assert mgr.state.status.stage == "awaiting_confirmation"
