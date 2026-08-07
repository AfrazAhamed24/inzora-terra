"""Environment event scheduling (SIMULATION_SPEC.md §4.4).

The EventScheduler owns the *story* of a scenario: it can inject envelope switches, impulses
(aftershock tilt/gas spikes), and derived-trend updates on specific ticks, and exposes the current
mission-tick counter. It is shared by the ScenarioEngine so all zones advance on the same clock.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List

from backend.simulation.sensors import TiltModel, TrendModel

__all__ = ["EventScheduler"]


@dataclass
class ScheduledEvent:
    """A single deferred effect applied when the mission clock reaches ``tick``."""

    tick: int
    kind: str  # envelope | impulse | trend
    payload: Dict[str, Any]
    fired: bool = field(default=False)

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"ScheduledEvent(tick={self.tick}, kind={self.kind})"


class EventScheduler:
    """Deterministic, tick-indexed scheduler for scenario effects.

    Call ``schedule()`` to queue an effect, then ``advance(ticks)`` each mission tick to fire any
    due events. Effects reference a sensor by ``sensor_type`` + ``zone``; the engine resolves them
    to the live models. ``trend`` effects write the derived tilt slope.
    """

    def __init__(self, *, seed: int = 0) -> None:
        self._seed = seed
        self._events: List[ScheduledEvent] = []
        self._tick = 0

    def schedule(
        self,
        tick: int,
        kind: str,
        *,
        sensor_type: str,
        zone: str,
        envelope: str = "stable",
        ramp_rate: float = 0.0,
        amount: float = 0.0,
    ) -> ScheduledEvent:
        if kind not in ("envelope", "impulse", "trend"):
            raise ValueError(f"unknown event kind {kind!r}")
        event = ScheduledEvent(
            tick=tick,
            kind=kind,
            payload={
                "sensor_type": sensor_type,
                "zone": zone,
                "envelope": envelope,
                "ramp_rate": ramp_rate,
                "amount": amount,
            },
        )
        self._events.append(event)
        return event

    def advance(self, ticks: int = 1) -> List[ScheduledEvent]:
        """Advance the mission clock; return events that fired on the crossed ticks."""
        fired: List[ScheduledEvent] = []
        self._tick += ticks
        for event in self._events:
            if not event.fired and event.tick <= self._tick:
                event.fired = True
                fired.append(event)
        return fired

    def apply(
        self, event: ScheduledEvent, sensors: Dict[Any, Any]
    ) -> None:
        """Apply a fired event to a sensor lookup (resolves via sensor_type/zone)."""
        sensor = sensors.get(
            (event.payload["sensor_type"], event.payload["zone"])
        )
        if sensor is None:
            return
        if event.kind == "envelope":
            sensor.set_envelope(
                event.payload["envelope"], ramp_rate=event.payload["ramp_rate"]
            )
        elif event.kind == "impulse":
            sensor.bump(event.payload["amount"])
        elif event.kind == "trend":
            if isinstance(sensor, TrendModel):
                sensor.set_slope(event.payload["amount"])

    @property
    def tick(self) -> int:
        return self._tick

    def reset(self) -> None:
        self._events.clear()
        self._tick = 0
