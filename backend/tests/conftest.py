"""Shared fixtures for the mission state engine tests."""

from typing import Generator

import pytest

from backend.core.mission_state import MissionState
from backend.core.state_manager import MissionStateManager


@pytest.fixture(autouse=True)
def _offline_llm(monkeypatch):
    """Keep the suite deterministic and offline even when a local .env has a key."""
    monkeypatch.setenv("GROQ_API_KEY", "")
    monkeypatch.setenv("OPENAI_API_KEY", "")
    monkeypatch.setenv("TERRA_LLM_ROUTER", "0")
    monkeypatch.setenv("LLM_CONFIDENCE_THRESHOLD", "1.1")

    import backend.core.llm_client as llm_client

    monkeypatch.setattr(llm_client, "_available", False, raising=False)
    monkeypatch.setattr(llm_client, "_client", None, raising=False)
    yield


@pytest.fixture
def state() -> MissionState:
    """A bare, freshly constructed MissionState (stage = created)."""
    return MissionState()


@pytest.fixture
def manager() -> Generator[MissionStateManager, None, None]:
    """A MissionStateManager with an already-created, initialized mission."""
    mgr = MissionStateManager()
    mgr.create(
        "Two-floor building collapsed after heavy rainfall. 3 missing persons.",
        environment_id="scenario_collapse_rain",
    )
    yield mgr


def make_packet(mission_id: str, **overrides) -> dict:
    base = {
        "packet_id": "TELE-1",
        "mission_id": mission_id,
        "zone": "north_wall",
        "sensor_type": "tilt",
        "metric": "tilt_deg",
        "value": 4.0,
        "unit": "deg",
        "confidence": 0.9,
        "source": "simulated",
    }
    base.update(overrides)
    return base
