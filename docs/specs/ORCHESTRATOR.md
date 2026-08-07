# Inzora Terra OS — Orchestrator Design

**Spec version:** 1.0 (Phase 1A)
**Status:** Design — implementation reference for Phase 1B
**Target:** rework of `backend/orchestration/orchestrator.py` (currently sequential)

## 1. Purpose

The Orchestrator is the mission conductor. It owns the lifecycle state machine, schedules agents
over the dependency graph, enforces timeouts/retries, applies fallbacks, generates the mission
briefing, and gates completion on Human-in-the-Loop decisions. It is the **only** component that
creates a mission and calls agents.

## 2. Responsibilities

1. Create and own the `MissionState` instance.
2. Drive `MissionState.status` through MISSION_LIFECYCLE.md.
3. Schedule agent cycles according to DEPENDENCY_GRAPH.md (level-parallel execution).
4. Enforce per-agent timeout, retry, and cancellation policy.
5. Apply fallback data when an agent fails after retries.
6. Generate the final briefing (`summary`) from owned reports.
7. Raise HITL confirmation requests per AGENTS.md triggers; gate completion on them.
8. Maintain the event timeline and structured logs (LOGGING_SPEC.md).

## 3. Architectural Components

```
┌─────────────────────────────────────────────────────────────────────┐
│  Orchestrator                                                        │
│  ┌────────────────┐  ┌──────────────────┐  ┌──────────────────────┐ │
│  │ MissionFactory │  │ GraphExecutor    │  │ BriefingGenerator    │ │
│  │  - create()    │  │  - schedule()    │  │  - build_briefing()  │ │
│  │  - ingest()    │  │  - wait()        │  │  - aggregate_conf()  │ │
│  └────────────────┘  │  - cancel()      │  └──────────────────────┘ │
│                      └──────────────────┘                           │
│  ┌────────────────┐  ┌──────────────────┐  ┌──────────────────────┐ │
│  │ RetryPolicy    │  │ HitlGate         │  │ EventSink            │ │
│  │  - attempt()   │  │  - raise()       │  │  - emit_timeline()   │ │
│  │  - backoff()   │  │  - await_ok()    │  │  - log()             │ │
│  └────────────────┘  └──────────────────┘  └──────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

| Component            | Responsibility                                                        |
|----------------------|-----------------------------------------------------------------------|
| `MissionFactory`     | Allocates `mission_id`, sets metadata, ingests evidence, wires simulation/telemetry |
| `GraphExecutor`      | Executes agents level-by-level over the DAG, in parallel, with timeout |
| `BriefingGenerator`  | Aggregates owned reports + confidence into `summary`                  |
| `RetryPolicy`        | Retry count, backoff, fallback source (configurable)                  |
| `HitlGate`           | Creates `human_decisions`, waits for resolution within timeout        |
| `EventSink`          | Single point for timeline events + structured logs                    |

The GraphExecutor is deliberately the only thing that talks to agents; everything else touches
only `MissionState`.

## 4. Execution Semantics (replaces the sequential loop)

### 4.1 Level scheduling

The dependency graph (DEPENDENCY_GRAPH.md) is flattened into **levels**:

| Level | Agents                     | Fires when                |
|-------|----------------------------|---------------------------|
| L1    | risk_assessment, victim_localization | `evidence_ingested` |
| L2    | resource_coordination, knowledge_retrieval | both L1 complete |
| L3    | BriefingGenerator          | both L2 complete          |

The executor iterates levels; within a level all agents run **concurrently**.

### 4.2 Concurrency model

- Each agent runs as an independent async task (`asyncio.create_task`).
- The executor waits for the **whole level** with a level timeout:
  `wait = ALL_COMPLETED` over `{agent_task: timeout}`.
- Any agent that exceeds its per-agent timeout is treated as failed for that attempt.
- Level completion condition: **all** agents in the level finished `ok` (after their own
  retries/fallbacks). A level never partially proceeds.

### 4.3 Cycle wrapper

Each agent invocation is wrapped by the executor:

1. Emit `agent_start` timeline event.
2. Call `agent.run(state)`.
3. On success: write `AgentOutput` (`status: ok`), emit `agent_complete`, update `status.stage`.
4. On exception/timeout: apply RetryPolicy, then Fallback, then `agent_failed` event.

The agent's own `perceive/reason/act` side effects (report writes, tasks, confirmations) are
unchanged — the executor only governs *when and how many times* `run()` is called.

### 4.4 Read-consistency snapshot

Before dispatching a level, the executor hands each agent a **read-consistent snapshot** of the
fields it may read (per MISSION_STATE.md §6 permission matrix). This prevents one L1 agent from
observing a half-updated L1 sibling. Writes go back to the live state.

## 5. Failure, Retry & Fallback

| Policy          | Default | Config key (CONFIGURATION_SPEC.md) |
|-----------------|---------|-------------------------------------|
| Per-agent timeout | 30s    | `orchestrator.agent_timeout`        |
| Max retries      | 2       | `orchestrator.max_retries`          |
| Backoff          | linear 1s, 2s | `orchestrator.retry_backoff_base` |
| Fallback         | simulated data (existing `tools.py` output shape) | `orchestrator.fallback_source` |

Flow:

1. `run()` raises or times out → if `attempt < max_retries`: backoff, retry, timeline `agent_retry`.
2. Retries exhausted → if fallback enabled: write fallback `AgentOutput` (`status: fallback`),
   continue mission; confidence for that agent is capped at 0.4 (forcing the < 0.5 HITL trigger).
3. Fallback unavailable → `status.error_count += 1`; if the level cannot complete, mission →
   `errored` (see MISSION_LIFECYCLE.md §8).

## 6. HITL Gate (`HitlGate`)

- After L2 completes and the briefing is generated (`briefing_ready`), the gate inspects
  `human_decisions` and `confidence_scores`.
- Triggers (AGENTS.md):
  - `risk_score > 0.8` → `confirm` request.
  - `confidence < 0.5` for any agent → `verify` request.
  - `>1` HIGH zone → `approve` request for resource allocation.
  - HIGH task with `requires_confirmation` → `confirm` request linked to task.
- If any request is pending → state `awaiting_confirmation`; wait up to `hitl.timeout`
  (default 120s); resolve timeouts per policy; then finalize → `completed`.
- The gate never mutates reports; it only resolves decision records and re-finalizes.

## 7. Briefing Generation

`BriefingGenerator` produces `summary` (MISSION_STATE.md §4.12). Rules:

- `overall_risk` = worst risk likelihood across zones/report.
- `priority_zones` = HIGH-priority zones from `victim_map`.
- `immediate_actions` = top 3 `knowledge_results.recommendations`.
- `resource_status` = `Deployed` if `resource_allocation.assignments` non-empty else `Pending`.
- `needs_human_review` = any pending `human_decisions`.
- Confidence aggregation: mean of all `confidence_scores`; also expose per-agent scores.

## 8. Public Lifecycle API (implemented in Phase 1B)

```
start(incident_text)      -> mission_id          (MissionFactory: created → initialized)
ingest(evidence_bundle)   -> None                 (→ evidence_ingested)
run_graph()               -> None                 (executes L1 → L2 → briefing; sets briefing_ready)
await_hitl()              -> None                 (if needed; → awaiting_confirmation → completed)
get_state()               -> MissionState         (read-only view for CLI/API)
abort(reason)             -> None                 (→ aborted)
```

The CLI calls these in sequence; the API server (API_SPEC.md) calls the same methods, so there is
**one orchestrator implementation** shared by both entry points.

## 9. Logging & Timeline Obligations

Every orchestrator action emits to the EventSink:

- `mission_start`, `stage_change {from, to}`, `agent_start`, `agent_complete`, `agent_retry`,
  `agent_failed`, `hitl`, `re_run`, `mission_complete`.
- Structured logs at `INFO` (normal flow), `WARNING` (retry/fallback), `ERROR` (final failure).

## 10. Non-Goals (Phase 1)

- No cross-mission scheduling or queueing.
- No persistent mission store (API server holds in-memory registry; persistence deferred).
- No dynamic agent registration UI; the registry is code-defined in Phase 1.
