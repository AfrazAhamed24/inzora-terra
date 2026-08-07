# Inzora Terra OS — API Specification

**Spec version:** 1.0 (Phase 1A)
**Status:** Design — implementation reference for Phase 1B (no code yet)
**Framing:** No framework or HTTP library is chosen here. This spec fixes the **contract** (routes,
payloads, status codes, streaming semantics) so the frontend can build against it and Phase 1B
can implement it in any async Python server (FastAPI is the intended candidate, not yet decided).

## 1. Purpose

Defines the HTTP surface the React command-center consumes to drive a mission and render live
data. It is the first real backend ↔ frontend contract (currently the frontend runs on mock data).

## 2. General Conventions

- **Base path:** `/api`.
- **Content type:** `application/json` unless streaming (SSE).
- **IDs:** `mission_id` format `MISS-YYYYMMDD-NNN`; packet `TELE-<n>`; cycle `CYC-<n>`;
  decision `DEC-<n>`.
- **Timestamps:** UTC ISO-8601.
- **Error body:** `{ "error": { "code": string, "message": string } }`.
- **Pagination:** offset/limit query params for list endpoints.
- **Casing:** `snake_case` everywhere (matches state schema).

## 3. Endpoints

### 3.1 Missions

| Method | Path                    | Purpose                                   |
|--------|-------------------------|-------------------------------------------|
| POST   | `/api/missions`         | Create + start a mission                  |
| GET    | `/api/missions`         | List missions (lightweight)               |
| GET    | `/api/missions/{id}`    | Full `MissionState` document              |
| DELETE | `/api/missions/{id}`    | Abort/close a mission (idempotent)        |

#### POST `/api/missions`
Request:
```json
{ "incident_text": "Two-floor building collapsed after heavy rainfall. 3 missing persons.",
  "environment_id": "scenario_collapse_rain" }
```
Behavior: creates state, ingests initial evidence, starts the graph executor asynchronously.
Response `201`:
```json
{ "mission_id": "MISS-2026-0815-001", "status": { "stage": "evidence_ingested",
  "phase": "ingest", "is_running": true }, "location": "/api/missions/MISS-2026-0815-001" }
```

#### GET `/api/missions/{id}`
Returns the full serialized `MissionState` (MISSION_STATE.md §7). `200`; `404` unknown id.

### 3.2 Status & Briefing

| Method | Path                          | Purpose                             |
|--------|-------------------------------|-------------------------------------|
| GET    | `/api/missions/{id}/status`   | Live status (stage, phase, flags)   |
| GET    | `/api/missions/{id}/briefing` | Final `summary` once `briefing_ready` |
| GET    | `/api/missions/{id}/timeline` | Ordered timeline events (paged)     |

#### GET `/api/missions/{id}/status`
```json
{ "mission_id": "MISS-2026-0815-001",
  "status": { "stage": "awaiting_confirmation", "phase": "review",
              "is_running": true, "error_count": 0, "last_error": null },
  "pending_decisions": 2 }
```

#### GET `/api/missions/{id}/briefing`
`200` once `stage >= briefing_ready`; `409` with `code: "BRIEFING_NOT_READY"` otherwise.
```json
{ "mission_briefing": { "incident_id": "MISS-2026-0815-001", "overall_risk": "HIGH",
    "priority_zones": ["B2"], "total_victims_estimated": 2,
    "immediate_actions": ["Evacuate all non-essential personnel immediately"],
    "resource_status": "Deployed", "next_update_in": "15 minutes" },
  "confidence_scores": { "risk_assessment": 0.92, "victim_localization": 0.78,
    "resource_coordination": 0.88, "knowledge_retrieval": 0.7 },
  "needs_human_review": true, "generated_at": "2026-08-15T08:00:04Z" }
```

### 3.3 Telemetry (streaming)

| Method | Path                          | Protocol | Purpose                               |
|--------|-------------------------------|----------|---------------------------------------|
| GET    | `/api/missions/{id}/telemetry`| SSE      | Live packet stream + environment deltas |

SSE event names:
- `telemetry_packet` → a telemetry packet object.
- `environment` → derived environment snapshot delta.
- `stage_change` → `{from, to}`.
- `hitl` → new/updated `human_decisions` record.
- `briefing_ready` → the summary.
- `error` → stream/execution error.

Client resumes from a `Last-Event-ID` equal to the last `packet_id`/`event_seq` to receive the
delta without replaying the whole stream.

### 3.4 Logs

| Method | Path                      | Purpose                                    |
|--------|---------------------------|--------------------------------------------|
| GET    | `/api/missions/{id}/logs` | Structured log records, filters + paging   |

Query params: `level`, `source`, `trace_id`, `offset`, `limit`, `from`, `to`.

### 3.5 Human-in-the-Loop

| Method | Path                             | Purpose                              |
|--------|----------------------------------|--------------------------------------|
| POST   | `/api/missions/{id}/decisions`   | Submit a supervisor decision         |

Request:
```json
{ "decision_id": "DEC-3", "action": "confirm" | "override",
  "notes": "Deploy Bravo to B2 immediately" }
```
Behavior: resolves the pending record per MISSION_LIFECYCLE.md §6. `200` on resolved; `409` if
the decision is not pending; `404` unknown id.

### 3.6 Assistant (Mission Assistant)

| Method | Path                          | Purpose                                          |
|--------|-------------------------------|--------------------------------------------------|
| POST   | `/api/missions/{id}/assistant`| Ask the assistant a question about this mission  |

Request: `{ "query": "What are the priority zones and why?" }`
Response:
```json
{ "response": "Zone B2 (basement) is the primary search zone...",
  "cited_references": ["SOP-003", "IBC-2021-1604", "victim_map"],
  "confidence": 0.85 }
```
The assistant is read-only over mission state (AGENT_CONTRACT.md / MISSION_STATE.md §4.13). It is
the **sole conversational surface** (BLUEPRINT v1.1) — no per-agent chat endpoints.

### 3.7 System

| Method | Path            | Purpose                                    |
|--------|-----------------|--------------------------------------------|
| GET    | `/api/health`   | Liveness + config summary (no secrets)     |

```json
{ "status": "ok", "version": "1.0",
  "simulation": { "source": "simulated", "scenario": "scenario_collapse_rain" },
  "llm_provider": "groq" }
```

## 4. Status Codes

| Code | Meaning                                             |
|------|-----------------------------------------------------|
| 200  | OK                                                  |
| 201  | Mission created                                     |
| 400  | Malformed request / invalid enum                    |
| 404  | Unknown `mission_id` / `decision_id`                |
| 409  | State conflict (`BRIEFING_NOT_READY`, decision not pending, aborted mission) |
| 500  | Unhandled server error                              |

## 5. Concurrency & State

- The API server holds an in-memory mission registry (mission_id → orchestrator). Persistence is
  deferred (non-goal for Phase 1).
- All writes go through the orchestrator lifecycle methods (ORCHESTRATOR.md §8) — the API layer
  never mutates state directly.
- SSE handlers subscribe to the mission's event stream; multiple clients per mission are allowed.

## 6. Security (demo vs production)

- **Demo (Phase 1):** no auth; bind to `127.0.0.1` by default; CORS allowlist configurable.
- **Production:** reverse-proxy termination, API-key auth for `POST` routes, per-mission ACLs.
- **Never** expose API keys in responses (health/config redact secrets — LOGGING_SPEC §8).

## 7. Frontend Integration Contract

The frontend (React + Vite) will:
1. `POST /api/missions` to start a mission.
2. Subscribe to `GET /api/missions/{id}/telemetry` (SSE) for live packets, stage changes, HITL, briefing.
3. `GET /api/missions/{id}/briefing` on `briefing_ready`.
4. `POST /api/missions/{id}/decisions` from the confirmation panel.
5. `POST /api/missions/{id}/assistant` for the assistant drawer.

Frontend adapters must tolerate SSE reconnect + resume (`Last-Event-ID`).

## 8. Non-Goals (Phase 1)

- No auth, no multi-tenant isolation, no persistence, no file upload.
- No per-agent HTTP endpoints (single orchestrator entry).
- No websocket (SSE is sufficient for one-way streams; bidirectional is deferred).
