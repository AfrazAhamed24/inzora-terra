"""Simulation engine (SIMULATION_SPEC.md §2, §4).

``ScenarioEngine`` composes the deterministic mission clock, the scenario sensor set, the weather
model, and the event scheduler. It advances on real time (``tick_seconds``) accelerated by
``time_multiplier``, and each tick produces the packet batch for ingestion.

Determinism guarantee: for a fixed seed + scenario, ``step(batch)`` yields an identical packet
stream (packet ids, timestamps, values) every run.
"""

from __future__ import annotations

import copy
import datetime as _dt
import random as _random
from typing import Any, Dict, Iterator, List

from backend.simulation.events import EventScheduler
from backend.simulation.scenarios import get_scenario
from backend.simulation.weather import WeatherModel

__all__ = ["MissionClock", "PacketEmitter", "ScenarioEngine"]

_PACKET_PREFIX = "TELE-"


class MissionClock:
    """Accelerated, monotonic mission clock."""

    def __init__(self, *, tick_seconds: float = 1.0, time_multiplier: float = 1.0):
        if tick_seconds <= 0 or time_multiplier <= 0:
            raise ValueError("clock params must be > 0")
        self.tick_seconds = float(tick_seconds)
        self.time_multiplier = float(time_multiplier)
        self.tick = 0

    def advance(self) -> _dt.datetime:
        self.tick += 1
        return self.now()

    def now(self) -> _dt.datetime:
        base = _dt.datetime(2026, 1, 1, tzinfo=_dt.timezone.utc)
        return base + _dt.timedelta(
            seconds=self.tick * self.tick_seconds * self.time_multiplier
        )

    def now_iso(self) -> str:
        return self.now().isoformat()

    def reset(self) -> None:
        self.tick = 0


class PacketEmitter:
    """Deterministic packet-id generator (pattern ``TELE-<n>``, SIMULATION_SPEC §4.1)."""

    def __init__(self, mission_id: str, seed: int = 0):
        self.mission_id = mission_id
        self._seed = seed
        self._count = 0

    def next(self) -> str:
        self._count += 1
        return f"{_PACKET_PREFIX}{self._seed}-{self._count:06d}"


class ScenarioEngine:
    """Owns the live state of one simulated mission and produces packet batches."""

    def __init__(
        self,
        *,
        mission_id: str,
        scenario: str = "scenario_collapse_rain",
        seed: int = 0,
        tick_seconds: float = 1.0,
        time_multiplier: float = 1.0,
    ):
        self.mission_id = mission_id
        self.seed = seed
        self.rng = _random.Random(seed)
        spec = get_scenario(scenario)
        self.spec = spec
        self.sensors: Dict[Any, Any] = {
            (sensor.sensor_type, sensor.zone): copy.deepcopy(sensor)
            for sensor in spec.sensors.values()
        }
        self.weather = WeatherModel(seed=seed, rng=self.rng)
        if spec.weather.get("rain_ramp"):
            self.weather.rain_ramp = float(spec.weather["rain_ramp"])
        self.scheduler = EventScheduler(seed=seed)
        for event in spec.events:
            payload = dict(event)
            tick = payload.pop("tick")
            kind = payload.pop("kind")
            self.scheduler.schedule(tick, kind, **payload)
        self.clock = MissionClock(
            tick_seconds=tick_seconds, time_multiplier=time_multiplier
        )
        self.emitter = PacketEmitter(mission_id, seed=seed)

    def step(self) -> List[Dict[str, Any]]:
        """Advance one tick and return the packet batch for this tick."""
        ts = self.clock.advance().isoformat()
        fired = self.scheduler.advance(1)
        for event in fired:
            self.scheduler.apply(event, self.sensors)

        packets: List[Dict[str, Any]] = []

        # Sensor channels (one packet per sensor).
        for sensor in self.sensors.values():
            sensor.tick(self.rng)
            packets.append(
                sensor.emit(
                    mission_id=self.mission_id,
                    ts=ts,
                    packet_id=self.emitter.next(),
                )
            )

        # Weather channel.
        self.weather.tick()
        packets.append(
            self.weather.emit(
                mission_id=self.mission_id,
                ts=ts,
                packet_id=self.emitter.next(),
            )
        )
        return packets

    def run(
        self, cycles: int, *, packets_per_step: int = 1
    ) -> Iterator[List[Dict[str, Any]]]:
        for _ in range(cycles):
            yield self.step()

    def current_environment(self) -> Dict[str, Any]:
        """The derived environment snapshot (MISSION_STATE §4.4)."""
        env: Dict[str, Any] = {}
        for (sensor_type, zone), sensor in self.sensors.items():
            env.setdefault(zone, {})[sensor_type] = sensor.to_environment()
        env.setdefault("site", {}).update(self.weather.to_environment())
        return env
