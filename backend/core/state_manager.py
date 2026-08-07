"""Mission State Manager.

The single gatekeeper for creating, reading, updating, validating, resetting, snapshotting, and
restoring a ``MissionState``. Enforces the MISSION_STATE.md §6 permission matrix and the state
validation rules, so future components (agents, orchestrator, simulation, assistant) interact
with the mission only through this layer.

Responsibilities (per Phase 1B.1):

* Create ``MissionState``
* Read state (permission-checked)
* Update state (permission-checked + validated)
* Validate updates
* Reset mission
* Snapshot state
* Restore state
"""

from __future__ import annotations

import threading
from datetime import datetime, timezone
from typing import Any, Dict, List, Mapping, Optional, Union

from backend.core.lifecycle import rollback, set_stage
from backend.core.mission_state import (
    EnvironmentSnapshot,
    HumanDecision,
    MissionState,
    MissionSummary,
    StateValidationError,
    utc_now_iso,
)
from backend.core.permissions import (
    ORCHESTRATOR,
    OWNED_REPORT_FIELDS,
    SYSTEM,
    StatePermissionError,
    assert_can_read,
    assert_can_write,
)
from backend.core.state_validation import raise_if_invalid, validate_mutation, validate_state

__all__ = ["MissionStateManager"]

Component = str


class MissionStateManager:
    """Owns a single ``MissionState`` and exposes permission-checked operations."""

    def __init__(self, state: Optional[MissionState] = None, *, log_buffer_limit: int = 1000):
        self._state = state or MissionState(log_buffer_limit=log_buffer_limit)
        self._log_buffer_limit = log_buffer_limit
        self._seq = 0
        self._lock = threading.RLock()

    # ------------------------------------------------------------------
    # State access
    # ------------------------------------------------------------------

    @property
    def state(self) -> MissionState:
        """The live mission state (read-only view for CLI/API consumers)."""
        return self._state

    def get_state(self) -> MissionState:
        return self._state

    def read(self, component: Component, section: Optional[str] = None) -> Dict[str, Any]:
        """Read a section (or the whole state) on behalf of ``component``.

        Returns a deep, JSON-ready copy so consumers cannot mutate the live state by accident.
        """
        with self._lock:
            if section is not None:
                assert_can_read(component, section)
                return self._state.to_dict()[section]
            if component != ORCHESTRATOR and component != SYSTEM:
                allowed = _readable_fields(component)
                data = self._state.to_dict()
                return {k: data[k] for k in allowed if k in data}
            return self._state.to_dict()

    # ------------------------------------------------------------------
    # Lifecycle transitions (MISSION_LIFECYCLE.md)
    # ------------------------------------------------------------------

    def advance(self, component: Component, target: str) -> str:
        """Advance the mission stage through the lifecycle state machine."""
        assert_can_write(component, "status")
        with self._lock:
            result = set_stage(self._state, target, source=component)
            raise_if_invalid(self._state)
            return result

    def rollback(self, component: Component, target: str) -> str:
        assert_can_write(component, "status")
        with self._lock:
            result = rollback(self._state, target, source=component)
            raise_if_invalid(self._state)
            return result

    def record_error(self, component: Component, message: str) -> None:
        """Record a mission execution error (increments ``status.error_count``).

        Used by the GraphExecutor when an agent exhausts its retries and no fallback is applied
        (ORCHESTRATOR.md §5). The message is kept as ``status.last_error`` for the audit trail.
        """
        assert_can_write(component, "status")
        with self._lock:
            self._state.status.error_count += 1
            self._state.status.last_error = message
            self._state._touch()
            raise_if_invalid(self._state)

    @property
    def stage(self) -> str:
        return self._state.status.stage

    @property
    def phase(self) -> str:
        return self._state.status.phase

    # ------------------------------------------------------------------
    # Updates (permission + validation enforced)
    # ------------------------------------------------------------------

    def update(self, component: Component, field: str, value: Any) -> None:
        """Generic validated, permission-checked update for a top-level field."""
        assert_can_write(component, field)
        validate_mutation(field, value)
        with self._lock:
            setattr(self._state, field, value)
            self._state._touch()
            raise_if_invalid(self._state)

    def set_report(self, component: Component, report: Mapping[str, Any]) -> None:
        """Write an owned report dict (MISSION_STATE §4.7)."""
        field = OWNED_REPORT_FIELDS.get(component)
        if field is None:
            raise StatePermissionError(f"{component!r} does not own a report")
        self.update(component, field, dict(report))

    def set_environment(
        self, component: Component, environment: Mapping[str, Any]
    ) -> None:
        assert_can_write(component, "environment")
        snapshot = EnvironmentSnapshot(**environment)
        with self._lock:
            self._state.environment = snapshot
            self._state._touch()
            raise_if_invalid(self._state)

    def set_summary(self, component: Component, summary: Mapping[str, Any]) -> None:
        assert_can_write(component, "summary")
        with self._lock:
            self._state.summary = (
                summary
                if isinstance(summary, MissionSummary)
                else MissionSummary(**summary)
            )
            self._state._touch()
            raise_if_invalid(self._state)

    def append_telemetry(self, component: Component, packets: Union[Mapping, List]) -> None:
        assert_can_write(component, "telemetry")
        with self._lock:
            if isinstance(packets, list):
                self._state.append_telemetry_many(packets)
            else:
                self._state.append_telemetry(packets)
            raise_if_invalid(self._state)

    def append_evidence(
        self,
        component: Component,
        source: str,
        data: Any,
        confidence: float = 0.0,
    ) -> None:
        assert_can_write(component, "evidence")
        with self._lock:
            self._state.append_evidence(source, data, confidence)
            raise_if_invalid(self._state)

    def append_agent_output(
        self, component: Component, output: Mapping[str, Any]
    ) -> None:
        assert_can_write(component, "agent_outputs")
        with self._lock:
            self._state.append_agent_output(output)
            raise_if_invalid(self._state)

    def add_timeline(self, component: Component, event: Mapping[str, Any]) -> None:
        assert_can_write(component, "timeline")
        with self._lock:
            self._state.append_timeline(event)
            raise_if_invalid(self._state)

    def add_log(self, component: Component, entry: Mapping[str, Any]) -> None:
        assert_can_write(component, "logs")
        with self._lock:
            self._state.append_log(entry)
            raise_if_invalid(self._state)

    def add_task(
        self,
        component: Component,
        description: str,
        priority: str = "MEDIUM",
        requires_confirmation: bool = False,
        *,
        dedupe: bool = True,
    ) -> None:
        assert_can_write(component, "tasks")
        with self._lock:
            if dedupe and any(t.description == description for t in self._state.tasks):
                raise StateValidationError(f"duplicate task description {description!r}")
            self._state.add_task(
                description,
                priority=priority,
                requires_confirmation=requires_confirmation,
            )
            raise_if_invalid(self._state)

    def set_confidence(
        self, component: Component, agent: str, score: float
    ) -> None:
        assert_can_write(component, "confidence_scores")
        with self._lock:
            self._state.update_confidence(agent, score)
            raise_if_invalid(self._state)

    def raise_hitl(self, component: Component, decision: Mapping[str, Any]) -> HumanDecision:
        assert_can_write(component, "human_decisions")
        with self._lock:
            record = self._state.raise_decision(decision)
            raise_if_invalid(self._state)
            return record

    def raise_hitl_atomic(
        self,
        component: Component,
        decision: Mapping[str, Any],
        review_needed: bool,
    ) -> HumanDecision:
        """Raise a HITL decision and set ``summary.needs_human_review`` atomically.

        The state validator requires ``summary.needs_human_review == (pending > 0)`` at every
        step; performing the decision raise and the summary flag update in one locked, validated
        mutation keeps the state consistent (used by the HITL gate).
        """
        assert_can_write(component, "human_decisions")
        assert_can_write(component, "summary")
        with self._lock:
            record = self._state.raise_decision(decision)
            if self._state.summary is not None:
                self._state.summary = self._state.summary.model_copy(
                    update={"needs_human_review": review_needed}
                )
            self._state._touch()
            raise_if_invalid(self._state)
            return record

    def resolve_hitl_atomic(
        self,
        component: Component,
        decision_id: str,
        status: str,
        *,
        resolved_by: str = "supervisor",
        notes: Optional[str] = None,
        review_needed: Optional[bool] = None,
    ) -> HumanDecision:
        """Resolve a HITL decision, optionally syncing ``summary.needs_human_review`` atomically."""
        assert_can_write(component, "human_decisions")
        assert_can_write(component, "summary")
        with self._lock:
            record = self._state.resolve_decision(
                decision_id, status, resolved_by=resolved_by, notes=notes
            )
            if review_needed is not None and self._state.summary is not None:
                self._state.summary = self._state.summary.model_copy(
                    update={"needs_human_review": review_needed}
                )
            self._state._touch()
            raise_if_invalid(self._state)
            return record

    def resolve_hitl(
        self,
        component: Component,
        decision_id: str,
        status: str,
        *,
        resolved_by: str = "supervisor",
        notes: Optional[str] = None,
    ) -> HumanDecision:
        assert_can_write(component, "human_decisions")
        with self._lock:
            record = self._state.resolve_decision(
                decision_id, status, resolved_by=resolved_by, notes=notes
            )
            raise_if_invalid(self._state)
            return record

    # ------------------------------------------------------------------
    # Validation
    # ------------------------------------------------------------------

    def validate(self) -> List[str]:
        """Return consistency problems (empty list = consistent)."""
        return validate_state(self._state)

    def validate_raise(self) -> None:
        """Raise if the state is inconsistent."""
        raise_if_invalid(self._state)

    # ------------------------------------------------------------------
    # Mission lifecycle helpers
    # ------------------------------------------------------------------

    def create(
        self,
        incident_text: str,
        *,
        environment_id: str = "",
        mission_name: str = "",
    ) -> MissionState:
        """Create a fresh mission and move it to ``initialized``."""
        now = utc_now_iso()
        state = MissionState(log_buffer_limit=self._log_buffer_limit)
        state.metadata.mission_id = self._generate_mission_id()
        state.metadata.incident_text = incident_text
        state.metadata.environment_id = environment_id
        state.metadata.mission_name = mission_name or incident_text[:60]
        state.metadata.started_at = now
        state.metadata.updated_at = now
        state.status.is_running = True
        self._state = state
        self.add_timeline(
            ORCHESTRATOR,
            {
                "type": "mission_start",
                "message": f"mission {state.metadata.mission_id} started",
                "mission_id": state.metadata.mission_id,
                "data": {"incident_text": incident_text},
            },
        )
        set_stage(self._state, "initialized", source=ORCHESTRATOR)
        raise_if_invalid(self._state)
        return state

    def reset(self, component: Component = SYSTEM) -> None:
        """Reset the mission: replace the state with a fresh, empty instance.

        The previous mission's data is discarded; the mission-id counter keeps counting so a new
        ``create`` never collides with a previously issued id.
        """
        assert_can_write(component, "metadata")
        with self._lock:
            self._state = MissionState(log_buffer_limit=self._log_buffer_limit)

    # ------------------------------------------------------------------
    # Snapshot / restore (MISSION_STATE §7)
    # ------------------------------------------------------------------

    def snapshot(self) -> Dict[str, Any]:
        """Export a deep, JSON-ready snapshot of the current state."""
        return self._state.snapshot()

    def restore(self, component: Component, data: Mapping[str, Any]) -> None:
        """Restore state from a snapshot/dict, preserving instance identity.

        Requires the ``system`` role (root tooling) and validates the restored state.
        """
        assert_can_write(component, "metadata")
        with self._lock:
            self._state.restore(data)
            raise_if_invalid(self._state)

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    def _generate_mission_id(self) -> str:
        self._seq += 1
        date = datetime.now(timezone.utc).strftime("%Y-%m%d")
        return f"MISS-{date}-{self._seq:03d}"


def _readable_fields(component: str) -> set:
    from backend.core.permissions import READ_PERMISSIONS

    return READ_PERMISSIONS[component]
