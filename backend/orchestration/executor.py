"""GraphExecutor: schedules agents over the dependency graph, level by level.

Implements ORCHESTRATOR.md §4–§5 and consumes the declarative graph from
``backend/orchestration/graph.py``. Highlights:

* Levels run one after another; every node inside a level runs **concurrently**.
* Each agent invocation is wrapped by a cycle that emits ``agent_start``, calls the handler,
  then records ``agent_complete`` / ``agent_retry`` / ``agent_failed``.
* Per-agent timeout, linear-backoff retries, and a fallback path (confidence capped at 0.4).
* A level never partially proceeds: it completes only when every node settled (ok or fallback).
  An unhandled failure errors the mission; ``cancel()`` stops pending work.
* The executor **never mutates ``MissionState`` directly** — every write goes through the
  ``MissionStateManager`` (append-only + permission + validation enforcement).

Legacy backward-compatibility: the four current agents still receive the live ``state`` and write
their reports onto it directly (Phase 1B.2 contract). The executor only governs *when and how many
times* each agent runs and records the outputs/confidence/stage through the manager.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Dict, List, Mapping, Optional

from backend.agents.registry import AgentRegistry
from backend.core.mission_state import MissionState, MissionSummary, utc_now_iso
from backend.core.permissions import ORCHESTRATOR, OWNED_REPORT_FIELDS, StatePermissionError
from backend.core.state_manager import MissionStateManager
from backend.core.tools import get_sensor_data, get_weather
from backend.orchestration.briefing import BriefingGenerator, aggregate_confidence
from backend.orchestration.context import ExecutionContext
from backend.orchestration.contract import report_as_of, run_contract_agent
from backend.orchestration.events import EventSink
from backend.orchestration.graph import DependencyGraph, MISSION_GRAPH
from backend.orchestration.retry import RetryPolicy

__all__ = [
    "GraphExecutionError",
    "ExecutionCancelled",
    "ExecutorConfig",
    "NodeResult",
    "ExecutionResult",
    "GraphExecutor",
]

NodeHandler = Callable[[ExecutionContext], Awaitable[Dict[str, Any]]]


class GraphExecutionError(RuntimeError):
    """Raised when a graph cannot be scheduled (missing handler, bad graph)."""


class ExecutionCancelled(Exception):
    """Raised internally when execution is cancelled between/within node cycles."""


@dataclass
class ExecutorConfig:
    """Execution policy knobs (ORCHESTRATOR.md §5)."""

    agent_timeout: Optional[float] = 30.0
    max_retries: int = 2
    retry_backoff_base: float = 1.0
    fallback_enabled: bool = True


@dataclass
class NodeResult:
    """Outcome of one node's cycle (after retries / fallback)."""

    node: str
    status: str  # ok | fallback | error | cancelled
    attempts: int = 0
    confidence: float = 0.0
    cycle_id: str = ""
    output: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


@dataclass
class ExecutionResult:
    """Overall run outcome, flattened per node.

    ``trace_id`` is the run-level correlation id (``GRAPH-<n>``) shared by every event emitted
    during this execution (LOGGING_SPEC §7).
    """

    status: str = "completed"  # completed | errored | cancelled
    level_results: Dict[int, Dict[str, NodeResult]] = field(default_factory=dict)
    errors: List[str] = field(default_factory=list)
    trace_id: str = ""

    def results(self) -> Dict[str, NodeResult]:
        flat: Dict[str, NodeResult] = {}
        for level in sorted(self.level_results):
            flat.update(self.level_results[level])
        return flat


class GraphExecutor:
    """Executes agents over a dependency graph with timeout, retry, and fallback."""

    def __init__(
        self,
        manager: MissionStateManager,
        *,
        handlers: Optional[Mapping[str, NodeHandler]] = None,
        agents: Optional[Mapping[str, Any]] = None,
        registry: Optional[AgentRegistry] = None,
        graph: DependencyGraph = MISSION_GRAPH,
        config: Optional[ExecutorConfig] = None,
        event_sink: Optional[EventSink] = None,
    ):
        self._manager = manager
        self._graph = graph
        self._config = config or ExecutorConfig()
        self._retry = RetryPolicy(self._config.max_retries, self._config.retry_backoff_base)
        self._sink = event_sink or EventSink(manager)
        self._handlers: Dict[str, NodeHandler] = {}

        for slug, handler in (handlers or {}).items():
            self._handlers[slug] = handler
        for slug, agent in (agents or {}).items():
            self._handlers.setdefault(slug, self._wrap_agent(agent))
        if registry is not None:
            # Agent discovery: every graph node without an explicit handler is resolved through
            # the registry, so future agents plug in without touching the executor.
            for slug in sorted(self._graph.nodes):
                if slug in self._handlers:
                    continue
                agent = registry.get(slug)
                if agent is not None:
                    self._handlers[slug] = self._wrap_agent(agent)

        missing = sorted(s for s in graph.nodes if s not in self._handlers)
        if missing:
            raise GraphExecutionError(
                f"no handler registered for graph node(s): {missing}"
            )

        self._cancelled = False
        self._tasks: Dict[str, asyncio.Task] = {}
        self._cycle_seq = 0

    # ------------------------------------------------------------------
    # Scheduling
    # ------------------------------------------------------------------

    async def run(self) -> ExecutionResult:
        """Run every level of the graph in order; return the aggregate result."""
        result = ExecutionResult()
        graph_trace = self._sink.new_graph_trace()
        result.trace_id = graph_trace
        self._sink.set_trace(graph_trace)
        try:
            for level in self._graph.levels():
                if self._cancelled:
                    break
                await self._run_level(level, result)
                if result.status in ("errored", "cancelled"):
                    break
        finally:
            self._sink.clear_trace()
            for task in self._tasks.values():
                if not task.done():
                    task.cancel()
        return result

    def cancel(self) -> None:
        """Request cancellation of pending node cycles."""
        self._cancelled = True
        for task in self._tasks.values():
            if not task.done():
                task.cancel()

    async def _run_level(self, level: int, result: ExecutionResult) -> None:
        nodes = self._graph.nodes_for_level(level)
        result.level_results[level] = {}
        tasks: Dict[str, asyncio.Task] = {}
        for slug in nodes:
            tasks[slug] = asyncio.create_task(self._run_node(slug, level))
        self._tasks.update(tasks)

        try:
            outcomes = await asyncio.gather(*tasks.values(), return_exceptions=True)
        except asyncio.CancelledError:
            result.status = "cancelled"
            self._cancelled = True
            for slug in nodes:
                result.level_results[level][slug] = NodeResult(node=slug, status="cancelled")
            return
        for slug, outcome in zip(nodes, outcomes):
            if isinstance(outcome, (ExecutionCancelled, asyncio.CancelledError)):
                result.level_results[level][slug] = NodeResult(node=slug, status="cancelled")
                result.status = "cancelled"
                self._cancelled = True
            elif isinstance(outcome, Exception):
                result.level_results[level][slug] = NodeResult(
                    node=slug, status="error", error=str(outcome)
                )
                result.status = "errored"
                self._cancelled = True
            else:
                result.level_results[level][slug] = outcome

        if result.status == "completed" and any(
            nr.status == "error" for nr in result.level_results[level].values()
        ):
            self._manager.advance(ORCHESTRATOR, "errored")
            result.status = "errored"
            self._cancelled = True

    # ------------------------------------------------------------------
    # Node cycle (ORCHESTRATOR.md §4.3)
    # ------------------------------------------------------------------

    async def _run_node(self, slug: str, level: int) -> NodeResult:
        spec = self._graph.node(slug)
        if self._cancelled:
            raise ExecutionCancelled(slug)

        # One correlation trace per node cycle: every event for this node (start, retries,
        # completion, handoff) shares the same CYC trace id (LOGGING_SPEC §7).
        cycle_id = self._next_cycle_id()
        self._sink.emit_agent(
            "agent_start",
            slug,
            f"{slug} started",
            data={"level": level, "cycle_id": cycle_id},
            trace_id=cycle_id,
        )

        inputs = self._snapshot_inputs(spec)
        dependencies = self._dependencies(slug)

        last_error: Optional[str] = None
        attempt = 0
        while True:
            attempt += 1
            if self._cancelled:
                raise ExecutionCancelled(slug)
            context = ExecutionContext(
                agent_name=slug,
                level=level,
                state=self._manager.state,
                inputs=inputs,
                dependencies=dependencies,
                config=self._config,
                cycle_id=cycle_id,
                cancelled=self._cancelled,
            )
            with self._sink.trace(cycle_id):
                try:
                    output = await self._call_handler(slug, context)
                except ExecutionCancelled:
                    raise
                except asyncio.CancelledError:
                    raise
                except asyncio.TimeoutError:
                    last_error = f"{slug} exceeded timeout of {self._config.agent_timeout}s"
                except Exception as exc:
                    last_error = f"{slug} failed: {type(exc).__name__}: {exc}"

            if last_error is None:
                return self._record_success(spec, context, output, attempt)

            if self._retry.should_retry(attempt):
                self._sink.emit_retry(
                    slug,
                    attempt,
                    last_error,
                    max_retries=self._retry.max_retries,
                    cycle_id=cycle_id,
                    trace_id=cycle_id,
                )
                self._sink.log(
                    "WARNING",
                    last_error,
                    source=slug,
                    context={"cycle_id": cycle_id, "attempt": attempt},
                    trace_id=cycle_id,
                )
                await asyncio.sleep(self._retry.backoff(attempt))
                last_error = None
                continue

            # Retries exhausted
            self._sink.emit_failure(
                slug, last_error, data={"attempt": attempt}, trace_id=cycle_id
            )
            if self._config.fallback_enabled:
                return self._apply_fallback(spec, context, last_error, attempt)
            self._sink.log(
                "ERROR",
                last_error,
                source=slug,
                context={"cycle_id": cycle_id},
                trace_id=cycle_id,
            )
            self._manager.record_error(ORCHESTRATOR, last_error)
            return NodeResult(node=slug, status="error", attempts=attempt, error=last_error)

    async def _call_handler(self, slug: str, context: ExecutionContext) -> Dict[str, Any]:
        handler = self._handlers[slug]
        if self._config.agent_timeout is None:
            return await handler(context)
        return await asyncio.wait_for(handler(context), timeout=self._config.agent_timeout)

    # ------------------------------------------------------------------
    # Success / fallback bookkeeping (all writes via the manager)
    # ------------------------------------------------------------------

    def _record_success(
        self,
        spec: Any,
        context: ExecutionContext,
        output: Dict[str, Any],
        attempt: int,
    ) -> NodeResult:
        confidence = self._extract_confidence(spec, context, output)
        output = dict(output)

        if "summary" in spec.writes:
            summary = output if isinstance(output, dict) else {"mission_briefing": output}
            self._manager.set_summary(ORCHESTRATOR, summary)

        if spec.slug != "briefing_generator":
            self._manager.set_confidence(ORCHESTRATOR, spec.slug, confidence)

        self._manager.append_agent_output(
            ORCHESTRATOR,
            {
                "agent_name": spec.slug,
                "cycle_id": context.cycle_id,
                "output": output,
                "confidence": confidence,
                "timestamp": utc_now_iso(),
                "status": "ok",
            },
        )
        self._sink.emit_agent(
            "agent_complete",
            spec.slug,
            f"{spec.slug} complete",
            data={"cycle_id": context.cycle_id, "attempts": attempt, "confidence": confidence},
            trace_id=context.cycle_id,
        )
        handoff = output.get("next_handoff") if isinstance(output, dict) else None
        if isinstance(handoff, dict) and handoff.get("agent"):
            target = handoff["agent"]
            self._sink.emit_handoff(
                spec.slug,
                target,
                f"{spec.slug} hands off to {target}",
                data={"next_handoff": handoff, "cycle_id": context.cycle_id},
                trace_id=context.cycle_id,
            )
        if spec.stage_token:
            self._advance_stage(spec.stage_token)

        return NodeResult(
            node=spec.slug,
            status="ok",
            attempts=attempt,
            confidence=confidence,
            cycle_id=context.cycle_id,
            output=output,
        )

    def _apply_fallback(
        self,
        spec: Any,
        context: ExecutionContext,
        error: str,
        attempt: int,
    ) -> NodeResult:
        confidence = 0.4  # capped to force the < 0.5 HITL trigger (AGENTS.md)
        report = self._build_fallback_report(spec.slug)

        self._sink.emit_failure(
            spec.slug, error, fallback=True, data={"attempt": attempt}, trace_id=context.cycle_id
        )
        self._sink.log(
            "WARNING",
            f"{error}; applying fallback for {spec.slug} (confidence capped at 0.4)",
            source=spec.slug,
            context={"cycle_id": context.cycle_id},
            trace_id=context.cycle_id,
        )
        self._manager.record_error(ORCHESTRATOR, f"{spec.slug}: {error} (fallback applied)")

        if "summary" in spec.writes:
            self._manager.set_summary(
                ORCHESTRATOR, self._build_fallback_summary(context)
            )
        else:
            owned = OWNED_REPORT_FIELDS.get(spec.slug)
            if owned and report is not None:
                report = dict(report)
                report.setdefault("cycle_id", context.cycle_id)
                report.setdefault("as_of", report_as_of(self._manager.state))
                self._manager.update(ORCHESTRATOR, owned, report)

        if spec.slug != "briefing_generator":
            self._manager.set_confidence(ORCHESTRATOR, spec.slug, confidence)
        self._manager.append_agent_output(
            ORCHESTRATOR,
            {
                "agent_name": spec.slug,
                "cycle_id": context.cycle_id,
                "output": report or {},
                "confidence": confidence,
                "timestamp": utc_now_iso(),
                "status": "fallback",
            },
        )
        if spec.stage_token:
            self._advance_stage(spec.stage_token)

        return NodeResult(
            node=spec.slug,
            status="fallback",
            attempts=attempt,
            confidence=confidence,
            cycle_id=context.cycle_id,
            output=report,
            error=error,
        )

    # ------------------------------------------------------------------
    # Read-consistency snapshot (ORCHESTRATOR.md §4.4)
    # ------------------------------------------------------------------

    def _snapshot_inputs(self, spec: Any) -> Dict[str, Any]:
        """Deep, JSON-ready copy of the fields this node may read, taken at level dispatch."""
        snapshot: Dict[str, Any] = {}
        for section in spec.reads:
            try:
                snapshot[section] = self._manager.read(ORCHESTRATOR, section)
            except StatePermissionError:
                continue
        return snapshot

    def _dependencies(self, slug: str) -> Dict[str, Any]:
        """Outputs of this node's direct predecessors (owned reports on the live state)."""
        deps: Dict[str, Any] = {}
        for pred in self._graph.dependencies(slug):
            field = OWNED_REPORT_FIELDS.get(pred)
            if field:
                deps[pred] = getattr(self._manager.state, field)
        return deps

    # ------------------------------------------------------------------
    # Confidence / fallback data
    # ------------------------------------------------------------------

    def _extract_confidence(
        self, spec: Any, context: ExecutionContext, output: Dict[str, Any]
    ) -> float:
        if spec.slug == "briefing_generator":
            return aggregate_confidence(context.state)
        recorded = context.state.confidence_scores.get(spec.slug)
        if isinstance(recorded, (int, float)) and not isinstance(recorded, bool):
            return float(recorded)
        raw = output.get("confidence") if isinstance(output, dict) else None
        if isinstance(raw, (int, float)) and not isinstance(raw, bool):
            return float(raw)
        return 0.0

    def _build_fallback_report(self, slug: str) -> Optional[Dict[str, Any]]:
        """Minimal simulated-data report matching ``tools.py`` output shapes."""
        if slug == "risk_assessment":
            sensor = get_sensor_data("north_wall")
            weather = get_weather("current")
            return {
                "likelihood": "MEDIUM",
                "risk_score": 0.4,
                "hazards": ["Fallback data: live sensors unavailable"],
                "recommendation": "Verify with manual inspection",
                "confidence": 0.4,
                "trend": sensor.get("trend", "unknown"),
                "source": "fallback",
                "weather_note": weather.get("rain"),
            }
        if slug == "victim_localization":
            return {
                "zones": [],
                "total_victims_estimated": 0,
                "primary_search_zone": "unknown",
                "confidence": 0.4,
                "source": "fallback",
            }
        if slug == "resource_coordination":
            return {
                "assignments": [],
                "utilization": 0.0,
                "bottlenecks": ["Fallback data: no live risk/victim estimates"],
                "source": "fallback",
            }
        if slug == "knowledge_retrieval":
            return {
                "sops": [],
                "building_codes": [],
                "recommendations": ["Re-run knowledge query once live data is available"],
                "source": "fallback",
            }
        return None

    def _build_fallback_summary(self, context: ExecutionContext) -> Dict[str, Any]:
        state = context.state
        pending = sum(1 for d in state.human_decisions if d.status == "pending")
        return {
            "mission_briefing": {
                "incident_id": state.metadata.mission_id or "INC-2026-001",
                "overall_risk": "UNKNOWN",
                "priority_zones": [],
                "total_victims_estimated": 0,
                "immediate_actions": [],
                "resource_status": "Pending",
                "next_update_in": "15 minutes",
                "overall_confidence": aggregate_confidence(state),
            },
            "confidence_scores": dict(state.confidence_scores),
            "needs_human_review": pending > 0,
            "generated_at": utc_now_iso(),
        }

    # ------------------------------------------------------------------
    # Misc
    # ------------------------------------------------------------------

    def _wrap_agent(self, agent: Any) -> NodeHandler:
        """Wrap a universal-contract agent as a node handler.

        Speaks only to the contract surface (identity + lifecycle + standard output envelope) via
        ``run_contract_agent`` — never to agent-specific methods — so the GraphExecutor is fully
        agent-agnostic (AGENT_CONTRACT.md).
        """

        async def wrapped(context: ExecutionContext) -> Dict[str, Any]:
            spec = self._graph.node(context.agent_name)
            return await run_contract_agent(agent, context, self._manager, spec)

        return wrapped

    def _next_cycle_id(self) -> str:
        self._cycle_seq += 1
        return f"CYC-{self._cycle_seq}"

    def _advance_stage(self, stage_token: str) -> None:
        """Advance the lifecycle stage only when the node's token is a known stage.

        Custom graphs may tag nodes with arbitrary tokens; the mission lifecycle only understands
        the stages defined in ``backend/core/lifecycle.py``, so unknown tokens are ignored.
        """
        from backend.core.lifecycle import STAGES, normalize_stage

        if normalize_stage(stage_token) in STAGES:
            self._manager.advance(ORCHESTRATOR, stage_token)
