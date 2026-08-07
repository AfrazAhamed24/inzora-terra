"""Contract adapter: run a universal-contract agent over one graph node cycle.

Implements AGENT_CONTRACT.md for the GraphExecutor. This module is the only code in the executor
path that talks to an agent, and it speaks exclusively to the universal contract surface: identity
metadata plus the ``initialize → perceive → reason → act → handoff`` lifecycle and the standard
output envelope. It never calls agent-specific methods, so the GraphExecutor stays agent-agnostic.

Every write the agent wants is applied here through the ``MissionStateManager`` — agents never
mutate ``MissionState`` directly (MISSION_STATE.md §6, AGENT_CONTRACT.md §3).
"""

from __future__ import annotations

import inspect
import time
from typing import Any, Dict

from backend.core.mission_state import utc_now_iso
from backend.core.permissions import ORCHESTRATOR
from backend.core.state_manager import MissionStateManager
from backend.interfaces.protocol import (
    SkippedError,
    build_contract_output,
    validate_contract_output,
)
from backend.orchestration.context import ExecutionContext

__all__ = ["run_contract_agent", "apply_envelope", "report_as_of"]


def report_as_of(state: Any) -> str:
    """The evidence/telemetry snapshot timestamp a report was computed from.

    Uses the most recently ingested evidence timestamp when present, otherwise the last state
    update (MISSION_STATE §4.7 ``as_of``).
    """
    if state.evidence:
        return state.evidence[-1].timestamp
    return state.metadata.updated_at or utc_now_iso()


async def _invoke(fn: Any, *args: Any) -> Any:
    result = fn(*args)
    if inspect.isawaitable(result):
        return await result
    return result


async def run_contract_agent(
    agent: Any,
    context: ExecutionContext,
    manager: MissionStateManager,
    spec: Any,
) -> Dict[str, Any]:
    """Run the agent lifecycle and persist its output; returns the output envelope.

    ``spec`` is the node's ``NodeSpec``; its ``writes`` set is used for contract-compliance
    validation. Exceptions from ``perceive``/``reason``/``act`` propagate to the executor's
    retry/fallback machinery (AGENT_CONTRACT.md §5); ``SkippedError`` is converted into a
    well-formed ``skipped`` envelope so a skip does not fail the mission.
    """
    started = time.monotonic()

    await _invoke(agent.initialize, context)
    perception = await _invoke(agent.perceive, context.state)
    decision = await _invoke(agent.reason, perception, context.state)
    try:
        output = await _invoke(agent.act, decision, context.state)
    except SkippedError as exc:
        output = build_contract_output(
            confidence=0.0,
            produced_artifacts={},
            status="skipped",
            reasoning_summary="agent skipped the cycle",
            warnings=[str(exc) or "agent signalled skip"],
        )

    output["execution_time"] = round(time.monotonic() - started, 4)
    output = await _invoke(agent.handoff, output, context)

    declared = getattr(agent, "writes", None) or spec.writes
    validate_contract_output(output, writes=declared)
    apply_envelope(agent, output, context, manager, spec)
    return output


def apply_envelope(
    agent: Any,
    output: Dict[str, Any],
    context: ExecutionContext,
    manager: MissionStateManager,
    spec: Any,
) -> Dict[str, Any]:
    """Persist the envelope's writes through the manager (the only write path).

    Owned reports are wholesale-replaced (AGENT_CONTRACT.md §7) and aligned with MISSION_STATE
    §4.7 (``as_of`` + ``cycle_id``); tasks are appended with description-level dedupe so a re-run
    or retry never duplicates them.
    """
    as_of = report_as_of(manager.state)
    for field, value in output["produced_artifacts"].items():
        report = dict(value)
        report.setdefault("cycle_id", context.cycle_id)
        report.setdefault("as_of", as_of)
        output["produced_artifacts"][field] = report
        manager.update(ORCHESTRATOR, field, report)

    for task in output["tasks"]:
        description = task["description"]
        if any(t.description == description for t in manager.state.tasks):
            output["warnings"].append(f"skipped duplicate task {description!r}")
            continue
        manager.add_task(
            ORCHESTRATOR,
            description,
            priority=task.get("priority", "MEDIUM"),
            requires_confirmation=bool(task.get("requires_confirmation", False)),
        )

    return output
