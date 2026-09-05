"""Unit tests: Observability & Agent Registry (Phase 1B.4).

Covers the central ``AgentRegistry`` (register/get/list/metadata/level/dependencies/validate),
structured logging + correlation per LOGGING_SPEC.md (mission_id / trace_id / stage / agent_id on
every record, CYC trace shared across retries, GRAPH run trace), report alignment (``as_of`` +
``cycle_id`` on owned reports), handoff events + ``MissionSummary.handoffs``, executor agent
discovery through the registry, and backward compatibility of the legacy ``agents=`` mapping.
"""

import asyncio

import pytest

from backend.agents.knowledge.agent import KnowledgeRetrievalAgent
from backend.agents.registry import (
    AgentRegistry,
    DuplicateRegistrationError,
    RegistryError,
    UnknownAgentError,
)
from backend.agents.rescue_coordination.agent import RescueCoordinationAgent
from backend.agents.resource_coordination.agent import ResourceCoordinationAgent
from backend.agents.risk_assessment.agent import RiskAssessmentAgent
from backend.agents.victim_localization.agent import VictimLocalizationAgent
from backend.core.permissions import ORCHESTRATOR
from backend.core.state_manager import MissionStateManager
from backend.core.tools import get_building_info, get_sensor_data, get_weather
from backend.orchestration.briefing import BriefingGenerator, collect_handoffs
from backend.orchestration.events import EventSink
from backend.orchestration.executor import ExecutorConfig, GraphExecutor
from backend.orchestration.graph import MISSION_GRAPH

BRIEFING = {"briefing_generator": BriefingGenerator()}


def default_factories():
    """Zero-argument factories — how the registry prefers registration."""
    return [
        RiskAssessmentAgent,
        VictimLocalizationAgent,
        ResourceCoordinationAgent,
        KnowledgeRetrievalAgent,
        RescueCoordinationAgent,
    ]


def make_manager() -> MissionStateManager:
    mgr = MissionStateManager()
    mgr.create(
        "Two-floor building collapsed after heavy rainfall. 3 missing persons.",
        environment_id="scenario_collapse_rain",
    )
    mgr.append_evidence(ORCHESTRATOR, "sensor:north_wall", get_sensor_data("north_wall"), 0.9)
    mgr.append_evidence(ORCHESTRATOR, "weather:current", get_weather("current"), 0.85)
    mgr.append_evidence(ORCHESTRATOR, "building:bld_001", get_building_info("bld_001"), 0.95)
    return mgr


# ---------------------------------------------------------------------------
# Agent Registry (AGENT_CONTRACT.md §8)
# ---------------------------------------------------------------------------


def test_registry_register_factory_and_get():
    registry = AgentRegistry()
    agent = registry.register(RiskAssessmentAgent)
    assert registry.get("risk_assessment") is agent
    assert agent.name == "risk_assessment"


def test_registry_register_instance():
    registry = AgentRegistry()
    instance = RiskAssessmentAgent()
    registry.register(instance)
    assert registry.get("risk_assessment") is instance


def test_registry_duplicate_registration_raises():
    registry = AgentRegistry()
    registry.register(RiskAssessmentAgent)
    with pytest.raises(DuplicateRegistrationError):
        registry.register(RiskAssessmentAgent)


def test_registry_missing_agent_raises():
    registry = AgentRegistry()
    assert registry.get("ghost_agent") is None
    with pytest.raises(UnknownAgentError):
        registry.unregister("ghost_agent")
    with pytest.raises(UnknownAgentError):
        registry.metadata("ghost_agent")
    with pytest.raises(UnknownAgentError):
        registry.level("ghost_agent")


def test_registry_unregister():
    registry = AgentRegistry()
    registry.register(RiskAssessmentAgent)
    registry.unregister("risk_assessment")
    assert "risk_assessment" not in registry
    assert len(registry) == 0


def test_registry_register_many_and_iteration():
    registry = AgentRegistry()
    registry.register_many(default_factories())
    assert sorted(registry) == [
        "knowledge_retrieval",
        "rescue_coordination",
        "resource_coordination",
        "risk_assessment",
        "victim_localization",
    ]
    assert len(registry) == 5


def test_registry_metadata_and_graph_position():
    registry = AgentRegistry()
    registry.register_many(default_factories())
    meta = registry.metadata("risk_assessment")
    assert meta["name"] == "risk_assessment"
    assert meta["version"]
    assert meta["description"]
    assert isinstance(meta["capabilities"], list)
    assert meta["level"] == 1
    assert meta["dependencies"] == []
    assert meta["dependents"] == ["victim_localization"]

    victim = registry.metadata("victim_localization")
    assert victim["level"] == 2
    assert sorted(victim["dependencies"]) == ["risk_assessment"]


def test_registry_level_dependencies_dependents():
    registry = AgentRegistry()
    registry.register_many(default_factories())
    assert registry.level("risk_assessment") == 1
    assert registry.level("victim_localization") == 2
    assert registry.level("resource_coordination") == 3
    assert registry.level("knowledge_retrieval") == 4
    assert registry.level("rescue_coordination") == 5
    assert registry.dependencies("victim_localization") == ("risk_assessment",)
    assert registry.dependencies("resource_coordination") == ("victim_localization",)
    assert registry.dependents("risk_assessment") == ("victim_localization",)


def test_registry_validate_good_agents():
    registry = AgentRegistry()
    registry.register_many(default_factories())
    assert registry.validate() == []
    registry.validate_raise()  # must not raise


def test_registry_validate_detects_violations():
    registry = AgentRegistry()

    class BadAgent:
        name = "risk_assessment"  # collision with graph node but bad metadata
        version = ""
        description = ""
        capabilities = [1, "two"]
        reads = "not-a-set"
        writes = ["risk_report", "not_granted"]

    registry.register(BadAgent())
    problems = registry.validate()
    assert any("version" in p for p in problems)
    assert any("capabilities" in p for p in problems)
    assert any("reads" in p for p in problems)
    assert any("not granted" in p for p in problems)
    with pytest.raises(RegistryError):
        registry.validate_raise()


def test_registry_rejects_agent_without_name():
    registry = AgentRegistry()

    class Nameless:
        pass

    with pytest.raises(RegistryError):
        registry.register(Nameless)  # factory producing an agent with no name


# ---------------------------------------------------------------------------
# EventSink correlation (LOGGING_SPEC §3, §7)
# ---------------------------------------------------------------------------


def test_sink_log_record_schema_and_correlation():
    mgr = make_manager()
    sink = EventSink(mgr)
    sink.set_trace("GRAPH-1")
    log_id = sink.log("WARNING", "sensor drift", source="risk_assessment",
                      context={"cycle_id": "CYC-1"}, data={"delta": 2.0})

    entry = mgr.state.logs[-1]
    assert entry.id == log_id
    assert entry.id.startswith("LOG-")
    assert entry.ts
    assert entry.level == "WARNING"
    assert entry.source == "risk_assessment"
    assert entry.message == "sensor drift"
    assert entry.mission_id == mgr.state.metadata.mission_id
    assert entry.trace_id == "GRAPH-1"
    assert entry.context["stage"] == mgr.stage
    assert entry.context["cycle_id"] == "CYC-1"
    assert entry.data == {"delta": 2.0}


def test_sink_trace_context_manager_restores_previous():
    mgr = make_manager()
    sink = EventSink(mgr)
    sink.set_trace("GRAPH-1")
    with sink.trace("CYC-9"):
        sink.log("INFO", "inside cycle")
        assert mgr.state.logs[-1].trace_id == "CYC-9"
    sink.log("INFO", "outside cycle")
    assert mgr.state.logs[-1].trace_id == "GRAPH-1"


def test_sink_emit_enriches_timeline_with_correlation():
    mgr = make_manager()
    sink = EventSink(mgr)
    sink.set_trace("GRAPH-2")
    sink.emit({"type": "agent_start", "agent": "risk_assessment", "message": "start"})

    event = mgr.state.timeline[-1]
    assert event.mission_id == mgr.state.metadata.mission_id
    assert event.trace_id == "GRAPH-2"
    assert event.data["stage"] == mgr.stage
    assert event.data["agent_id"] == "risk_assessment"


def test_sink_typed_handoff_event():
    mgr = make_manager()
    sink = EventSink(mgr)
    sink.emit_handoff("risk_assessment", "resource_coordination", "handing off")

    event = mgr.state.timeline[-1]
    assert event.type == "handoff"
    assert event.data["from"] == "risk_assessment"
    assert event.data["to"] == "resource_coordination"


# ---------------------------------------------------------------------------
# Executor observability: traces, report alignment, handoffs, discovery
# ---------------------------------------------------------------------------


def run_sync(awaitable):
    return asyncio.run(awaitable)


def test_executor_allocates_graph_trace_and_correlated_events():
    async def scenario():
        mgr = make_manager()
        executor = GraphExecutor(
            mgr,
            registry=_full_registry(),
            handlers=BRIEFING,
            config=ExecutorConfig(agent_timeout=10.0, retry_backoff_base=0.0),
        )
        result = await executor.run()
        return mgr, result

    mgr, result = run_sync(scenario())
    assert result.status == "completed"
    assert result.trace_id.startswith("GRAPH-")
    for event in mgr.state.timeline:
        assert event.mission_id == mgr.state.metadata.mission_id
    for event in mgr.state.timeline:
        if event.type in ("agent_start", "agent_complete", "agent_retry", "agent_failed", "handoff"):
            assert event.trace_id  # node-cycle events always carry a CYC/GRAPH trace
    assert any(e.type == "handoff" for e in mgr.state.timeline)
    assert any(e.type == "mission_start" for e in mgr.state.timeline)


def test_executor_reports_carry_cycle_id_and_as_of():
    async def scenario():
        mgr = make_manager()
        executor = GraphExecutor(
            mgr,
            registry=_full_registry(),
            handlers=BRIEFING,
            config=ExecutorConfig(agent_timeout=10.0, retry_backoff_base=0.0),
        )
        result = await executor.run()
        return mgr, result

    mgr, result = run_sync(scenario())
    assert result.status == "completed"
    assert mgr.state.risk_report.get("cycle_id")
    assert mgr.state.risk_report.get("as_of")
    assert mgr.state.victim_map.get("cycle_id")
    assert mgr.state.resource_allocation.get("cycle_id")
    assert mgr.state.knowledge_results.get("cycle_id")
    assert mgr.state.rescue_guidance.get("cycle_id")
    assert mgr.state.rescue_guidance.get("as_of")


def test_executor_agent_complete_trace_matches_cycle_and_summary_handoffs():
    async def scenario():
        mgr = make_manager()
        executor = GraphExecutor(
            mgr,
            registry=_full_registry(),
            handlers=BRIEFING,
            config=ExecutorConfig(agent_timeout=10.0, retry_backoff_base=0.0),
        )
        await executor.run()
        return mgr

    mgr = run_sync(scenario())
    assert mgr.state.summary is not None
    handoffs = collect_handoffs(mgr.state)
    assert len(handoffs) >= 5  # all five agents declare a handoff
    agents = {h["agent"] for h in handoffs}
    assert agents == {
        "risk_assessment",
        "victim_localization",
        "resource_coordination",
        "knowledge_retrieval",
        "rescue_coordination",
    }
    assert mgr.state.summary.handoffs
    assert mgr.state.summary.handoffs[0]["next_handoff"]["agent"]


def test_executor_retries_share_one_cycle_trace():
    async def scenario():
        mgr = make_manager()
        attempts = {"n": 0}

        async def flaky_handler(_ctx):
            attempts["n"] += 1
            if attempts["n"] < 3:
                raise RuntimeError("transient")
            return {"ok": True, "likelihood": "LOW", "confidence": 0.9}

        # Only risk_assessment is flaky; brief the rest with handlers.
        executor = GraphExecutor(
            mgr,
            registry=_full_registry(),
            handlers={
                **BRIEFING,
                "victim_localization": lambda _ctx: {
                    "zones": [], "total_victims_estimated": 0, "confidence": 0.8
                },
                "resource_coordination": lambda _ctx: {
                    "assignments": [], "confidence": 0.8
                },
                "knowledge_retrieval": lambda _ctx: {
                    "sops": [], "recommendations": [], "confidence": 0.8
                },
                "rescue_coordination": lambda _ctx: {
                    "priority_sequence": [], "confidence": 0.8
                },
                "risk_assessment": flaky_handler,
            },
            config=ExecutorConfig(max_retries=3, retry_backoff_base=0.0),
        )
        result = await executor.run()
        return mgr, result, attempts

    mgr, result, attempts = run_sync(scenario())
    assert result.status == "completed"
    assert attempts["n"] == 3

    start = next(e for e in mgr.state.timeline if e.type == "agent_start"
                 and e.agent == "risk_assessment")
    retries = [e for e in mgr.state.timeline if e.type == "agent_retry"
               and e.agent == "risk_assessment"]
    complete = next(e for e in mgr.state.timeline if e.type == "agent_complete"
                    and e.agent == "risk_assessment")
    cyc = start.data["cycle_id"]
    assert len(retries) == 2
    assert all(r.trace_id == cyc for r in retries)
    assert complete.trace_id == cyc


def test_executor_discovers_agents_via_registry():
    async def scenario():
        mgr = make_manager()
        executor = GraphExecutor(
            mgr,
            registry=_full_registry(),
            handlers=BRIEFING,
            config=ExecutorConfig(agent_timeout=10.0, retry_backoff_base=0.0),
        )
        return await executor.run()

    result = run_sync(scenario())
    assert result.status == "completed"
    assert all(nr.status == "ok" for nr in result.results().values())


def test_executor_registry_without_required_agent_raises():
    async def scenario():
        mgr = make_manager()
        registry = AgentRegistry()
        registry.register(RiskAssessmentAgent)
        executor = GraphExecutor(
            mgr,
            registry=registry,
            handlers=BRIEFING,
        )
        await executor.run()

    with pytest.raises(Exception):
        run_sync(scenario())


def test_executor_legacy_agents_mapping_backward_compat():
    async def scenario():
        mgr = make_manager()
        agents = {
            "risk_assessment": RiskAssessmentAgent(),
            "victim_localization": VictimLocalizationAgent(),
            "resource_coordination": ResourceCoordinationAgent(),
            "knowledge_retrieval": KnowledgeRetrievalAgent(),
            "rescue_coordination": RescueCoordinationAgent(),
        }
        executor = GraphExecutor(
            mgr,
            agents=agents,
            handlers=BRIEFING,
            config=ExecutorConfig(agent_timeout=10.0, retry_backoff_base=0.0),
        )
        return await executor.run()

    result = run_sync(scenario())
    assert result.status == "completed"


def test_executor_fallback_report_aligned():
    async def scenario():
        mgr = make_manager()

        async def fail_handler(_ctx):
            raise RuntimeError("boom")

        agents = {
            "risk_assessment": RiskAssessmentAgent(),
            "victim_localization": VictimLocalizationAgent(),
            "resource_coordination": ResourceCoordinationAgent(),
            "knowledge_retrieval": KnowledgeRetrievalAgent(),
            "rescue_coordination": RescueCoordinationAgent(),
        }
        agents["risk_assessment"] = fail_handler
        executor = GraphExecutor(
            mgr,
            agents=agents,
            handlers=BRIEFING,
            config=ExecutorConfig(max_retries=0, fallback_enabled=True,
                                  retry_backoff_base=0.0),
        )
        result = await executor.run()
        return mgr, result

    mgr, result = run_sync(scenario())
    assert result.status == "completed"
    fallback = next(r for r in result.results().values() if r.status == "fallback")
    assert fallback.node == "risk_assessment"
    assert mgr.state.risk_report.get("cycle_id")
    assert mgr.state.risk_report.get("as_of")
    assert mgr.state.risk_report.get("source") == "fallback"


def _full_registry() -> AgentRegistry:
    registry = AgentRegistry()
    registry.register_many(default_factories())
    return registry


def test_mission_start_timeline_carries_mission_id():
    mgr = make_manager()
    start = next(e for e in mgr.state.timeline if e.type == "mission_start")
    assert start.mission_id == mgr.state.metadata.mission_id


def test_stage_change_timeline_carries_mission_id():
    mgr = make_manager()
    mgr.advance(ORCHESTRATOR, "evidence_ingested")
    change = next(e for e in mgr.state.timeline if e.type == "stage_change")
    assert change.mission_id == mgr.state.metadata.mission_id
