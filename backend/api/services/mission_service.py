"""MissionService: the only App-facing front door to the Mission Engine (API_SPEC §4).

Responsibilities, all implemented by *composing the existing Phase 1 engine* — never duplicating
its orchestration logic:

* Mission creation + in-memory registry (``POST /missions``, ``GET /missions``)
* Mission lookup / state retrieval
* Executor + Mission Loop control (start / stop)
* Session persistence, availability lookup, and cleanup

Every mutation goes through ``MissionStateManager``; every read through its read API wrapped in
a JSON-ready deep copy. The service owns exactly one ``MissionLoop`` per active mission and
launches it as a background asyncio task so SSE consumers stream live updates while the loop
drives the engine. Configuration (scenario, seed, timeouts) comes from ``app_settings``.
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from backend.agents.knowledge.agent import KnowledgeRetrievalAgent
from backend.agents.registry import AgentRegistry
from backend.agents.rescue_coordination.agent import RescueCoordinationAgent
from backend.agents.resource_coordination.agent import ResourceCoordinationAgent
from backend.agents.risk_assessment.agent import RiskAssessmentAgent
from backend.agents.victim_localization.agent import VictimLocalizationAgent
from backend.api.exceptions import (
    MissionAlreadyExistsError,
    MissionAlreadyStartedError,
    MissionNotFoundError,
    MissionNotRunningError,
    MissionTerminalError,
    MissionValidationError,
)
from backend.core.state_validation import _MISSION_ID_RE
from backend.core.config import AppSettings
from backend.core.lifecycle import is_terminal
from backend.core.permissions import ORCHESTRATOR
from backend.core.state_manager import MissionStateManager
from backend.orchestration.briefing import BriefingGenerator
from backend.orchestration.events import EventSink
from backend.orchestration.executor import ExecutorConfig, GraphExecutor
from backend.orchestration.hitl import HitlGate
from backend.orchestration.mission_loop import MissionLoop, MissionLoopConfig, MissionLoopResult
from backend.orchestration.replay import MissionReplayRecorder
from backend.simulation import ScenarioEngine, TelemetryIngest
log = logging.getLogger("inzora.api")

__all__ = ["MissionSession", "MissionService"]


@dataclass
class MissionSession:
    """One live mission: its manager + engine wiring, ready for a loop to drive it."""

    mission_id: str
    manager: MissionStateManager
    created_at: float = field(default_factory=time.time)

    engine: Optional[ScenarioEngine] = None
    ingest: Optional[TelemetryIngest] = None
    executor: Optional[GraphExecutor] = None
    event_sink: Optional[EventSink] = None
    hitl: Optional[HitlGate] = None
    loop: Optional[MissionLoop] = None
    recorder: Optional[MissionReplayRecorder] = None
    loop_task: Optional[asyncio.Task] = None
    loop_result: Optional[MissionLoopResult] = None
    is_running: bool = False

    def to_dict(self, *, deep: bool = False) -> Dict[str, Any]:
        """JSON-ready snapshot of session-level (non-mutating) facts."""
        state = self.manager.state
        return {
            "mission_id": self.mission_id,
            "stage": state.status.stage,
            "phase": state.status.phase,
            "is_running": self.is_running,
            "incident_text": state.metadata.incident_text,
            "incident_id": state.metadata.mission_id,
            "environment_id": state.metadata.environment_id,
            "mission_name": state.metadata.mission_name,
            "created_at": state.metadata.started_at,
            "updated_at": state.metadata.updated_at,
        }


def _build_registry() -> AgentRegistry:
    """Default agent set. Registry is the single discovery mechanism."""
    registry = AgentRegistry()
    registry.register_many(
        [
            RiskAssessmentAgent,
            VictimLocalizationAgent,
            ResourceCoordinationAgent,
            KnowledgeRetrievalAgent,
            RescueCoordinationAgent,
        ]
    )
    return registry


class MissionService:
    """In-memory mission session registry + control orchestration for the API."""

    def __init__(self, settings: AppSettings):
        self._settings = settings
        self._sessions: Dict[str, MissionSession] = {}
        self._lock = asyncio.Lock()
        self._log = logging.getLogger("inzora.api.mission")
        self._id_seq = 0

    # ------------------------------------------------------------------
    # Registry
    # ------------------------------------------------------------------

    async def create(self, incident_text: str, *, mission_name: str = "", environment: str = "") -> MissionSession:
        """Create a mission: build manager, validate incident text, register the session.

        The engine/loop are *not* started here — they are wired on ``start`` (API_SPEC §2:
        creation and execution are separate concerns).
        """
        if not incident_text or not incident_text.strip():
            raise MissionValidationError("incident_text is required and must be non-empty")
        manager = MissionStateManager()
        env_id = environment or self._settings.simulation.scenario
        manager.create(
            incident_text.strip(),
            environment_id=env_id,
            mission_name=mission_name,
        )
        # Per-manager id counters restart at 001, so the service owns a global monotonic
        # counter to guarantee unique ids across missions (MISSION_ID pattern preserved).
        mission_id = self._next_mission_id()
        manager.state.metadata.mission_id = mission_id
        manager.state._touch()

        session = MissionSession(mission_id=mission_id, manager=manager)
        async with self._lock:
            if mission_id in self._sessions:
                raise MissionAlreadyExistsError(f"mission {mission_id} already exists")
            self._sessions[mission_id] = session

        event_sink = EventSink(manager)
        event_sink.emit_mission(
            "mission_start",
            "mission registered via API",
            data={"environment_id": env_id},
        )
        self._log.info("created mission %s (env=%s)", mission_id, env_id)
        return session

    def _next_mission_id(self) -> str:
        """Generate a unique ``MISS-YYYYMMDD-NNN`` id owned by the service registry."""
        self._id_seq += 1
        from datetime import datetime, timezone

        date = datetime.now(timezone.utc).strftime("%Y-%m%d")
        return f"MISS-{date}-{self._id_seq:03d}"

    def get(self, mission_id: str) -> MissionSession:
        """Look up a live session; raise ``MissionNotFoundError`` when absent."""
        self._require_valid_id(mission_id)
        session = self._sessions.get(mission_id)
        if session is None:
            raise MissionNotFoundError(f"mission {mission_id} not found")
        return session

    @staticmethod
    def _require_valid_id(mission_id: str) -> None:
        if not mission_id or not _MISSION_ID_RE.fullmatch(mission_id):
            raise MissionValidationError(
                f"invalid mission_id {mission_id!r}; expected MISS-YYYYMMDD-NNN"
            )

    def list(self) -> List[MissionSession]:
        return sorted(self._sessions.values(), key=lambda s: s.created_at)

    def count(self) -> int:
        return len(self._sessions)

    # ------------------------------------------------------------------
    # Lifecycle control
    # ------------------------------------------------------------------

    async def start(self, mission_id: str) -> MissionSession:
        """Wire + launch this mission's engine and MissionLoop as a background task."""
        session = self.get(mission_id)
        state = session.manager.state
        if session.is_running:
            raise MissionAlreadyStartedError(f"mission {mission_id} is already running")
        if is_terminal(state.status.stage):
            raise MissionTerminalError(f"mission {mission_id} has already reached terminal stage")

        # Build every engine piece from the shared strategy (all writable through the manager).
        session.engine = ScenarioEngine(
            mission_id=mission_id,
            scenario=state.metadata.environment_id or self._settings.simulation.scenario,
            seed=self._settings.simulation.seed,
            tick_seconds=self._settings.simulation.tick_seconds,
            time_multiplier=self._settings.simulation.time_multiplier,
        )
        session.ingest = TelemetryIngest(session.manager)
        session.event_sink = EventSink(session.manager)
        session.executor = GraphExecutor(
            session.manager,
            registry=_build_registry(),
            handlers={"briefing_generator": BriefingGenerator()},
            config=ExecutorConfig(
                agent_timeout=self._settings.orchestrator.agent_timeout,
                max_retries=self._settings.orchestrator.max_retries,
                retry_backoff_base=self._settings.orchestrator.retry_backoff_base,
                fallback_enabled=True,
            ),
            event_sink=session.event_sink,
        )
        session.hitl = HitlGate(
            session.manager,
            event_sink=session.event_sink,
            timeout=self._settings.hitl.timeout,
            timeout_action=self._settings.hitl.timeout_action,
        )
        session.recorder = MissionReplayRecorder.from_engine(session.engine)
        session.loop = MissionLoop(
            manager=session.manager,
            engine=session.engine,
            ingest=session.ingest,
            executor=session.executor,
            event_sink=session.event_sink,
            hitl=session.hitl,
            config=MissionLoopConfig(
                max_cycles=0,  # 0 = run until terminal or explicit stop (live stream)
                cycles_between_graph_runs=1,
                hitl_timeout=self._settings.hitl.timeout,
                hitl_timeout_action=self._settings.hitl.timeout_action,
                hitl_enabled=True,
                loop_timeout_seconds=0.0,
                # One tick per wall-clock second so the mission unfolds cinematically
                # instead of re-running the whole agent graph dozens of times a second.
                pacing_seconds=session.engine.clock.tick_seconds,
            ),
            recorder=session.recorder,
        )

        async with self._lock:
            if session.is_running:
                raise MissionAlreadyStartedError(f"mission {mission_id} is already running")
            session.is_running = True

        session.loop_task = asyncio.create_task(self._drive(session))
        session.loop_task.add_done_callback(lambda _t: self._on_loop_done(session))
        self._log.info("started mission %s", mission_id)
        return session

    async def _drive(self, session: MissionSession) -> Optional[MissionLoopResult]:
        """Background runner: drive the loop to completion (`loop.run` never duplicated)."""
        try:
            session.loop_result = await session.loop.run()
            return session.loop_result
        except asyncio.CancelledError:
            session.loop_result = MissionLoopResult(
                mission_id=session.mission_id, status="stopped", reason="cancelled"
            )
            return session.loop_result
        except Exception as exc:  # pragma: no cover - defensive
            self._log.exception("mission %s loop error", session.mission_id)
            session.loop_result = MissionLoopResult(
                mission_id=session.mission_id,
                status="errored",
                reason=f"{type(exc).__name__}: {exc}",
            )
            return session.loop_result

    def _on_loop_done(self, session: MissionSession) -> None:
        """Mark a finished loop as not-running (idempotent done-callback)."""
        session.is_running = False
        stage = session.manager.state.status.stage
        self._log.info("mission %s loop finished (stage=%s)", session.mission_id, stage)

    def stop(self, mission_id: str) -> MissionSession:
        """Request a clean loop stop (loop obeys ``request_stop``)."""
        session = self.get(mission_id)
        if not session.is_running or session.loop is None:
            raise MissionNotRunningError(f"mission {mission_id} is not running")
        session.loop.request_stop()
        return session

    async def await_completion(self, mission_id: str, timeout: float = 30.0) -> MissionSession:
        """Blocking await for a mission to terminal (used by tests / CLI)."""
        session = self.get(mission_id)
        if session.loop_task is not None:
            try:
                await asyncio.wait_for(session.loop_task, timeout)
            except asyncio.TimeoutError:
                pass
        return session

    # ------------------------------------------------------------------
    # State retrieval
    # ------------------------------------------------------------------

    def state(self, mission_id: str) -> Dict[str, Any]:
        """JSON-ready deep copy of the whole live mission state (ORCHESTRATOR read)."""
        session = self.get(mission_id)
        return session.manager.read(ORCHESTRATOR)

    def summary(self, mission_id: str) -> Optional[Dict[str, Any]]:
        session = self.get(mission_id)
        summary = session.manager.state.summary
        return summary.model_dump() if summary else None

    def telemetry(self, mission_id: str) -> Dict[str, Any]:
        session = self.get(mission_id)
        state = session.manager.state
        return {
            "mission_id": mission_id,
            "telemetry": [p.model_dump() for p in state.telemetry],
            "environment": state.environment.model_dump(),
        }

    def timeline(self, mission_id: str) -> List[Dict[str, Any]]:
        session = self.get(mission_id)
        return [e.model_dump() for e in session.manager.state.timeline]

    def replay(self, mission_id: str) -> Optional[Dict[str, Any]]:
        session = self.get(mission_id)
        if session.recorder is None:
            return None
        return session.recorder.snapshot()

    # ------------------------------------------------------------------
    # Cleanup
    # ------------------------------------------------------------------

    async def cleanup(self, mission_id: str) -> None:
        """Cancel any running loop and evict the session (shutdown path)."""
        session = self.get(mission_id)
        async with self._lock:
            if session.loop_task and not session.loop_task.done():
                session.loop_task.cancel()
            self._sessions.pop(mission_id, None)
        self._log.info("cleaned mission %s", mission_id)

    async def shutdown(self) -> None:
        """Cancel and finish all active missions (app lifespan shutdown)."""
        async with self._lock:
            for session in self._sessions.values():
                if session.loop_task and not session.loop_task.done():
                    session.loop_task.cancel()
        self._sessions.clear()
        self._log.info("mission service shutdown (%d sessions evicted)", self.count())