"""Sensor dynamics models (SIMULATION_SPEC.md §4.1).

Each ``SensorModel`` holds the current value of one sensor channel and advances it each mission
tick under an envelope (increasing / stable / decreasing / ramp), a drift rate, a noise seed, and
declared bounds. Concrete models cover the full Phase 1C channel set: temperature, humidity, gas,
GPS, IMU, GPR, thermal, tilt, stress, trend (derived), and network status.

Every model is deterministic for a given seed: the RNG is supplied by the scenario engine and the
model never samples randomness itself, so the packet stream reproduces byte-for-byte.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Optional

from backend.simulation.models import UNITS, ZONES

__all__ = [
    "SensorModel",
    "TiltModel",
    "TrendModel",
    "TemperatureModel",
    "HumidityModel",
    "GasModel",
    "GpsModel",
    "ImuModel",
    "GprModel",
    "ThermalModel",
    "StressModel",
    "NetworkModel",
]


@dataclass
class SensorModel:
    """A single sensor channel with deterministic value dynamics.

    ``value`` advances on every ``tick()`` call. ``emit()`` produces a packet dict that validates
    against the canonical schema (backend/simulation/models.py §3).
    """

    sensor_type: str
    zone: str
    metric: str
    unit: str
    baseline: float = 0.0
    drift: float = 0.0
    noise: float = 0.0
    lo: float = -1e9
    hi: float = 1e9
    envelope: str = "stable"  # increasing | stable | decreasing | ramp
    ramp_rate: float = 0.0
    value: float = field(default=0.0, init=False)

    def __post_init__(self) -> None:
        self.value = float(self.baseline)

    def set_envelope(self, envelope: str, ramp_rate: Optional[float] = None) -> None:
        """Switch dynamics envelope mid-stream (EventScheduler effect)."""
        if envelope not in ("increasing", "stable", "decreasing", "ramp"):
            raise ValueError(f"unknown envelope {envelope!r}")
        self.envelope = envelope
        if ramp_rate is not None:
            self.ramp_rate = ramp_rate

    def bump(self, amount: float) -> None:
        """Impulse adjustment (EventScheduler effect, e.g. aftershock tilt bump)."""
        self.value = self._clamp(self.value + amount)

    def _clamp(self, v: float) -> float:
        return min(max(v, self.lo), self.hi)

    def _delta(self, rng: Any) -> float:
        """Per-tick delta from drift, envelope, and noise."""
        delta = self.drift
        if self.envelope == "increasing":
            delta += self.ramp_rate
        elif self.envelope == "decreasing":
            delta -= self.ramp_rate
        elif self.envelope == "ramp":
            delta += self.ramp_rate * max(self.value, 0.0) + 0.01
        if self.noise and rng is not None:
            delta += rng.uniform(-self.noise, self.noise)
        return delta

    def tick(self, rng: Any) -> float:
        """Advance the value one mission tick; returns the new value."""
        self.value = self._clamp(self.value + self._delta(rng))
        return self.value

    def emit(
        self, *, mission_id: str, ts: str, packet_id: str, confidence: float = 0.9
    ) -> Dict[str, Any]:
        return {
            "packet_id": packet_id,
            "mission_id": mission_id,
            "ts": ts,
            "zone": self.zone,
            "sensor_type": self.sensor_type,
            "metric": self.metric,
            "value": round(self.value, 4),
            "unit": self.unit,
            "confidence": confidence,
            "source": "simulated",
        }

    def to_environment(self) -> Any:
        """The value as exposed on the derived environment snapshot."""
        return self.value


class TiltModel(SensorModel):
    def __init__(self, zone: str = "north_wall", **kwargs: Any):
        kwargs.setdefault("metric", "tilt_deg")
        kwargs.setdefault("unit", "deg")
        kwargs.setdefault("baseline", 0.0)
        kwargs.setdefault("drift", 0.0)
        kwargs.setdefault("noise", 0.05)
        kwargs.setdefault("lo", -10.0)
        kwargs.setdefault("hi", 15.0)
        super().__init__("tilt", zone, **kwargs)


class TrendModel(SensorModel):
    """Derived tilt slope encoded numerically (0 stable, 1 increasing, -1 decreasing)."""

    def __init__(self, zone: str = "north_wall", **kwargs: Any):
        kwargs.setdefault("metric", "tilt_slope")
        kwargs.setdefault("unit", "raw")
        kwargs.setdefault("baseline", 0.0)
        kwargs.setdefault("noise", 0.0)
        kwargs.setdefault("lo", -1.0)
        kwargs.setdefault("hi", 1.0)
        super().__init__("trend", zone, **kwargs)

    def set_slope(self, slope: float) -> None:
        self.value = self._clamp(round(float(slope), 4))

    @staticmethod
    def label(slope: float) -> str:
        if slope > 0.02:
            return "increasing"
        if slope < -0.02:
            return "decreasing"
        return "stable"


class TemperatureModel(SensorModel):
    def __init__(self, zone: str = "site", **kwargs: Any):
        kwargs.setdefault("metric", "temp_c")
        kwargs.setdefault("unit", "c")
        kwargs.setdefault("baseline", 22.0)
        kwargs.setdefault("drift", 0.0)
        kwargs.setdefault("noise", 0.3)
        kwargs.setdefault("lo", -20.0)
        kwargs.setdefault("hi", 60.0)
        super().__init__("temperature", zone, **kwargs)


class HumidityModel(SensorModel):
    def __init__(self, zone: str = "site", **kwargs: Any):
        kwargs.setdefault("metric", "humidity_pct")
        kwargs.setdefault("unit", "pct")
        kwargs.setdefault("baseline", 60.0)
        kwargs.setdefault("drift", 0.0)
        kwargs.setdefault("noise", 1.0)
        kwargs.setdefault("lo", 0.0)
        kwargs.setdefault("hi", 100.0)
        super().__init__("humidity", zone, **kwargs)


class GasModel(SensorModel):
    def __init__(self, zone: str = "basement", **kwargs: Any):
        kwargs.setdefault("metric", "ppm")
        kwargs.setdefault("unit", "ppm")
        kwargs.setdefault("baseline", 50.0)
        kwargs.setdefault("drift", 0.0)
        kwargs.setdefault("noise", 5.0)
        kwargs.setdefault("lo", 0.0)
        kwargs.setdefault("hi", 10000.0)
        super().__init__("gas", zone, **kwargs)

    def spike(self, amount: float) -> None:
        """Aftershock gas spike (EventScheduler effect)."""
        self.bump(amount)


class GpsModel(SensorModel):
    def __init__(self, zone: str = "site", **kwargs: Any):
        kwargs.setdefault("metric", "signal_strength")
        kwargs.setdefault("unit", "dbm")
        kwargs.setdefault("baseline", -60.0)
        kwargs.setdefault("drift", 0.0)
        kwargs.setdefault("noise", 2.0)
        kwargs.setdefault("lo", -120.0)
        kwargs.setdefault("hi", -30.0)
        super().__init__("gps", zone, **kwargs)


class ImuModel(SensorModel):
    def __init__(self, zone: str = "north_wall", **kwargs: Any):
        kwargs.setdefault("metric", "accel_x")
        kwargs.setdefault("unit", "accel")
        kwargs.setdefault("baseline", 0.0)
        kwargs.setdefault("drift", 0.01)
        kwargs.setdefault("noise", 0.05)
        kwargs.setdefault("lo", -5.0)
        kwargs.setdefault("hi", 5.0)
        super().__init__("imu", zone, **kwargs)


class GprModel(SensorModel):
    def __init__(self, zone: str = "basement", **kwargs: Any):
        kwargs.setdefault("metric", "signal_strength")
        kwargs.setdefault("unit", "raw")
        kwargs.setdefault("baseline", 100.0)
        kwargs.setdefault("drift", 0.0)
        kwargs.setdefault("noise", 8.0)
        kwargs.setdefault("lo", 0.0)
        kwargs.setdefault("hi", 1000.0)
        super().__init__("gpr", zone, **kwargs)


class ThermalModel(SensorModel):
    """Thermal channel: temperature (c) plus a heat-flag (bool encoded 0/1)."""

    def __init__(self, zone: str = "basement", heat: bool = False, **kwargs: Any):
        super().__init__(
            "thermal", zone, metric="temp_c", unit="c",
            baseline=24.0 if not heat else 31.0,
            drift=0.0, noise=0.4, lo=-20.0, hi=60.0, **kwargs,
        )
        self.heat_flag = 1.0 if heat else 0.0

    def set_heat(self, heat: bool) -> None:
        self.heat_flag = 1.0 if heat else 0.0

    def tick(self, rng: Any) -> float:
        if self.heat_flag:
            # Victims present: hold elevated temperature toward an interior plateau.
            self.value = self._clamp(self.value + (31.0 - self.value) * 0.1 + self._delta(rng) * 0.1)
        else:
            self.value = self._clamp(self.value + self._delta(rng))
        return self.value

    def to_environment(self) -> Any:
        return "heat signature detected" if self.heat_flag else "no anomaly"


class StressModel(SensorModel):
    def __init__(self, zone: str = "north_wall", **kwargs: Any):
        kwargs.setdefault("metric", "stress_index")
        kwargs.setdefault("unit", "raw")
        kwargs.setdefault("baseline", 0.0)
        kwargs.setdefault("drift", 0.0)
        kwargs.setdefault("noise", 0.05)
        kwargs.setdefault("lo", 0.0)
        kwargs.setdefault("hi", 100.0)
        super().__init__("stress", zone, **kwargs)


class NetworkModel(SensorModel):
    """Network status: signal strength (dbm) plus online flag (bool encoded 0/1)."""

    def __init__(self, zone: str = "site", **kwargs: Any):
        kwargs.setdefault("metric", "signal_strength")
        kwargs.setdefault("unit", "dbm")
        kwargs.setdefault("baseline", -55.0)
        kwargs.setdefault("drift", 0.0)
        kwargs.setdefault("noise", 1.0)
        kwargs.setdefault("lo", -120.0)
        kwargs.setdefault("hi", -30.0)
        super().__init__("network", zone, **kwargs)
        self.online = 1.0

    def set_online(self, online: bool) -> None:
        self.online = 1.0 if online else 0.0

    def to_environment(self) -> Any:
        return "online" if self.online else "offline"
