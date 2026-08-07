# Inzora Terra OS — Mission Lifecycle

**Spec version:** 1.0 (Phase 1A)
**Status:** Design — implementation reference for Phase 1B
**Applies to:** `MissionState.status.stage` and `.phase` (see MISSION_STATE.md §4.2)

## 1. Purpose

Defines the formal state machine every mission travels through, including the Human-in-the-Loop
(HITL) branch mandated by BLUEPRINT v1.1 and AGENTS.md. It replaces the current ad-hoc stage
strings (`initialized` → `risk_assessed` → `victims_localized` → `resources_allocated` →
`knowledge_queried` → `complete`) with a well-defined, testable lifecycle.

## 2. State Machine Overview

```
                    ┌────────────────────────────────────────────────┐
                    │              created (metadata set)            │
                    └───────────────────────────┬────────────────────┘
                                                │ mission.start()
                                                v
                    ┌────────────────────────────────────────────────┐
                    │              initialized                       │
                    └───────────────────────────┬────────────────────┘
                                                │ evidence ingested
                                                v
                    ┌────────────────────────────────────────────────┐
                    │              evidence_ingested                 │
                    └───────────────────────────┬────────────────────┘
                                                │ dependency graph L1 fires
                                                v
      ┌──────────────────────────────────────────┴───────────────────────────────┐
      │                                                                           │
      v                                                                           v
risk_assessed                                              victims_localized
      │                                                                           │
      └──────────────────────────┬──────────────────────────────┬─────────────────┘
                                 v                              v
            resources_allocated                  knowledge_queried
                                 │                              │
                                 └──────────────┬───────────────┘
                                                v
                    ┌────────────────────────────────────────────────┐
                    │              briefing_ready                    │
                    └───────────────────────────┬────────────────────┘
                                                │ pending confirmations?
                                      ┌─────────┴─────────┐
                                      │ yes               │ no
                                      v                   v
                            ┌────────────────────┐   ┌──────────────┐
                            │ awaiting_confirmation│  │  completed   │
                            │    (HITL review)    │   └──────────────┘
                            └─────────┬──────────┘
                                      │ confirmed/overridden/timeout
                                      v
                            ┌────────────────────┐
                            │      completed     │
                            └────────────────────┘

  (aborted / errored are reachable from any running state)
```

## 3. States

| Stage                  | Phase     | Meaning                                                        | Terminal |
|------------------------|-----------|----------------------------------------------------------------|----------|
| `created`              | setup     | Mission identity + metadata written, no work started           | no       |
| `initialized`          | ingest    | State object ready; incident text set                           | no       |
| `evidence_ingested`    | ingest    | Evidence + first telemetry snapshot captured                    | no       |
| `risk_assessed`        | assess    | Risk Assessment completed (L1)                                  | no       |
| `victims_localized`    | assess    | Victim Localization completed (L1)                              | no       |
| `resources_allocated`  | coordinate| Resource Coordination completed (L2)                            | no       |
| `knowledge_queried`    | coordinate| Knowledge Retrieval completed (L2)                              | no       |
| `briefing_ready`       | report    | Orchestrator produced the mission briefing                      | no       |
| `awaiting_confirmation`| review    | HITL — at least one confirmation pending                        | no       |
| `completed`            | done      | All work + human review resolved                                | yes      |
| `aborted`              | done      | Mission cancelled by supervisor/system                          | yes      |
| `errored`              | done      | Unrecoverable execution failure                                  | yes      |

## 4. Transitions

| From                 | Event / Trigger                                        | To                    | Guard |
|----------------------|--------------------------------------------------------|-----------------------|-------|
| `created`            | mission start called with incident text                | `initialized`         | incident text non-empty |
| `initialized`        | evidence ingestion completes                            | `evidence_ingested`   | ≥1 evidence entry |
| `evidence_ingested`  | L1 agents dispatched                                    | `risk_assessed`       | risk agent completes |
| `evidence_ingested`  | L1 agents dispatched                                    | `victims_localized`   | victim agent completes |
| `risk_assessed` AND `victims_localized` | both L1 complete  | (orchestrator fires L2) | — |
| `risk_assessed`, `victims_localized` | L2 resource dispatched   | `resources_allocated` | — |
| `risk_assessed`, `victims_localized` | L2 knowledge dispatched   | `knowledge_queried`   | — |
| `resources_allocated` AND `knowledge_queried` | both L2 complete | `briefing_ready` | — |
| `briefing_ready`     | pending confirmations exist                             | `awaiting_confirmation` | ≥1 `human_decisions` status `pending` |
| `briefing_ready`     | no pending confirmations                               | `completed`           | none pending |
| `awaiting_confirmation` | all decisions resolved (confirmed/overridden/timeout) | `completed`         | none pending |
| any running state    | supervisor aborts                                      | `aborted`             | — |
| any running state    | unrecoverable failure + no fallback possible            | `errored`             | — |

## 5. Lifecycle Rules

1. **Stage is monotonic toward completion** except for re-runs: the orchestrator may re-run an
   agent (re-trigger a transition) which rolls `stage` back to the earliest incomplete state of
   that phase, but never below `evidence_ingested`. Rollbacks are recorded on the timeline as
   `re_run`.
2. **`phase` derives from `stage`** and is stored for cheap UI grouping. It is updated atomically
   with `stage`.
3. **Every transition appends a timeline event** of type `stage_change` with `{from, to}` — this
   is the mission audit trail.
4. **Concurrent states are normal.** Because L1 agents run in parallel, the state machine may
   briefly hold `risk_assessed` while `victims_localized` is still pending. The orchestrator
   treats the **set** of completed stages as the actual condition for firing the next level (see
   ORCHESTRATOR.md §4 scheduling semantics). `status.stage` reflects the latest completed
   transition and `is_running` stays `true` until a terminal state.
5. **Failure does not immediately terminalize.** A failed agent triggers a retry or fallback
   first (ORCHESTRATOR.md §5). `errored` is only entered when retry policy is exhausted and no
   fallback data is available.

## 6. Human-in-the-Loop Branch (`awaiting_confirmation`)

Replaces the current implicit `pending_confirmations` with the explicit decision workflow from
BLUEPRINT v1.1.

### 6.1 When HITL fires

- **Risk score > 0.8** → raise a `confirm` request, alert supervisor.
- **Any agent confidence < 0.5** → raise a `verify` request, request manual verification.
- **Multiple HIGH-risk zones** → raise an `approve` request, request resource allocation approval.
- A HIGH-priority task with `requires_confirmation` (existing `Task.confirmed` semantics) also
  raises a `confirm` request linked to that task.

### 6.2 Decision lifecycle

```
pending ──┬── supervisor confirms ────────────► confirmed
          ├── supervisor overrides ────────────► overridden
          └── timeout (config, default 120s) ───► timeout (resolved_by = system)
```

| Transition        | Effect on mission                                                       |
|-------------------|-------------------------------------------------------------------------|
| `confirmed`       | Approved as-is; related task marked confirmed; pipeline may proceed     |
| `overridden`      | Supervisor changed the decision; orchestrator applies override action   |
| `timeout`         | System default action applied (e.g. escalate to next-priority); logged  |

### 6.3 Rules

- `awaiting_confirmation` does not block the simulation or telemetry collection — only mission
  completion is gated.
- A decision on one request may auto-resolve dependents (e.g. approving resource allocation
  confirms the linked HIGH tasks).
- Every decision is appended to `human_decisions` and mirrored to `timeline` (`type: hitl`).
- Timeout duration, and whether timeouts auto-approve or auto-escalate, is configuration
  (CONFIGURATION_SPEC.md §7).

## 7. Mission Completion

`completed` requires:

1. `stage == briefing_ready` (briefing generated), **and**
2. zero `human_decisions` in `pending`.

On completion the orchestrator:

- writes the final `summary`,
- appends a `mission_complete` timeline event,
- records `metadata.updated_at`,
- leaves `telemetry`/`timeline` open for monitoring until the mission is closed.

## 8. Abort & Error

- **Abort** (`aborted`): supervisor-triggered or system-triggered (e.g. duplicate mission).
  Running agent cycles are cancelled. Partial outputs remain in state for post-incident review.
- **Error** (`errored`): entered only after retry + fallback exhaustion. The last error is
  recorded in `status.last_error`, `error_count` incremented, and a `CRITICAL` log entry written.
- Both terminal states are immutable: no further transitions are permitted.

## 9. Relationship to CLI

The CLI (`python -m backend.run`) currently drives states implicitly. Post-migration it will call
the orchestrator's lifecycle API (`start`, `ingest`, `run_graph`, `finalize`) instead of mutating
`stage` strings directly, so the CLI and the future API server share one lifecycle implementation.
