"""Telemetry ingestion into MissionState (SIMULATION_SPEC.md §5, MISSION_STATE §4.3-4.4).

``TelemetryIngest`` is the *only* path by which the simulation writes telemetry to mission state.
It validates every packet against the canonical schema, routes it through
``MissionStateManager.append_telemetry`` (permission-checked: the SIMULATION component owns
``telemetry`` + ``environment`` writes), and derives the environment snapshot from the latest
packets — one entry per zone/sensor plus the aggregated weather channel (MISSION_STATE §4.4).

It never touches state directly: all mutations flow through the manager.
"""

from __future__ import annotations

from typing import Any, Dict, List, Mapping

from backend.core.state_manager import MissionStateManager
from backend.simulation.models import validate_packet

__all__ = ["TelemetryIngest", "derive_environment", "derive_evidence"]


class TelemetryIngest:
    """Ingests packet batches into a ``MissionStateManager`` and derives the environment."""

    def __init__(self, manager: MissionStateManager, *, component: str = "simulation"):
        self.manager = manager
        self.component = component
        self.accepted: int = 0
        self.rejected: int = 0

    def ingest(self, packets: List[Mapping[str, Any]]) -> Dict[str, Any]:
        """Validate + append a packet batch; returns per-packet accept/reject results."""
        results: List[Dict[str, Any]] = []
        accepted: List[Mapping[str, Any]] = []
        for packet in packets:
            problems = validate_packet(packet)
            if problems:
                self.rejected += 1
                results.append(
                    {
                        "packet_id": packet.get("packet_id"),
                        "ok": False,
                        "problems": problems,
                    }
                )
                continue
            accepted.append(packet)
            results.append(
                {"packet_id": packet.get("packet_id"), "ok": True, "problems": []}
            )

        if accepted:
            self.manager.append_telemetry(self.component, list(accepted))
            self.accepted += len(accepted)

        self.refresh_environment()
        return {"results": results, "accepted": len(accepted), "rejected": len(packets) - len(accepted)}

    def refresh_environment(self) -> Dict[str, Any]:
        """Re-derive and persist the environment snapshot from the latest telemetry."""
        snapshot = derive_environment(self.manager.state.telemetry)
        self.manager.set_environment(self.component, snapshot)
        return snapshot

    def current_environment(self) -> Dict[str, Any]:
        """Best-known environment snapshot without re-deriving (read-only view)."""
        return self.manager.state.environment.model_dump()


def derive_environment(packets: List[Any]) -> Dict[str, Any]:
    """Derive an ``EnvironmentSnapshot`` dict from the ordered packet stream (MISSION_STATE §4.4).

    * ``sensors`` — per zone, the latest value of each distinct sensor_type.
    * ``weather``  — the latest weather packet (rain/precip).
    * ``building`` — left to the orchestrator; filled from risk/building sources.
    """
    latest: Dict[str, Dict[str, Any]] = {}
    weather: Dict[str, Any] = {}
    for packet in packets:
        data = packet if isinstance(packet, Mapping) else getattr(packet, "model_dump", lambda: {})()
        zone = data.get("zone")
        sensor_type = data.get("sensor_type")
        if zone and sensor_type:
            latest.setdefault(zone, {})[sensor_type] = data.get("value")
        if sensor_type == "weather":
            weather = {
                key: data.get(key)
                for key in ("temp_c", "humidity_pct", "wind_mps", "rain_intensity")
                if data.get(key) is not None
            } or {"precip_mm_hr": data.get("value"), "unit": data.get("unit")}
    return {"sensors": latest, "weather": weather, "building": {}}


def derive_evidence(packets: List[Any]) -> Dict[str, Any]:
    """Derive per-source evidence from the latest packets (``sensor:`` / ``weather:`` / ``building:``).

    Mirrors the shapes the current agents' ``perceive`` expect (AGENT_CONTRACT migration note:
    SIMULATION_SPEC §9). ``sensor:<zone>`` entries carry ``tilt_deg`` + ``trend``; ``weather:current``
    carries ``rain``; ``building:bld_001`` carries static metadata. Entries are derived from the
    *latest* packet per (zone, sensor_type) so evidence tracks the live stream.
    """
    from backend.core.tools import get_building_info

    evidence: Dict[str, Any] = {}
    latest: Dict[str, Dict[str, Any]] = {}
    for packet in packets:
        data = packet if isinstance(packet, Mapping) else getattr(packet, "model_dump", lambda: {})()
        zone = data.get("zone")
        sensor_type = data.get("sensor_type")
        if zone and sensor_type:
            latest.setdefault(zone, {})[sensor_type] = data.get("value")

    for zone, sensors in latest.items():
        sensor_evidence: Dict[str, Any] = {}
        if "tilt" in sensors:
            sensor_evidence["tilt_deg"] = sensors["tilt"]
        if "trend" in sensors:
            sensor_evidence["trend"] = _trend_label(sensors["trend"])
        if "gas" in sensors:
            sensor_evidence["ppm"] = sensors["gas"]
        if "thermal" in sensors:
            temp = sensors["thermal"]
            sensor_evidence["temp_c"] = temp
            sensor_evidence["thermal"] = (
                "heat signature detected" if temp >= 29.0 else "no heat signature"
            )
        if "gpr" in sensors:
            sensor_evidence["gpr"] = "subsurface scan"
        if sensor_evidence:
            evidence[f"sensor:{zone}"] = sensor_evidence

    # Weather evidence: rain when precipitation is present (rain_intensity > 0.15).
    weather = latest.get("site", {}).get("weather")
    if weather is not None:
        evidence["weather:current"] = {"rain": "heavy" if weather > 6.0 else ("light" if weather > 0 else "none")}

    building = get_building_info("bld_001")
    evidence["building:bld_001"] = building
    return evidence


def _trend_label(slope: Any) -> str:
    """Map a numeric trend packet to the label the risk agent expects."""
    try:
        slope = float(slope)
    except (TypeError, ValueError):
        return "stable"
    if slope > 0.02:
        return "increasing"
    if slope < -0.02:
        return "decreasing"
    return "stable"
