# Inzora Terra OS — Dependency Graph

**Spec version:** 1.0 (Phase 1A)
**Status:** Design — implementation reference for Phase 1B
**Supersedes:** the sequential loop in `backend/orchestration/orchestrator.py` and the ASCII
diagram in `docs/WORKFLOW.md`

## 1. Purpose

Formalizes the agent execution order as a **directed acyclic graph (DAG)**. BLUEPRINT v1.1 and
`docs/WORKFLOW.md` already mandate this model; this spec defines the exact structure the
GraphExecutor consumes.

## 2. Why a Graph (not a sequence)

- **Risk Assessment and Victim Localization are independent** — parallelizing them cuts wall-clock
  time on first intelligence.
- **Resource Coordination and Knowledge Retrieval both depend on Risk + Victim outputs** — they
  cannot start until L1 settles, but they do not depend on each other.
- **Streaming-telemetry philosophy** (BLUEPRINT v1.1): later phases re-trigger the graph on new
  telemetry, which requires explicit dependency edges rather than a hardcoded loop.
- A graph makes the pipeline **inspectable, schedulable, and re-triggerable** by the orchestrator
  and testable by unit tests.

## 3. The Graph

### 3.1 Nodes

| Node                  | Produces (writes)            | Consumes (reads)                      | Level |
|-----------------------|------------------------------|----------------------------------------|-------|
| `risk_assessment`     | `risk_report`                | telemetry, environment, evidence       | L1    |
| `victim_localization` | `victim_map`                 | telemetry, environment, evidence       | L1    |
| `resource_coordination`| `resource_allocation`, tasks| `risk_report`, `victim_map`, tasks     | L2    |
| `knowledge_retrieval` | `knowledge_results`          | `risk_report`, `victim_map`, building  | L2    |
| `briefing_generator`  | `summary`                    | all owned reports, confidence_scores   | L3    |

### 3.2 Edges (dependencies)

```
risk_assessment ────────► resource_coordination
victim_localization ────► resource_coordination
risk_assessment ────────► knowledge_retrieval
victim_localization ────► knowledge_retrieval
resource_coordination ──► briefing_generator
knowledge_retrieval ───► briefing_generator
```

### 3.3 Dependency rationale

| Edge                                   | Rationale                                                      |
|----------------------------------------|----------------------------------------------------------------|
| risk → resource                        | Resource allocation must know risk level to pick secure/rescue teams |
| victim → resource                      | Teams are assigned to HIGH-probability victim zones            |
| risk → knowledge                       | Knowledge Retrieval filters SOPs/codes by risk level & hazards |
| victim → knowledge                     | Recommendations prioritize high-probability zones              |
| resource, knowledge → briefing         | Briefing aggregates both L2 outputs                            |

### 3.4 Levels (topological layers)

| Level | Nodes                            | Ready when                       |
|-------|----------------------------------|----------------------------------|
| L1    | risk_assessment, victim_localization | evidence ingested             |
| L2    | resource_coordination, knowledge_retrieval | **all** L1 complete   |
| L3    | briefing_generator               | **all** L2 complete              |

All nodes in a level run concurrently (ORCHESTRATOR.md §4.2). A level fires only when **every**
node in the previous level completed successfully (after retries/fallbacks).

## 4. Formal Properties

1. **Acyclic.** No edge can create a cycle; verified by the executor before scheduling
   (topological sort must succeed).
2. **Deterministic order within a level.** Level node order is alphabetical by slug for stable
   scheduling, but they run concurrently so ordering only affects log order.
3. **Level-completion semantics.** A node is "complete" when `run()` returns `ok`, its report is
   written, and its stage token set. Fallback counts as complete with confidence capped at 0.4.
4. **Single terminal node.** `briefing_generator` is the unique sink; the mission cannot reach
   `briefing_ready` without it.
5. **Re-triggerability.** The same graph can be re-run on a later telemetry snapshot (Phase ≥ 4).
   Re-runs reset L1 → L3 in order; stage rolls back to `evidence_ingested` per MISSION_LIFECYCLE
   §5.1.

## 5. Graph Definition Format (declarative)

The graph is expressed **declaratively** so the executor is generic (no per-mission hardcoding):

```
nodes:
  risk_assessment:       { level: 1, reads: [telemetry, environment, evidence], writes: [risk_report] }
  victim_localization:   { level: 1, reads: [telemetry, environment, evidence], writes: [victim_map] }
  resource_coordination: { level: 2, reads: [risk_report, victim_map, tasks], writes: [resource_allocation, tasks] }
  knowledge_retrieval:   { level: 2, reads: [risk_report, victim_map, building], writes: [knowledge_results] }
  briefing_generator:    { level: 3, reads: [*], writes: [summary] }

edges:
  risk_assessment        -> resource_coordination
  victim_localization    -> resource_coordination
  risk_assessment        -> knowledge_retrieval
  victim_localization    -> knowledge_retrieval
  resource_coordination  -> briefing_generator
  knowledge_retrieval    -> briefing_generator
```

The executor derives levels from the graph or consumes levels directly; both representations must
agree (validated at startup).

## 6. Extension Points (Future)

- **Mission Assistant node** (BLUEPRINT v1.1): a consumer-only node that does not write reports;
  it reads any level output. Added at L3 alongside briefing for the demo, or kept out of the graph
  as a state consumer.
- **New agents** register a node + edges and are picked up by the generic executor without changes
  to the scheduling loop.
- **Streaming re-trigger**: `new_telemetry_batch` event re-invokes L1 with the latest snapshot
  (Phase 4 simulation feature).

## 7. Validation & Testing

- Startup validation: graph is a DAG, exactly one sink, every node reachable.
- Unit test matrix:
  - L1 parallel start time < sequential time (both agents begin before either finishes).
  - L2 never starts until both L1 reports exist.
  - Briefing only after both L2 reports exist.
  - A failed node blocks its level until retry/fallback resolves.
  - Re-run resets stages correctly and dedupes tasks/HITL.
