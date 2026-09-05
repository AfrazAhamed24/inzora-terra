"""State validation for the mission state engine.

Implements the validation contract of MISSION_STATE.md: reject invalid mutations and prevent
inconsistent mission state. ``MissionStateManager`` calls these before applying every update and
after each update (consistency check).

Two entry points:

* :func:`validate_mutation` — validates a single field value before it is applied.
* :func:`validate_state` / :func:`raise_if_invalid` — full-consistency checks over a state.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List

from backend.core.lifecycle import STAGES, normalize_stage, phase_for
from backend.core.mission_state import StateValidationError
from backend.core.permissions import APPEND_ONLY_FIELDS

__all__ = ["validate_mutation", "validate_state", "raise_if_invalid"]

_MISSION_ID_RE = re.compile(r"MISS-(?:\d{4}-\d{4}|\d{8})-\d{3}")

_VALID_PRIORITIES = {"CRITICAL", "HIGH", "MEDIUM", "LOW"}
_VALID_LEVELS = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}
_VALID_OUTPUT_STATUS = {"ok", "error", "fallback"}
_VALID_DECISION_STATUS = {"pending", "confirmed", "overridden", "timeout"}


def _confidence_problems(confidences: Dict[str, float], path: str) -> List[str]:
    problems: List[str] = []
    for agent, score in confidences.items():
        if isinstance(score, bool) or not isinstance(score, (int, float)):
            problems.append(f"{path}.{agent}: confidence must be a number")
        elif not (0.0 <= score <= 1.0):
            problems.append(f"{path}.{agent}: confidence {score} outside [0.0, 1.0]")
    return problems


def validate_mutation(field: str, value: Any) -> None:
    """Validate a single field mutation; raises :class:`StateValidationError` on violation."""
    if field in APPEND_ONLY_FIELDS:
        raise StateValidationError(
            f"{field!r} is append-only; mutations must use the append_* helpers"
        )
    if field == "confidence_scores":
        problems = _confidence_problems(value, "confidence_scores")
        if problems:
            raise StateValidationError("; ".join(problems))
    if field in ("risk_report", "victim_map", "resource_allocation", "knowledge_results",
                 "rescue_guidance"):
        if not isinstance(value, dict):
            raise StateValidationError(f"{field!r} must be a dict")
    if field == "environment":
        if not isinstance(value, dict):
            raise StateValidationError("environment must be a dict")


def validate_state(state: Any) -> List[str]:
    """Return a list of consistency problems for the given state (empty = consistent)."""
    problems: List[str] = []

    stage = normalize_stage(state.status.stage)
    if stage not in STAGES:
        problems.append(f"status.stage {state.status.stage!r} is not a known stage")

    phase = phase_for(state.status.stage)
    if state.status.phase != phase:
        problems.append(
            f"status.phase {state.status.phase!r} does not match stage "
            f"{state.status.stage!r} (expected {phase!r})"
        )

    if state.status.error_count < 0:
        problems.append("status.error_count cannot be negative")
    if state.status.is_running and stage in ("completed", "aborted", "errored"):
        problems.append(f"terminal stage {stage!r} cannot be running")

    problems.extend(_confidence_problems(state.confidence_scores, "confidence_scores"))

    for task in state.tasks:
        if task.priority not in _VALID_PRIORITIES:
            problems.append(f"task {task.id} has invalid priority {task.priority!r}")
        if task.requires_confirmation and task.confirmed and task.status != "DONE":
            problems.append(f"task {task.id} confirmed but status is {task.status!r}")

    for output in state.agent_outputs:
        if output.status not in _VALID_OUTPUT_STATUS:
            problems.append(
                f"agent_output {output.cycle_id or output.agent_name} has invalid status "
                f"{output.status!r}"
            )

    for decision in state.human_decisions:
        if decision.status not in _VALID_DECISION_STATUS:
            problems.append(f"decision {decision.id} has invalid status {decision.status!r}")
        if decision.status == "pending" and decision.resolved_at is not None:
            problems.append(f"pending decision {decision.id} has a resolved_at timestamp")
        if decision.status != "pending" and decision.resolved_at is None:
            problems.append(f"resolved decision {decision.id} is missing resolved_at")

    for log in state.logs:
        if log.level not in _VALID_LEVELS:
            problems.append(f"log {log.id} has invalid level {log.level!r}")

    pending = sum(1 for d in state.human_decisions if d.status == "pending")
    if state.summary is not None and state.summary.needs_human_review != (pending > 0):
        problems.append(
            "summary.needs_human_review does not match pending human_decisions "
            f"({pending} pending)"
        )

    if stage == "completed" and pending > 0:
        problems.append("mission is completed but has pending human_decisions")

    if stage == "evidence_ingested" and not state.evidence:
        problems.append("stage is evidence_ingested but no evidence is present")

    if state.metadata.mission_id and not _MISSION_ID_RE.fullmatch(state.metadata.mission_id):
        problems.append(
            f"metadata.mission_id {state.metadata.mission_id!r} must match 'MISS-YYYYMMDD-NNN'"
        )

    if len(state.logs) > state.log_buffer_limit:
        problems.append(
            f"logs exceed ring buffer limit ({len(state.logs)} > {state.log_buffer_limit})"
        )

    return problems


def raise_if_invalid(state: Any) -> None:
    """Raise :class:`StateValidationError` if the state is inconsistent."""
    problems = validate_state(state)
    if problems:
        raise StateValidationError("mission state is inconsistent: " + "; ".join(problems))
