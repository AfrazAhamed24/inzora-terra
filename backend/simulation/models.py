"""Canonical telemetry packet schema + validation (SIMULATION_SPEC.md §3).

Every packet emitted by the simulation (and later hardware adapters) must satisfy this schema.
Validation is shared by the emitter (drop-in guard before ingestion), the ingest path (every
packet that reaches ``MissionState`` is validated), and unit tests.

The packet schema is a 1:1 match with ``TelemetryPacket`` in ``backend/core/mission_state.py``;
the simulation emits plain dicts that validate against both this schema and the state model.
"""

from __future__ import annotations

from typing import Any, Dict, List, Mapping

__all__ = [
    "PACKET_FIELDS",
    "REQUIRED_PACKET_FIELDS",
    "SENSOR_TYPES",
    "ZONES",
    "UNITS",
    "validate_packet",
    "validate_stream",
]

# Full canonical field set (SIMULATION_SPEC §3). All are present on every packet.
PACKET_FIELDS = frozenset(
    {
        "packet_id",
        "mission_id",
        "ts",
        "zone",
        "sensor_type",
        "metric",
        "value",
        "unit",
        "confidence",
        "source",
    }
)

REQUIRED_PACKET_FIELDS = frozenset(
    {
        "packet_id",
        "mission_id",
        "ts",
        "zone",
        "sensor_type",
        "metric",
        "value",
        "unit",
        "confidence",
        "source",
    }
)

# Sensor channels supported by the streaming engine (SIMULATION_SPEC §4.1 plus the Phase 1C
# additions: temperature, humidity, gps, imu, network).
SENSOR_TYPES = frozenset(
    {
        "tilt",
        "trend",
        "thermal",
        "gpr",
        "gas",
        "stress",
        "weather",
        "building",
        "temperature",
        "humidity",
        "gps",
        "imu",
        "network",
    }
)

ZONES = frozenset(
    {
        "north_wall",
        "south_wall",
        "east_wall",
        "basement",
        "perimeter",
        "site",
    }
)

UNITS = frozenset(
    {
        "deg",
        "c",
        "bool",
        "raw",
        "ppm",
        "level",
        "pct",
        "mps",
        "meters",
        "satellites",
        "accel",
        "dbm",
    }
)

_CONFIDENCE_RANGE = (0.0, 1.0)


def validate_packet(packet: Mapping[str, Any]) -> List[str]:
    """Return a list of schema problems (empty list = the packet is valid)."""
    problems: List[str] = []
    if not isinstance(packet, Mapping):
        return ["packet must be a mapping"]

    for field in REQUIRED_PACKET_FIELDS:
        if field not in packet:
            problems.append(f"missing required field {field!r}")

    if "packet_id" in packet and not isinstance(packet["packet_id"], str):
        problems.append("packet_id must be a string")
    if "mission_id" in packet and not isinstance(packet["mission_id"], str):
        problems.append("mission_id must be a string")
    if "zone" in packet and packet["zone"] not in ZONES:
        problems.append(
            f"zone {packet['zone']!r} not in {sorted(ZONES)}"
        )
    if "sensor_type" in packet and packet["sensor_type"] not in SENSOR_TYPES:
        problems.append(
            f"sensor_type {packet['sensor_type']!r} not in {sorted(SENSOR_TYPES)}"
        )
    if "metric" in packet and not isinstance(packet["metric"], str):
        problems.append("metric must be a string")
    if "unit" in packet and packet["unit"] not in UNITS:
        problems.append(f"unit {packet['unit']!r} not in {sorted(UNITS)}")
    if "source" in packet and not isinstance(packet["source"], str):
        problems.append("source must be a string")

    value = packet.get("value")
    if "value" in packet and (
        isinstance(value, bool) or not isinstance(value, (int, float))
    ):
        problems.append("value must be a number")

    confidence = packet.get("confidence")
    if "confidence" in packet:
        if isinstance(confidence, bool) or not isinstance(confidence, (int, float)):
            problems.append("confidence must be a number")
        elif not _CONFIDENCE_RANGE[0] <= float(confidence) <= _CONFIDENCE_RANGE[1]:
            problems.append(
                f"confidence must be within {_CONFIDENCE_RANGE}, got {confidence!r}"
            )
    return problems


def validate_stream(packets: List[Mapping[str, Any]]) -> List[str]:
    """Validate an ordered batch of packets; returns a flat list of problems."""
    problems: List[str] = []
    for i, packet in enumerate(packets):
        for problem in validate_packet(packet):
            problems.append(f"packet[{i}]: {problem}")
    return problems
