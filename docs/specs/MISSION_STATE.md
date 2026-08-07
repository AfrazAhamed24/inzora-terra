# Inzora Terra OS — MissionState (Global Operating Picture)

**Spec version:** 1.0 (Phase 1A)
**Status:** Design — implementation reference for Phase 1B
**Supersedes:** `backend/core/gop.py` `TERRAState`

## 1. Purpose

`MissionState` is the single source of truth shared by every agent, the orchestrator, the
simulation layer, and the future API layer. It evolves the existing `TERRAState` object from a
small scripted container into the structured Global Operating Picture (GOP) that BLUEPRINT v1.1
describes. No component holds a private copy of mission data; everything reads and writes
`MissionState`.

**Design rule (from BLUEPRINT v1.1):** every backend component interacts with the system only
through `MissionState`. Agents never call each other directly; they read inputs from state and
write outputs back to state.

## 2. Guiding Principles

1. **One object per mission.** A mission has exactly one `MissionState` instance for its lifetime.
2. **Explicit ownership.** Each field has a defined writer (agent or orchestrator) — see §6.
3. **Append-only histories.** Evidence, telemetry, logs, timeline, and human decisions only ever
   grow. Derived reports are overwritten by their owning agent on each execution cycle.
4. **Streaming-friendly.** Telemetry and timeline are collections that grow over time, so the API
   can stream them incrementally.
5. **Traceable.** Every entry links to source evidence and carries a timestamp, so the audit trail
   for compliance is complete.
6. **Serializable.** The whole state can be dumped to a plain JSON document at any point (used by
   the API, CLI, and briefing generator).

## 3. Top-Level Structure

```
MissionState
├── metadata            mission identity + timing
├── status              lifecycle stage + phase + flags
├── telemetry           ordered stream of sensor packets  (append-only)
├── environment         current environment snapshot (sensors/weather/building)
├── evidence            ingested evidence entries          (append-only)
├── agent_outputs       every agent run result             (append-only)
├── risk_report         Risk Assessment output (owned)
├── victim_map          Victim Localization output (owned)
├── resource_allocation Resource Coordination output (owned)
├── knowledge_results   Knowledge Retrieval output (owned)
├── confidence_scores   per-agent confidence (0.0–1.0)
├── timeline            ordered event log for UI/stream   (append-only)
├── human_decisions     HITL confirmation records          (append-only)
├── logs                structured log entries             (append-only)
├── summary             orchestrator mission briefing
└── assistant_context   Mission Assistant conversation state
```

## 4. Field Specifications

### 4.1 metadata

| Field          | Type     | Description                                                      | Written by      |
|----------------|----------|------------------------------------------------------------------|-----------------|
| `mission_id`   | string   | Stable unique ID, e.g. `MISS-2026-0815-001`                      | Orchestrator    |
| `incident_text`| string   | Raw incident report string                                        | Orchestrator    |
| `started_at`   | timestamp| UTC ISO-8601 mission start                                        | Orchestrator    |
| `updated_at`   | timestamp| UTC ISO-8601 last state mutation                                  | Orchestrator    |
| `environment_id`| string  | Active simulation scenario / env profile (see SIMULATION_SPEC)    | Orchestrator    |
| `mission_name` | string   | Optional human label (defaults from incident)                     | Orchestrator    |
| `version`      | string   | State schema version (`1.0`)                                      | System          |

### 4.2 status

| Field          | Type     | Description                                                        |
|----------------|----------|--------------------------------------------------------------------|
| `stage`        | string   | Lifecycle state token — see MISSION_LIFECYCLE.md (e.g. `initialized`, `evidence_ingested`, `risk_assessed`, `briefing_ready`, `completed`) |
| `phase`        | string   | Coarse grouping: `ingest`, `assess`, `coordinate`, `report`, `review`, `done` |
| `is_running`   | boolean  | True while the dependency graph has pending work                    |
| `error_count`  | integer  | Cumulative agent/execution errors (0 = clean)                       |
| `last_error`   | string?  | Short message of the most recent failure, null when clean           |

### 4.3 telemetry (append-only)

Ordered packet stream consumed by agents and streamed to the frontend.

| Field        | Type    | Description                                            |
|--------------|---------|--------------------------------------------------------|
| `packet_id`  | string  | Unique `TELE-<n>` (or ULID)                             |
| `mission_id` | string  | Owning mission                                          |
| `ts`         | timestamp | Simulated mission-clock timestamp (not wall clock)     |
| `zone`       | string  | Sensor zone (`north_wall`, `basement`, …)               |
| `sensor_type`| string  | `tilt`, `trend`, `thermal`, `gpr`, `gas`, `stress`      |
| `metric`     | string  | Metric name (`tilt_deg`, `temp_c`, …)                   |
| `value`      | number  | Measured value                                          |
| `unit`       | string  | `deg`, `c`, `bool`, `raw`, `ppm`                        |
| `confidence` | float   | 0.0–1.0 sensor confidence                               |
| `source`     | string  | `simulated` now; future hardware adapter ID             |

### 4.4 environment

Current best-known snapshot derived from the telemetry stream by the orchestrator, plus static
context. Mirrors the existing `get_sensor_data` / `get_weather` / `get_building_info` outputs so
agents keep working while the simulation layer replaces the static getters.

| Field            | Type   | Description                                        | Written by       |
|------------------|--------|----------------------------------------------------|------------------|
| `sensors`        | dict   | `{ zone: {tilt_deg, trend, thermal, …} }`          | Orchestrator (from telemetry) |
| `weather`        | dict   | `{ rain, forecast, aftershock_probability, wind }` | Orchestrator (from telemetry) |
| `building`       | dict   | `{ age_years, material, floors, occupancy, basement }` | Orchestrator / ingest |

### 4.5 evidence (append-only)

Unchanged shape from `TERRAState.EvidenceEntry`:

| Field       | Type   | Description                            |
|-------------|--------|----------------------------------------|
| `source`    | string | e.g. `sensor:north_wall`, `weather:current`, `building:bld_001`, `witness:report_001` |
| `data`      | any    | Raw payload                             |
| `timestamp` | timestamp | UTC ISO-8601 ingestion time         |
| `confidence`| float  | 0.0–1.0                                 |

Ingested evidence may be **snapshot evidence** (static, e.g. building info) or **stream-derived**
(marked with `source` prefixed `telemetry:`).

### 4.6 agent_outputs (append-only)

| Field       | Type   | Description                                    |
|-------------|--------|------------------------------------------------|
| `agent_name`| string | Stable agent slug (`risk_assessment`, …)        |
| `cycle_id`  | string | Unique run identifier `CYC-<n>`                |
| `output`    | dict   | The agent's returned result                    |
| `confidence`| float  | 0.0–1.0                                        |
| `timestamp` | timestamp | UTC ISO-8601 run completion                |
| `status`    | string | `ok` / `error` / `fallback`                   |

### 4.7 owned report fields

Each agent owns exactly one report dict. Ownership means only that agent (or the orchestrator on
its behalf during a fallback) writes it.

| Field                | Writer                 | Existing shape to preserve                     |
|----------------------|------------------------|------------------------------------------------|
| `risk_report`        | risk_assessment        | `likelihood, risk_score, hazards[], recommendation, confidence, trend` |
| `victim_map`         | victim_localization    | `zones[], total_victims_estimated, primary_search_zone, confidence` |
| `resource_allocation`| resource_coordination  | `assignments[], utilization, bottlenecks[]`    |
| `knowledge_results`  | knowledge_retrieval    | `sops[], building_codes[], recommendations[]`  |

Each report SHOULD also carry `as_of` (the telemetry/evidence snapshot it was computed from) and
`cycle_id` so consumers can verify staleness.

### 4.8 confidence_scores

`dict[str, float]` mapping agent slug → 0.0–1.0. Orchestrator aggregates these into the briefing
and triggers HITL when any score < 0.5 (see AGENTS.md triggers).

### 4.9 timeline (append-only)

Ordered, human-readable-but-structured event stream for the UI:

| Field     | Type   | Description                                          |
|-----------|--------|------------------------------------------------------|
| `ts`      | timestamp | Event time                                      |
| `type`    | string | `mission_start`, `agent_start`, `agent_complete`, `agent_failed`, `telemetry`, `hintl`, `briefing`, `environment_change` |
| `agent`   | string?| Emitting agent, null for system events               |
| `message` | string | Short description                                    |
| `data`    | dict?  | Optional structured payload                          |

### 4.10 human_decisions (append-only)

HITL records (see MISSION_LIFECYCLE.md and BLUEPRINT v1.1 HITL workflow):

| Field        | Type   | Description                                             |
|--------------|--------|---------------------------------------------------------|
| `id`         | string | `DEC-<n>`                                               |
| `request_type`| string| `confirm`, `verify`, `approve`                          |
| `summary`    | string | What the supervisor is asked to decide                  |
| `related_agent`| string? | Agent that raised it                              |
| `related_task_id`| string? | Task being confirmed                            |
| `status`     | string | `pending` → `confirmed` / `overridden` / `timeout`      |
| `raised_at`  | timestamp | Request time                                        |
| `resolved_at`| timestamp? | Resolution time, null while pending                 |
| `resolved_by`| string? | `supervisor`, `system` (on timeout)                   |
| `decision_notes`| string? | Optional free-text rationale                        |

### 4.11 logs

Structured log entries — full schema in LOGGING_SPEC.md. Summarized here for state:

| Field      | Type   | Description                        |
|------------|--------|------------------------------------|
| `id`       | string | `LOG-<n>`                          |
| `ts`       | timestamp | UTC log time                    |
| `level`    | string | `DEBUG`/`INFO`/`WARNING`/`ERROR`/`CRITICAL` |
| `source`   | string | `orchestrator`, agent slug, `simulation`, `system` |
| `message`  | string | Human-readable message             |
| `context`  | dict?  | Structured extras (zone, cycle_id, …) |

The state holds a bounded **in-memory ring buffer** (configurable, default last 1,000 entries);
persistence is defined in LOGGING_SPEC.md.

### 4.12 summary

The orchestrator-produced mission briefing (equivalent to today's `_generate_briefing()` return):

| Field                  | Type   | Description                                |
|------------------------|--------|--------------------------------------------|
| `mission_briefing`     | dict   | `incident_id, overall_risk, priority_zones[], total_victims_estimated, immediate_actions[], resource_status, next_update_in` |
| `confidence_scores`    | dict   | Aggregated agent confidence                |
| `needs_human_review`   | boolean| True if any confirmation is pending        |
| `generated_at`         | timestamp | Briefing time                          |

### 4.13 assistant_context

State held for the Mission Assistant (the sole conversational surface per BLUEPRINT v1.1):

| Field            | Type   | Description                                        |
|------------------|--------|----------------------------------------------------|
| `session_id`     | string | Assistant session for this mission                 |
| `message_count`  | integer| Turn counter                                       |
| `last_query`     | string?| Most recent supervisor question                    |
| `last_response`  | string?| Most recent assistant answer                       |
| `cited_references`| array | SOP/code/evidence IDs the last answer cited       |

The assistant is a **consumer** of state (reads reports, evidence, timeline) and never mutates
mission data — it only produces responses.

## 5. Mutation Rules

- **Append-only lists** (`telemetry`, `evidence`, `agent_outputs`, `timeline`, `human_decisions`,
  `logs`) support only `append`/`append_many`. No deletion, no in-place edits.
- **Owned reports** are replaced wholesale by their owning agent each cycle.
- **metadata.updated_at** is refreshed on every mutation.
- **Reads are non-destructive.** Agents receive a read-consistent view for the duration of their
  cycle (executor snapshot semantics defined in ORCHESTRATOR.md).

## 6. Read/Write Permission Matrix

| Component            | Reads                                                              | Writes                                        |
|----------------------|--------------------------------------------------------------------|-----------------------------------------------|
| Risk Assessment      | telemetry, environment (sensor/weather/building), evidence         | `risk_report`, `confidence_scores`, `timeline`, `agent_outputs`, tasks (evac/monitor), HITL requests |
| Victim Localization  | telemetry, environment (thermal/GPR), evidence (witness)           | `victim_map`, `confidence_scores`, tasks (search), HITL requests |
| Resource Coordination| `risk_report`, `victim_map`, `tasks`                               | `resource_allocation`, tasks (deploy)         |
| Knowledge Retrieval  | `risk_report`, `victim_map`, environment (building)                | `knowledge_results`, `confidence_scores`      |
| Orchestrator         | all                                                                | `metadata`, `status`, `summary`, `environment`, `timeline` |
| Simulation           | none                                                               | `telemetry`, `environment` (stream side)      |
| Mission Assistant    | all reports, evidence, timeline, `knowledge_results`               | `assistant_context` (response records only)   |

## 7. Serialization Contract

- The state dumps to a single JSON document (`state.to_dict()`).
- The dump must be **stable-ordered** so CLI output and API responses are deterministic.
- Timestamps are always UTC ISO-8601 with `Z` or explicit offset.
- JSON sample (abridged, data only — not a schema definition):

```json
{
  "metadata": {
    "mission_id": "MISS-2026-0815-001",
    "incident_text": "Two-floor building collapsed after heavy rainfall. 3 missing persons.",
    "started_at": "2026-08-15T08:00:00Z",
    "updated_at": "2026-08-15T08:00:05Z",
    "environment_id": "scenario_collapse_rain",
    "version": "1.0"
  },
  "status": { "stage": "briefing_ready", "phase": "report", "is_running": false,
              "error_count": 0, "last_error": null },
  "telemetry": [
    { "packet_id": "TELE-1", "mission_id": "MISS-2026-0815-001", "ts": "2026-08-15T08:00:01Z",
      "zone": "north_wall", "sensor_type": "tilt", "metric": "tilt_deg",
      "value": 4.0, "unit": "deg", "confidence": 0.9, "source": "simulated" }
  ],
  "environment": {
    "sensors": { "north_wall": { "tilt_deg": 4, "trend": "increasing" } },
    "weather": { "rain": "heavy", "forecast": "more rain expected in 2 hours",
                 "aftershock_probability": "low" },
    "building": { "age_years": 20, "material": "concrete frame", "floors": 2,
                  "occupancy": "residential", "basement": true }
  },
  "risk_report": { "likelihood": "HIGH", "risk_score": 0.9, "hazards": [
      "Tilt angle 4 degrees exceeds stability threshold",
      "Trend is increasing - conditions worsening",
      "Heavy rain worsens soil instability"],
    "recommendation": "Evacuate immediately. Do not enter structure.",
    "confidence": 0.92, "trend": "increasing", "cycle_id": "CYC-2" },
  "confidence_scores": { "risk_assessment": 0.92, "victim_localization": 0.78,
                         "resource_coordination": 0.88, "knowledge_retrieval": 0.7 },
  "summary": { "mission_briefing": { "incident_id": "MISS-2026-0815-001",
      "overall_risk": "HIGH", "priority_zones": ["B2"], "total_victims_estimated": 2,
      "immediate_actions": ["Evacuate all non-essential personnel immediately"],
      "resource_status": "Deployed", "next_update_in": "15 minutes" },
    "needs_human_review": true, "generated_at": "2026-08-15T08:00:04Z" }
}
```

## 8. Backward Compatibility with TERRAState

`MissionState` is a **superset** of `TERRAState`. During the migration (see MIGRATION_PLAN.md):

- All existing `TERRAState` fields keep their names (`evidence`, `tasks`, `agent_outputs`,
  `risk_report`, `victim_map`, `resource_allocation`, `knowledge_results`, `confidence_scores`,
  `pending_confirmations`).
- `pending_confirmations` is re-expressed as `human_decisions`; a compatibility accessor maps
  one to the other so existing agent code compiles during transition.
- `tasks` (existing `Task` list) remains a top-level list for backward compatibility; new
  task-related metadata goes into `timeline` and `human_decisions`.
- The CLI (`python -m backend.run`) continues to work against the new state with minimal changes.
