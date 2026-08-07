from abc import ABC, abstractmethod
from typing import Any, Dict, FrozenSet, List


class BaseAgent(ABC):
    """Base class for all TERRA-X agents.

    Implements the universal contract (AGENT_CONTRACT.md): identity metadata that is queryable
    without executing the agent, the ``initialize → perceive → reason → act → handoff`` lifecycle,
    and a standard output envelope. ``perceive``/``reason``/``act`` remain abstract; the four
    concrete agents keep their decision logic unchanged and return the envelope from ``act``
    instead of writing to the mission state directly.
    """

    version: str = "1.0"
    description: str = ""
    capabilities: List[str] = []
    reads: FrozenSet[str] = frozenset()
    writes: FrozenSet[str] = frozenset()

    def __init__(self, name: str):
        self.name = name
        self.state: Dict[str, Any] = {}
        self.tools: list = []
        self.confidence: float = 0.0

    def register_tool(self, tool_name: str, tool_fn) -> None:
        self.tools.append({"name": tool_name, "fn": tool_fn})

    def set_state(self, key: str, value: Any) -> None:
        self.state[key] = value

    def get_state(self, key: str, default: Any = None) -> Any:
        return self.state.get(key, default)

    def identity(self) -> Dict[str, Any]:
        """Identity metadata (AGENT_CONTRACT.md §2.1), queryable without executing."""
        return {
            "name": self.name,
            "version": self.version,
            "description": self.description,
            "capabilities": list(self.capabilities),
            "reads": sorted(self.reads),
            "writes": sorted(self.writes),
        }

    async def initialize(self, context: Any) -> None:
        """Lifecycle step 1: per-cycle setup. Default is a no-op (idempotent)."""

    async def handoff(self, output: Dict[str, Any], context: Any) -> Dict[str, Any]:
        """Lifecycle step 5: validate/finalize the output before the executor persists it."""
        return output

    @abstractmethod
    async def perceive(self, gop: Any) -> Dict[str, Any]:
        pass

    @abstractmethod
    async def reason(self, perception: Dict[str, Any], gop: Any) -> Dict[str, Any]:
        pass

    @abstractmethod
    async def act(self, decision: Dict[str, Any], gop: Any) -> Dict[str, Any]:
        pass

    async def run(self, gop: Any) -> Dict[str, Any]:
        """Legacy convenience pipeline (not part of the scheduling path).

        The GraphExecutor schedules through the contract lifecycle (initialize → perceive →
        reason → act → handoff) via ``backend/orchestration/contract.run_contract_agent``.
        """
        perception = await self.perceive(gop)
        decision = await self.reason(perception, gop)
        result = await self.act(decision, gop)
        return result

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "state": self.state,
            "confidence": self.confidence,
            "tools": [t["name"] for t in self.tools],
            "version": self.version,
            "description": self.description,
            "capabilities": list(self.capabilities),
        }
