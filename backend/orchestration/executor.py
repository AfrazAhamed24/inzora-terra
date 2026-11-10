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
* Enhanced error recovery with circuit breakers, dead-letter queue, and health tracking.

Legacy backward-compatibility: the four current agents still receive the live ``state`` and write
their reports onto it directly (Phase 1B.2 contract). The executor only governs *when and how many
times* each agent runs and records the outputs/confidence/stage through the manager.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta
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
    "EnhancedGraphExecutor",
    "CircuitBreaker",
    "DeadLetterQueue",
    "AgentHealthMonitor",
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
    agent_delay: float = 2.0


@dataclass
class NodeResult:
    """Outcome of one node's cycle (after retries / fallback)."""

    node: str
    status: str
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

    status: str = "completed"
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

    async def run(self, levels: Optional[List[int]] = None) -> ExecutionResult:
        """Run graph levels in order; return the aggregate result."""
        result = ExecutionResult()
        graph_trace = self._sink.new_graph_trace()
        result.trace_id = graph_trace
        self._sink.set_trace(graph_trace)
        try:
            to_run = self._graph.levels() if levels is None else sorted(levels)
            for level in to_run:
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

    def pending_levels(self) -> List[int]:
        """Levels (ascending) whose nodes have not yet produced a recorded output."""
        state = self._manager.state
        ran = {a.agent_name for a in state.agent_outputs}
        pending: List[int] = []
        for level in self._graph.levels():
            if any(slug not in ran for slug in self._graph.nodes_for_level(level)):
                pending.append(level)
        return pending

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

        if result.status == "completed" and self._config.agent_delay > 0 and not self._cancelled:
            await asyncio.sleep(self._config.agent_delay)

    async def _run_node(self, slug: str, level: int) -> NodeResult:
        spec = self._graph.node(slug)
        if self._cancelled:
            raise ExecutionCancelled(slug)

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
        confidence = 0.4
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

    def _snapshot_inputs(self, spec: Any) -> Dict[str, Any]:
        snapshot: Dict[str, Any] = {}
        for section in spec.reads:
            try:
                snapshot[section] = self._manager.read(ORCHESTRATOR, section)
            except StatePermissionError:
                continue
        return snapshot

    def _dependencies(self, slug: str) -> Dict[str, Any]:
        deps: Dict[str, Any] = {}
        for pred in self._graph.dependencies(slug):
            field = OWNED_REPORT_FIELDS.get(pred)
            if field:
                deps[pred] = getattr(self._manager.state, field)
        return deps

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
        if slug == "rescue_coordination":
            return {
                "summary": "Rescue guidance unavailable — fallback data only",
                "entry_clearance": "HOLD",
                "priority_sequence": [],
                "objectives": ["Re-run rescue coordination once live agent data is available"],
                "extraction_guidance": [],
                "safety_constraints": ["Verify all specialist reports before staging teams"],
                "triage_notes": [],
                "comms_guidance": "Maintain single incident channel",
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

    def _wrap_agent(self, agent: Any) -> NodeHandler:
        async def wrapped(context: ExecutionContext) -> Dict[str, Any]:
            spec = self._graph.node(context.agent_name)
            return await run_contract_agent(agent, context, self._manager, spec)
        return wrapped

    def _next_cycle_id(self) -> str:
        self._cycle_seq += 1
        return f"CYC-{self._cycle_seq}"

    def _advance_stage(self, stage_token: str) -> None:
        from backend.core.lifecycle import STAGES, normalize_stage

        if normalize_stage(stage_token) in STAGES:
            self._manager.advance(ORCHESTRATOR, stage_token)


class EnhancedGraphExecutor(GraphExecutor):
    """Enhanced executor with circuit breakers, dead-letter queue, and health monitoring."""
    
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
        enable_circuit_breaker: bool = True,
        dead_letter_retention_hours: int = 72,
    ):
        super().__init__(manager, handlers=handlers, agents=agents, registry=registry, 
                        graph=graph, config=config, event_sink=event_sink)
        
        self._enable_circuit_breaker = enable_circuit_breaker
        self._dead_letter_queue = DeadLetterQueue(retention_hours=dead_letter_retention_hours)
        self._circuit_breakers: Dict[str, CircuitBreaker] = {}
        self._health_monitor = AgentHealthMonitor(self._dead_letter_queue)
        
    async def _run_node(self, slug: str, level: int) -> NodeResult:
        if self._enable_circuit_breaker and self._is_circuit_open(slug):
            status = self._circuit_breakers[slug].get_status()
            error_msg = (
                f"Agent {slug} is blocked by circuit breaker. "
                f"Failures: {status['failure_count']}, "
                f"Timeout: {status['timeout_remaining']:.1f}s remaining"
            )
            
            self._sink.emit_failure(slug, error_msg, circuit_breaker=True)
            self._sink.log(
                "WARNING", error_msg, source=slug,
                context={"circuit_breaker_status": status},
                trace_id=f"CIRCUIT-{slug}"
            )
            
            return NodeResult(
                node=slug,
                status="circuit_open",
                attempts=0,
                confidence=0.0,
                cycle_id=f"CIRCUIT-{slug}",
                output=None,
                error=error_msg,
            )
        
        return await super()._run_node(slug, level)
        
    def _record_success(
        self,
        spec: Any,
        context: ExecutionContext,
        output: Dict[str, Any],
        attempt: int,
    ) -> NodeResult:
        result = super()._record_success(spec, context, output, attempt)
        
        if self._enable_circuit_breaker and spec.slug in self._circuit_breakers:
            self._circuit_breakers[spec.slug].record_success()
            
        self._health_monitor.record_success(spec.slug)
        
        return result
        
    def _apply_fallback(
        self,
        spec: Any,
        context: ExecutionContext,
        error: str,
        attempt: int,
    ) -> NodeResult:
        result = super()._apply_fallback(spec, context, error, attempt)
        
        if self._enable_circuit_breaker and spec.slug in self._circuit_breakers:
            if result.status == "fallback":
                self._circuit_breakers[spec.slug].record_failure()
        
        self._health_monitor.record_fallback(spec.slug)
        
        return result
        
    def _is_circuit_open(self, slug: str) -> bool:
        if not self._enable_circuit_breaker:
            return False
            
        if slug not in self._circuit_breakers:
            self._circuit_breakers[slug] = CircuitBreaker()
            
        return self._circuit_breakers[slug].is_open()
        
    def get_circuit_breaker_status(self, slug: Optional[str] = None) -> Dict[str, Any]:
        if slug:
            if slug in self._circuit_breakers:
                return {slug: self._circuit_breakers[slug].get_status()}
            return {slug: {"status": "not_found"}}
            
        return {slug: status.get_status() for slug, status in self._circuit_breakers.items()}
        
    def get_dead_letter_statistics(self) -> Dict[str, Any]:
        return {
            "dead_letter_queue": self._dead_letter_queue.get_statistics(),
            "health_monitor": self._health_monitor.get_statistics(),
        }
        
    def clear_circuit_breaker(self, slug: str) -> None:
        if slug in self._circuit_breakers:
            self._circuit_breakers[slug].record_success()
            self._sink.log(
                "INFO", f"Circuit breaker cleared for {slug} (manual reset)",
                source=slug,
            )
            
    def recover_from_dead_letter(self, execution_id: str) -> bool:
        if self._dead_letter_queue.remove_entry(execution_id):
            self._sink.log(
                "INFO", f"Recovered execution from dead-letter: {execution_id}",
                source="recovery_system",
            )
            return True
        return False


class CircuitBreaker:
    def __init__(self, threshold: int = 5, timeout: float = 300.0):
        self.threshold = threshold
        self.timeout = timeout
        self.failure_count = 0
        self.tripped_at: Optional[float] = None
        self.last_failure: Optional[float] = None
        
    def record_failure(self) -> bool:
        self.failure_count += 1
        self.last_failure = time.time()
        
        if self.failure_count >= self.threshold:
            self.tripped_at = time.time()
            return True
        return False
        
    def record_success(self) -> None:
        if self.tripped_at is not None and time.time() - self.tripped_at > self.timeout:
            self.failure_count = 0
            self.tripped_at = None
        elif self.tripped_at is not None:
            pass
        else:
            self.failure_count = 0
            
    def is_open(self) -> bool:
        if self.tripped_at is None:
            return False
            
        if time.time() - self.tripped_at > self.timeout:
            return False
            
        return True
        
    def get_status(self) -> Dict[str, Any]:
        return {
            "failure_count": self.failure_count,
            "threshold": self.threshold,
            "is_open": self.is_open(),
            "tripped_at": self.tripped_at,
            "last_failure": self.last_failure,
            "timeout_remaining": max(0, self.timeout - (time.time() - self.tripped_at)) if self.tripped_at else 0,
        }


class DeadLetterQueue:
    def __init__(self, retention_hours: int = 72):
        self.entries: List[Dict[str, Any]] = []
        self.retention_hours = retention_hours
        self.logger = logging.getLogger(__name__)
        
    def enqueue(
        self,
        node_id: str,
        node: Any,
        context: ExecutionContext,
        error: Exception,
        attempt: int
    ) -> None:
        entry = {
            "node_id": node_id,
            "node_spec": {
                "slug": getattr(node, 'slug', node_id),
                "reads": getattr(node, 'reads', []),
                "writes": getattr(node, 'writes', []),
                "stage_token": getattr(node, 'stage_token', None),
            },
            "context": {
                "agent_name": context.agent_name,
                "level": context.level,
                "cycle_id": context.cycle_id,
                "inputs": context.inputs,
                "dependencies": context.dependencies,
                "cancelled": context.cancelled,
            },
            "error": {
                "type": type(error).__name__,
                "message": str(error),
                "traceback": self._get_traceback(error),
            },
            "attempt": attempt,
            "timestamp": datetime.utcnow().isoformat(),
            "execution_id": f"{node_id}_{context.cycle_id}_{attempt}",
        }
        
        self.entries.append(entry)
        self.logger.error(
            f"Agent {node_id} failed and enqueued to dead-letter queue: {error}",
            extra={
                "node_id": node_id,
                "error": str(error),
                "attempt": attempt,
                "execution_id": entry["execution_id"],
            }
        )
        
        self._cleanup_old_entries()
        
    def _get_traceback(self, error: Exception) -> str:
        import traceback
        return ''.join(traceback.format_exception(type(error), error, error.__traceback__))
        
    def _cleanup_old_entries(self) -> None:
        cutoff_time = datetime.utcnow() - timedelta(hours=self.retention_hours)
        self.entries = [
            entry for entry in self.entries
            if datetime.fromisoformat(entry["timestamp"]) > cutoff_time
        ]
        
    def get_entries(self, agent_name: Optional[str] = None) -> List[Dict[str, Any]]:
        if agent_name is None:
            return self.entries.copy()
        return [
            entry for entry in self.entries
            if entry["context"]["agent_name"] == agent_name
        ]
        
    def remove_entry(self, execution_id: str) -> bool:
        for i, entry in enumerate(self.entries):
            if entry["execution_id"] == execution_id:
                self.entries.pop(i)
                self.logger.info(f"Removed dead-letter entry: {execution_id}")
                return True
        return False
        
    def get_statistics(self) -> Dict[str, Any]:
        return {
            "total_entries": len(self.entries),
            "retention_hours": self.retention_hours,
            "oldest_entry": self.entries[-1]["timestamp"] if self.entries else None,
            "newest_entry": self.entries[0]["timestamp"] if self.entries else None,
            "entries_by_agent": self._get_entries_by_agent(),
        }
        
    def _get_entries_by_agent(self) -> Dict[str, int]:
        counts = {}
        for entry in self.entries:
            agent = entry["context"]["agent_name"]
            counts[agent] = counts.get(agent, 0) + 1
        return counts


class AgentHealthMonitor:
    def __init__(self, dead_letter_queue: DeadLetterQueue):
        self.dead_letter_queue = dead_letter_queue
        self.success_counts: Dict[str, int] = {}
        self.failure_counts: Dict[str, int] = {}
        self.last_success: Dict[str, float] = {}
        self.last_failure: Dict[str, float] = {}
        self.logger = logging.getLogger(__name__)
        
    def record_success(self, agent_name: str) -> None:
        self.success_counts[agent_name] = self.success_counts.get(agent_name, 0) + 1
        self.last_success[agent_name] = time.time()
        
    def record_failure(self, agent_name: str) -> None:
        self.failure_counts[agent_name] = self.failure_counts.get(agent_name, 0) + 1
        self.last_failure[agent_name] = time.time()
        
    def record_fallback(self, agent_name: str) -> None:
        self.record_failure(agent_name)
        self.logger.warning(f"Agent {agent_name} used fallback path", extra={
            "agent_name": agent_name,
            "failure_count": self.failure_counts.get(agent_name, 0),
        })
        
    def get_health_score(self, agent_name: str) -> float:
        total = self.success_counts.get(agent_name, 0) + self.failure_counts.get(agent_name, 0)
        if total == 0:
            return 1.0
            
        success_rate = self.success_counts.get(agent_name, 0) / total
        
        recent_failures = 0
        if agent_name in self.last_failure:
            recent_failures = self._count_recent_failures(agent_name)
            
        health_score = max(0.0, success_rate - (recent_failures * 0.1))
        return round(health_score, 3)
        
    def _count_recent_failures(self, agent_name: str, window_hours: float = 1.0) -> int:
        cutoff = time.time() - (window_hours * 3600)
        
        entries = self.dead_letter_queue.get_entries(agent_name)
        recent = [
            entry for entry in entries
            if datetime.fromisoformat(entry["timestamp"]).timestamp() > cutoff
        ]
        
        return len(recent)
        
    def get_recovery_recommendations(self, agent_name: str) -> List[str]:
        recommendations = []
        health_score = self.get_health_score(agent_name)
        
        if health_score < 0.5:
            recommendations.extend([
                "Consider increasing retry count for this agent",
                "Review agent configuration and dependencies",
                "Check external service connectivity",
                "Examine logs for patterns in failures",
            ])
            
        if agent_name in self.last_failure and agent_name in self.last_success:
            time_since_success = time.time() - self.last_success[agent_name]
            time_since_failure = time.time() - self.last_failure[agent_name]
            
            if time_since_failure < time_since_success:
                recommendations.append(
                    "Agent recovered recently - monitor for recurrence"
                )
                
        if agent_name in self.last_failure:
            time_since_failure = time.time() - self.last_failure[agent_name]
            if time_since_failure < 3600:
                recommendations.append(
                    "Agent failed recently - check for transient issues"
                )
                
        return recommendations
        
    def get_statistics(self) -> Dict[str, Any]:
        agents = set(list(self.success_counts.keys()) + list(self.failure_counts.keys()))
        
        return {
            "total_agents": len(agents),
            "agent_health": {
                agent: {
                    "health_score": self.get_health_score(agent),
                    "success_count": self.success_counts.get(agent, 0),
                    "failure_count": self.failure_counts.get(agent, 0),
                    "last_success": self.last_success.get(agent),
                    "last_failure": self.last_failure.get(agent),
                    "recommendations": self.get_recovery_recommendations(agent),
                }
                for agent in agents
            },
            "overall_health": self._calculate_overall_health(),
        }
        
    def _calculate_overall_health(self) -> float:
        if not self.success_counts and not self.failure_counts:
            return 1.0
            
        total_score = 0.0
        agent_count = 0
        
        for agent in set(list(self.success_counts.keys()) + list(self.failure_counts.keys())):
            total_score += self.get_health_score(agent)
            agent_count += 1
            
        return round(total_score / agent_count, 3) if agent_count > 0 else 1.0
