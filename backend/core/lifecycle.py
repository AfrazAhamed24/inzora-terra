"""Mission lifecycle state machine.

Implements ``docs/specs/MISSION_LIFECYCLE.md`` (v1.0). The orchestrator and the future HITL
gate drive missions through this module; ``MissionState.status.stage`` / ``.phase`` reflect the
current position.

The legacy ``stage`` property setter on ``MissionState`` routes through :func:`set_stage` so the
existing CLI/agents keep working while illegal transitions are rejected.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Dict, Optional, Set

if TYPE_CHECKING:
    from backend.core.mission_state import MissionState

from backend.core.mission_state import StateValidationError

__all__ = [
    "STAGES",
    "PHASES",
    "TERMINAL_STAGES",
    "LEGACY_ALIASES",
    "TRANSITIONS",
    "normalize_stage",
    "phase_for",
    "is_terminal",
    "can_transition",
    "set_stage",
    "transition",
    "rollback",
]


# Order defines the canonical linear sequence (used for rollback detection).
STAGES: list[str] = [
    "created",                # 0 setup
    "initialized",            # 1 ingest
    "evidence_ingested",      # 2 ingest
    "risk_assessed",          # 3 assess
    "victims_localized",      # 4 assess
    "resources_allocated",    # 5 coordinate
    "knowledge_queried",      # 6 coordinate
    "briefing_ready",         # 7 report
    "awaiting_confirmation",  # 8 review
    "completed",              # 9 done (terminal)
    "aborted",                # 10 done (terminal)
    "errored",                # 11 done (terminal)
]

PHASES: Dict[str, str] = {
    "created": "setup",
    "initialized": "ingest",
    "evidence_ingested": "ingest",
    "risk_assessed": "assess",
    "victims_localized": "assess",
    "resources_allocated": "coordinate",
    "knowledge_queried": "coordinate",
    "briefing_ready": "report",
    "awaiting_confirmation": "review",
    "completed": "done",
    "aborted": "done",
    "errored": "done",
}

TERMINAL_STAGES: Set[str] = {"completed", "aborted", "errored"}

LEGACY_ALIASES: Dict[str, str] = {"complete": "completed"}

_STAGE_ORDER: Dict[str, int] = {stage: i for i, stage in enumerate(STAGES)}


# Allowed forward transitions. Sibling L1/L2 moves are allowed in both directions because the
# dependency graph runs them concurrently (MISSION_LIFECYCLE §5.4). ``completed`` is reachable
# from post-work states (also covers the legacy CLI which skips ``briefing_ready``).
TRANSITIONS: Dict[str, Set[str]] = {
    "created": {"initialized"},
    "initialized": {"evidence_ingested", "risk_assessed", "victims_localized"},
    "evidence_ingested": {"risk_assessed", "victims_localized"},
    "risk_assessed": {
        "victims_localized",
        "resources_allocated",
        "knowledge_queried",
        "completed",
    },
    "victims_localized": {
        "risk_assessed",
        "resources_allocated",
        "knowledge_queried",
        "completed",
    },
    "resources_allocated": {"knowledge_queried", "briefing_ready", "completed"},
    "knowledge_queried": {"resources_allocated", "briefing_ready", "completed"},
    "briefing_ready": {"awaiting_confirmation", "completed"},
    "awaiting_confirmation": {"completed"},
    "completed": set(),
    "aborted": set(),
    "errored": set(),
}


def normalize_stage(stage: str) -> str:
    """Resolve legacy stage names (e.g. ``complete`` -> ``completed``)."""
    return LEGACY_ALIASES.get(stage, stage)


def phase_for(stage: str) -> str:
    """Return the coarse phase for a stage (MISSION_LIFECYCLE §3)."""
    return PHASES.get(normalize_stage(stage), "done")


def is_terminal(stage: str) -> bool:
    return normalize_stage(stage) in TERMINAL_STAGES


def _guard_passes(state: Any, target: str) -> bool:
    """Transition guards from MISSION_LIFECYCLE §4."""
    if target == "initialized":
        return bool(state.metadata.incident_text.strip())
    if target == "evidence_ingested":
        return len(state.evidence) >= 1
    if target == "completed":
        return not any(d.status == "pending" for d in state.human_decisions)
    return True


def can_transition(state: Any, target: str, *, current: Optional[str] = None) -> bool:
    """Whether moving from the current stage to ``target`` is permitted.

    Allowed cases:
    * no-op (same stage)
    * terminal states are immutable (no outgoing transitions)
    * forward transitions listed in :data:`TRANSITIONS` whose guard passes
    * ``aborted`` / ``errored`` from any non-terminal stage
    * backward rollback (re-runs, MISSION_LIFECYCLE §5.1)
    """
    current = normalize_stage(current or state.status.stage)
    target = normalize_stage(target)
    if current == target:
        return True
    if is_terminal(current):
        return False
    if target in ("aborted", "errored"):
        return True
    if target in TRANSITIONS.get(current, set()):
        return _guard_passes(state, target)
    # backward rollback
    return _STAGE_ORDER.get(target, -1) < _STAGE_ORDER.get(current, 0)


def set_stage(state: Any, value: str, *, source: Optional[str] = None) -> str:
    """Set the mission stage, enforcing lifecycle rules.

    Emits a ``stage_change`` timeline event on a real transition (the audit trail required by
    MISSION_LIFECYCLE §5.3). Raises :class:`StateValidationError` for illegal transitions.
    """
    current = normalize_stage(state.status.stage)
    target = normalize_stage(value)

    if target not in _STAGE_ORDER:
        raise StateValidationError(f"unknown lifecycle stage {value!r}")

    if not can_transition(state, target):
        raise StateValidationError(
            f"invalid lifecycle transition: {state.status.stage!r} -> {value!r}"
        )

    state.status.stage = target
    state.status.phase = phase_for(target)

    # MISSION_LIFECYCLE §5.4: a terminal state means the mission is no longer running.
    if target in TERMINAL_STAGES:
        state.status.is_running = False

    if current != target:
        state.append_timeline(
            {
                "type": "stage_change",
                "agent": source,
                "message": f"{current} -> {target}",
                "mission_id": state.metadata.mission_id or "",
                "data": {"from": current, "to": target, "stage": target},
            }
        )
    return target


def transition(state: Any, target: str, *, source: Optional[str] = None) -> str:
    """Strict lifecycle transition (alias of :func:`set_stage` for callers who prefer the name)."""
    return set_stage(state, target, source=source)


def rollback(state: Any, target: str, *, source: Optional[str] = None) -> str:
    """Roll a mission back for a re-run.

    Enforces MISSION_LIFECYCLE §5.1: rollback never goes below ``evidence_ingested`` and only
    goes to an earlier stage. Records a ``re_run`` timeline event.
    """
    current = state.status.stage
    target = normalize_stage(target)
    if _STAGE_ORDER.get(target, -1) >= _STAGE_ORDER.get(current, 0):
        raise StateValidationError(
            f"rollback target {target!r} is not earlier than current stage {current!r}"
        )
    if _STAGE_ORDER.get(target, -1) < _STAGE_ORDER["evidence_ingested"]:
        raise StateValidationError(
            f"rollback below 'evidence_ingested' is not allowed (target {target!r})"
        )
    state.status.stage = target
    state.status.phase = phase_for(target)
    state.append_timeline(
        {
            "type": "re_run",
            "agent": source,
            "message": f"rollback {current} -> {target}",
            "mission_id": state.metadata.mission_id or "",
            "data": {"from": current, "to": target, "stage": target},
        }
    )
    return target
