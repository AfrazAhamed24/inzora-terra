"""Event-driven mission loop (Phase 1C, live mission engine).

Composes the three Phase 1C subsystems into one event-driven loop:

    mission created
      -> telemetry stream starts            (ScenarioEngine)
      -> packets ingested into MissionState (TelemetryIngest -> MissionStateManager)
      -> dependency graph evaluates         (GraphExecutor: level-by-level, parallel in level)
      -> eligible agents execute            (agents read latest environment/evidence)
      -> MissionState updates               (reports, confidence, timeline, decisions)
      -> live mission summary refreshes     (incremental, after each agent / level)
      -> wait for next packet / event       (loop back)

The loop terminates on a terminal lifecycle stage (``completed`` / ``aborted`` / ``errored``), a
wall-clock or cycle cap, an explicit stop, or an unrecoverable exception. It never touches
``MissionState`` directly: every write is routed through the manager. The orchestrator instance is
reused for a whole mission (it owns the mission state + executor); the loop drives it.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from backend.core.permissions import ORCHESTRATOR
from backend.core.state_manager import MissionStateManager
from backend.orchestration.events import EventSink
from backend.orchestration.executor import ExecutionResult, GraphExecutor
from backend.orchestration.hitl import HitlGate, INTERRUPTED
from backend.orchestration.replay import MissionReplayRecorder
from backend.simulation.engine import ScenarioEngine
from backend.simulation.ingest import TelemetryIngest

__all__ = ["MissionLoop", "MissionLoopConfig", "MissionLoopResult"]


@dataclass
class MissionLoopConfig:
    """Live-mission loop policy knobs (CONFIGURATION_SPEC §3.3 + SIMULATION_SPEC §5)."""

    max_cycles: int = 600          # wall-clock tick cap (0 = unlimited)
    cycles_between_graph_runs: int = 5  # re-run the dependency graph every N ticks
    hitl_timeout: float = 120.0
    hitl_timeout_action: str = "escalate"
    hitl_enabled: bool = True      # master switch for HITL trigger evaluation + pausing
    loop_timeout_seconds: float = 0.0  # wall-clock cap (0 = unlimited)


@dataclass
class MissionLoopResult:
    """Outcome of a mission-loop run."""

    mission_id: str = ""
    cycles: int = 0
    status: str = "completed"      # completed | aborted | errored | stopped | timeout
    graph_results: List[Dict[str, Any]] = field(default_factory=list)
    packets_ingested: int = 0
    end_stage: str = ""
    reason: str = ""


class MissionLoop:
    """Runs one mission to completion under the live simulation stream."""

    def __init__(
        self,
        *,
        manager: MissionStateManager,
        engine: ScenarioEngine,
        ingest: TelemetryIngest,
        executor: GraphExecutor,
        event_sink: Optional[EventSink] = None,
        hitl: Optional[HitlGate] = None,
        config: Optional[MissionLoopConfig] = None,
        recorder: Optional[MissionReplayRecorder] = None,
    ):
        self._manager = manager
        self._engine = engine
        self._ingest = ingest
        self._executor = executor
        self._sink = event_sink or EventSink(manager)
        self._hitl = hitl or HitlGate(
            manager,
            event_sink=self._sink,
            timeout=config.hitl_timeout if config else 120.0,
            timeout_action=config.hitl_timeout_action if config else "escalate",
        )
        self._config = config or MissionLoopConfig()
        self._stop_requested = False
        self._recorder = recorder

    # ------------------------------------------------------------------
    # Control
    # ------------------------------------------------------------------

    def request_stop(self) -> None:
        """Request a clean stop at the next event boundary."""
        self._stop_requested = True
        self._hitl.interrupt()

    # ------------------------------------------------------------------
    # Main loop
    # ------------------------------------------------------------------

    async def run(self) -> MissionLoopResult:
        result = MissionLoopResult(mission_id=self._manager.state.metadata.mission_id)
        deadline = None
        if self._config.loop_timeout_seconds > 0:
            deadline = time.monotonic() + self._config.loop_timeout_seconds

        try:
            while not self._is_terminal():
                if self._stop_requested:
                    result.status = "stopped"
                    result.reason = "stop requested"
                    break
                if deadline is not None and time.monotonic() >= deadline:
                    result.status = "timeout"
                    result.reason = f"loop wall-clock timeout ({self._config.loop_timeout_seconds}s)"
                    break
                if (
                    self._config.max_cycles > 0
                    and result.cycles >= self._config.max_cycles
                ):
                    result.status = "timeout"
                    result.reason = f"cycle cap reached ({self._config.max_cycles})"
                    break

                await self._tick(result)
                result.cycles += 1

            result.end_stage = self._manager.state.status.stage
            if result.status == "completed" and not self._is_terminal():
                result.status = "stopped"
                result.reason = "loop exited without reaching a terminal stage"
        except asyncio.CancelledError:
            result.status = "aborted"
            result.reason = "cancelled"
            raise
        except Exception as exc:  # pragma: no cover - defensive
            result.status = "errored"
            result.reason = f"{type(exc).__name__}: {exc}"
        return result

    async def _tick(self, result: MissionLoopResult) -> None:
        """One event-loop iteration: stream -> ingest -> graph -> summary -> pause check."""
        # 0. Pause gate: while a human decision is pending, park the loop (no streaming advances).
        while self._hitl.is_paused() and not self._is_terminal():
            if self._stop_requested:
                return
            outcome = await self._hitl.wait_for_resolution()
            if outcome == INTERRUPTED or self._stop_requested:
                return

        # 1. Telemetry stream: advance the engine and ingest the packet batch.
        packets = self._engine.step()
        if self._recorder is not None:
            for packet in packets:
                self._recorder.record({"kind": "telemetry", "packet": packet})
        ingest_report = self._ingest.ingest(packets)
        result.packets_ingested += ingest_report["accepted"]
        self._mirror_evidence()

        # 2. Dependency graph: re-run eligible agents periodically over the latest state.
        if result.cycles % self._config.cycles_between_graph_runs == 0:
            if self._recorder is not None:
                self._recorder.record(
                    {"kind": "lifecycle", "stage": self._manager.state.status.stage,
                     "cycles": result.cycles}
                )
            graph_result = await self._executor.run()
            result.graph_results.append(
                {
                    "cycles": result.cycles,
                    "status": graph_result.status,
                    "trace_id": graph_result.trace_id,
                }
            )
            if self._recorder is not None:
                for slug, nr in graph_result.results().items():
                    self._recorder.record(
                        {"kind": "agent", "agent": slug, "status": nr.status,
                         "confidence": nr.confidence, "cycle_id": nr.cycle_id,
                         "cycles": result.cycles}
                    )
            if graph_result.status == "errored":
                self._manager.advance(ORCHESTRATOR, "errored")
                return
            if graph_result.status == "cancelled":
                self._manager.advance(ORCHESTRATOR, "aborted")
                return
            if self._config.hitl_enabled:
                self._evaluate_hitl_triggers()
            await self._refresh_summary()

        # 3. HITL pause: the gate parks the loop until a decision is resolved.
        while self._config.hitl_enabled and self._hitl.is_paused() and not self._is_terminal():
            if self._stop_requested:
                self._hitl.interrupt()
                return
            outcome = await self._hitl.wait_for_resolution()
            if outcome == INTERRUPTED:
                return

    def _evaluate_hitl_triggers(self) -> None:
        """Raise pending HITL decisions per AGENTS.md §HITL trigger rules.

        * risk_score > 0.8          -> alert supervisor (``approve``)
        * confidence < 0.5          -> request manual verification (``verify``)
        * multiple HIGH-risk zones  -> request resource allocation approval (``approve``)

        No duplicate decisions are raised for the same trigger.
        """
        state = self._manager.state
        pending = {d.request_type for d in state.human_decisions if d.status == "pending"}

        risk_score = state.risk_report.get("risk_score")
        if isinstance(risk_score, (int, float)) and not isinstance(risk_score, bool):
            if risk_score > 0.8 and "approve" not in pending:
                self._hitl.raise_decision(
                    request_type="approve",
                    summary=f"Critical risk score {risk_score:.2f} — supervisor approval required",
                    related_agent="risk_assessment",
                )

        low_confidence = [
            agent for agent, score in state.confidence_scores.items()
            if isinstance(score, (int, float)) and not isinstance(score, bool) and score < 0.5
        ]
        if low_confidence and "verify" not in pending:
            self._hitl.raise_decision(
                request_type="verify",
                summary=f"Low agent confidence ({low_confidence}) — manual verification requested",
                related_agent=low_confidence[0],
            )

        high_zones = [
            z.get("zone")
            for z in state.victim_map.get("zones", [])
            if z.get("priority") == "HIGH"
        ]
        if len(high_zones) >= 2 and "approve" not in pending:
            self._hitl.raise_decision(
                request_type="approve",
                summary=f"Multiple HIGH-risk zones ({high_zones}) — resource allocation approval",
                related_agent="victim_localization",
            )

    async def _refresh_summary(self) -> None:
        """Recompute the live mission summary from the current state (incremental)."""
        from backend.orchestration.briefing import BriefingGenerator

        summary = BriefingGenerator().build(self._manager.state)
        self._manager.set_summary(ORCHESTRATOR, summary)

    def _mirror_evidence(self) -> None:
        """Mirror the latest telemetry-derived evidence (as the orchestrator).

        The SIMULATION component owns ``telemetry`` + ``environment`` writes only; evidence is
        appended by the orchestrator (permission matrix), so the loop bridges the two.
        """
        from backend.simulation.ingest import derive_evidence

        entries = derive_evidence(self._manager.state.telemetry)
        last_by_source: Dict[str, Any] = {}
        for entry in self._manager.state.evidence:
            last_by_source[entry.source] = entry.data
        for source, data in entries.items():
            if last_by_source.get(source) == data:
                continue
            self._manager.append_evidence(ORCHESTRATOR, source, data, 0.9)

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    def _is_terminal(self) -> bool:
        from backend.core.lifecycle import is_terminal

        return is_terminal(self._manager.state.status.stage)
