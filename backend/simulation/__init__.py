"""Inzora Terra OS — Live Mission Engine: simulation package (SIMULATION_SPEC.md).

Submodules:
* ``models``    — canonical telemetry packet schema + validation
* ``sensors``   — deterministic sensor dynamics
* ``weather``   — site weather model
* ``events``    — environment event scheduler
* ``scenarios`` — scenario presets (deterministic recipes)
* ``engine``    — mission clock, packet emitter, scenario engine
* ``ingest``    — telemetry -> MissionStateManager (sole write path)
"""

from backend.simulation.engine import MissionClock, PacketEmitter, ScenarioEngine
from backend.simulation.ingest import TelemetryIngest, derive_environment
from backend.simulation.models import validate_packet, validate_stream
from backend.simulation.scenarios import DEFAULT_SCENARIO, SCENARIOS, get_scenario

__all__ = [
    "MissionClock",
    "PacketEmitter",
    "ScenarioEngine",
    "TelemetryIngest",
    "derive_environment",
    "validate_packet",
    "validate_stream",
    "DEFAULT_SCENARIO",
    "SCENARIOS",
    "get_scenario",
]
