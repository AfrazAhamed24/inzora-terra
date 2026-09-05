"""Unit tests: Universal Agent Contract (AGENT_CONTRACT.md).

Proves every agent exposes the same contract surface (identity + lifecycle + standard output
envelope), the GraphExecutor schedules agents through the contract only (agent-agnostic), the
failure taxonomy integrates with retry/fallback, contract violations fail the cycle, tasks are
deduplicated on re-run, and the CLI flow stays regression-free.
"""

import asyncio

import pytest

from backend.agents.knowledge.agent import KnowledgeRetrievalAgent
from backend.agents.rescue_coordination.agent import RescueCoordinationAgent
from backend.agents.resource_coordination.agent import ResourceCoordinationAgent
from backend.agents.risk_assessment.agent import RiskAssessmentAgent
from backend.agents.victim_localization.agent import VictimLocalizationAgent
from backend.core.permissions import ORCHESTRATOR
from backend.core.state_manager import MissionStateManager
from backend.core.tools import get_building_info, get_sensor_data, get_weather
from backend.interfaces.protocol import (
    CONTRACT_OUTPUT_KEYS,
    ContractViolationError,
    RecoverableError,
    RetryableError,
    SkippedError,
    build_contract_output,
    classify_contract_error,
    validate_contract_output,
)
from backend.orchestration.briefing import BriefingGenerator
from backend.orchestration.context import ExecutionContext
from backend.orchestration.contract import run_contract_agent
from backend.orchestration.executor import ExecutorConfig, GraphExecutor
from backend.orchestration.graph import MISSION_GRAPH

BRIEFING = {"briefing_generator": BriefingGenerator()}

ALL_AGENTS = [
    RiskAssessmentAgent(),
    VictimLocalizationAgent(),
    ResourceCoordinationAgent(),
    KnowledgeRetrievalAgent(),
    RescueCoordinationAgent(),
]

AGENT_IDS = [a.name for a in ALL_AGENTS]


def make_manager() -> MissionStateManager:
    """A manager with an initialized mission and the standard CLI evidence bundle."""
    mgr = MissionStateManager()
    mgr.create(
        "Two-floor building collapsed after heavy rainfall. 3 missing persons.",
        environment_id="scenario_collapse_rain",
    )
    mgr.append_evidence(ORCHESTRATOR, "sensor:north_wall", get_sensor_data("north_wall"), 0.9)
    mgr.append_evidence(
        ORCHESTRATOR,
        "sensor:basement",
        {"tilt_deg": 2, "trend": "stable", "thermal": "heat signature detected in basement",
         "gpr": "cracks at basement level"},
        0.85,
    )
    mgr.append_evidence(ORCHESTRATOR, "weather:current", get_weather("current"), 0.85)
    mgr.append_evidence(ORCHESTRATOR, "building:bld_001", get_building_info("bld_001"), 0.95)
    mgr.append_evidence(
        ORCHESTRATOR,
        "witness:report_001",
        {"source": "neighbor", "last_seen": "basement", "persons": 3},
        0.60,
    )
    return mgr


def default_agents() -> dict:
    return {
        "risk_assessment": RiskAssessmentAgent(),
        "victim_localization": VictimLocalizationAgent(),
        "resource_coordination": ResourceCoordinationAgent(),
        "knowledge_retrieval": KnowledgeRetrievalAgent(),
        "rescue_coordination": RescueCoordinationAgent(),
    }


async def ok_handler(_ctx):
    return {"ok": True}


async def run_executor(mgr, *, config=None, handlers=None, agents=None):
    executor = GraphExecutor(
        mgr,
        handlers=handlers or BRIEFING,
        agents=agents if agents is not None else default_agents(),
        config=config or ExecutorConfig(agent_timeout=10.0, retry_backoff_base=0.0),
    )
    return await executor.run()


def test_knowledge_agent_survives_missing_building_evidence():
    """Knowledge agent must not crash when no building evidence exists (NoneType bug)."""
    async def scenario():
        # A mission with sensor/weather evidence but NO building source.
        mgr = MissionStateManager()
        mgr.create(
            "Two-floor building collapsed after heavy rainfall. 3 missing persons.",
            environment_id="scenario_collapse_rain",
        )
        mgr.append_evidence(ORCHESTRATOR, "sensor:north_wall", get_sensor_data("north_wall"), 0.9)
        mgr.append_evidence(ORCHESTRATOR, "weather:current", get_weather("current"), 0.85)

        assert not any(e.source.startswith("building") for e in mgr.state.evidence)

        agent = KnowledgeRetrievalAgent()
        perception = await agent.perceive(mgr.state)
        assert perception["building_info"] is None

        decision = await agent.reason(perception, mgr.state)
        assert decision["confidence"] >= 0.0
        assert isinstance(decision["relevant_sops"], list)

    asyncio.run(scenario())


def _ctx(agent, mgr) -> ExecutionContext:
    return ExecutionContext(
        agent_name=agent.name,
        level=1,
        state=mgr.state,
        inputs={},
        dependencies={},
        config=ExecutorConfig(),
        cycle_id="CYC-TEST",
        cancelled=False,
    )


async def _run_agent(agent, mgr):
    spec = MISSION_GRAPH.node(agent.name)
    return await run_contract_agent(agent, _ctx(agent, mgr), mgr, spec)


# ---------------------------------------------------------------------------
# Identity (AGENT_CONTRACT §2.1) — queryable without executing
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("agent", ALL_AGENTS, ids=AGENT_IDS)
def test_agent_identity_metadata(agent):
    assert isinstance(agent.name, str) and agent.name
    assert isinstance(agent.version, str) and agent.version
    assert agent.description
    assert agent.capabilities

    info = agent.identity()
    assert info["name"] == agent.name
    assert info["version"] == agent.version
    assert info["description"] == agent.description
    assert info["capabilities"] == list(agent.capabilities)
    assert isinstance(info["reads"], list)
    assert isinstance(info["writes"], list)

    # Registry key = stable slug; reads/writes match the MISSION_STATE §6 matrix.
    assert agent.name in {
        "risk_assessment", "victim_localization",
        "resource_coordination", "knowledge_retrieval", "rescue_coordination",
    }
    assert agent.reads and agent.writes


# ---------------------------------------------------------------------------
# Standard output envelope
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("agent", ALL_AGENTS, ids=AGENT_IDS)
def test_agent_emits_standard_envelope(agent):
    mgr = make_manager()
    output = asyncio.run(_run_agent(agent, mgr))

    assert CONTRACT_OUTPUT_KEYS <= output.keys()
    assert output["status"] == "success"
    assert 0.0 <= output["confidence"] <= 1.0
    assert isinstance(output["produced_artifacts"], dict) and output["produced_artifacts"]
    assert isinstance(output["tasks"], list)
    assert isinstance(output["warnings"], list)
    assert isinstance(output["errors"], list)
    assert output["execution_time"] is not None
    assert isinstance(output["next_handoff"], dict)
    assert output["next_handoff"]["agent"]


def test_agent_outputs_record_standard_envelope_on_state():
    mgr = make_manager()
    asyncio.run(run_executor(mgr))
    state = mgr.state

    for slug in ("risk_assessment", "victim_localization",
                 "resource_coordination", "knowledge_retrieval", "rescue_coordination"):
        record = [o for o in state.agent_outputs if o.agent_name == slug][-1]
        assert CONTRACT_OUTPUT_KEYS <= record.output.keys()
        assert record.status == "ok"
        assert record.output["produced_artifacts"]


# ---------------------------------------------------------------------------
# Input validation / output schema
# ---------------------------------------------------------------------------


def test_contract_validation_rejects_missing_keys():
    with pytest.raises(ContractViolationError):
        validate_contract_output({"status": "success", "confidence": 0.5}, writes={"risk_report"})


def test_contract_validation_rejects_bad_confidence():
    env = build_contract_output(confidence=1.5, produced_artifacts={"risk_report": {}})
    with pytest.raises(ContractViolationError):
        validate_contract_output(env, writes={"risk_report"})


def test_contract_validation_rejects_bad_status():
    env = build_contract_output(
        confidence=0.5, produced_artifacts={"risk_report": {}}, status="bogus"
    )
    with pytest.raises(ContractViolationError):
        validate_contract_output(env, writes={"risk_report"})


def test_contract_validation_rejects_undeclared_artifact():
    env = build_contract_output(confidence=0.5, produced_artifacts={"summary": {}})
    with pytest.raises(ContractViolationError):
        validate_contract_output(env, writes={"risk_report"})


def test_contract_validation_rejects_undeclared_tasks():
    env = build_contract_output(
        confidence=0.5,
        produced_artifacts={"risk_report": {}},
        tasks=[{"description": "x", "priority": "HIGH"}],
    )
    with pytest.raises(ContractViolationError):
        validate_contract_output(env, writes={"risk_report"})


def test_contract_validation_accepts_wellformed_output():
    env = build_contract_output(
        confidence=0.7,
        produced_artifacts={"risk_report": {"likelihood": "HIGH"}},
        tasks=[{"description": "Evacuate structure", "priority": "HIGH"}],
        next_handoff={"agent": "resource_coordination", "reason": "x"},
    )
    validate_contract_output(env, writes={"risk_report", "tasks"})


# ---------------------------------------------------------------------------
# Contract compliance via the executor (agent-agnostic scheduling)
# ---------------------------------------------------------------------------


class FakeContractAgent:
    """Implements only the universal contract (no BaseAgent) to prove executor agnosticism."""

    name = "risk_assessment"
    version = "2.0"
    description = "fake contract agent"
    capabilities = ["fake"]
    reads = frozenset({"evidence"})
    writes = frozenset({"risk_report", "tasks"})

    def __init__(self):
        self.initialize_calls = 0
        self.handoff_calls = 0
        self.act_calls = 0

    async def initialize(self, context):
        self.initialize_calls += 1
        assert context.state is not None
        assert context.config is not None
        assert isinstance(context.cycle_id, str) and context.cycle_id
        assert isinstance(context.cancelled, bool)

    async def perceive(self, state):
        return {"evidence": [e.source for e in state.evidence]}

    async def reason(self, perception, state):
        return {"action": "generate_report"}

    async def act(self, decision, state):
        self.act_calls += 1
        return build_contract_output(
            confidence=0.6,
            produced_artifacts={"risk_report": {"likelihood": "MEDIUM", "source": "fake"}},
            next_handoff={"agent": "resource_coordination", "reason": "probe"},
        )

    async def handoff(self, output, context):
        self.handoff_calls += 1
        return output


def _executor_with(risk_agent, *, config=None):
    mgr = make_manager()
    executor = GraphExecutor(
        mgr,
        handlers={
            "victim_localization": ok_handler,
            "resource_coordination": ok_handler,
            "knowledge_retrieval": ok_handler,
            "rescue_coordination": ok_handler,
            **BRIEFING,
        },
        agents={"risk_assessment": risk_agent},
        config=config or ExecutorConfig(agent_timeout=10.0, retry_backoff_base=0.0),
    )
    return mgr, executor


def test_executor_schedules_contract_agent_agnostically():
    mgr, executor = _executor_with(FakeContractAgent())
    result = asyncio.run(executor.run())

    assert result.status == "completed"
    node = result.results()["risk_assessment"]
    assert node.status == "ok"
    assert mgr.state.risk_report["likelihood"] == "MEDIUM"
    assert mgr.state.confidence_scores["risk_assessment"] == 0.6


def test_contract_violation_fails_cycle():
    class ViolatingAgent(FakeContractAgent):
        async def act(self, decision, state):
            return build_contract_output(
                confidence=0.5, produced_artifacts={"summary": {"overall_risk": "HIGH"}}
            )

    mgr, executor = _executor_with(
        ViolatingAgent(),
        config=ExecutorConfig(
            agent_timeout=10.0, max_retries=0, retry_backoff_base=0.0, fallback_enabled=False
        ),
    )
    result = asyncio.run(executor.run())

    assert result.status == "errored"
    node = result.results()["risk_assessment"]
    assert node.status == "error"
    assert "undeclared field" in node.error


# ---------------------------------------------------------------------------
# Error model + retry/fallback integration
# ---------------------------------------------------------------------------


def test_recoverable_error_retries_then_succeeds():
    class FlakyContractAgent(FakeContractAgent):
        def __init__(self):
            super().__init__()
            self.failures = 0

        async def act(self, decision, state):
            self.failures += 1
            if self.failures < 2:
                raise RecoverableError("transient blip")
            return await super().act(decision, state)

    agent = FlakyContractAgent()
    mgr, executor = _executor_with(
        agent, config=ExecutorConfig(agent_timeout=10.0, max_retries=2, retry_backoff_base=0.0)
    )
    result = asyncio.run(executor.run())

    assert result.status == "completed"
    node = result.results()["risk_assessment"]
    assert node.status == "ok"
    assert node.attempts == 2
    assert agent.failures == 2
    assert mgr.state.confidence_scores["risk_assessment"] == 0.6


def test_errors_exhausted_then_fallback_caps_confidence():
    class AlwaysFailContractAgent(FakeContractAgent):
        async def act(self, decision, state):
            raise RetryableError("hard failure")

    mgr, executor = _executor_with(
        AlwaysFailContractAgent(),
        config=ExecutorConfig(agent_timeout=10.0, max_retries=2, retry_backoff_base=0.0),
    )
    result = asyncio.run(executor.run())

    assert result.status == "completed"
    node = result.results()["risk_assessment"]
    assert node.status == "fallback"
    assert node.confidence == 0.4
    assert mgr.state.confidence_scores["risk_assessment"] == 0.4
    assert mgr.state.risk_report["source"] == "fallback"


def test_skip_error_produces_skipped_envelope():
    class SkipAgent(FakeContractAgent):
        async def act(self, decision, state):
            raise SkippedError("no evidence to assess")

    mgr, executor = _executor_with(SkipAgent())
    result = asyncio.run(executor.run())

    assert result.status == "completed"
    node = result.results()["risk_assessment"]
    assert node.status == "ok"
    record = [o for o in mgr.state.agent_outputs if o.agent_name == "risk_assessment"][-1]
    assert record.output["status"] == "skipped"
    assert record.confidence == 0.0


def test_contract_error_classification():
    assert classify_contract_error(RecoverableError()) == "recoverable"
    assert classify_contract_error(RetryableError()) == "retryable"
    assert classify_contract_error(ContractViolationError()) == "validation"
    assert classify_contract_error(ValueError("x")) == "unknown"


# ---------------------------------------------------------------------------
# Handoff + task dedupe + backward compatibility
# ---------------------------------------------------------------------------


def test_handoff_step_is_invoked_and_can_mutate_output():
    class HandoffAgent(FakeContractAgent):
        async def handoff(self, output, context):
            output = await super().handoff(output, context)
            output["warnings"].append("post-processed")
            return output

    agent = HandoffAgent()
    mgr, executor = _executor_with(agent)
    asyncio.run(executor.run())

    assert agent.handoff_calls == 1
    record = [o for o in mgr.state.agent_outputs if o.agent_name == "risk_assessment"][-1]
    assert "post-processed" in record.output["warnings"]


def test_task_dedupe_on_rerun():
    mgr = make_manager()
    risk = RiskAssessmentAgent()

    asyncio.run(_run_agent(risk, mgr))
    first_count = len(mgr.state.tasks)
    assert first_count == 2

    asyncio.run(_run_agent(risk, mgr))
    assert len(mgr.state.tasks) == first_count


def test_full_graph_preserves_legacy_outputs():
    mgr = make_manager()
    asyncio.run(run_executor(mgr))
    state = mgr.state

    assert state.risk_report["likelihood"] == "HIGH"
    assert state.victim_map["primary_search_zone"] == "B2"
    assert state.resource_allocation["assignments"]
    assert state.knowledge_results["recommendations"]
    assert state.rescue_guidance["priority_sequence"]
    # risk context elevates B1 to HIGH, adding a victim task; resource then
    # deploys for 3 HIGH zones + perimeter (4 assignments). 2+3+4+2 = 11 tasks.
    assert len(state.tasks) == 11
    assert set(state.confidence_scores) == {
        "risk_assessment", "victim_localization",
        "resource_coordination", "knowledge_retrieval", "rescue_coordination",
    }
    assert state.status.stage == "briefing_ready"
    assert mgr.validate() == []
