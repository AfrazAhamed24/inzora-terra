"""Unit tests: Event-driven Mission Loop (Phase 1C).

Covers the live mission loop end-to-end: telemetry streaming + ingestion, periodic dependency-graph
evaluation, HITL pause/resume and timeout/escalate, terminal lifecycle stages, incremental summary
refresh, and replay recording.
"""

import asyncio

import pytest

from backend.agents.knowledge.agent import KnowledgeRetrievalAgent
from backend.agents.registry import AgentRegistry
from backend.agents.rescue_coordination.agent import RescueCoordinationAgent
from backend.agents.resource_coordination.agent import ResourceCoordinationAgent
from backend.agents.risk_assessment.agent import RiskAssessmentAgent
from backend.agents.victim_localization.agent import VictimLocalizationAgent
from backend.core.permissions import ORCHESTRATOR
from backend.core.state_manager import MissionStateManager
from backend.orchestration.briefing import BriefingGenerator
from backend.orchestration.events import EventSink
from backend.orchestration.executor import ExecutorConfig, GraphExecutor
from backend.orchestration.hitl import HitlGate
from backend.orchestration.mission_loop import MissionLoop, MissionLoopConfig
from backend.orchestration.replay import MissionReplayRecorder
from backend.simulation import ScenarioEngine, TelemetryIngest

BRIEFING = {"briefing_generator": BriefingGenerator()}


def _registry() -> AgentRegistry:
    registry = AgentRegistry()
    registry.register_many(
        [RiskAssessmentAgent, VictimLocalizationAgent,
         ResourceCoordinationAgent, KnowledgeRetrievalAgent,
         RescueCoordinationAgent]
    )
    return registry


def _make_loop(*, max_cycles=60, hitl_timeout=5.0, cycles_between=5, recorder=True,
               engine_seed=42, timeout_action="escalate", scenario="scenario_collapse_rain",
               hitl_enabled=True):
    mgr = MissionStateManager()
    mgr.create(
        "Two-floor building collapsed after heavy rainfall. 3 missing persons.",
        environment_id=scenario,
    )
    engine = ScenarioEngine(
        mission_id=mgr.state.metadata.mission_id, seed=engine_seed,
        scenario=scenario,
    )
    ingest = TelemetryIngest(mgr)
    executor = GraphExecutor(
        mgr,
        registry=_registry(),
        handlers=BRIEFING,
        config=ExecutorConfig(agent_timeout=10.0, retry_backoff_base=0.0),
    )
    hitl = HitlGate(mgr, timeout=hitl_timeout, timeout_action=timeout_action)
    rec = MissionReplayRecorder.from_engine(engine) if recorder else None
    loop = MissionLoop(
        manager=mgr,
        engine=engine,
        ingest=ingest,
        executor=executor,
        event_sink=EventSink(mgr),
        hitl=hitl,
        config=MissionLoopConfig(
            max_cycles=max_cycles,
            cycles_between_graph_runs=cycles_between,
            hitl_timeout=hitl_timeout,
            hitl_enabled=hitl_enabled,
        ),
        recorder=rec,
    )
    return mgr, loop, hitl, rec


# ---------------------------------------------------------------------------
# Happy path: supervisor approves -> mission completes
# ---------------------------------------------------------------------------


def test_loop_approve_completes_mission():
    async def scenario():
        mgr, loop, hitl, _ = _make_loop()

        async def supervisor():
            while True:
                await asyncio.sleep(0.05)
                for d in list(hitl.pending()):
                    hitl.approve(d["id"], notes="approved")

        sup = asyncio.create_task(supervisor())
        try:
            result = await asyncio.wait_for(loop.run(), timeout=8.0)
        finally:
            sup.cancel()
        return mgr, result

    mgr, result = asyncio.run(scenario())
    assert result.status == "completed"
    assert mgr.state.status.stage == "completed"
    assert result.packets_ingested > 0
    assert result.graph_results  # at least one graph evaluation
    assert mgr.state.summary is not None
    assert all(d.status != "pending" for d in mgr.state.human_decisions)


def test_loop_approve_produces_live_briefing():
    async def scenario():
        mgr, loop, hitl, _ = _make_loop()

        async def supervisor():
            while True:
                await asyncio.sleep(0.05)
                for d in list(hitl.pending()):
                    hitl.approve(d["id"])

        sup = asyncio.create_task(supervisor())
        try:
            await asyncio.wait_for(loop.run(), timeout=8.0)
        finally:
            sup.cancel()
        return mgr

    mgr = asyncio.run(scenario())
    assert mgr.state.summary.mission_briefing["incident_id"]
    assert mgr.state.summary.confidence_scores
    assert mgr.state.summary.needs_human_review is False


# ---------------------------------------------------------------------------
# Timeout / escalate path (no supervisor)
# ---------------------------------------------------------------------------


def test_loop_timeout_escalates_and_completes():
    async def scenario():
        mgr, loop, _, _ = _make_loop(hitl_timeout=0.1, timeout_action="escalate")
        result = await asyncio.wait_for(loop.run(), timeout=8.0)
        return mgr, result

    mgr, result = asyncio.run(scenario())
    assert result.status == "completed"
    assert mgr.state.status.stage == "completed"
    assert mgr.state.human_decisions
    assert mgr.state.human_decisions[-1].status == "overridden"
    assert mgr.state.summary.needs_human_review is False


# ---------------------------------------------------------------------------
# Loop control: stop + cycle cap
# ---------------------------------------------------------------------------


def test_loop_request_stop():
    async def scenario():
        mgr, loop, _, _ = _make_loop(max_cycles=2000, hitl_enabled=False)

        async def stop():
            # Deterministic: wait for real telemetry progress instead of a wall-clock race.
            while len(mgr.state.telemetry) < 10:
                await asyncio.sleep(0.005)
            loop.request_stop()

        task = asyncio.create_task(stop())
        result = await asyncio.wait_for(loop.run(), timeout=8.0)
        task.cancel()
        return result

    result = asyncio.run(scenario())
    assert result.status == "stopped"


def test_loop_cycle_cap_is_timeout():
    async def scenario():
        mgr, loop, _, _ = _make_loop(max_cycles=3, hitl_enabled=False)
        result = await asyncio.wait_for(loop.run(), timeout=8.0)
        return mgr, result

    mgr, result = asyncio.run(scenario())
    assert result.status == "timeout"
    assert result.cycles == 3
    assert result.reason.startswith("cycle cap")


def test_loop_telemetry_streams_each_cycle():
    async def scenario():
        mgr, loop, _, _ = _make_loop(max_cycles=3)
        result = await asyncio.wait_for(loop.run(), timeout=8.0)
        return mgr, result

    mgr, result = asyncio.run(scenario())
    assert result.packets_ingested > 0
    assert len(mgr.state.telemetry) == result.packets_ingested


# ---------------------------------------------------------------------------
# Recording
# ---------------------------------------------------------------------------


def test_loop_records_replay_artifact():
    async def scenario():
        mgr, loop, _, rec = _make_loop(max_cycles=3)
        result = await asyncio.wait_for(loop.run(), timeout=8.0)
        return result, rec

    result, rec = asyncio.run(scenario())
    assert rec.log  # events were recorded
    kinds = {e["kind"] for e in rec.log}
    assert "telemetry" in kinds
    assert "agent" in kinds
    assert rec.snapshot()["mission_id"]
    assert rec.snapshot()["seed"] is not None
