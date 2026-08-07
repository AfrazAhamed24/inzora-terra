"""Read/write permission matrix for the mission state.

Implements the MISSION_STATE.md §6 permission matrix. ``MissionStateManager`` enforces these on
every access so future agents can only modify the sections they own. Enforcement lives here
(state model), not in the agents.

Roles / components (slugs) match the agent contract and orchestrator naming.

Note on the orchestrator row: the spec matrix lists its *domain* writes
(``metadata``, ``status``, ``summary``, ``environment``, ``timeline``). As the mission conductor
and executor it additionally performs ingest/record duties (``evidence``, ``telemetry``,
``agent_outputs``, ``tasks``, ``confidence_scores``, ``human_decisions``, ``logs``); those are
granted here and documented as the controller extension. The ``system`` role is the root
(validation/restore tooling).
"""

from __future__ import annotations

from typing import Dict, FrozenSet, Set

from backend.core.mission_state import MissionStateError

__all__ = [
    "COMPONENTS",
    "APPEND_ONLY_FIELDS",
    "OWNED_REPORT_FIELDS",
    "ALL_FIELDS",
    "READ_PERMISSIONS",
    "WRITE_PERMISSIONS",
    "can_read",
    "can_write",
    "assert_can_read",
    "assert_can_write",
    "StatePermissionError",
]


class StatePermissionError(MissionStateError):
    """Raised when a component reads or writes a section it does not own."""


# Components (stable slugs).
ORCHESTRATOR = "orchestrator"
RISK_ASSESSMENT = "risk_assessment"
VICTIM_LOCALIZATION = "victim_localization"
RESOURCE_COORDINATION = "resource_coordination"
KNOWLEDGE_RETRIEVAL = "knowledge_retrieval"
SIMULATION = "simulation"
MISSION_ASSISTANT = "mission_assistant"
SYSTEM = "system"

COMPONENTS: FrozenSet[str] = frozenset(
    {
        ORCHESTRATOR,
        RISK_ASSESSMENT,
        VICTIM_LOCALIZATION,
        RESOURCE_COORDINATION,
        KNOWLEDGE_RETRIEVAL,
        SIMULATION,
        MISSION_ASSISTANT,
        SYSTEM,
    }
)

# Top-level MissionState fields.
ALL_FIELDS: FrozenSet[str] = frozenset(
    {
        "metadata",
        "status",
        "telemetry",
        "environment",
        "evidence",
        "tasks",
        "agent_outputs",
        "risk_report",
        "victim_map",
        "resource_allocation",
        "knowledge_results",
        "confidence_scores",
        "timeline",
        "human_decisions",
        "logs",
        "summary",
        "assistant_context",
    }
)

# Append-only histories (MISSION_STATE §5): no deletion, no in-place edits.
APPEND_ONLY_FIELDS: FrozenSet[str] = frozenset(
    {"telemetry", "evidence", "agent_outputs", "timeline", "human_decisions", "logs"}
)

# Owned report fields, replaced wholesale by their owning agent (§4.7).
OWNED_REPORT_FIELDS: Dict[str, str] = {
    RISK_ASSESSMENT: "risk_report",
    VICTIM_LOCALIZATION: "victim_map",
    RESOURCE_COORDINATION: "resource_allocation",
    KNOWLEDGE_RETRIEVAL: "knowledge_results",
}

ALL_FIELDS_SET: Set[str] = set(ALL_FIELDS)

# ---------------------------------------------------------------------------
# Matrix (MISSION_STATE §6)
# ---------------------------------------------------------------------------

READ_PERMISSIONS: Dict[str, Set[str]] = {
    RISK_ASSESSMENT: {"telemetry", "environment", "evidence"},
    VICTIM_LOCALIZATION: {"telemetry", "environment", "evidence"},
    RESOURCE_COORDINATION: {"risk_report", "victim_map", "tasks"},
    KNOWLEDGE_RETRIEVAL: {"risk_report", "victim_map", "environment"},
    ORCHESTRATOR: ALL_FIELDS_SET,
    SIMULATION: set(),
    MISSION_ASSISTANT: {
        "risk_report",
        "victim_map",
        "resource_allocation",
        "knowledge_results",
        "evidence",
        "timeline",
        "environment",
        "summary",
        "confidence_scores",
        "human_decisions",
        "tasks",
    },
    SYSTEM: ALL_FIELDS_SET,
}

# Orchestrator domain writes per spec + controller/executor duties.
_ORCHESTRATOR_DOMAIN = {"metadata", "status", "summary", "environment", "timeline"}
_ORCHESTRATOR_CONTROLLER = {
    "evidence",
    "telemetry",
    "tasks",
    "agent_outputs",
    "confidence_scores",
    "human_decisions",
    "logs",
}
# Fallback-on-behalf: MISSION_STATE §4.7 lets the orchestrator write an owned report for an agent
# that failed after retries (GraphExecutor fallback, ORCHESTRATOR.md §5).
_ORCHESTRATOR_FALLBACK = {
    "risk_report",
    "victim_map",
    "resource_allocation",
    "knowledge_results",
}

WRITE_PERMISSIONS: Dict[str, Set[str]] = {
    RISK_ASSESSMENT: {"risk_report", "confidence_scores", "timeline", "agent_outputs",
                      "tasks", "human_decisions"},
    VICTIM_LOCALIZATION: {"victim_map", "confidence_scores", "tasks", "human_decisions"},
    RESOURCE_COORDINATION: {"resource_allocation", "tasks"},
    KNOWLEDGE_RETRIEVAL: {"knowledge_results", "confidence_scores"},
    ORCHESTRATOR: _ORCHESTRATOR_DOMAIN | _ORCHESTRATOR_CONTROLLER | _ORCHESTRATOR_FALLBACK,
    SIMULATION: {"telemetry", "environment"},
    MISSION_ASSISTANT: {"assistant_context"},
    SYSTEM: ALL_FIELDS_SET,
}


def _normalize(component: str) -> str:
    if component not in COMPONENTS:
        raise StatePermissionError(f"unknown component {component!r}")
    return component


def can_read(component: str, field: str) -> bool:
    component = _normalize(component)
    return field in READ_PERMISSIONS[component]


def can_write(component: str, field: str) -> bool:
    component = _normalize(component)
    return field in WRITE_PERMISSIONS[component]


def assert_can_read(component: str, field: str) -> None:
    if not can_read(component, field):
        raise StatePermissionError(f"{component!r} cannot read {field!r}")


def assert_can_write(component: str, field: str) -> None:
    if not can_write(component, field):
        raise StatePermissionError(f"{component!r} cannot write {field!r}")
