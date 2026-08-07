"""Dependency graph for agent scheduling.

Implements ``docs/specs/DEPENDENCY_GRAPH.md`` (v1.0). The execution order of TERRA-X agents is
declared as a directed acyclic graph: nodes carry a level plus the fields they read/write, and
edges encode dependencies. The GraphExecutor (``backend/orchestration/executor.py``) derives
topological levels from this graph and schedules level-by-level, in parallel within a level.

Formal properties (DEPENDENCY_GRAPH §4) enforced at construction:

* acyclic — a topological sort must cover every node
* exactly one sink (``briefing_generator``)
* every node reachable from a source
* declared levels agree with the edges (an edge must point strictly upward in level)
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, FrozenSet, Iterable, List, Mapping, Sequence, Set, Tuple

__all__ = [
    "GraphValidationError",
    "NodeSpec",
    "DependencyGraph",
    "MISSION_GRAPH",
]


class GraphValidationError(ValueError):
    """Raised when a dependency graph violates the DAG contract (DEPENDENCY_GRAPH §4)."""


@dataclass(frozen=True)
class NodeSpec:
    """A single schedulable node (agent or the briefing generator).

    ``reads`` / ``writes`` mirror the MISSION_STATE §6 permission matrix and drive the
    read-consistency snapshot the executor hands each node (ORCHESTRATOR.md §4.4).
    """

    slug: str
    level: int
    reads: FrozenSet[str] = frozenset()
    writes: FrozenSet[str] = frozenset()
    stage_token: str = ""

    @classmethod
    def make(
        cls,
        slug: str,
        *,
        level: int,
        reads: Iterable[str] = (),
        writes: Iterable[str] = (),
        stage_token: str = "",
    ) -> "NodeSpec":
        return cls(
            slug=slug,
            level=level,
            reads=frozenset(reads),
            writes=frozenset(writes),
            stage_token=stage_token,
        )


class DependencyGraph:
    """A declarative, validated dependency graph over node slugs."""

    def __init__(self, nodes: Mapping[str, NodeSpec], edges: Iterable[Tuple[str, str]]):
        self.nodes: Dict[str, NodeSpec] = dict(nodes)
        self.edges: Tuple[Tuple[str, str], ...] = tuple(edges)
        self.validate()

    # ------------------------------------------------------------------
    # Structure accessors
    # ------------------------------------------------------------------

    def node(self, slug: str) -> NodeSpec:
        return self.nodes[slug]

    def level(self, slug: str) -> int:
        return self.nodes[slug].level

    def levels(self) -> List[int]:
        """Sorted levels present in the graph (topological layers)."""
        return sorted({n.level for n in self.nodes.values()})

    def nodes_for_level(self, level: int) -> List[str]:
        """Nodes in a level, alphabetically ordered by slug (DEPENDENCY_GRAPH §4.2)."""
        return sorted(s for s, n in self.nodes.items() if n.level == level)

    def dependencies(self, slug: str) -> Tuple[str, ...]:
        """Direct predecessors (nodes this node consumes)."""
        return tuple(sorted(u for u, v in self.edges if v == slug))

    def dependents(self, slug: str) -> Tuple[str, ...]:
        """Direct successors (nodes that consume this node)."""
        return tuple(sorted(v for u, v in self.edges if u == slug))

    def sources(self) -> Tuple[str, ...]:
        """Nodes with no incoming edge (level 1 inputs)."""
        return tuple(sorted(s for s in self.nodes if not any(v == s for _, v in self.edges)))

    def sinks(self) -> Tuple[str, ...]:
        """Nodes with no outgoing edge. Exactly one is required (DEPENDENCY_GRAPH §4.4)."""
        return tuple(sorted(s for s in self.nodes if not any(u == s for u, _ in self.edges)))

    def is_sink(self, slug: str) -> bool:
        return slug in self.sinks()

    # ------------------------------------------------------------------
    # Scheduling helpers
    # ------------------------------------------------------------------

    def topological_order(self) -> List[str]:
        """Kahn's algorithm; a valid ordering exists iff the graph is acyclic."""
        in_degree: Dict[str, int] = {s: 0 for s in self.nodes}
        successors: Dict[str, List[str]] = {s: [] for s in self.nodes}
        for u, v in self.edges:
            in_degree[v] += 1
            successors[u].append(v)

        ready = sorted(s for s, d in in_degree.items() if d == 0)
        order: List[str] = []
        while ready:
            node = ready.pop(0)
            order.append(node)
            for nxt in sorted(successors[node]):
                in_degree[nxt] -= 1
                if in_degree[nxt] == 0:
                    ready.append(nxt)
                    ready.sort()
        return order

    # ------------------------------------------------------------------
    # Validation (DEPENDENCY_GRAPH §4, §7)
    # ------------------------------------------------------------------

    def validate(self) -> None:
        known = set(self.nodes)
        if not known:
            raise GraphValidationError("graph must contain at least one node")

        for u, v in self.edges:
            if u not in known or v not in known:
                raise GraphValidationError(f"edge references unknown node: {u!r} -> {v!r}")
            if u == v:
                raise GraphValidationError(f"self-loop on node {u!r} is not allowed")
            if self.nodes[u].level >= self.nodes[v].level:
                raise GraphValidationError(
                    f"edge {u!r} -> {v!r} must point to a strictly higher level "
                    f"({self.nodes[u].level} !< {self.nodes[v].level})"
                )

        order = self.topological_order()
        if len(order) != len(known):
            raise GraphValidationError("graph is not acyclic (contains a cycle)")

        sinks = self.sinks()
        if len(sinks) != 1:
            raise GraphValidationError(
                f"graph must have exactly one sink; found {list(sinks)}"
            )

        unreachable = known - self._reachable()
        if unreachable:
            raise GraphValidationError(
                f"node(s) not reachable from a source: {sorted(unreachable)}"
            )

    def _reachable(self) -> Set[str]:
        """Set of nodes reachable from the graph's sources."""
        reachable: Set[str] = set()
        stack = list(self.sources())
        while stack:
            node = stack.pop()
            if node in reachable:
                continue
            reachable.add(node)
            stack.extend(self.dependents(node))
        return reachable


# ---------------------------------------------------------------------------
# The default mission graph (DEPENDENCY_GRAPH §3, §5)
# ---------------------------------------------------------------------------

MISSION_GRAPH = DependencyGraph(
    nodes={
        spec.slug: spec
        for spec in (
            NodeSpec.make(
                "risk_assessment",
                level=1,
                reads=["telemetry", "environment", "evidence"],
                writes=["risk_report", "confidence_scores", "tasks", "human_decisions",
                        "agent_outputs", "timeline"],
                stage_token="risk_assessed",
            ),
            NodeSpec.make(
                "victim_localization",
                level=1,
                reads=["telemetry", "environment", "evidence"],
                writes=["victim_map", "confidence_scores", "tasks", "human_decisions"],
                stage_token="victims_localized",
            ),
            NodeSpec.make(
                "resource_coordination",
                level=2,
                reads=["risk_report", "victim_map", "tasks"],
                writes=["resource_allocation", "tasks"],
                stage_token="resources_allocated",
            ),
            NodeSpec.make(
                "knowledge_retrieval",
                level=2,
                reads=["risk_report", "victim_map", "environment"],
                writes=["knowledge_results", "confidence_scores"],
                stage_token="knowledge_queried",
            ),
            NodeSpec.make(
                "briefing_generator",
                level=3,
                reads=["risk_report", "victim_map", "resource_allocation",
                       "knowledge_results", "confidence_scores"],
                writes=["summary"],
                stage_token="briefing_ready",
            ),
        )
    },
    edges=(
        ("risk_assessment", "resource_coordination"),
        ("victim_localization", "resource_coordination"),
        ("risk_assessment", "knowledge_retrieval"),
        ("victim_localization", "knowledge_retrieval"),
        ("resource_coordination", "briefing_generator"),
        ("knowledge_retrieval", "briefing_generator"),
    ),
)
