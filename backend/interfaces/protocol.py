from abc import ABC, abstractmethod
from typing import Any, Dict, FrozenSet, Iterable, List, Optional


class AgentProtocol(ABC):
    """Interface for all TERRA-X agents."""

    def __init__(self, name: str):
        self.name = name

    @abstractmethod
    async def perceive(self, gop: Any) -> Dict[str, Any]:
        """Gather information from the Global Operating Picture."""
        pass

    @abstractmethod
    async def reason(self, perception: Dict[str, Any], gop: Any) -> Dict[str, Any]:
        """Analyze perception and decide on action."""
        pass

    @abstractmethod
    async def act(self, decision: Dict[str, Any], gop: Any) -> Dict[str, Any]:
        """Execute the decision and update GOP."""
        pass

    async def run(self, gop: Any) -> Dict[str, Any]:
        """Execute the full perceive-reason-act cycle."""
        perception = await self.perceive(gop)
        decision = await self.reason(perception, gop)
        result = await self.act(decision, gop)
        return result


# ---------------------------------------------------------------------------
# Universal Agent Contract (AGENT_CONTRACT.md)
# ---------------------------------------------------------------------------

# Standard output envelope keys (AGENT_CONTRACT.md "Standard output"). Every agent returns exactly
# this shape; ``run_contract_agent`` fills ``execution_time`` and persists the artifacts through
# the MissionStateManager.
CONTRACT_OUTPUT_KEYS: FrozenSet[str] = frozenset(
    {
        "status",
        "confidence",
        "reasoning_summary",
        "execution_time",
        "produced_artifacts",
        "tasks",
        "warnings",
        "errors",
        "next_handoff",
    }
)

CONTRACT_STATUSES: FrozenSet[str] = frozenset(
    {"success", "partial", "skipped", "failed"}
)


class ContractError(Exception):
    """Base class for universal-contract failures (AGENT_CONTRACT.md "Error model")."""

    kind: str = "contract_error"
    retryable: bool = False


class RecoverableError(ContractError):
    """Transient failure; the cycle may be retried safely."""

    kind = "recoverable"
    retryable = True


class RetryableError(ContractError):
    """Explicit retry request; the cycle is retried by the orchestrator."""

    kind = "retryable"
    retryable = True


class FatalError(ContractError):
    """Non-recoverable failure; the mission must not continue on this agent."""

    kind = "fatal"


class SkippedError(ContractError):
    """The agent intentionally skips this cycle (no artifacts produced)."""

    kind = "skipped"


class ContractCancelledError(ContractError):
    """The cycle was cancelled by the orchestrator or an external signal."""

    kind = "cancelled"


class ContractViolationError(ContractError):
    """The agent violated the contract (bad output schema, undeclared write)."""

    kind = "validation"


def classify_contract_error(exc: BaseException) -> str:
    """Return the contract error kind for ``exc`` (or ``"unknown"``)."""
    return getattr(exc, "kind", "unknown")


def build_contract_output(
    confidence: float,
    produced_artifacts: Dict[str, Any],
    *,
    status: str = "success",
    tasks: Optional[Iterable[Dict[str, Any]]] = None,
    reasoning_summary: str = "",
    warnings: Optional[Iterable[str]] = None,
    errors: Optional[Iterable[str]] = None,
    next_handoff: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Construct a standard contract output envelope.

    ``produced_artifacts`` maps the fields the agent owns (e.g. ``{"risk_report": {...}}``) to
    their values; ``tasks`` lists ``{"description", "priority", "requires_confirmation"}`` dicts
    the agent wants appended. ``execution_time`` is filled by the contract adapter.
    """
    return {
        "status": status,
        "confidence": float(confidence),
        "reasoning_summary": reasoning_summary,
        "execution_time": None,
        "produced_artifacts": dict(produced_artifacts),
        "tasks": [dict(t) for t in (tasks or [])],
        "warnings": list(warnings or []),
        "errors": list(errors or []),
        "next_handoff": dict(next_handoff) if next_handoff else None,
    }


def validate_contract_output(
    output: Dict[str, Any], *, writes: Iterable[str] = ()
) -> None:
    """Validate an output envelope against the contract; raises ContractViolationError.

    ``writes`` is the node's declared write set (NodeSpec.writes) used to reject undeclared
    artifact/task writes (AGENT_CONTRACT.md §3 hard rules).
    """
    if not isinstance(output, dict):
        raise ContractViolationError("agent output must be a dict")

    missing = CONTRACT_OUTPUT_KEYS - output.keys()
    if missing:
        raise ContractViolationError(
            f"agent output missing required key(s): {sorted(missing)}"
        )

    status = output["status"]
    if status not in CONTRACT_STATUSES:
        raise ContractViolationError(f"invalid agent output status {status!r}")

    confidence = output["confidence"]
    if isinstance(confidence, bool) or not isinstance(confidence, (int, float)):
        raise ContractViolationError("agent output confidence must be numeric")
    if not 0.0 <= float(confidence) <= 1.0:
        raise ContractViolationError(
            f"agent output confidence {confidence!r} outside [0.0, 1.0]"
        )

    artifacts = output["produced_artifacts"]
    if not isinstance(artifacts, dict):
        raise ContractViolationError("agent output produced_artifacts must be a dict")

    writes = set(writes)
    undeclared = set(artifacts) - writes
    if undeclared:
        raise ContractViolationError(
            f"agent wrote undeclared field(s): {sorted(undeclared)} "
            f"(declared: {sorted(writes)})"
        )

    tasks = output["tasks"]
    if not isinstance(tasks, list):
        raise ContractViolationError("agent output tasks must be a list")
    if tasks and "tasks" not in writes:
        raise ContractViolationError(
            "agent emitted tasks but does not declare the 'tasks' write"
        )
