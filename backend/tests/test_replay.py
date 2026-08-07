"""Unit tests: Mission Replay recorder/replayer (Phase 1C).

Covers recording a mission's telemetry stream, JSON artifact serialization, round-trip via JSON,
deterministic re-verification against a fresh engine, and the recorder's observer-only contract.
"""

import json

import pytest

from backend.orchestration.replay import (
    KIND_AGENT,
    KIND_LIFECYCLE,
    KIND_SUMMARY,
    KIND_TELEMETRY,
    MissionReplayRecorder,
    MissionReplayReplayer,
)
from backend.simulation import ScenarioEngine

MISSION_ID = "MISS-2026-0803-001"


def _recorded_mission(*, seed=11, ticks=5) -> MissionReplayRecorder:
    engine = ScenarioEngine(mission_id=MISSION_ID, seed=seed)
    recorder = MissionReplayRecorder.from_engine(engine)
    packets = []
    for _ in range(ticks):
        for packet in engine.step():
            recorder.record({"kind": KIND_TELEMETRY, "packet": packet})
            packets.append(packet)
    return recorder, packets


def test_recorder_captures_telemetry_stream():
    recorder, packets = _recorded_mission(seed=3, ticks=4)
    assert len(recorder.log) == len(packets)
    assert all(e["kind"] == KIND_TELEMETRY for e in recorder.log)


def test_recorder_snapshot_shape():
    recorder, _ = _recorded_mission()
    snap = recorder.snapshot()
    assert snap["format"] == "terra-mission-replay/v1"
    assert snap["mission_id"] == MISSION_ID
    assert snap["seed"] is not None
    assert snap["scenario"]
    assert isinstance(snap["events"], list)


def test_recorder_json_round_trip():
    recorder, _ = _recorded_mission(seed=5, ticks=3)
    text = recorder.to_json()
    parsed = json.loads(text)
    assert parsed["format"] == "terra-mission-replay/v1"
    assert len(parsed["events"]) == len(recorder.log)

    replayer = MissionReplayReplayer.from_json(text)
    assert replayer.recording["mission_id"] == MISSION_ID


def test_replayer_reconstructs_stream():
    recorder, packets = _recorded_mission(seed=9, ticks=6)
    replayer = MissionReplayReplayer.from_json(recorder.to_json())
    assert replayer.replayed_stream() == packets


def test_replay_verifies_fresh_engine_determinism():
    recorder, _ = _recorded_mission(seed=21, ticks=7)
    replayer = MissionReplayReplayer.from_json(recorder.to_json())

    fresh = ScenarioEngine(mission_id=MISSION_ID, seed=21)
    fresh_packets = [p for _ in range(7) for p in fresh.step()]
    assert replayer.verify_packet_stream(fresh_packets)


def test_replay_rejects_different_seed():
    recorder, _ = _recorded_mission(seed=21, ticks=4)
    replayer = MissionReplayReplayer.from_json(recorder.to_json())

    fresh = ScenarioEngine(mission_id=MISSION_ID, seed=999)
    fresh_packets = [p for _ in range(4) for p in fresh.step()]
    assert not replayer.verify_packet_stream(fresh_packets)


def test_replay_records_additional_event_kinds():
    recorder, _ = _recorded_mission(seed=1, ticks=2)
    recorder.record({"kind": KIND_LIFECYCLE, "stage": "risk_assessed"})
    recorder.record({"kind": KIND_AGENT, "agent": "risk_assessment", "status": "ok"})
    recorder.record({"kind": KIND_SUMMARY, "needs_human_review": False})
    kinds = {e["kind"] for e in recorder.log}
    assert KIND_LIFECYCLE in kinds
    assert KIND_AGENT in kinds
    assert KIND_SUMMARY in kinds


def test_replay_recorder_is_observer_only():
    """The recorder never mutates the engine it observes."""
    engine = ScenarioEngine(mission_id=MISSION_ID, seed=2)
    before = engine.clock.tick
    recorder = MissionReplayRecorder.from_engine(engine)
    batch = engine.step()
    for packet in batch:
        recorder.record({"kind": KIND_TELEMETRY, "packet": packet})
    assert recorder.snapshot()["mission_id"] == MISSION_ID
    assert engine.clock.tick > before  # only the engine advanced itself
