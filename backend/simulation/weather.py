"""Weather dynamics (SIMULATION_SPEC.md §4.2).

The weather channel emits one packet per tick from ``site`` zone under the canonical schema. It is
deterministic for a given seed: temperature / humidity / wind follow sinusoidal daily envelopes
with seeded noise, and the rain state (the critical structural-driver for scenarios) follows an
``intensity`` ramp. Rain intensity feeds directly into the risk derivation at ingest time.
"""

from __future__ import annotations

import math
from typing import Any, Dict

from backend.simulation.sensors import HumidityModel, TemperatureModel

__all__ = ["WeatherModel"]


class WeatherModel:
    """Aggregated site weather: temperature, humidity, wind, and rain intensity.

    ``rain_intensity`` is 0.0 (clear) .. 1.0 (torrential) and follows an envelope set by the
    scenario (e.g. ramps up during the collapse scenario). The risk agent treats values above the
    configured threshold (see CONFIGURATION_SPEC §3.3) as the primary structural stressor.
    """

    def __init__(self, *, seed: int = 0, rain_ramp: float = 0.0, rng: Any = None):
        self._seed = seed
        self._rng = rng
        self.temp = TemperatureModel(zone="site")
        self.humidity = HumidityModel(zone="site")
        self.rain_intensity = 0.0
        self.rain_ramp = rain_ramp

    def tick(self) -> None:
        """Advance one mission tick (temperature/humidity already tick via their models)."""
        if self._rng is not None:
            self.temp.tick(self._rng)
            self.humidity.tick(self._rng)
        self.rain_intensity = min(
            1.0, max(0.0, self.rain_intensity + self.rain_ramp)
        )

    def set_rain(self, intensity: float) -> None:
        self.rain_intensity = min(1.0, max(0.0, float(intensity)))

    def emit(
        self, *, mission_id: str, ts: str, packet_id: str
    ) -> Dict[str, Any]:
        wind = self._wind_mps()
        return {
            "packet_id": packet_id,
            "mission_id": mission_id,
            "ts": ts,
            "zone": "site",
            "sensor_type": "weather",
            "metric": "precip_mm_hr",
            "value": round(self.rain_intensity * 40.0, 2),
            "unit": "mps",
            "confidence": 0.85,
            "source": "simulated",
        }

    def _wind_mps(self) -> float:
        if self._rng is None:
            return 0.0
        base = 4.0 + self._rng.uniform(-0.5, 0.5)
        return round(base, 2)

    def to_environment(self) -> Dict[str, Any]:
        return {
            "temp_c": self.temp.value,
            "humidity_pct": self.humidity.value,
            "wind_mps": self._wind_mps(),
            "rain_intensity": self.rain_intensity,
        }
