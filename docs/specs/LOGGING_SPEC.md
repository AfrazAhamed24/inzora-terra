# Inzora Terra OS — Logging Specification

**Spec version:** 1.0 (Phase 1A)
**Status:** Design — implementation reference for Phase 1B
**Targets:** replace ad-hoc `orchestrator.agent_log` + `print()` in `backend/run.py` with a
structured logging subsystem

## 1. Purpose

Provides a single, structured logging path for all backend activity — agent runs, orchestrator
decisions, telemetry, evidence ingestion, and HITL events — so the frontend, CLI, API, and audit
tooling consume the same records. Satisfies the **evidence chain / audit trail for compliance**
requirement in MEMORY.md.

## 2. Design Principles

1. **Structured by default.** Logs are records with fields, never free-text lines. Human-readable
   text is a presentation concern of the sink, not the format.
2. **One sink interface.** All components log through the EventSink (ORCHESTRATOR.md §3); no
   component writes to stdout directly.
3. **Correlatable.** Every record carries `mission_id` and an optional `trace_id` so all records
   from one agent cycle or one graph run can be reassembled.
4. **Append-only.** Logs are never edited; retention/pruning is a sink concern.
5. **Non-blocking.** Logging must never block the agent pipeline (async, buffered sink).
6. **Secret-safe.** API keys and tokens are never written to logs (see §8).

## 3. Log Record Schema

| Field       | Type    | Required | Description                                              |
|-------------|---------|----------|----------------------------------------------------------|
| `id`        | string  | yes      | `LOG-<n>` (or ULID), unique within a mission             |
| `ts`        | timestamp | yes    | UTC ISO-8601 wall-clock time                             |
| `level`     | string  | yes      | `DEBUG`/`INFO`/`WARNING`/`ERROR`/`CRITICAL`             |
| `source`    | string  | yes      | `orchestrator`, agent slug, `simulation`, `system`, `hitl` |
| `message`   | string  | yes      | Short human-readable summary                            |
| `mission_id`| string  | yes      | Owning mission                                          |
| `trace_id`  | string? | no       | Cycle/run correlation ID (`CYC-<n>` or `GRAPH-<n>`)     |
| `context`   | dict?   | no       | Structured extras (zone, cycle_id, stage, packet_id, …) |
| `data`      | any?    | no       | Optional payload (report snapshots, decision record)    |

## 4. Levels

| Level     | Used for                                                                          |
|-----------|-----------------------------------------------------------------------------------|
| `DEBUG`   | telemetry packets, per-agent perceive/reason internals, verbose traces           |
| `INFO`    | normal lifecycle: mission start, agent start/complete, stage changes, briefing   |
| `WARNING` | retry attempt, fallback used, HITL timeout, near-threshold confidence            |
| `ERROR`   | agent cycle failure, contract violation, level incompletion, log sink failure    |
| `CRITICAL`| unrecoverable error → mission `errored`, data integrity loss                      |

## 5. Sources and Obligations

| Source          | Emits                                                     |
|-----------------|-----------------------------------------------------------|
| `orchestrator`  | mission events, stage changes, scheduling, retries, briefing, abort |
| `risk_assessment` / `victim_localization` / `resource_coordination` / `knowledge_retrieval` | per-cycle completion summary, own report writes |
| `simulation`    | tick summary, event fired, packet batch emitted           |
| `hitl`          | decision raised/resolved/timeout                          |
| `system`        | config load, registry validation, startup/shutdown        |

## 6. Sinks

| Sink        | Default | Purpose                                                          |
|-------------|---------|------------------------------------------------------------------|
| In-memory ring buffer (`MissionState.logs`, bounded) | yes | Live state, API `GET logs`, CLI display |
| JSONL file  | optional | Durable audit trail; one line per record; configured path        |
| Console (pretty) | dev    | Human-readable CLI output during development                     |

Ring buffer size default 1,000 entries (config `logging.buffer_size`). JSONL write is async and
batched; failures emit an `ERROR` but never block the pipeline.

## 7. Correlation

- **`mission_id`** on every record — required.
- **`trace_id`** groups a graph execution: `GRAPH-<n>` for the orchestrator run, `CYC-<n>` per
  agent cycle. Retries reuse the cycle trace; each retry attempt increments a nested counter.
- The API can filter logs by `mission_id`, `trace_id`, `level`, `source`, and time range.

## 8. Redaction & Security

- Provider API keys, tokens, and file paths that reveal secrets are redacted at the sink boundary
  (`***`) before persistence.
- Free-text `message` is generated from templates; raw payloads never embed key material.
- JSONL files honor the same redaction rules as in-memory logs.

## 9. Evidence Chain (Compliance)

MEMORY.md requires: all sensor data logged with timestamp; agent outputs linked to source evidence;
audit trail for compliance. Achieved via:

1. **Ingest:** each telemetry/evidence append generates a `DEBUG`/`INFO` log with `packet_id` /
   evidence `source` in context.
2. **Agent linkage:** each `AgentOutput` (MISSION_STATE.md §4.6) is linked by `cycle_id`; the
   completion log records `trace_id` and the evidence snapshot it used (`as_of`).
3. **Timeline:** `MissionState.timeline` events mirror the audit trail in mission-clock order.
4. **Export:** `GET /api/missions/{id}/logs` returns the full ordered record set for external
   compliance tooling.

## 10. CLI Migration

`backend/run.py` currently prints ASCII banners. Phase 1B keeps the CLI as a consumer of the log
subsystem: it renders `INFO`+ records as the existing banners/tables (presentation only), so the
CLI output remains identical for demos while the data path is structured.

## 11. Validation & Testing

- Every record validates against the §3 schema.
- Correlation invariants: all records for a mission share its `mission_id`; retry attempts share
  the cycle `trace_id`.
- Redaction unit tests: key material never appears in any sink output.
- Non-blocking test: a high-volume tick burst does not exceed a fixed logging latency budget.
