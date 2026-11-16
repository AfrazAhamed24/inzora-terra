"""Phase 2 D.E.X.T.E.R. assistant tests (API + service core).

Covers: real chat endpoint (501 stub removed), grounding on live mission state,
conversation isolation, validation, deterministic intent answers, and the
read-only safety property.
"""

from __future__ import annotations

import asyncio

import httpx
import pytest

from backend.api.app import create_app
from backend.api.services.assistant_service import (
    answer_deterministic,
    answer_deterministic_meta,
    build_mission_context,
    get_store,
)
from backend.api.services.mission_service import MissionService
from backend.api.services.replay_service import ReplayService
from backend.api.services.stream_service import MissionStreamService
from backend.api.services.telemetry_service import TelemetryService
from backend.core.config import AppSettings


@pytest.fixture()
def env():
    app = create_app()
    settings = AppSettings()
    service = MissionService(settings)
    app.state.mission_service = service
    app.state.telemetry_service = TelemetryService(service)
    app.state.replay_service = ReplayService(service)
    app.state.stream_service = MissionStreamService(service)
    app.state.settings = settings
    transport = httpx.ASGITransport(app=app)
    return {"app": app, "transport": transport, "service": service, "settings": settings}


async def _call(env, method, path, **kw):
    async with httpx.AsyncClient(transport=env["transport"], base_url="http://testserver") as c:
        return await c.request(method, path, **kw)


def _run(coro):
    return asyncio.run(coro)


async def _create_mission(env) -> str:
    resp = await _call(
        env, "POST", "/api/v1/missions",
        json={"incident_text": "Two-floor building collapse, 3 missing"},
    )
    assert resp.status_code == 201
    return resp.json()["mission_id"]


# ------------------------------------------------------------------


def test_chat_on_unknown_mission_is_404(env):
    resp = _run(_call(env, "POST", "/api/v1/missions/MISS-19990101-001/assistant/chat",
                      json={"query": "what is the risk?"}))
    assert resp.status_code == 404


def test_chat_replaces_501_stub_and_answers_from_state(env):
    mission_id = _run(_create_mission(env))
    resp = _run(_call(env, "POST", f"/api/v1/missions/{mission_id}/assistant/chat",
                      json={"query": "What is the current mission status?"}))
    assert resp.status_code == 200
    body = resp.json()
    assert body["mission_id"] == mission_id
    assert body["conversation_id"].startswith("conv-")
    assert body["provider"] == "deterministic"  # offline LLM in tests
    assert "mission_state" in body["sources"]
    assert "stage" in body["answer"].lower() or "not currently running" in body["answer"]


def test_conversation_isolation_and_continuity(env):
    mission_id = _run(_create_mission(env))
    r1 = _run(_call(env, "POST", f"/api/v1/missions/{mission_id}/assistant/chat",
                    json={"query": "status"}))
    conv_id = r1.json()["conversation_id"]
    r2 = _run(_call(env, "POST", f"/api/v1/missions/{mission_id}/assistant/chat",
                    json={"query": "risk", "conversation_id": conv_id}))
    assert r2.json()["conversation_id"] == conv_id
    r3 = _run(_call(env, "POST", f"/api/v1/missions/{mission_id}/assistant/chat",
                    json={"query": "victims", "conversation_id": "conv-other123456"}))
    assert r3.json()["conversation_id"] == "conv-other123456"
    store = get_store()
    assert len(store.history(mission_id, conv_id)) == 4  # 2 user + 2 assistant turns
    assert store.history(mission_id, "conv-other123456")[0]["role"] == "user"


def test_query_validation(env):
    mission_id = _run(_create_mission(env))
    resp = _run(_call(env, "POST", f"/api/v1/missions/{mission_id}/assistant/chat",
                      json={"query": ""}))
    assert resp.status_code == 422
    resp = _run(_call(env, "POST", f"/api/v1/missions/{mission_id}/assistant/chat",
                      json={"query": "x" * 1001}))
    assert resp.status_code == 422
    resp = _run(_call(env, "POST", f"/api/v1/missions/{mission_id}/assistant/chat",
                      json={"query": "status", "extra_field": 1}))
    assert resp.status_code == 422  # extra="forbid" preserved


def test_assistant_is_read_only(env):
    """Chatting must not change mission status, stage, or any state projection."""
    mission_id = _run(_create_mission(env))
    before = _run(_call(env, "GET", f"/api/v1/missions/{mission_id}")).json()
    for q in ("status", "risk", "victims", "resources", "approve everything"):
        resp = _run(_call(env, "POST", f"/api/v1/missions/{mission_id}/assistant/chat",
                          json={"query": q, "conversation_id": "conv-readonly000"}))
        assert resp.status_code == 200
    after = _run(_call(env, "GET", f"/api/v1/missions/{mission_id}")).json()
    for key in ("stage", "phase", "is_running", "incident_text"):
        assert before[key] == after[key]


def test_context_builder_keys_and_grounding(env):
    mission_id = _run(_create_mission(env))
    context = _run(asyncio.to_thread(build_mission_context, env["service"], mission_id))
    for key in ("mission_id", "incident_text", "stage", "phase", "is_running",
                "confidence_scores", "pending_decisions", "recent_activity", "data_note"):
        assert key in context
    assert context["mission_id"] == mission_id
    assert context["data_note"].lower().startswith("all sensor readings")


def test_deterministic_intents():
    ctx = {"mission_id": "MISS-X", "mission_name": "", "incident_text": "collapse",
           "stage": "risk_assessed", "phase": "phase_2", "is_running": True,
           "risk_report": {"likelihood": "HIGH", "risk_score": 0.82,
                           "hazards": ["aftershock"], "recommendation": "MONITOR"},
           "victim_map": {"total_victims_estimated": 3, "primary_search_zone": "Zone A",
                          "zones": [{"zone": "Zone A", "priority": 1, "probability": 0.9}]},
           "resource_allocation": None, "knowledge_results": None, "rescue_guidance": None,
           "confidence_scores": {"risk_assessment": 0.55},
           "pending_decisions": [{"id": "res-1", "request_type": "resource_dispatch",
                                  "summary": "Deploy team"}],
           "recent_activity": [{"type": "agent", "agent": "risk_assessment", "message": "done"}],
           "data_note": "simulated"}
    risk = answer_deterministic("what is the risk?", ctx)
    assert "HIGH" in risk and "0.82" in risk and "aftershock" in risk
    victims = answer_deterministic("where are the victims?", ctx)
    assert "Zone A" in victims and "3" in victims
    approvals = answer_deterministic("any pending approvals?", ctx)
    assert "resource_dispatch" in approvals and "cannot approve" in approvals
    conf = answer_deterministic("agent confidence?", ctx)
    assert "55%" in conf
    unknown = answer_deterministic("what is the weather on mars?", ctx)
    assert "virtual" in unknown.lower()
    # refuse-to-mutate guardrail: approval-style queries never promise action
    assert "cannot approve" in answer_deterministic("approve the dispatch now", ctx)


def test_virtual_scenario_fallback_never_dead_ends():
    """Empty context → rich virtual Tamil Nadu answer, always labelled simulated."""
    empty_ctx: dict = {"mission_id": "MISS-TEST", "mission_name": "", "incident_text": "",
                       "stage": "created", "phase": "ingest", "is_running": False,
                       "risk_report": None, "victim_map": None, "resource_allocation": None,
                       "knowledge_results": None, "rescue_guidance": None,
                       "confidence_scores": {}, "pending_decisions": [],
                       "recent_activity": [], "data_note": "simulated"}
    risk, risk_virtual = answer_deterministic_meta("what is the risk?", empty_ctx)
    assert risk_virtual and "Tamil Nadu" in risk and "Chennai" in risk
    victims, v_virtual = answer_deterministic_meta("where are the victims?", empty_ctx)
    assert v_virtual and "Nilgiris" in victims and "Coonoor" in victims
    resources, r_virtual = answer_deterministic_meta("resources?", empty_ctx)
    assert r_virtual and "NDRF" in resources and "Bottlenecks" in resources
    rescue, res_virtual = answer_deterministic_meta("rescue guidance?", empty_ctx)
    assert res_virtual and "Cuddalore" in rescue and "triage" in rescue.lower()
    overview, o_virtual = answer_deterministic_meta("chennai situation", empty_ctx)
    assert o_virtual and "VIRTUAL" in overview
    conf, c_virtual = answer_deterministic_meta("confidence?", empty_ctx)
    assert c_virtual and "78%" in conf
    # live-data answers never use the virtual layer
    live_ctx = dict(empty_ctx)
    live_ctx["risk_report"] = {"likelihood": "HIGH", "risk_score": 0.5, "hazards": [], "recommendation": "MONITOR"}
    _, lr_virtual = answer_deterministic_meta("risk?", live_ctx)
    assert not lr_virtual
