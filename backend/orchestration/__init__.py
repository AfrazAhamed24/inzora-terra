"""Orchestration: dependency graph, graph executor, and mission-conducting orchestrator.

Implements ``docs/specs/ORCHESTRATOR.md`` and ``docs/specs/DEPENDENCY_GRAPH.md``. The
``GraphExecutor`` schedules agents over the declarative ``MISSION_GRAPH`` level-by-level
(parallel within a level) with timeout/retry/fallback, and never touches ``MissionState``
directly — every write is routed through the ``MissionStateManager``.
"""

from backend.orchestration.briefing import BriefingGenerator, aggregate_confidence
from backend.orchestration.context import ExecutionContext
from backend.orchestration.events import EventSink
from backend.orchestration.executor import (
    ExecutionCancelled,
    ExecutionResult,
    ExecutorConfig,
    GraphExecutionError,
    GraphExecutor,
    NodeResult,
)
from backend.orchestration.graph import DependencyGraph, MISSION_GRAPH, NodeSpec
from backend.orchestration.retry import RetryPolicy

__all__ = [
    "MISSION_GRAPH",
    "NodeSpec",
    "DependencyGraph",
    "GraphExecutor",
    "GraphExecutionError",
    "ExecutionCancelled",
    "ExecutorConfig",
    "NodeResult",
    "ExecutionResult",
    "ExecutionContext",
    "EventSink",
    "RetryPolicy",
    "BriefingGenerator",
    "aggregate_confidence",
]
