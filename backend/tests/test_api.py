"""Phase 2A API tests.

Each test runs its HTTP calls inside a single ``asyncio.run`` with one shared ``httpx.AsyncClient``
so the background MissionLoop task (launched on ``/start``) survives for the lifetime of the test.
A fast HITL timeout keeps the loop completing quickly. Backward compatibility with
`python -m backend.run` is asserted at module level.
"""
from __future__ import annotations

import asyncio
import time

import httpx
import pytest

from backend.api.app import create_app
from backend.api.services.mission_service import MissionService
from backend.api.services.replay_service import ReplayService
from backend.api.services.stream_service import MissionStreamService
from backend.api.services.telemetry_service import TelemetryService
from backend.core.config import AppSettings


def _fast_settings() -> AppSettings:
    s = AppSettings()
    s.hitl.timeout = 0.5
    s.hitl.timeout_action = "escalate"
    s.simulation.tick_seconds = 0.05
    s.simulation.seed = 20240101
    return s


@pytest.fixture()
def env():
    app = create_app()
    settings = _fast_settings()
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


async def _create(env):
    resp = await _call(
        env, "POST", "/api/v1/missions",
        json={"incident_text": "Two-floor building collapse, 3 missing"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["mission_id"]


async def _wait_completed(env, mission_id, attempts=80, interval=0.1):
    service = env["service"]
    session = service.get(mission_id)
    for _ in range(attempts):
        if not session.is_running:
            return
        await asyncio.sleep(interval)


# --- Health / version ---
def test_health_and_version(env):
    async def main():
        h = await _call(env, "GET", "/api/v1/health")
        assert h.status_code == 200
        assert h.json()["status"] == "ok"
        v = await _call(env, "GET", "/api/v1/version")
        assert v.status_code == 200
        assert v.json()["version"]
    _run(main())


# --- Mission CRUD + lifecycle ---
def test_create_and_get_mission(env):
    async def main():
        mid = await _create(env)
        g = await _call(env, "GET", f"/api/v1/missions/{mid}")
        assert g.status_code == 200
        body = g.json()
        assert body["mission_id"] == mid
        assert body["stage"] == "initialized"
        assert body["is_running"] is False
    _run(main())


def test_list_missions(env):
    async def main():
        await _create(env)
        await _create(env)
        lst = await _call(env, "GET", "/api/v1/missions")
        assert lst.status_code == 200
        assert lst.json()["count"] == 2
    _run(main())


def test_create_rejects_empty_incident(env):
    async def main():
        resp = await _call(env, "POST", "/api/v1/missions", json={"incident_text": "   "})
        assert resp.status_code == 422
    _run(main())


def test_start_stop_and_complete(env):
    async def main():
        mid = await _create(env)
        s = await _call(env, "POST", f"/api/v1/missions/{mid}/start")
        assert s.status_code == 200
        assert s.json()["is_running"] is True
        await _wait_completed(env, mid)
        done = await _call(env, "GET", f"/api/v1/missions/{mid}")
        assert done.json()["is_running"] is False
        assert done.json()["stage"] in ("completed", "errored", "stopped", "aborted")
    _run(main())


def test_start_unknown_mission_is_validation(env):
    async def main():
        resp = await _call(env, "POST", "/api/v1/missions/MISS-1999-99-000/start")
        assert resp.status_code == 422
        assert resp.json()["code"] == "mission_validation_error"
    _run(main())


def test_start_twice_conflict(env):
    async def main():
        mid = await _create(env)
        await _call(env, "POST", f"/api/v1/missions/{mid}/start")
        second = await _call(env, "POST", f"/api/v1/missions/{mid}/start")
        assert second.status_code == 409
        assert second.json()["code"] == "mission_already_started"
    _run(main())


def test_stop_not_running(env):
    async def main():
        mid = await _create(env)
        resp = await _call(env, "POST", f"/api/v1/missions/{mid}/stop")
        assert resp.status_code == 409
        assert resp.json()["code"] == "mission_not_running"
    _run(main())


# --- Summary / timeline / telemetry / replay ---
def test_summary_telemetry_timeline_replay(env):
    async def main():
        mid = await _create(env)
        await _call(env, "POST", f"/api/v1/missions/{mid}/start")
        await _wait_completed(env, mid)

        s = await _call(env, "GET", f"/api/v1/missions/{mid}/summary")
        assert s.status_code == 200
        assert s.json()["mission_id"] == mid

        t = await _call(env, "GET", f"/api/v1/missions/{mid}/telemetry")
        assert t.status_code == 200
        tb = t.json()
        assert tb["mission_id"] == mid
        assert isinstance(tb["telemetry"], list)

        tl = await _call(env, "GET", f"/api/v1/missions/{mid}/timeline")
        assert tl.status_code == 200
        assert isinstance(tl.json(), list)

        rep = await _call(env, "GET", f"/api/v1/missions/{mid}/replay")
        assert rep.status_code == 200
        rb = rep.json()
        assert rb["format"] == "terra-mission-replay/v1"
        assert isinstance(rb["events"], list)
    _run(main())


def test_invalid_mission_id_returns_422(env):
    async def main():
        resp = await _call(env, "GET", "/api/v1/missions/not-a-real-id")
        assert resp.status_code == 422
    _run(main())


# --- SSE stream ---
def test_stream_emits_events(env):
    async def main():
        mid = await _create(env)
        await _call(env, "POST", f"/api/v1/missions/{mid}/start")
        frames = []
        async with httpx.AsyncClient(transport=env["transport"], base_url="http://testserver") as c:
            async with c.stream("GET", f"/api/v1/missions/{mid}/stream", timeout=3.0) as r:
                assert r.status_code == 200
                assert r.headers["content-type"].startswith("text/event-stream")
                async for line in r.aiter_lines():
                    if line.startswith("data:"):
                        frames.append(line.removeprefix("data:"))
                    if len(frames) > 20:
                        break
        await _call(env, "POST", f"/api/v1/missions/{mid}/stop")
        assert any("telemetry" in f for f in frames)
    _run(main())


def test_404_structured_error(env):
    async def main():
        mid = await _create(env)
        err = await _call(env, "GET", "/api/v1/missions/MISS-2099-1231-001")
        assert err.status_code == 404
        assert err.json()["code"] == "mission_not_found"
    _run(main())


def test_assistant_placeholder_501(env):
    async def main():
        mid = await _create(env)
        resp = await _call(env, "POST", f"/api/v1/missions/{mid}/assistant/chat",
                           json={"query": "what do i do"})
        assert resp.status_code == 501
        assert resp.json()["code"] == "assistant_unavailable"
    _run(main())


# --- Backward compatibility with the legacy CLI ---
def test_legacy_run_unchanged():
    from backend.core.gop import TERRAState
    from backend.core.tools import get_building_info, get_sensor_data, get_weather
    from backend.orchestration.orchestrator import Orchestrator

    state = TERRAState()
    state.incident_text = "Two-floor building collapse, 3 missing"
    state.stage = "initialized"
    state.add_evidence("sensor:north_wall", get_sensor_data("north_wall"), 0.9)
    state.add_evidence("building:bld_001", get_building_info("bld_001"), 0.95)
    state.add_evidence("weather:current", get_weather("current"), 0.85)

    orch = Orchestrator()
    orch.state = state
    orch.setup_default_agents()
    briefing = asyncio.run(orch.run(state.incident_text))
    assert briefing["mission_briefing"]["incident_id"]


# --- Agent report summarizer (D.E.X.T.E.R narration source) ---
def test_agent_report_summarizes_outputs():
    from backend.api.services.stream_service import _agent_report

    risk = _agent_report("risk_assessment", {
        "produced_artifacts": {
            "risk_report": {
                "likelihood": "HIGH",
                "risk_score": 0.91,
                "recommendation": "Evacuate immediately.",
            }
        }
    })
    assert "HIGH" in risk and "0.91" in risk and "Evacuate" in risk

    victim = _agent_report("victim_localization", {
        "produced_artifacts": {
            "victim_map": {
                "zones": [{"zone": "B2", "probability": 0.82}],
                "primary_search_zone": "B2",
                "total_victims_estimated": 3,
            }
        }
    })
    assert "B2" in victim and "82%" in victim and "3" in victim

    resource = _agent_report("resource_coordination", {
        "produced_artifacts": {
            "resource_allocation": {
                "assignments": [{"zone": "B2"}, {"zone": "B1"}],
                "utilization": 0.67,
            }
        }
    })
    assert "2 assignments" in resource and "B1" in resource

    knowledge = _agent_report("knowledge_retrieval", {
        "produced_artifacts": {
            "knowledge_results": {
                "sops": [{"title": "Earthquake Response"}],
                "building_codes": [{"code": "IBC-2021-1604"}],
            }
        }
    })
    assert "1 SOPs" in knowledge and "1 building codes" in knowledge

    rescue = _agent_report("rescue_coordination", {
        "produced_artifacts": {
            "rescue_guidance": {
                "summary": "3 rescue zones prioritized",
                "entry_clearance": "CONDITIONAL",
                "priority_sequence": ["B2", "B1", "A1"],
            }
        }
    })
    assert "3 rescue zones" in rescue and "conditional" in rescue and "B2, B1, A1" in rescue

    briefing = _agent_report("briefing_generator", {
        "mission_briefing": {
            "overall_risk": "HIGH",
            "priority_zones": ["B2", "B1"],
            "total_victims_estimated": 3,
        }
    })
    assert "HIGH" in briefing and "B2, B1" in briefing

    # Unknown / fallback shapes degrade gracefully.
    assert _agent_report("victim_localization", {"source": "fallback", "zones": []}) == ""
    assert _agent_report("unknown_agent", {}) == ""
