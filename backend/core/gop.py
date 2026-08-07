"""Backward-compatibility shim for the legacy ``TERRAState``.

The old ``TERRAState`` (a small scripted container) has been replaced by ``MissionState``
(``docs/specs/MISSION_STATE.md``). Per MIGRATION_PLAN.md, ``TERRAState`` is kept as an alias so
the current agents, orchestrator, and CLI keep working unchanged.

``MissionState`` is a strict superset: all historical field names are preserved
(``evidence``, ``tasks``, ``agent_outputs``, ``risk_report``, ``victim_map``,
``resource_allocation``, ``knowledge_results``, ``confidence_scores``,
``pending_confirmations``) via top-level fields or compatibility accessors.
"""

from backend.core.mission_state import (
    AgentOutput,
    EvidenceEntry,
    MissionState,
    Task,
)

__all__ = [
    "TERRAState",
    "MissionState",
    "EvidenceEntry",
    "Task",
    "AgentOutput",
]

# Legacy alias: TERRAState IS MissionState.
TERRAState = MissionState
