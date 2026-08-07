"""Scenario presets (SIMULATION_SPEC.md §4.3).

Each scenario is a fully deterministic recipe: the set of sensor channels per zone with their
baselines/dynamics, plus the rain ramp and scheduled events that drive the story. The engine
instantiates a scenario with a seeded RNG so any run of a given scenario reproduces the same
packet stream.

Default (``scenario_collapse_rain``): partial structural collapse during heavy rain. The north wall
tilts aggressively, basement temperature rises (victims), gas spikes after an aftershock, and the
north wall stress builds — together this pushes the risk agent past the CRITICAL threshold.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Tuple

from backend.simulation.sensors import (
    GasModel,
    GpsModel,
    GprModel,
    HumidityModel,
    ImuModel,
    NetworkModel,
    SensorModel,
    StressModel,
    TemperatureModel,
    ThermalModel,
    TiltModel,
    TrendModel,
)

__all__ = ["Scenario", "DEFAULT_SCENARIO", "SCENARIOS", "get_scenario"]


@dataclass
class Scenario:
    """A named scenario recipe: sensors, weather ramp, scheduled events."""

    name: str
    description: str
    sensors: Dict[Tuple[str, str], SensorModel]
    weather: Dict[str, Any]
    events: List[Dict[str, Any]]


def _standard_set() -> List[SensorModel]:
    """The sensor channels every scenario shares, keyed by (type, zone)."""
    return [
        TiltModel("north_wall"),
        TrendModel("north_wall"),
        TemperatureModel("site"),
        HumidityModel("site"),
        GasModel("basement"),
        GpsModel("site"),
        ImuModel("north_wall"),
        GprModel("basement"),
        ThermalModel("basement", heat=False),
        StressModel("north_wall"),
        NetworkModel("site"),
    ]


def _collapse_rain_sensors() -> List[SensorModel]:
    """North-wall tilt ramps up; basement heats (victims); gas spikes later."""
    sensors = _standard_set()
    # Override dynamics for the collapse story.
    for sensor in sensors:
        if isinstance(sensor, TiltModel) and sensor.zone == "north_wall":
            sensor.set_envelope("increasing", ramp_rate=0.12)
        elif isinstance(sensor, ThermalModel) and sensor.zone == "basement":
            sensor.set_heat(True)
        elif isinstance(sensor, StressModel) and sensor.zone == "north_wall":
            sensor.set_envelope("increasing", ramp_rate=3.5)
    return sensors


DEFAULT_SCENARIO = "scenario_collapse_rain"

SCENARIOS: Dict[str, Scenario] = {
    DEFAULT_SCENARIO: Scenario(
        name=DEFAULT_SCENARIO,
        description="Partial structural collapse during heavy rain; victims in basement.",
        sensors={(s.sensor_type, s.zone): s for s in _collapse_rain_sensors()},
        weather={"rain_ramp": 0.02},
        events=[
            {
                "tick": 10,
                "kind": "envelope",
                "sensor_type": "tilt",
                "zone": "north_wall",
                "envelope": "increasing",
                "ramp_rate": 0.12,
            },
            {
                "tick": 25,
                "kind": "impulse",
                "sensor_type": "tilt",
                "zone": "north_wall",
                "amount": 0.8,
            },
            {
                "tick": 25,
                "kind": "impulse",
                "sensor_type": "gas",
                "zone": "basement",
                "amount": 900.0,
            },
            {
                "tick": 30,
                "kind": "trend",
                "sensor_type": "trend",
                "zone": "north_wall",
                "amount": 1.0,
            },
        ],
    ),
    "scenario_stable_monitoring": Scenario(
        name="scenario_stable_monitoring",
        description="Routine monitoring; benign conditions, no anomalies expected.",
        sensors={(s.sensor_type, s.zone): s for s in _standard_set()},
        weather={"rain_ramp": 0.0},
        events=[],
    ),
    "scenario_gas_leak": Scenario(
        name="scenario_gas_leak",
        description="Gradual gas accumulation in basement with stable structure.",
        sensors={
            (s.sensor_type, s.zone): s
            for s in _standard_set()
            if not isinstance(s, (ThermalModel, StressModel, TiltModel))
            or s.zone != "north_wall"
        },
        weather={"rain_ramp": 0.0},
        events=[
            {
                "tick": 5,
                "kind": "envelope",
                "sensor_type": "gas",
                "zone": "basement",
                "envelope": "increasing",
                "ramp_rate": 6.0,
            }
        ],
    ),
}


def get_scenario(name: str) -> Scenario:
    if name not in SCENARIOS:
        raise KeyError(
            f"unknown scenario {name!r}; available: {sorted(SCENARIOS)}"
        )
    return SCENARIOS[name]
