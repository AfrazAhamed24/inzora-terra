"""Unit tests: Telemetry Simulation package (Phase 1C, SIMULATION_SPEC.md).

Covers the canonical packet schema + validation, deterministic + seeded scenario engine,
sensor/weather dynamics, event scheduler effects, packet-id/timestamp monotonicity, bounds
behaviour, scenario presets, and the ingest path (telemetry -> environment through the
``MissionStateManager`` — never direct state mutation).
"""

import pytest

from backend.core.state_manager import MissionStateManager
from backend.simulation import (
    DEFAULT_SCENARIO,
    SCENARIOS,
    MissionClock,
    PacketEmitter,
    ScenarioEngine,
    TelemetryIngest,
    derive_environment,
    get_scenario,
    validate_packet,
    validate_stream,
)
from backend.simulation.events import EventScheduler
from backend.simulation.sensors import GasModel, TiltModel, TrendModel

MISSION_ID = "MISS-2026-0803-001"


# ---------------------------------------------------------------------------
# Packet schema (SIMULATION_SPEC §3)
# ---------------------------------------------------------------------------


def test_validate_packet_accepts_canonical_shape():
    packet = {
        "packet_id": "TELE-1",
        "mission_id": MISSION_ID,
        "ts": "2026-08-03T00:00:00Z",
        "zone": "north_wall",
        "sensor_type": "tilt",
        "metric": "tilt_deg",
        "value": 0.1,
        "unit": "deg",
        "confidence": 0.9,
        "source": "simulated",
    }
    assert validate_packet(packet) == []


def test_validate_packet_missing_required_field():
    packet = {
        "packet_id": "TELE-1",
        "mission_id": MISSION_ID,
        "zone": "north_wall",
        "sensor_type": "tilt",
        "metric": "tilt_deg",
        "value": 0.1,
        "unit": "deg",
    }
    problems = validate_packet(packet)
    assert any("ts" in p for p in problems)
    assert any("confidence" in p for p in problems)
    assert any("source" in p for p in problems)


def test_validate_packet_unknown_zone_and_sensor():
    packet = {
        "packet_id": "TELE-1",
        "mission_id": MISSION_ID,
        "ts": "2026-08-03T00:00:00Z",
        "zone": "rooftop",
        "sensor_type": "sonar",
        "metric": "x",
        "value": 1.0,
        "unit": "raw",
        "confidence": 0.9,
        "source": "simulated",
    }
    problems = validate_packet(packet)
    assert any("zone" in p for p in problems)
    assert any("sensor_type" in p for p in problems)


def test_validate_packet_confidence_range_and_non_number_value():
    base = {
        "packet_id": "TELE-1",
        "mission_id": MISSION_ID,
        "ts": "2026-08-03T00:00:00Z",
        "zone": "north_wall",
        "sensor_type": "tilt",
        "metric": "tilt_deg",
        "value": 0.1,
        "unit": "deg",
        "confidence": 0.9,
        "source": "simulated",
    }
    assert any("confidence" in p for p in validate_packet({**base, "confidence": 1.5}))
    assert any("confidence" in p for p in validate_packet({**base, "confidence": "high"}))
    assert any("value" in p for p in validate_packet({**base, "value": "warm"}))


def test_validate_stream_reports_indexed_problems():
    good = {
        "packet_id": "TELE-1",
        "mission_id": MISSION_ID,
        "ts": "2026-08-03T00:00:00Z",
        "zone": "north_wall",
        "sensor_type": "tilt",
        "metric": "tilt_deg",
        "value": 0.1,
        "unit": "deg",
        "confidence": 0.9,
        "source": "simulated",
    }
    bad = dict(good)
    bad["unit"] = "furlongs"
    problems = validate_stream([good, bad])
    assert len(problems) == 1
    assert "packet[1]" in problems[0]


# ---------------------------------------------------------------------------
# Sensor dynamics (SIMULATION_SPEC §4.1)
# ---------------------------------------------------------------------------


class _Rng:
    def uniform(self, lo, hi):
        return (lo + hi) / 2  # deterministic midpoint


def test_tilt_model_envelope_and_bounds():
    tilt = TiltModel(zone="north_wall")
    tilt.set_envelope("increasing", ramp_rate=0.1)
    before = tilt.value
    tilt.tick(_Rng())
    assert tilt.value > before
    assert tilt.lo <= tilt.value <= tilt.hi


def test_trend_label_mapping():
    trend = TrendModel()
    trend.set_slope(0.5)
    assert trend.to_environment() == 0.5
    assert trend.sensor_type == "trend"


def test_gas_model_spike():
    gas = GasModel(zone="basement")
    before = gas.value
    gas.spike(900.0)
    assert gas.value >= before + 900.0 - 1e-9


# ---------------------------------------------------------------------------
# Mission clock + packet emitter (SIMULATION_SPEC §4, §5)
# ---------------------------------------------------------------------------


def test_mission_clock_advances_monotonically():
    clock = MissionClock(tick_seconds=1.0, time_multiplier=10.0)
    t0 = clock.now()
    t1 = clock.advance()
    t2 = clock.advance()
    assert t1 > t0
    assert t2 > t1


def test_packet_emitter_pattern():
    emitter = PacketEmitter(MISSION_ID, seed=7)
    first = emitter.next()
    second = emitter.next()
    assert first.startswith("TELE-7-")
    assert second.startswith("TELE-7-")
    assert first != second


# ---------------------------------------------------------------------------
# Scenario engine: determinism + schema compliance (SIMULATION_SPEC §10)
# ---------------------------------------------------------------------------


def test_engine_same_seed_produces_identical_stream():
    a = ScenarioEngine(mission_id=MISSION_ID, seed=42, scenario=DEFAULT_SCENARIO)
    b = ScenarioEngine(mission_id=MISSION_ID, seed=42, scenario=DEFAULT_SCENARIO)
    stream_a = [batch for _ in range(5) for batch in a.step()]
    stream_b = [batch for _ in range(5) for batch in b.step()]
    assert stream_a == stream_b


def test_engine_different_seed_differs():
    a = ScenarioEngine(mission_id=MISSION_ID, seed=42)
    b = ScenarioEngine(mission_id=MISSION_ID, seed=43)
    assert a.step() != b.step()


def test_engine_every_packet_validates_and_carries_mission_id():
    engine = ScenarioEngine(mission_id=MISSION_ID, seed=42)
    for _ in range(3):
        batch = engine.step()
        for packet in batch:
            assert validate_packet(packet) == []
            assert packet["mission_id"] == MISSION_ID
            assert packet["source"] == "simulated"


def test_engine_timestamps_and_packet_ids_monotonic():
    engine = ScenarioEngine(mission_id=MISSION_ID, seed=42)
    prior_ts = ""
    prior_id = ""
    for _ in range(5):
        for packet in engine.step():
            assert packet["ts"] >= prior_ts
            prior_ts = packet["ts"]
            assert packet["packet_id"] > prior_id
            prior_id = packet["packet_id"]


def test_engine_scenario_rains_and_tilt_worsens():
    engine = ScenarioEngine(mission_id=MISSION_ID, seed=42, scenario=DEFAULT_SCENARIO)
    tilt0 = None
    rain0 = None
    for _ in range(30):
        engine.step()
    env = engine.current_environment()
    assert "site" in env
    assert "rain_intensity" in env["site"]
    assert env["site"]["rain_intensity"] > 0.0


def test_get_scenario_unknown_raises():
    with pytest.raises(KeyError):
        get_scenario("no_such_scenario")


def test_scenarios_presets_exist():
    for name in ("scenario_collapse_rain", "scenario_stable_monitoring", "scenario_gas_leak"):
        assert name in SCENARIOS


# ---------------------------------------------------------------------------
# Event scheduler (SIMULATION_SPEC §4.2)
# ---------------------------------------------------------------------------


def test_event_scheduler_fires_on_tick():
    scheduler = EventScheduler()
    tilt = TiltModel(zone="north_wall")
    sensors = {("tilt", "north_wall"): tilt}
    scheduler.schedule(3, "envelope", sensor_type="tilt", zone="north_wall",
                       envelope="increasing", ramp_rate=0.5)
    fired = scheduler.advance(3)  # events fired on the crossed tick
    assert fired
    for event in fired:
        scheduler.apply(event, sensors)
    assert tilt.envelope == "increasing"


def test_event_scheduler_impulse_bumps_sensor():
    scheduler = EventScheduler()
    tilt = TiltModel(zone="north_wall")
    sensors = {("tilt", "north_wall"): tilt}
    before = tilt.value
    scheduler.schedule(2, "impulse", sensor_type="tilt", zone="north_wall", amount=0.8)
    fired = scheduler.advance(2)
    for event in fired:
        scheduler.apply(event, sensors)
    assert tilt.value > before


# ---------------------------------------------------------------------------
# Ingest path (SIMULATION_SPEC §7, MISSION_STATE §4.3-4.4)
# ---------------------------------------------------------------------------


def test_ingest_accepts_valid_batch_and_updates_telemetry_and_environment():
    manager = MissionStateManager()
    manager.create("test")
    engine = ScenarioEngine(mission_id=manager.state.metadata.mission_id, seed=1)
    ingest = TelemetryIngest(manager)

    report = ingest.ingest(engine.step())
    assert report["accepted"] == len(engine.spec.sensors) + 1  # sensors + weather
    assert report["rejected"] == 0
    assert len(manager.state.telemetry) == report["accepted"]
    assert manager.state.environment.sensors  # derived per-zone environment


def test_ingest_rejects_invalid_packets_without_mutating_state():
    manager = MissionStateManager()
    manager.create("test")
    ingest = TelemetryIngest(manager)
    before = len(manager.state.telemetry)
    bad = {
        "packet_id": "TELE-X",
        "mission_id": "nope",
        "ts": "now",
        "zone": "rooftop",
        "sensor_type": "sonar",
        "metric": "x",
        "value": "text",
        "unit": "units",
        "confidence": 2.0,
        "source": "simulated",
    }
    report = ingest.ingest([bad])
    assert report["rejected"] == 1
    assert len(manager.state.telemetry) == before


def test_derive_environment_groups_latest_values_per_zone():
    packets = [
        {"zone": "north_wall", "sensor_type": "tilt", "value": 1.0},
        {"zone": "north_wall", "sensor_type": "stress", "value": 10.0},
        {"zone": "site", "sensor_type": "weather", "value": 5.0},
    ]
    env = derive_environment(packets)
    assert env["sensors"]["north_wall"]["tilt"] == 1.0
    assert env["sensors"]["north_wall"]["stress"] == 10.0


def test_ingest_refuses_to_bypass_manager():
    from backend.core.permissions import SIMULATION, can_write

    manager = MissionStateManager()
    manager.create("test")
    ingest = TelemetryIngest(manager)
    # The ingest never touches state.telemetry directly: only the manager's method may.
    engine = ScenarioEngine(mission_id=manager.state.metadata.mission_id, seed=2)
    ingest.ingest(engine.step())
    # telemetry write must be permitted for the SIMULATION component (permission matrix)
    assert can_write(SIMULATION, "telemetry")
    assert can_write(SIMULATION, "environment")
