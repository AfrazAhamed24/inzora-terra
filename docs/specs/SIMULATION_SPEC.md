# Inzora Terra OS — Telemetry Simulation Specification

**Spec version:** 1.0 (Phase 1A)
**Status:** Design — implementation reference for Phase 1B
**Targets:** replacement for `backend/core/tools.py` static getters and `backend/run.py` evidence
seeding

## 1. Purpose

Replaces the current static mock data (`get_sensor_data`, `get_weather`, `get_building_info`)
with a **streaming telemetry simulation layer**. The pipeline should consume time-ordered sensor
packets rather than one-shot dicts, matching the BLUEPRINT v1.1 streaming-telemetry philosophy and
giving the frontend a live data stream. Hardware adapters (drone cameras, robot feeds, GPR, gas
sensors) later emit the **same packet schema**, so the simulation is hot-swappable with zero
pipeline changes.

## 2. Design Principles

1. **Packet-based, not snapshot-based.** All telemetry is an ordered stream of packets appended to
   `MissionState.telemetry` (MISSION_STATE.md §4.3).
2. **Deterministic & replayable.** The generator is seeded so the same scenario reproduces the same
   stream (for tests and demos).
3. **Time-driven.** Uses a simulated **mission clock** (accelerated vs wall clock, configurable)
   so agents see the environment evolve over time (tilt increasing, weather changing, aftershocks).
4. **Schema-locked.** Packet fields are frozen (see §3); consumers (agents, API, logging) rely only
   on these fields.
5. **Environment derivation.** The orchestrator derives `MissionState.environment` from the latest
   packet values per zone/sensor, preserving the shape today's agents expect.

## 3. Packet Schema (canonical)

From MISSION_STATE.md §4.3 — repeat here for reference and validation:

| Field        | Type    | Required | Notes                                          |
|--------------|---------|----------|------------------------------------------------|
| `packet_id`  | string  | yes      | `TELE-<n>`, globally unique per mission        |
| `mission_id` | string  | yes      | Owning mission                                 |
| `ts`         | timestamp | yes    | Simulated mission-clock time (ISO-8601)        |
| `zone`       | string  | yes      | `north_wall`, `south_wall`, `basement`, `perimeter`, `site` |
| `sensor_type`| string  | yes      | `tilt`, `trend`, `thermal`, `gpr`, `gas`, `stress`, `weather`, `building` |
| `metric`     | string  | yes      | e.g. `tilt_deg`, `trend`, `temp_c`, `signal_strength`, `ppm`, `rain` |
| `value`      | number  | yes      | numeric value                                  |
| `unit`       | string  | yes      | `deg`, `c`, `bool`, `raw`, `ppm`, `level`      |
| `confidence` | float   | yes      | 0.0–1.0                                        |
| `source`     | string  | yes      | `simulated`; future hardware adapter ID        |

## 4. Generator Architecture

```
┌────────────────────────────────────────────────────────────┐
│  Scenario Engine (deterministic, seeded)                    │
│  ┌────────────┐  ┌────────────────┐  ┌──────────────────┐  │
│  │ SensorModel │  │ EventScheduler │  │ WeatherModel     │  │
│  └─────┬──────┘  └───────┬────────┘  └────────┬─────────┘  │
│        └──────────┬──────┴────────────────────┘            │
│                   v                                        │
│  ┌───────────────────────────────────────────┐             │
│  │ PacketEmitter (mission-clock ticker)      │             │
│  │   tick() → List[packet]  (appends to      │             │
│  │   MissionState.telemetry + environment)   │             │
│  └───────────────────────────────────────────┘             │
└────────────────────────────────────────────────────────────┘
```

### 4.1 SensorModel

Per-sensor value dynamics. Each model holds: current value, drift rate, bounds, noise seed, and a
base envelope (increasing/stable/decreasing).

| Sensor   | Metrics                                   | Dynamics example                                   |
|----------|-------------------------------------------|----------------------------------------------------|
| `tilt`   | `tilt_deg` (deg)                          | baseline 0; event "crack" ramps +0.1 deg/tick toward threshold; noise ±0.05 |
| `trend`  | `trend` (level)                           | derived from tilt slope: `increasing` / `stable` / `decreasing` |
| `thermal`| `temp_c` (c), `heat_flag` (bool)          | basement holds high temp when victims present       |
| `gpr`    | `signal_strength` (raw), `anomaly` (bool) | elevated signal in basement zone                    |
| `gas`    | `ppm` (ppm)                               | spikes during aftershock; low otherwise             |
| `stress` | `stress_index` (raw)                      | tracks tilt; used by Risk Agent in later phases     |
| `weather`| `rain` (level), `wind_ms` (m/s), `aftershock_probability` (0-1) | scheduled event changes |
| `building`| static metadata packet (`age_years`, `material`, `floors`, `occupancy`, `basement`) | emitted once at mission start |

### 4.2 EventScheduler

Time-based scenario events that alter model envelopes mid-stream:

| Event          | Effect                                                          |
|----------------|-----------------------------------------------------------------|
| `aftershock`   | spike `gas`, bump `tilt` +0.3 deg, raise `aftershock_probability`, emit `environment_change` timeline event |
| `rain_intensity`| change `rain` level (affects Risk Agent hazard logic)          |
| `crack`        | switch a zone's tilt envelope to `increasing`                  |
| `victim_detected` | set `thermal` heat flag + `gpr` anomaly for a zone           |
| `stabilize`    | switch envelope to `stable` (post-response)                    |

Events are declared in the scenario with a mission-clock time and probability (deterministic via seed).

### 4.3 WeatherModel

Aggregates rain/wind/aftershock into the `weather` metric set and mirrors to the environment.

## 5. Timing Model

| Parameter      | Default | Config key (CONFIGURATION_SPEC.md)       | Meaning                          |
|----------------|---------|------------------------------------------|----------------------------------|
| Tick interval  | 1.0 s   | `simulation.tick_seconds`                | wall-clock gap between ticks     |
| Time multiplier| 1.0     | `simulation.time_multiplier`             | mission minutes per wall minute  |
| Ticks per cycle| 60      | `simulation.ticks_per_cycle`             | packets per cycle (batch emit)   |
| Seed           | 20260815| `simulation.seed`                        | reproducibility                  |

## 6. Scenarios (presets)

| Scenario ID              | Description                                                        |
|--------------------------|--------------------------------------------------------------------|
| `scenario_collapse_rain` | Default demo: building collapse + heavy rain, victims in basement (matches current `run.py` demo) |
| `scenario_earthquake_clean` | Earthquake, moderate tilt, no rain, few victims                |
| `scenario_critical`      | HIGH risk, multiple zones, aftershocks, gas spike (exercises CRITICAL paths) |
| `scenario_quiet`         | Stable structure, low risk, single LOW zone                       |

Each scenario defines: zones + sensor set, initial values, event schedule, weather profile, and a
`risk_goal` used to sanity-check demo outcomes.

## 7. Ingest Path

The orchestrator's `MissionFactory.ingest()` (ORCHESTRATOR.md §8):

1. Start the scenario engine for `environment_id`.
2. Emit static `building` packet + initial sensor state (this satisfies the `evidence_ingested`
   transition).
3. During the mission, each tick appends packets to `telemetry` and refreshes `environment`.
4. Agents read `environment` (stable snapshot) as their L1 input — the packet stream is the source;
   the environment dict is the derived projection.

## 8. Hardware Adapter Interface (Future)

A hardware adapter implements the same contract as the generator's `PacketEmitter.tick()`:

| Method/Concept | Description                                          |
|----------------|------------------------------------------------------|
| `connect()`    | establish link to hardware                           |
| `tick()`       | yield one or more packets (same schema)              |
| `disconnect()` | teardown                                             |

Swapping `simulated → drone`/`rover`/`gpr` requires only changing `simulation.source` in config.
Packets retain `source` so the audit trail distinguishes simulated vs real data.

## 9. Backward Compatibility

- Today's agents consume `tilt_deg`, `trend`, `thermal`, `weather.rain`, `building.*`. The derived
  `environment` dict preserves **exactly** these keys, so existing `perceive` bodies keep working
  during migration.
- `tools.py` static getters remain as **fallback source** (`orchestrator.fallback_source = simulated`)
  and for unit tests; the streaming generator is the default source.

## 10. Validation & Testing

- Determinism: same seed + scenario → byte-identical packet stream.
- Schema: every emitted packet passes the §3 schema validator.
- Timing: emitted `ts` is strictly monotonic within a mission.
- Bounds: values stay within declared sensor bounds unless an event overrides them.
- Replay: recorded stream can be re-fed into the pipeline (agents produce identical outputs).
