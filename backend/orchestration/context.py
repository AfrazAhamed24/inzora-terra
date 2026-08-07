"""Execution context for a single graph node run.

Carries everything a node handler needs about its invocation: the live mission state, a
read-consistent snapshot of the fields it may read (ORCHESTRATOR.md §4.4), the outputs of its
direct dependencies, and the shared executor configuration.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict

from backend.core.mission_state import MissionState

__all__ = ["ExecutionContext"]


@dataclass
class ExecutionContext:
    """Read-only-ish view given to a node handler for one execution cycle.

    ``state`` is the **live** mission state (legacy agents write their reports straight onto it,
    preserving the Phase 1B.2 backward-compatibility contract). ``inputs`` is a deep, JSON-ready
    snapshot of the fields the node is permitted to read, taken at level-dispatch time so a node
    never observes a half-updated sibling. ``dependencies`` maps each direct predecessor to the
    owned report it produced.
    """

    agent_name: str
    level: int
    state: MissionState
    inputs: Dict[str, Any] = field(default_factory=dict)
    dependencies: Dict[str, Any] = field(default_factory=dict)
    config: Any = None
    cycle_id: str = ""
    shared: Dict[str, Any] = field(default_factory=dict)
    cancelled: bool = False
