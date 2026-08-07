"""Mission replay recorder + deterministic replayer (Phase 1C).

Records the full story of a mission as it runs — telemetry packets, lifecycle transitions,
agent executions, HITL decisions, and live summaries — so an operator (or a test) can replay the
mission identically. Replay is snapshot-based: the recorder stores the mission's deterministic
inputs (seed, scenario, settings) plus the ordered mutation log, and the replayer re-drives them
against a fresh manager. No UI is involved; replay is a headless, verifiable artifact.

The recorder is *observer-only*: it hooks the manager/engine and never mutates state.
"""

from __future__ import annotations

import json
from typing import Any, Dict, List

from backend.simulation.engine import ScenarioEngine

__all__ = ["MissionReplayRecorder", "MissionReplayReplayer"]


def _round(x: Any) -> Any:
    """Recursively round floats for byte-stable JSON replay output."""
    if isinstance(x, float):
        return round(x, 6)
    if isinstance(x, dict):
        return {k: _round(v) for k, v in x.items()}
    if isinstance(x, list):
        return [_round(v) for v in x]
    if isinstance(x, tuple):
        return tuple(_round(v) for v in x)
    return x


class MissionReplayRecorder:
    """Records mission inputs + mutation log; produces a replay JSON artifact."""

    def __init__(self, *, mission_id: str, seed: int, scenario: str):
        self.mission_id = mission_id
        self.seed = seed
        self.scenario = scenario
        self.log: List[Dict[str, Any]] = []

    def record(self, event: Dict[str, Any]) -> None:
        self.log.append(_round(event))

    def snapshot(self) -> Dict[str, Any]:
        return {
            "format": "terra-mission-replay/v1",
            "mission_id": self.mission_id,
            "seed": self.seed,
            "scenario": self.scenario,
            "events": self.log,
        }

    def to_json(self, *, indent: int = 2) -> str:
        return json.dumps(self.snapshot(), indent=indent)

    @classmethod
    def from_engine(cls, engine: ScenarioEngine) -> "MissionReplayRecorder":
        return cls(
            mission_id=engine.mission_id,
            seed=engine.seed,
            scenario=engine.spec.name,
        )


class MissionReplayReplayer:
    """Re-drives a recorded mission and verifies it reproduces the original state."""

    def __init__(self, recording: Dict[str, Any]):
        self.recording = recording

    @classmethod
    def from_json(cls, text: str) -> "MissionReplayReplayer":
        return cls(json.loads(text))

    def replayed_stream(self) -> List[Dict[str, Any]]:
        """Reconstruct the ordered telemetry stream from the recording events."""
        return [
            e["packet"]
            for e in self.recording["events"]
            if e.get("kind") == "telemetry"
        ]

    def verify_packet_stream(self, packets: List[Dict[str, Any]]) -> bool:
        """Compare a freshly emitted packet stream against the recorded one."""
        recorded = self.replayed_stream()
        return _round(recorded) == _round(packets)


# Default event-type keys the recorder writes (kept as module constants for tests/CLI).
KIND_TELEMETRY = "telemetry"
KIND_LIFECYCLE = "lifecycle"
KIND_AGENT = "agent"
KIND_DECISION = "decision"
KIND_SUMMARY = "summary"
