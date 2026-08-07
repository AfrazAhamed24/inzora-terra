# Inzora Terra OS — Universal Agent Contract

**Spec version:** 1.0 (Phase 1A)
**Status:** Design — implementation reference for Phase 1B
**Targets:** `backend/interfaces/protocol.py`, `backend/agents/base.py`, and the four concrete agents

## 1. Purpose

Defines the single contract every agent implements so the GraphExecutor (ORCHESTRATOR.md) can
schedule any agent uniformly. It preserves the existing `perceive → reason → act` decomposition
(so current agent bodies keep working) while adding the metadata and guarantees the orchestrator,
HITL gate, logging, and Mission Assistant require.

## 2. Contract Overview

```
Agent
├── identity         name, version, description, capabilities[]
├── lifecycle        perceive() → reason() → act()   (unchanged pipeline)
├── permissions      reads[] / writes[]               (MISSION_STATE.md §6)
├── confidence       confidence property (0.0–1.0)
└── obligations      side effects, failure contract, idempotency
```

### 2.1 Identity

| Field          | Type     | Description                                              |
|----------------|----------|----------------------------------------------------------|
| `name`         | string   | Stable slug, e.g. `risk_assessment` — the registry key    |
| `version`      | string   | Agent implementation version (`1.0`)                     |
| `description`  | string   | One-line capability statement (used by Mission Assistant) |
| `capabilities` | string[] | Feature tags, e.g. `["structural", "sensor"]`             |

### 2.2 Pipeline (perceive → reason → act)

Kept as-is from today's `AgentProtocol`/`BaseAgent`:

1. **`perceive(gop) → perception`** — gather only the read-permitted fields into a flat dict.
2. **`reason(perception, gop) → decision`** — pure computation; must not write to state. Decision
   carries `{"action": <token>, ...}` and MUST include `confidence` when applicable.
3. **`act(decision, gop) → result`** — apply the decision: write owned report, update confidence,
   add tasks / HITL requests, advance `status.stage`.

`run(gop)` executes the pipeline and returns the result. The orchestrator calls only `run()`.

## 3. Read/Write Contract (per agent)

From MISSION_STATE.md §6 — each agent declares its reads and writes explicitly. The orchestrator
uses these for the read-consistency snapshot (§4.4 of ORCHESTRATOR.md) and validation.

| Agent                 | Reads                                            | Writes                                   |
|-----------------------|--------------------------------------------------|------------------------------------------|
| `risk_assessment`     | telemetry, environment (sensors/weather/building), evidence | `risk_report`, tasks (evac/monitor), `confidence_scores`, HITL `confirm` |
| `victim_localization` | telemetry, environment (thermal/GPR), evidence (witness) | `victim_map`, tasks (search), HITL `confirm` |
| `resource_coordination`| `risk_report`, `victim_map`, tasks               | `resource_allocation`, tasks (deploy), HITL `approve` |
| `knowledge_retrieval` | `risk_report`, `victim_map`, environment (building) | `knowledge_results`, `confidence_scores` |

**Hard rules:**
- An agent may only write to its declared write set; writing another agent's report is a contract
  violation (logged at `ERROR`, treated as a failed cycle).
- Agents **never** communicate directly — all data flows through `MissionState`.

## 4. Confidence

- `confidence` is a 0.0–1.0 float output by `reason`/`act` and stored in `confidence_scores` and
  `agent_outputs`.
- Semantics: strength of the evidence-backed claim, not certainty of a fact.
- Orchestrator aggregate: mean; HITL verification triggers at `< 0.5` (AGENTS.md).
- Fallback cycles are capped at `confidence = 0.4`.

## 5. Failure Contract

| Condition             | Behavior                                                             |
|------------------------|----------------------------------------------------------------------|
| `perceive` raises     | Cycle fails; orchestrator retry/fallback (ORCHESTRATOR.md §5)         |
| `reason` raises       | Same as above                                                         |
| `act` raises          | Same; partial writes are acceptable (reports are overwritten, append-only lists may keep a partial entry) |
| Timeout (agent hangs) | Orchestrator cancels the task; treated as failure                     |
| Contract violation    | Write to undeclared field → `ERROR` log + failed cycle                |
| `act` wants to add HITL | Adds a `human_decisions` record via the state helper, not directly |

## 6. Side-Effect Rules

1. **Tasks:** agents may append tasks (existing `Task` semantics: `priority`, `requires_confirmation`,
   `confirmed`). HIGH-priority `requires_confirmation` tasks imply a HITL `confirm` request.
2. **HITL:** agents never resolve decisions — only `HitlGate`/supervisor resolves them.
3. **Stage advancement:** agents set their own `status.stage` to their completion token
   (`risk_assessed`, `victims_localized`, `resources_allocated`, `knowledge_queried`).
4. **Timeline:** agents may add `agent_*` events through the EventSink; the orchestrator emits the
   authoritative `agent_start`/`agent_complete`.

## 7. Idempotency & Re-Runs

- A re-run of an agent (retry or orchestrator `re_run`) **must not duplicate** HITL requests or
  tasks. Implemented via:
  - Tasks: dedupe by `description` within the mission.
  - HITL: dedupe by `(request_type, related_task_id)`.
  - Append-only lists: an entry tagged with the same `cycle_id` is ignored on re-run.
- Reports are wholesale-replaced, so re-running an agent refreshes its owned report with no
  residue.

## 8. Agent Registry

A code-defined registry (Phase 1; no dynamic registration) maps slug → agent factory:

| Slug                  | Description (for assistant)                          | Level |
|-----------------------|------------------------------------------------------|-------|
| `risk_assessment`     | Evaluates structural risk from sensor data           | L1    |
| `victim_localization` | Locates victims using thermal/GPR/witness data       | L1    |
| `resource_coordination`| Allocates teams and equipment                        | L2    |
| `knowledge_retrieval` | Queries SOPs and building codes (prototype, not RAG) | L2    |

Registry exposes: `list()`, `get(slug)`, `level(slug)`, and `validate(agent)` (contract check).

## 9. Base Class Contract

- `BaseAgent` keeps `register_tool`, `set_state`, `get_state` for compatibility but they are
  **not** part of the scheduling path.
- `BaseAgent.__init__(name)` must call `super().__init__(name)`; subclasses supply
  `description`, `capabilities`, and the read/write sets.
- Abstract methods remain: `perceive`, `reason`, `act`.

## 10. Compatibility with Existing Agents

The four current agents already follow `perceive → reason → act`. Phase 1B changes:

1. Add identity/metadata to each agent class.
2. Align report dicts to MISSION_STATE.md §4.7 (add `as_of`, `cycle_id`).
3. Replace direct `gop.pending_confirmations` writes with the state HITL helper.
4. Add task/HITL dedupe on re-run.
5. Switch imports from `TERRAState` to `MissionState` (compat accessor during transition).
