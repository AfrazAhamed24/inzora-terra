"""MissionState: the single source of truth shared by every component.

Implements ``docs/specs/MISSION_STATE.md`` (v1.0). ``MissionState`` is a **strict superset** of
the legacy ``TERRAState`` (see ``backend/core/gop.py`` for the compatibility shim).

Design rules implemented here:

* One ``MissionState`` instance per mission.
* Append-only histories: ``telemetry``, ``evidence``, ``agent_outputs``, ``timeline``,
  ``human_decisions``, and ``logs`` only support ``append`` / ``extend``. In-place mutation is
  rejected at runtime (``AppendOnlyList``).
* Owned reports are replaced wholesale by their owning agent.
* ``metadata.updated_at`` is refreshed on every mutation.
* The whole state serializes to a single, stable-ordered JSON document.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Mapping, Optional, get_args

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic_core import core_schema

__all__ = [
    "AppendOnlyError",
    "AppendOnlyList",
    "MissionStateError",
    "StateValidationError",
    "utc_now_iso",
    "MissionMetadata",
    "MissionStatus",
    "TelemetryPacket",
    "EnvironmentSnapshot",
    "EvidenceEntry",
    "Task",
    "AgentOutput",
    "TimelineEvent",
    "HumanDecision",
    "LogEntry",
    "MissionSummary",
    "AssistantContext",
    "MissionState",
]


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------


class MissionStateError(Exception):
    """Base error for the mission state engine."""


class AppendOnlyError(MissionStateError):
    """Raised when an append-only collection is mutated in place."""


class StateValidationError(MissionStateError):
    """Raised when a state mutation violates the state model."""


# ---------------------------------------------------------------------------
# Time helpers
# ---------------------------------------------------------------------------


def utc_now_iso() -> str:
    """UTC ISO-8601 timestamp with a ``Z`` suffix (MISSION_STATE §7)."""
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _validate_confidence(value: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("confidence must be a number")
    if value < 0.0 or value > 1.0:
        raise ValueError("confidence must be within [0.0, 1.0]")
    return float(value)


# MISSION_STATE §4.1 examples use the hyphenated form (MISS-2026-0815-001); API_SPEC §2 uses
# MISS-YYYYMMDD-NNN. Both are accepted; the manager generates the hyphenated form.
_MISSION_ID_RE = re.compile(r"MISS-(?:\d{4}-\d{4}|\d{8})-\d{3}")


# ---------------------------------------------------------------------------
# Append-only list
# ---------------------------------------------------------------------------


class AppendOnlyList(list):
    """A ``list`` that only permits ``append`` / ``extend``.

    Rejects every in-place mutation (item assignment, deletion, ``pop``, ``remove``, ``clear``,
    ``sort``, ``reverse``, ``insert``, augmented assignment) so append-only histories cannot be
    violated. Pydantic v2 support is provided via ``__get_pydantic_core_schema__``.
    """

    @classmethod
    def __get_pydantic_core_schema__(cls, source_type: Any, handler: Any) -> core_schema.CoreSchema:
        args = get_args(source_type)
        items_schema = handler.generate_schema(args[0] if args else Any)
        return core_schema.no_info_after_validator_function(
            cls,
            core_schema.list_schema(items_schema=items_schema),
        )

    def _deny(self, *args: Any, **kwargs: Any) -> Any:
        raise AppendOnlyError(
            f"{type(self).__name__} is append-only; in-place mutation is not allowed"
        )

    def __setitem__(self, key: Any, value: Any) -> None:
        self._deny()

    def __delitem__(self, key: Any) -> None:
        self._deny()

    def insert(self, index: int, object: Any) -> None:
        self._deny()

    def pop(self, *args: Any) -> Any:
        self._deny()

    def remove(self, value: Any) -> None:
        self._deny()

    def clear(self) -> None:
        self._deny()

    def reverse(self) -> None:
        self._deny()

    def sort(self, *args: Any, **kwargs: Any) -> None:
        self._deny()

    def __iadd__(self, other: Any) -> Any:
        self._deny()

    def __imul__(self, n: int) -> Any:
        self._deny()

    def append_many(self, items: List[Any]) -> None:
        """Sanctioned bulk append (the ``append_many`` of MISSION_STATE §5)."""
        self.extend(items)

    def _replace(self, items: List[Any]) -> None:
        """Sanctioned internal replacement (private).

        Used only for bounded ring-buffer trimming (``logs``) and HITL decision resolution.
        Bypasses the in-place guards on purpose; it is not part of the public API.
        """
        super().clear()
        super().extend(items)


# ---------------------------------------------------------------------------
# Sub-models (MISSION_STATE §4)
# ---------------------------------------------------------------------------


class _StrictModel(BaseModel):
    """Base model: reject unknown fields on load to prevent inconsistent state."""

    model_config = ConfigDict(extra="forbid")


class MissionMetadata(_StrictModel):
    """Mission identity + timing (MISSION_STATE §4.1)."""

    mission_id: str = ""
    incident_text: str = ""
    started_at: str = Field(default_factory=utc_now_iso)
    updated_at: str = Field(default_factory=utc_now_iso)
    environment_id: str = ""
    mission_name: str = ""
    version: str = "1.0"

    @field_validator("mission_id")
    @classmethod
    def _mission_id_pattern(cls, v: str) -> str:
        if v and not _MISSION_ID_RE.fullmatch(v):
            raise ValueError(
                f"mission_id {v!r} must match 'MISS-YYYYMMDD-NNN' (empty allowed before start)"
            )
        return v


class MissionStatus(_StrictModel):
    """Lifecycle state token + flags (MISSION_STATE §4.2)."""

    stage: str = "created"
    phase: str = "setup"
    is_running: bool = False
    error_count: int = 0
    last_error: Optional[str] = None


class TelemetryPacket(_StrictModel):
    """A single sensor packet in the ordered stream (MISSION_STATE §4.3)."""

    packet_id: str
    mission_id: str
    ts: str = Field(default_factory=utc_now_iso)
    zone: str
    sensor_type: str
    metric: str
    value: float
    unit: str
    confidence: float = 1.0
    source: str = "simulated"

    @field_validator("confidence")
    @classmethod
    def _conf(cls, v: float) -> float:
        return _validate_confidence(v)


class EnvironmentSnapshot(_StrictModel):
    """Current best-known environment projection (MISSION_STATE §4.4)."""

    sensors: Dict[str, Any] = Field(default_factory=dict)
    weather: Dict[str, Any] = Field(default_factory=dict)
    building: Dict[str, Any] = Field(default_factory=dict)


class EvidenceEntry(_StrictModel):
    """An ingested evidence record (MISSION_STATE §4.5; unchanged from TERRAState)."""

    source: str
    data: Any
    timestamp: str = Field(default_factory=utc_now_iso)
    confidence: float = 0.0

    @field_validator("confidence")
    @classmethod
    def _conf(cls, v: float) -> float:
        return _validate_confidence(v)


class Task(_StrictModel):
    """A mission task (MISSION_STATE §8; unchanged from TERRAState)."""

    id: str
    description: str
    priority: str = "MEDIUM"
    status: str = "PENDING"
    assigned_to: Optional[str] = None
    requires_confirmation: bool = False
    confirmed: Optional[bool] = None

    @field_validator("priority")
    @classmethod
    def _priority(cls, v: str) -> str:
        if v not in ("CRITICAL", "HIGH", "MEDIUM", "LOW"):
            raise ValueError(f"invalid task priority {v!r}")
        return v


class AgentOutput(_StrictModel):
    """A recorded agent run result (MISSION_STATE §4.6)."""

    agent_name: str
    cycle_id: str = ""
    output: Dict[str, Any] = Field(default_factory=dict)
    confidence: float = 0.0
    timestamp: str = Field(default_factory=utc_now_iso)
    status: str = "ok"

    @field_validator("confidence")
    @classmethod
    def _conf(cls, v: float) -> float:
        return _validate_confidence(v)

    @field_validator("status")
    @classmethod
    def _status(cls, v: str) -> str:
        if v not in ("ok", "error", "fallback"):
            raise ValueError(f"invalid agent output status {v!r}")
        return v


class TimelineEvent(_StrictModel):
    """An ordered, structured event for the mission timeline (MISSION_STATE §4.9).

    ``mission_id`` / ``trace_id`` are correlation fields (LOGGING_SPEC.md §3, §7): every event
    carries the owning mission and the cycle/run trace so a full mission can be reconstructed.
    """

    ts: str = Field(default_factory=utc_now_iso)
    type: str
    agent: Optional[str] = None
    message: str = ""
    mission_id: str = ""
    trace_id: str = ""
    data: Optional[Dict[str, Any]] = None


class HumanDecision(_StrictModel):
    """A Human-in-the-Loop decision record (MISSION_STATE §4.10)."""

    id: str
    request_type: str
    summary: str
    related_agent: Optional[str] = None
    related_task_id: Optional[str] = None
    status: str = "pending"
    raised_at: str = Field(default_factory=utc_now_iso)
    resolved_at: Optional[str] = None
    resolved_by: Optional[str] = None
    decision_notes: Optional[str] = None

    @field_validator("request_type")
    @classmethod
    def _request_type(cls, v: str) -> str:
        if v not in ("confirm", "verify", "approve"):
            raise ValueError(f"invalid decision request_type {v!r}")
        return v

    @field_validator("status")
    @classmethod
    def _status(cls, v: str) -> str:
        if v not in ("pending", "confirmed", "overridden", "timeout"):
            raise ValueError(f"invalid decision status {v!r}")
        return v


class LogEntry(_StrictModel):
    """A structured log record (MISSION_STATE §4.11; full spec in LOGGING_SPEC.md).

    ``mission_id`` is required by the logging spec; ``trace_id`` groups a graph run (``GRAPH-<n>``)
    or an agent cycle (``CYC-<n>``); ``data`` carries an optional structured payload.
    """

    id: str
    ts: str = Field(default_factory=utc_now_iso)
    level: str = "INFO"
    source: str = "system"
    message: str = ""
    mission_id: str = ""
    trace_id: str = ""
    context: Optional[Dict[str, Any]] = None
    data: Optional[Dict[str, Any]] = None

    @field_validator("level")
    @classmethod
    def _level(cls, v: str) -> str:
        if v not in ("DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"):
            raise ValueError(f"invalid log level {v!r}")
        return v


class MissionSummary(_StrictModel):
    """The orchestrator-produced mission briefing (MISSION_STATE §4.12)."""

    mission_briefing: Dict[str, Any] = Field(default_factory=dict)
    confidence_scores: Dict[str, float] = Field(default_factory=dict)
    needs_human_review: bool = False
    generated_at: str = Field(default_factory=utc_now_iso)
    handoffs: List[Dict[str, Any]] = Field(default_factory=list)


class AssistantContext(_StrictModel):
    """Mission Assistant conversation state (MISSION_STATE §4.13)."""

    session_id: str = ""
    message_count: int = 0
    last_query: Optional[str] = None
    last_response: Optional[str] = None
    cited_references: List[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# MissionState
# ---------------------------------------------------------------------------


class MissionState(_StrictModel):
    """The Global Operating Picture. Strict superset of ``TERRAState``.

    Top-level structure follows MISSION_STATE §3. The append-only collections are typed as
    ``AppendOnlyList`` so in-place mutation is rejected at runtime.
    """

    metadata: MissionMetadata = Field(default_factory=MissionMetadata)
    status: MissionStatus = Field(default_factory=MissionStatus)

    telemetry: AppendOnlyList[TelemetryPacket] = Field(default_factory=AppendOnlyList)
    environment: EnvironmentSnapshot = Field(default_factory=EnvironmentSnapshot)
    evidence: AppendOnlyList[EvidenceEntry] = Field(default_factory=AppendOnlyList)
    tasks: List[Task] = Field(default_factory=list)
    agent_outputs: AppendOnlyList[AgentOutput] = Field(default_factory=AppendOnlyList)

    risk_report: Dict[str, Any] = Field(default_factory=dict)
    victim_map: Dict[str, Any] = Field(default_factory=dict)
    resource_allocation: Dict[str, Any] = Field(default_factory=dict)
    knowledge_results: Dict[str, Any] = Field(default_factory=dict)
    rescue_guidance: Dict[str, Any] = Field(default_factory=dict)

    confidence_scores: Dict[str, float] = Field(default_factory=dict)

    timeline: AppendOnlyList[TimelineEvent] = Field(default_factory=AppendOnlyList)
    human_decisions: AppendOnlyList[HumanDecision] = Field(default_factory=AppendOnlyList)
    logs: AppendOnlyList[LogEntry] = Field(default_factory=AppendOnlyList)

    summary: Optional[MissionSummary] = None
    assistant_context: AssistantContext = Field(default_factory=AssistantContext)

    log_buffer_limit: int = Field(default=1000, exclude=True)

    # ------------------------------------------------------------------
    # Lifecycle state: exposed for MISSION_LIFECYCLE.md integration.
    # ------------------------------------------------------------------

    @property
    def stage(self) -> str:
        """Compatibility accessor: ``state.stage`` -> ``status.stage``."""
        return self.status.stage

    @stage.setter
    def stage(self, value: str) -> None:
        # Thin compatibility shim so the current CLI/agents keep working. Strict
        # lifecycle enforcement lives in ``backend/core/lifecycle.py``.
        from backend.core.lifecycle import set_stage

        set_stage(self, value)

    @property
    def incident_id(self) -> str:
        """Compatibility accessor: ``state.incident_id`` -> ``metadata.mission_id``."""
        return self.metadata.mission_id

    @incident_id.setter
    def incident_id(self, value: str) -> None:
        self.metadata.mission_id = value

    @property
    def incident_text(self) -> str:
        """Compatibility accessor: ``state.incident_text`` -> ``metadata.incident_text``."""
        return self.metadata.incident_text

    @incident_text.setter
    def incident_text(self, value: str) -> None:
        self.metadata.incident_text = value

    @property
    def pending_confirmations(self) -> List[Dict[str, Any]]:
        """Compatibility accessor: ``human_decisions`` re-expressed as the legacy list of dicts.

        Returns the pending HITL records (the historical ``pending_confirmations`` payload).
        """
        return [
            decision.model_dump()
            for decision in self.human_decisions
            if decision.status == "pending"
        ]

    @pending_confirmations.setter
    def pending_confirmations(self, value: List[Dict[str, Any]]) -> None:
        for record in value:
            self.human_decisions.append(HumanDecision(**record))

    # ------------------------------------------------------------------
    # Append-only history helpers
    # ------------------------------------------------------------------

    def append_telemetry(self, packet: Mapping[str, Any]) -> None:
        self.telemetry.append(
            TelemetryPacket(**packet) if not isinstance(packet, TelemetryPacket) else packet
        )
        self._touch()

    def append_telemetry_many(self, packets: List[Any]) -> None:
        for packet in packets:
            self.append_telemetry(packet)
        self._touch()

    def append_evidence(self, source: str, data: Any, confidence: float = 0.0) -> None:
        self.evidence.append(EvidenceEntry(source=source, data=data, confidence=confidence))
        self._touch()

    # Legacy alias (TERRAState compatibility).
    def add_evidence(self, source: str, data: Any, confidence: float = 0.0) -> None:
        self.append_evidence(source, data, confidence)

    def append_agent_output(self, output: Mapping[str, Any]) -> None:
        self.agent_outputs.append(
            AgentOutput(**output) if not isinstance(output, AgentOutput) else output
        )
        self._touch()

    def append_timeline(self, event: Mapping[str, Any]) -> None:
        self.timeline.append(
            TimelineEvent(**event) if not isinstance(event, TimelineEvent) else event
        )
        self._touch()

    def append_log(self, entry: Mapping[str, Any]) -> None:
        log = LogEntry(**entry) if not isinstance(entry, LogEntry) else entry
        if len(self.logs) >= self.log_buffer_limit:
            # Bounded in-memory ring buffer (MISSION_STATE §4.11): drop oldest.
            keep = list(self.logs)[-(self.log_buffer_limit - 1):]
            self.logs._replace(keep)
        self.logs.append(log)
        self._touch()

    def raise_decision(self, decision: Mapping[str, Any]) -> HumanDecision:
        record = HumanDecision(**decision) if not isinstance(decision, HumanDecision) else decision
        self.human_decisions.append(record)
        self._touch()
        return record

    def resolve_decision(
        self,
        decision_id: str,
        status: str,
        *,
        resolved_by: str = "supervisor",
        notes: Optional[str] = None,
    ) -> HumanDecision:
        """Resolve a pending decision in place (append-only list item update).

        Note: ``AppendOnlyList`` forbids index mutation; the decision record lives inside the
        list so we rebuild the matching record via a non-mutating map below.
        """
        records = list(self.human_decisions)
        found: Optional[HumanDecision] = None
        for i, record in enumerate(records):
            if record.id == decision_id:
                found = record
                updated = record.model_copy(
                    update={
                        "status": status,
                        "resolved_at": utc_now_iso(),
                        "resolved_by": resolved_by,
                        "decision_notes": notes,
                    }
                )
                records[i] = updated
                break
        if found is None:
            raise StateValidationError(f"unknown decision id {decision_id!r}")
        if found.status != "pending":
            raise StateValidationError(f"decision {decision_id!r} is not pending")
        if status not in ("confirmed", "overridden", "timeout"):
            raise StateValidationError(f"invalid resolution status {status!r}")
        self.human_decisions._replace(records)
        self._touch()
        return updated

    # ------------------------------------------------------------------
    # Confidence helpers (legacy API)
    # ------------------------------------------------------------------

    def update_confidence(self, agent: str, score: float) -> None:
        try:
            validated = _validate_confidence(score)
        except ValueError as exc:
            raise StateValidationError(str(exc)) from exc
        self.confidence_scores[agent] = validated
        self._touch()

    # ------------------------------------------------------------------
    # Task helpers (legacy API)
    # ------------------------------------------------------------------

    def add_task(
        self,
        description: str,
        priority: str = "MEDIUM",
        requires_confirmation: bool = False,
        dedupe: bool = False,
    ) -> Task:
        if dedupe and any(t.description == description for t in self.tasks):
            raise StateValidationError(f"duplicate task description {description!r}")
        task = Task(
            id=f"task_{len(self.tasks) + 1}",
            description=description,
            priority=priority,
            requires_confirmation=requires_confirmation,
        )
        self.tasks.append(task)
        self._touch()
        return task

    # ------------------------------------------------------------------
    # Serialization / snapshot (MISSION_STATE §7)
    # ------------------------------------------------------------------

    def to_dict(self) -> Dict[str, Any]:
        """Stable-ordered JSON-ready dump of the whole state."""
        return self.model_dump()

    def to_json(self, **kwargs: Any) -> str:
        return json.dumps(self.to_dict(), **kwargs)

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> "MissionState":
        return cls.model_validate(data)

    @classmethod
    def from_json(cls, data: str) -> "MissionState":
        return cls.model_validate(json.loads(data))

    def snapshot(self) -> Dict[str, Any]:
        """Export a deep snapshot of the current state (safe for restore)."""
        return self.model_dump()

    def restore(self, data: Mapping[str, Any]) -> "MissionState":
        """Restore state from a snapshot/dict in place, preserving object identity.

        Keeps the "one MissionState instance per mission" invariant: the existing instance is
        repopulated rather than replaced. The ring-buffer limit is preserved.
        """
        buffer_limit = self.log_buffer_limit
        fresh = self.__class__.model_validate(data)
        fresh.log_buffer_limit = buffer_limit
        self.__dict__.clear()
        self.__dict__.update(fresh.__dict__)
        return self

    def _touch(self) -> None:
        self.metadata.updated_at = utc_now_iso()
