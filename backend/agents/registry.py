"""Central Agent Registry (AGENT_CONTRACT.md §8).

A code-defined registry mapping slug → agent, plus the lookups the orchestrator and tooling need
(identity metadata, dependency graph level, dependencies). The GraphExecutor discovers agents
through the registry instead of holding hardcoded instances, so future Vision / Weather / Medical
/ Drone / Route agents plug in without modifying the executor. No dynamic (runtime) loading is
implemented yet — registration is code-driven (Phase 1).
"""

from __future__ import annotations

from typing import Any, Callable, Dict, Iterable, Iterator, List, Optional, Tuple

__all__ = [
    "RegistryError",
    "DuplicateRegistrationError",
    "UnknownAgentError",
    "AgentRegistry",
]


def _default_graph() -> Any:
    """The default mission graph, imported lazily to avoid an import cycle.

    ``backend.orchestration`` eagerly imports the executor, which imports this module; loading the
    graph inside the orchestration package would loop back into ``registry`` during module init.
    """
    from backend.orchestration.graph import MISSION_GRAPH

    return MISSION_GRAPH


class RegistryError(Exception):
    """Base class for registry failures."""


class DuplicateRegistrationError(RegistryError):
    """Raised when an agent slug is registered twice."""


class UnknownAgentError(RegistryError):
    """Raised when a slug is not present in the registry."""


class AgentRegistry:
    """Holds the known agents and their contract metadata.

    Accepts either agent instances or zero-argument factories/classes. Contract metadata is
    derived from the agent's universal-contract surface (``identity()``, ``reads``, ``writes``)
    combined with dependency-graph position (``level``, ``dependencies``, ``dependents``).
    """

    def __init__(self, graph: Optional[Any] = None):
        self._graph = graph if graph is not None else _default_graph()
        self._agents: Dict[str, Any] = {}

    # ------------------------------------------------------------------
    # Registration
    # ------------------------------------------------------------------

    def register(self, agent_or_factory: Any) -> Any:
        """Register an agent instance or a zero-argument factory/class.

        Raises :class:`DuplicateRegistrationError` if the slug is already registered.
        """
        if hasattr(agent_or_factory, "name"):
            agent = agent_or_factory
        else:
            try:
                agent = agent_or_factory()
            except Exception as exc:
                raise RegistryError(
                    f"could not instantiate registered agent factory: {exc}"
                ) from exc
        slug = getattr(agent, "name", None)
        if not isinstance(slug, str) or not slug:
            raise RegistryError("registered agent must expose a non-empty string 'name'")
        if slug in self._agents:
            raise DuplicateRegistrationError(f"agent {slug!r} is already registered")
        self._agents[slug] = agent
        return agent

    def register_many(self, agents: Iterable[Any]) -> None:
        """Register several agents/factories in one call."""
        for agent in agents:
            self.register(agent)

    def unregister(self, slug: str) -> None:
        """Remove an agent by slug; raises :class:`UnknownAgentError` when absent."""
        if slug not in self._agents:
            raise UnknownAgentError(f"agent {slug!r} is not registered")
        del self._agents[slug]

    # ------------------------------------------------------------------
    # Lookup
    # ------------------------------------------------------------------

    def get(self, slug: str, default: Any = None) -> Any:
        """Return the agent instance for ``slug`` (or ``default`` when missing)."""
        return self._agents.get(slug, default)

    def list(self) -> List[Dict[str, Any]]:
        """Return sorted metadata for every registered agent."""
        return [self.metadata(slug) for slug in sorted(self._agents)]

    def metadata(self, slug: str) -> Dict[str, Any]:
        """Identity metadata + graph position for ``slug``."""
        if slug not in self._agents:
            raise UnknownAgentError(f"agent {slug!r} is not registered")
        agent = self._agents[slug]
        info = agent.identity() if hasattr(agent, "identity") else {
            "name": getattr(agent, "name", slug),
            "version": getattr(agent, "version", ""),
            "description": getattr(agent, "description", ""),
            "capabilities": list(getattr(agent, "capabilities", [])),
            "reads": sorted(getattr(agent, "reads", ())),
            "writes": sorted(getattr(agent, "writes", ())),
        }
        info["level"] = self.level(slug)
        info["dependencies"] = list(self.dependencies(slug))
        info["dependents"] = list(self.dependents(slug))
        return info

    def level(self, slug: str) -> int:
        """Graph level for ``slug`` (agent-declared level when outside the graph)."""
        if slug not in self._agents:
            raise UnknownAgentError(f"agent {slug!r} is not registered")
        if self._graph is not None and slug in self._graph.nodes:
            return self._graph.node(slug).level
        declared = getattr(self._agents[slug], "level", None)
        return declared if isinstance(declared, int) else 0

    def dependencies(self, slug: str) -> Tuple[str, ...]:
        """Direct predecessors of ``slug`` from the dependency graph."""
        if self._graph is None:
            return ()
        return tuple(sorted(self._graph.dependencies(slug)))

    def dependents(self, slug: str) -> Tuple[str, ...]:
        """Direct successors of ``slug`` from the dependency graph."""
        if self._graph is None:
            return ()
        return tuple(sorted(self._graph.dependents(slug)))

    # ------------------------------------------------------------------
    # Container protocol
    # ------------------------------------------------------------------

    def __contains__(self, slug: object) -> bool:
        return slug in self._agents

    def __iter__(self) -> Iterator[str]:
        return iter(sorted(self._agents))

    def __len__(self) -> int:
        return len(self._agents)

    # ------------------------------------------------------------------
    # Validation (AGENT_CONTRACT.md §8 registry.validate)
    # ------------------------------------------------------------------

    def validate(self) -> List[str]:
        """Return a list of contract problems (empty = all agents conform)."""
        problems: List[str] = []
        for slug, agent in self._agents.items():
            name = getattr(agent, "name", None)
            if name != slug:
                problems.append(f"registered key {slug!r} does not match agent.name {name!r}")

            version = getattr(agent, "version", None)
            if not isinstance(version, str) or not version:
                problems.append(f"{slug}: version must be a non-empty string")

            description = getattr(agent, "description", None)
            if not isinstance(description, str) or not description:
                problems.append(f"{slug}: description must be a non-empty string")

            capabilities = getattr(agent, "capabilities", None)
            if not isinstance(capabilities, Iterable) or not all(
                isinstance(c, str) and c for c in capabilities
            ):
                problems.append(f"{slug}: capabilities must be a list of non-empty strings")

            reads = getattr(agent, "reads", None)
            writes = getattr(agent, "writes", None)
            if not isinstance(reads, (frozenset, set, list, tuple)) or not reads:
                problems.append(f"{slug}: reads must declare the read permission set")
            if not isinstance(writes, (frozenset, set, list, tuple)) or not writes:
                problems.append(f"{slug}: writes must declare the write permission set")

            if self._graph is not None:
                if slug not in self._graph.nodes:
                    problems.append(
                        f"{slug}: registered but not present in the dependency graph"
                    )
                else:
                    granted = self._graph.node(slug).writes
                    undeclared = set(writes or ()) - set(granted)
                    if undeclared:
                        problems.append(
                            f"{slug}: declares writes {sorted(undeclared)} not granted "
                            f"by the graph spec"
                        )
        return problems

    def validate_raise(self) -> None:
        """Raise :class:`RegistryError` when any registered agent violates the contract."""
        problems = self.validate()
        if problems:
            raise RegistryError("agent registry validation failed: " + "; ".join(problems))
