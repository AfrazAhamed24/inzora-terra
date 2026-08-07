"""Unit tests: GraphExecutor (ORCHESTRATOR.md §4–§5) over the dependency graph.

Covers level scheduling, parallel L1 execution, level gating, retry/backoff, fallback (with
capped confidence), mission errored on unhandled failure, cancellation, and state-manager routing.
"""

import asyncio

import pytest

from backend.agents.knowledge.agent import KnowledgeRetrievalAgent
from backend.agents.resource_coordination.agent import ResourceCoordinationAgent
from backend.agents.risk_assessment.agent import RiskAssessmentAgent
from backend.agents.victim_localization.agent import VictimLocalizationAgent
from backend.core.gop import TERRAState
from backend.core.permissions import ORCHESTRATOR
from backend.core.state_manager import MissionStateManager
from backend.core.tools import get_building_info, get_sensor_data, get_weather
from backend.orchestration.briefing import BriefingGenerator
from backend.orchestration.executor import (
    ExecutionResult,
    ExecutorConfig,
    GraphExecutionError,
    GraphExecutor,
)
from backend.orchestration.graph import DependencyGraph, NodeSpec

from backend.orchestration.orchestrator import Orchestrator

BRIEFING = {"briefing_generator": BriefingGenerator()}


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
    }


async def ok_handler(_ctx):
    return {"ok": True}


async def run_executor(mgr, *, config=None, handlers=None, agents=None) -> ExecutionResult:
    executor = GraphExecutor(
        mgr,
        handlers=handlers or BRIEFING,
        agents=agents if agents is not None else default_agents(),
        config=config or ExecutorConfig(agent_timeout=10.0, retry_backoff_base=0.0),
    )
    return await executor.run()


def test_full_graph_with_real_agents():
    mgr = make_manager()
    result = asyncio.run(run_executor(mgr))

    assert result.status == "completed"
    flat = result.results()
    assert set(flat) == {
        "risk_assessment", "victim_localization",
        "resource_coordination", "knowledge_retrieval", "briefing_generator",
    }
    for slug, node in flat.items():
        assert node.status == "ok", f"{slug} -> {node.status}"

    state = mgr.state
    assert state.risk_report["likelihood"] == "HIGH"
    assert state.victim_map["primary_search_zone"] == "B2"
    assert state.resource_allocation["assignments"]
    assert state.knowledge_results["recommendations"]
    assert state.summary is not None
    assert state.summary.mission_briefing["overall_risk"] == "HIGH"
    assert state.status.stage == "briefing_ready"
    assert state.status.is_running is True
    assert mgr.validate() == []


def test_stage_advances_through_lifecycle():
    mgr = make_manager()
    asyncio.run(run_executor(mgr))
    stage_change = [e for e in mgr.state.timeline if e.type == "stage_change"]
    types = [e.data["to"] for e in stage_change]
    assert "risk_assessed" in types
    assert "victims_localized" in types
    assert "resources_allocated" in types
    assert "knowledge_queried" in types
    assert "briefing_ready" in types


def test_level1_runs_in_parallel():
    """Both L1 agents must overlap in wall-clock time (DEPENDENCY_GRAPH §7)."""
    events = []

    async def slow(name, _ctx):
        events.append(f"{name}-start")
        await asyncio.sleep(0.05)
        events.append(f"{name}-end")
        return {"ok": True}

    def make(name):
        def handler(ctx):
            return slow(name, ctx)
        return handler

    mgr = make_manager()
    executor = GraphExecutor(
        mgr,
        handlers={
            "risk_assessment": make("risk"),
            "victim_localization": make("victim"),
            "resource_coordination": ok_handler,
            "knowledge_retrieval": ok_handler,
            **BRIEFING,
        },
        config=ExecutorConfig(agent_timeout=10.0),
    )
    asyncio.run(executor.run())

    start = [i for i, e in enumerate(events) if e.endswith("-start")]
    end = [i for i, e in enumerate(events) if e.endswith("-end")]
    # The two L1 agents interleave: the second start happens before the first end.
    assert max(start) < min(end)


def test_level2_waits_for_both_level1_nodes():
    """L2 resource/knowledge nodes must observe both L1 reports (DEPENDENCY_GRAPH §7)."""
    mgr = make_manager()
    asyncio.run(run_executor(mgr))
    state = mgr.state
    # resource_coordination consumed risk_report + victim_map
    for assignment in state.resource_allocation["assignments"]:
        assert assignment["zone"]
    # knowledge_retrieval consumed risk_report + victim_map
    assert state.knowledge_results["recommendations"]
    assert state.resource_allocation["utilization"] >= 0


def test_briefing_only_after_both_l2_reports():
    mgr = make_manager()
    asyncio.run(run_executor(mgr))
    types = [e.type for e in mgr.state.timeline]
    # agent_complete for L2 precedes the briefing_generator's agent_start.
    l2_done = max(i for i, t in enumerate(types) if t == "agent_complete" and
                  mgr.state.timeline[i].agent in ("resource_coordination", "knowledge_retrieval"))
    briefing_start = next(
        i for i, e in enumerate(mgr.state.timeline)
        if e.type == "agent_start" and e.agent == "briefing_generator"
    )
    assert l2_done < briefing_start


def test_retry_then_success():
    calls = {"n": 0}

    async def flaky(_ctx):
        calls["n"] += 1
        if calls["n"] < 2:
            raise RuntimeError("transient failure")
        return {"ok": True}

    mgr = make_manager()
    executor = GraphExecutor(
        mgr,
        handlers={
            "risk_assessment": flaky,
            "victim_localization": ok_handler,
            "resource_coordination": ok_handler,
            "knowledge_retrieval": ok_handler,
            **BRIEFING,
        },
        config=ExecutorConfig(agent_timeout=10.0, max_retries=2, retry_backoff_base=0.0),
    )
    result = asyncio.run(executor.run())

    assert result.status == "completed"
    assert result.results()["risk_assessment"].attempts == 2
    assert calls["n"] == 2
    retries = [e for e in mgr.state.timeline if e.type == "agent_retry"]
    assert len(retries) == 1
    assert retries[0].agent == "risk_assessment"


def test_retries_exhausted_then_fallback_caps_confidence():
    calls = {"n": 0}

    async def always_fail(_ctx):
        calls["n"] += 1
        raise RuntimeError("hard failure")

    mgr = make_manager()
    executor = GraphExecutor(
        mgr,
        handlers={
            "risk_assessment": always_fail,
            "victim_localization": ok_handler,
            "resource_coordination": ok_handler,
            "knowledge_retrieval": ok_handler,
            **BRIEFING,
        },
        config=ExecutorConfig(agent_timeout=10.0, max_retries=2, retry_backoff_base=0.0),
    )
    result = asyncio.run(executor.run())

    # Fallback counts as complete; the mission continues with capped confidence.
    assert result.status == "completed"
    risk = result.results()["risk_assessment"]
    assert risk.status == "fallback"
    assert risk.confidence == 0.4
    assert calls["n"] == 3  # initial + 2 retries
    assert mgr.state.confidence_scores["risk_assessment"] == 0.4
    outputs = [o for o in mgr.state.agent_outputs if o.agent_name == "risk_assessment"]
    assert outputs[-1].status == "fallback"
    assert mgr.state.risk_report["source"] == "fallback"
    # error_count records the exhausted failure
    assert mgr.state.status.error_count == 1


def test_fallback_disabled_errors_mission():
    calls = {"n": 0}

    async def always_fail(_ctx):
        calls["n"] += 1
        raise RuntimeError("hard failure")

    mgr = make_manager()
    executor = GraphExecutor(
        mgr,
        handlers={
            "risk_assessment": always_fail,
            "victim_localization": ok_handler,
            "resource_coordination": ok_handler,
            "knowledge_retrieval": ok_handler,
            **BRIEFING,
        },
        config=ExecutorConfig(
            agent_timeout=10.0, max_retries=2, retry_backoff_base=0.0, fallback_enabled=False
        ),
    )
    result = asyncio.run(executor.run())

    assert result.status == "errored"
    risk = result.results()["risk_assessment"]
    assert risk.status == "error"
    assert mgr.state.status.stage == "errored"
    assert mgr.state.status.error_count >= 1
    assert mgr.state.status.last_error
    assert mgr.state.status.is_running is False


def test_level_failure_blocks_subsequent_levels():
    async def fail(_ctx):
        raise RuntimeError("boom")

    mgr = make_manager()
    executor = GraphExecutor(
        mgr,
        handlers={
            "risk_assessment": fail,
            "victim_localization": ok_handler,
            "resource_coordination": ok_handler,
            "knowledge_retrieval": ok_handler,
            **BRIEFING,
        },
        config=ExecutorConfig(
            agent_timeout=10.0, max_retries=0, retry_backoff_base=0.0, fallback_enabled=False
        ),
    )
    result = asyncio.run(executor.run())
    assert result.status == "errored"
    # briefing (L3) never ran
    assert "briefing_generator" not in result.results()
    assert mgr.state.summary is None


def test_timeout_treated_as_failure_then_fallback():
    calls = {"n": 0}

    async def slow(_ctx):
        calls["n"] += 1
        await asyncio.sleep(10.0)
        return {"ok": True}

    mgr = make_manager()
    executor = GraphExecutor(
        mgr,
        handlers={
            "risk_assessment": slow,
            "victim_localization": ok_handler,
            "resource_coordination": ok_handler,
            "knowledge_retrieval": ok_handler,
            **BRIEFING,
        },
        config=ExecutorConfig(agent_timeout=0.05, max_retries=1, retry_backoff_base=0.0),
    )
    result = asyncio.run(executor.run())
    assert result.status == "completed"
    risk = result.results()["risk_assessment"]
    assert risk.status == "fallback"
    assert risk.confidence == 0.4
    assert calls["n"] == 2  # initial attempt + 1 retry, both timed out


def test_cancel_stops_execution():
    started = asyncio.Event()

    async def block_until_cancelled(_ctx):
        started.set()
        await asyncio.sleep(10.0)
        return {"ok": True}

    mgr = make_manager()
    executor = GraphExecutor(
        mgr,
        handlers={
            "risk_assessment": block_until_cancelled,
            "victim_localization": ok_handler,
            "resource_coordination": ok_handler,
            "knowledge_retrieval": ok_handler,
            **BRIEFING,
        },
        config=ExecutorConfig(agent_timeout=None),
    )

    async def scenario():
        task = asyncio.create_task(executor.run())
        await started.wait()
        executor.cancel()
        return await task

    result = asyncio.run(scenario())
    assert result.status == "cancelled"
    risk = result.results()["risk_assessment"]
    assert risk.status == "cancelled"
    # Later levels did not run.
    assert "briefing_generator" not in result.results()


def test_missing_handler_raises_at_construction():
    mgr = make_manager()
    with pytest.raises(GraphExecutionError):
        GraphExecutor(
            mgr,
            handlers={"risk_assessment": ok_handler},
            config=ExecutorConfig(agent_timeout=10.0),
        )


def test_read_consistency_snapshot_is_deep_copy():
    seen = {}

    async def spy(_ctx):
        seen["inputs"] = _ctx.inputs
        return {"ok": True}

    mgr = make_manager()
    asyncio.run(run_executor(mgr, handlers={
        "risk_assessment": spy,
        "victim_localization": ok_handler,
        "resource_coordination": ok_handler,
        "knowledge_retrieval": ok_handler,
        **BRIEFING,
    }))
    # Mutating the snapshot must not leak into live state.
    inputs = seen["inputs"]
    assert isinstance(inputs["evidence"], list)
    inputs["evidence"] = []
    assert mgr.state.evidence


def test_context_carries_dependencies():
    captured = {}

    async def spy(ctx):
        captured["deps"] = ctx.dependencies
        captured["cycle"] = ctx.cycle_id
        return {"ok": True}

    mgr = make_manager()
    asyncio.run(run_executor(mgr, handlers={
        "risk_assessment": ok_handler,
        "victim_localization": ok_handler,
        "resource_coordination": spy,
        "knowledge_retrieval": ok_handler,
        **BRIEFING,
    }))
    # resource_coordination depends on both L1 reports.
    assert "risk_assessment" in captured["deps"]
    assert "victim_localization" in captured["deps"]
    assert captured["cycle"].startswith("CYC-")


def test_orchestrator_lifecycle_api_runs_graph():
    from backend.orchestration.orchestrator import Orchestrator

    async def scenario():
        orch = Orchestrator()
        orch.setup_default_agents()
        mission_id = orch.start("building collapse", environment_id="scenario_collapse_rain")
        assert mission_id.startswith("MISS-")
        orch.ingest([
            {"source": "sensor:north_wall", "data": get_sensor_data("north_wall"), "confidence": 0.9},
            {"source": "building:bld_001", "data": get_building_info("bld_001"), "confidence": 0.95},
        ])
        state = orch.get_state()
        assert state.status.stage == "evidence_ingested"
        result = await orch.run_graph()
        return orch, result

    orch, result = asyncio.run(scenario())
    assert result.status == "completed"
    assert orch.get_state().status.stage == "briefing_ready"
    assert orch.get_state().summary is not None


def test_orchestrator_legacy_run_still_works():
    """The CLI entry point (backend/run.py) must still produce a briefing via the graph."""

    async def scenario():
        state = TERRAState()
        state.incident_text = "Two-floor building collapsed after heavy rainfall. 3 missing persons."
        state.stage = "initialized"
        state.add_evidence("sensor:north_wall", get_sensor_data("north_wall"), 0.9)
        state.add_evidence(
            "sensor:basement",
            {"tilt_deg": 2, "trend": "stable", "thermal": "heat signature detected in basement",
             "gpr": "cracks at basement level"},
            0.85,
        )
        state.add_evidence("weather:current", get_weather("current"), 0.85)
        state.add_evidence("building:bld_001", get_building_info("bld_001"), 0.95)
        state.add_evidence(
            "witness:report_001",
            {"source": "neighbor", "last_seen": "basement", "persons": 3},
            0.60,
        )
        orch = Orchestrator()
        orch.state = state
        orch.setup_default_agents()
        briefing = await orch.run(state.incident_text)
        return state, briefing

    state, briefing = asyncio.run(scenario())
    mb = briefing["mission_briefing"]
    assert mb["overall_risk"] == "HIGH"
    assert mb["total_victims_estimated"] == 3
    assert "B2" in mb["priority_zones"]
    assert state.status.stage == "completed"
    assert len(state.agent_outputs) == 5  # 4 agents + briefing_generator


def test_custom_graph_scheduling_order():
    """A smaller custom graph still executes L1 before L2."""

    graph = DependencyGraph(
        nodes={
            "a": NodeSpec.make("a", level=1, stage_token="a_done"),
            "b": NodeSpec.make("b", level=2, stage_token="b_done"),
        },
        edges=[("a", "b")],
    )
    order = []

    async def handler_a(_ctx):
        order.append("a")
        return {"ok": True}

    async def handler_b(_ctx):
        order.append("b")
        return {"ok": True}

    mgr = make_manager()
    executor = GraphExecutor(
        mgr,
        handlers={"a": handler_a, "b": handler_b},
        graph=graph,
        config=ExecutorConfig(agent_timeout=10.0),
    )
    result = asyncio.run(executor.run())
    assert result.status == "completed"
    assert order == ["a", "b"]
