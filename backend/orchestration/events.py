"""EventSink: single point for mission timeline events and structured logs.

The orchestrator and its GraphExecutor emit all timeline/log records through this sink
(ORCHESTRATOR.md §3). Every write goes through the ``MissionStateManager`` so append-only rules
and validation are enforced; the sink never touches ``MissionState`` directly.

Implements LOGGING_SPEC.md: every record is correlated with ``mission_id``, ``trace_id``,
``agent_id``, a timestamp, and the lifecycle ``stage`` so an entire mission can be reconstructed.
Typed emitters cover the event categories (mission, agent, execution, lifecycle, decision, retry,
failure, handoff); each writes a structured log record and, where the vocabulary exists, a
matching timeline event.
"""

from __future__ import annotations

from contextlib import contextmanager
from typing import Any, Dict, Iterator, Mapping, Optional

from backend.core.permissions import ORCHESTRATOR
from backend.core.state_manager import MissionStateManager

__all__ = [
    "EventSink",
    "MISSION_EVENT_TYPES",
    "AGENT_EVENT_TYPES",
]

# Timeline vocabulary (ORCHESTRATOR.md §9).
MISSION_EVENT_TYPES = ("mission_start", "mission_complete", "mission_aborted")
AGENT_EVENT_TYPES = ("agent_start", "agent_complete", "agent_retry", "agent_failed")


class EventSink:
    """Writes correlated timeline events and structured logs to the mission state."""

    def __init__(self, manager: MissionStateManager):
        self._manager = manager
        self._log_seq = 0
        self._graph_seq = 0
        self._active_trace: Optional[str] = None

    # ------------------------------------------------------------------
    # Correlation
    # ------------------------------------------------------------------

    @property
    def mission_id(self) -> str:
        """The owning mission id (empty before a mission is created)."""
        return self._manager.state.metadata.mission_id or ""

    @property
    def stage(self) -> str:
        """The current lifecycle stage (LOGGING_SPEC §3 ``context.stage``)."""
        return self._manager.stage

    def new_graph_trace(self) -> str:
        """Allocate the next run-level trace id (``GRAPH-<n>``)."""
        self._graph_seq += 1
        return f"GRAPH-{self._graph_seq}"

    def set_trace(self, trace_id: str) -> None:
        """Set the active trace; records emitted without an explicit trace inherit it."""
        self._active_trace = trace_id

    def clear_trace(self) -> None:
        self._active_trace = None

    @contextmanager
    def trace(self, trace_id: str) -> Iterator[None]:
        """Temporarily set the active trace for a block (e.g. one agent cycle)."""
        previous = self._active_trace
        self._active_trace = trace_id
        try:
            yield
        finally:
            self._active_trace = previous

    def _correlation(
        self, *, trace_id: Optional[str] = None, stage: Optional[str] = None
    ) -> Dict[str, str]:
        return {
            "mission_id": self.mission_id,
            "trace_id": trace_id or self._active_trace or "",
            "stage": stage or self.stage,
        }

    # ------------------------------------------------------------------
    # Low-level writers
    # ------------------------------------------------------------------

    def emit(
        self,
        event: Mapping[str, Any],
        *,
        trace_id: Optional[str] = None,
        stage: Optional[str] = None,
    ) -> None:
        """Append a timeline event, enriched with correlation fields."""
        record = dict(event)
        corr = self._correlation(trace_id=trace_id, stage=stage)
        record.setdefault("mission_id", corr["mission_id"])
        record.setdefault("trace_id", corr["trace_id"])

        data = dict(record.get("data") or {})
        data.setdefault("stage", corr["stage"])
        if record.get("agent"):
            data.setdefault("agent_id", record["agent"])
        record["data"] = data
        self._manager.add_timeline(ORCHESTRATOR, record)

    def log(
        self,
        level: str,
        message: str,
        source: str = "orchestrator",
        context: Optional[Dict[str, Any]] = None,
        *,
        data: Optional[Dict[str, Any]] = None,
        trace_id: Optional[str] = None,
        stage: Optional[str] = None,
    ) -> str:
        """Append a structured log record (LOGGING_SPEC §3) and return its id."""
        self._log_seq += 1
        corr = self._correlation(trace_id=trace_id, stage=stage)
        log_context = dict(context or {})
        log_context.setdefault("stage", corr["stage"])
        record = {
            "id": f"LOG-{self._log_seq}",
            "level": level,
            "source": source,
            "message": message,
            "mission_id": corr["mission_id"],
            "trace_id": corr["trace_id"],
            "context": log_context or None,
            "data": data,
        }
        self._manager.add_log(ORCHESTRATOR, record)
        return record["id"]

    # ------------------------------------------------------------------
    # Combined timeline + log helper
    # ------------------------------------------------------------------

    def timeline(
        self,
        type_: str,
        agent: str,
        message: str,
        *,
        level: str = "INFO",
        data: Optional[Dict[str, Any]] = None,
        trace_id: Optional[str] = None,
        source: Optional[str] = None,
        stage: Optional[str] = None,
    ) -> None:
        """Emit a timeline event plus a matching structured log record."""
        self.emit(
            {"type": type_, "agent": agent, "message": message, "data": data},
            trace_id=trace_id,
            stage=stage,
        )
        self.log(
            level,
            message,
            source=source or agent or "orchestrator",
            data=data,
            trace_id=trace_id,
            stage=stage,
        )

    # ------------------------------------------------------------------
    # Typed event emitters (LOGGING_SPEC §5 sources/obligations)
    # ------------------------------------------------------------------

    def emit_mission(
        self,
        event_type: str,
        message: str,
        *,
        level: str = "INFO",
        data: Optional[Dict[str, Any]] = None,
        trace_id: Optional[str] = None,
    ) -> None:
        """Mission event (e.g. ``mission_start``, ``mission_complete``)."""
        self.timeline(event_type, "orchestrator", message, level=level, data=data, trace_id=trace_id)

    def emit_agent(
        self,
        event_type: str,
        agent: str,
        message: str,
        *,
        level: str = "INFO",
        data: Optional[Dict[str, Any]] = None,
        trace_id: Optional[str] = None,
    ) -> None:
        """Agent event (e.g. ``agent_start``, ``agent_complete``)."""
        self.timeline(event_type, agent, message, level=level, data=data, trace_id=trace_id)

    def emit_execution(
        self,
        event_type: str,
        message: str,
        *,
        level: str = "INFO",
        data: Optional[Dict[str, Any]] = None,
        trace_id: Optional[str] = None,
    ) -> None:
        """Execution event (scheduling, level gates, fallback application)."""
        self.timeline(event_type, "orchestrator", message, level=level, data=data, trace_id=trace_id)

    def emit_lifecycle(
        self,
        stage_token: str,
        message: str,
        *,
        level: str = "INFO",
        data: Optional[Dict[str, Any]] = None,
        trace_id: Optional[str] = None,
    ) -> None:
        """Lifecycle event carrying the target stage token."""
        data = dict(data or {})
        data.setdefault("stage", stage_token)
        self.timeline(
            "stage_change", "orchestrator", message, level=level, data=data, trace_id=trace_id
        )

    def emit_decision(
        self,
        decision_id: str,
        request_type: str,
        message: str,
        *,
        level: str = "INFO",
        data: Optional[Dict[str, Any]] = None,
        trace_id: Optional[str] = None,
    ) -> None:
        """Decision (HITL) event; source ``hitl`` per LOGGING_SPEC §5."""
        payload = dict(data or {})
        payload.setdefault("decision_id", decision_id)
        payload.setdefault("request_type", request_type)
        self.timeline("decision", "hitl", message, level=level, data=payload, trace_id=trace_id)

    def emit_retry(
        self,
        agent: str,
        attempt: int,
        error: str,
        *,
        max_retries: Optional[int] = None,
        cycle_id: str = "",
        trace_id: Optional[str] = None,
    ) -> None:
        """Retry event: WARNING log + ``agent_retry`` timeline entry."""
        data: Dict[str, Any] = {"attempt": attempt, "error": error}
        if max_retries is not None:
            data["max_retries"] = max_retries
        if cycle_id:
            data["cycle_id"] = cycle_id
        label = f"retry {attempt}" + (f"/{max_retries}" if max_retries is not None else "")
        self.timeline("agent_retry", agent, label, level="WARNING", data=data, trace_id=trace_id)

    def emit_failure(
        self,
        agent: str,
        error: str,
        *,
        fallback: bool = False,
        data: Optional[Dict[str, Any]] = None,
        trace_id: Optional[str] = None,
    ) -> None:
        """Failure event: ``agent_failed`` timeline entry (+ ERROR log unless fallback)."""
        payload = dict(data or {})
        payload.setdefault("error", error)
        if fallback:
            payload.setdefault("status", "fallback")
            message = f"{agent} using fallback data"
        else:
            message = f"{agent} failed"
        level = "WARNING" if fallback else "ERROR"
        self.timeline("agent_failed", agent, message, level=level, data=payload, trace_id=trace_id)

    def emit_handoff(
        self,
        agent: str,
        target: str,
        message: str,
        *,
        data: Optional[Dict[str, Any]] = None,
        trace_id: Optional[str] = None,
    ) -> None:
        """Handoff event: the completed agent declares its next consumer."""
        payload = dict(data or {})
        payload.setdefault("from", agent)
        payload.setdefault("to", target)
        self.timeline("handoff", agent, message, level="INFO", data=payload, trace_id=trace_id)
