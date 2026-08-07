# Inzora Terra OS — Migration Plan (Current → Phase 1 Target)

**Spec version:** 1.0 (Phase 1A)
**Status:** Design — the executable ordering reference for Phase 1B
**Rule:** every step must keep `python -m backend.run`, `npm run build`, and `npm run lint`
green; the CLI demo must not regress at any commit.

## 1. Goal

Evolve the working-but-sequential backend into the architecture specified by MISSION_STATE,
MISSION_LIFECYCLE, ORCHESTRATOR, AGENT_CONTRACT, DEPENDENCY_GRAPH, SIMULATION_SPEC, LOGGING_SPEC,
API_SPEC, and CONFIGURATION_SPEC. No rewrite-from-scratch; each current module is migrated to its
target role.

## 2. Current → Target Mapping

| Current module                              | Target role (spec)                                              |
|---------------------------------------------|------------------------------------------------------------------|
| `backend/core/gop.py` `TERRAState`          | `MissionState` (MISSION_STATE.md) — superset, compat accessors  |
| `backend/core/config.py`                    | Settings object, namespaced groups (CONFIGURATION_SPEC.md)      |
| `backend/core/tools.py` static getters      | Telemetry simulation layer (SIMULATION_SPEC.md); getters become fallback |
| `backend/interfaces/protocol.py`            | Agent contract (AGENT_CONTRACT.md) — metadata + permissions     |
| `backend/agents/base.py`                    | Contract base class (AGENT_CONTRACT.md §9)                      |
| `backend/agents/{risk,victim,resource,knowledge}/agent.py` | Contract-conformant agents (report alignment, HITL helpers, dedupe) |
| `backend/orchestration/orchestrator.py`     | Mission-conducting orchestrator (ORCHESTRATOR.md) + graph executor |
| `backend/run.py`                            | CLI as a consumer of lifecycle API + logging (LOGGING_SPEC §10) |
| `frontend/src/App.jsx`                      | Backend API + SSE consumer (Phase 1C, after backend lands)      |
| (new)                                        | Graph definition, EventSink/logging, Mission Assistant stub    |
| (new, Phase 1C)                              | API server (API_SPEC.md)                                        |

## 3. Migration Order (dependency-ordered)

Each step ends in a working, verifiable state.

### Step 1 — Configuration (low risk)
- Replace `config.py` with the namespaced settings object (CONFIGURATION_SPEC §3).
- Keep backward-compatible bare env keys (`LLM_PROVIDER`, `GROQ_API_KEY`, …) as defaults.
- Update `.env.example`.
- **Validate:** settings load from env; unknown provider fails fast; CLI still runs.

### Step 2 — MissionState (core data, foundation)
- Introduce `MissionState` as a superset of `TERRAState` (MISSION_STATE §8): keep all field names,
  add `metadata`, `status`, `telemetry`, `environment`, `timeline`, `human_decisions`, `logs`,
  `summary`, `assistant_context`.
- Provide compat accessors (`pending_confirmations` ↔ `human_decisions`; keep `tasks`).
- Keep `TERRAState` alias in place so agents compile unchanged during this step.
- **Validate:** unit tests on append-only rules + serialization; `python -m backend.run` unchanged.

### Step 3 — Logging / EventSink (cross-cutting)
- Implement structured log record + EventSink (LOGGING_SPEC §3–§6) with ring buffer + JSONL sink.
- Route `orchestrator.agent_log` and CLI `print`s through the sink (presentation preserved).
- **Validate:** logs schema-valid; redaction tests pass; CLI output visually unchanged.

### Step 4 — Agent Contract alignment (medium risk)
- Add identity (description, capabilities, version) + read/write sets to the four agents.
- Align reports to MISSION_STATE §4.7 (`as_of`, `cycle_id`).
- Replace direct `pending_confirmations` writes with state HITL helpers; add task/HITL dedupe.
- Keep perceive/reason/act bodies; only signatures/metadata change.
- **Validate:** each agent unit test passes; full CLI run passes.

### Step 5 — Dependency Graph + GraphExecutor (core change)
- Define the DAG declaratively (DEPENDENCY_GRAPH §5); validate (acyclic, one sink).
- Implement GraphExecutor level-parallel scheduling (ORCHESTRATOR §4) with timeout/retry/fallback.
- Rewrite `orchestrator.py` to the lifecycle API (`start`, `ingest`, `run_graph`, `await_hitl`,
  `finalize`, `abort`); CLI calls these.
- **Validate:** concurrency tests (L1 parallel, L2 blocked until L1 done, briefing after L2);
  end-to-end CLI run identical briefing to before.

### Step 6 — Lifecycle + HITL Gate (medium risk)
- Implement stage state machine (MISSION_LIFECYCLE) driven by the executor.
- Implement `HitlGate` triggers (risk > 0.8, confidence < 0.5, multi-HIGH, confirmations) and
  decision lifecycle (`confirmed`/`overridden`/`timeout`).
- **Validate:** state-machine unit tests; HITL flow test (pending → resolve → completed);
  CLI shows confirmation states (as today, now backed by real gate).

### Step 7 — Telemetry Simulation layer (medium risk)
- Implement PacketEmitter, SensorModel, EventScheduler, WeatherModel, scenario presets
  (SIMULATION_SPEC §4–§6); packet schema validator.
- Orchestrator ingests from generator; `environment` derived; `tools.py` demoted to fallback.
- **Validate:** determinism (same seed → same stream); schema compliance; agents read unchanged
  `environment` shape; CLI still produces a briefing.

### Step 8 — Mission Assistant stub (low risk)
- Add read-only assistant over mission state returning `response`, `cited_references`, `confidence`
  (MISSION_STATE §4.13, API §3.6). Rule-based in Phase 1 (prototype, not RAG).

### Step 9 — API server (Phase 1C; behind backend stability)
- Implement API_SPEC routes over the orchestrator lifecycle + SSE telemetry stream.
- In-memory mission registry; no auth (loopback default).
- **Validate:** contract tests per route; SSE resume via `Last-Event-ID`.

### Step 10 — Frontend integration (Phase 1C)
- `App.jsx` consumes the API + SSE (replaces mock data); confirmation panel + assistant drawer.

## 4. Risk Register

| Step | Risk | Mitigation |
|------|------|-----------|
| 2    | Report key drift breaks agents | Superset-only fields; compat accessors; agents frozen until Step 4 |
| 5    | Parallelism races on shared state | Read-consistency snapshots (ORCHESTRATOR §4.4); single writer per report |
| 5    | Retry loop instability | Backoff + max_retries; level timeout caps total run |
| 6    | HITL blocks demo | Timeout_action `escalate` default (auto-approve) keeps demo moving |
| 7    | Determinism lost | Seeded generator; replay tests |
| 9    | SSE reconnect bugs | `Last-Event-ID` resume; event seq monotonic |

## 5. Validation Gates (every step)

1. `python -m backend.run` exits 0 and prints a briefing.
2. `cd frontend && npm run build` passes (unchanged until Step 10).
3. `cd frontend && npm run lint` clean.
4. Backend unit tests for the step's spec (added alongside implementation).
5. No secrets in logs or `.env.example`; `.gitignore` intact.

## 6. Backward Compatibility Notes

- Bare env keys accepted through Step 1; deprecated warnings, removal deferred.
- `TERRAState` name kept as alias through Step 4; removed in Step 5 once agents are re-pointed.
- `tools.py` getters stay importable as fallback source forever (tests + offline mode).
- CLI output format (banners/tables) is preserved through Step 8; Step 9+ optionally swaps the CLI
  to hit the API for dogfooding.

## 7. Definition of Done (Phase 1)

- [ ] All 10 specs reflected in code (no spec-only stragglers).
- [ ] Orchestrator executes the dependency graph concurrently with retry/fallback.
- [ ] Mission lifecycle + HITL gate behave per spec (unit-tested).
- [ ] Telemetry simulation streams packets deterministically; agents consume derived environment.
- [ ] Structured logging with evidence-chain linkage and redaction.
- [ ] API server (Step 9) + frontend SSE integration (Step 10) complete the loop.
- [ ] CLI, backend tests, `npm run build`, `npm run lint` all green.
