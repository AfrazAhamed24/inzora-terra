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

- **Report handoff is explicit.** Each specialist consumes the previous agent's report, so the
  pipeline is a **strict sequential chain**: risk → victim → resource → knowledge → rescue →
  briefing. Every edge declares *what* is handed off and *why*.
- **Victim search is driven by risk** (L1 → L2): the Risk Assessment report prioritizes victim
  zones before the Victim agent runs.
- **Resource allocation is driven by the victim map** (L2 → L3), **knowledge is scoped by the
  resource plan** (L3 → L4), and **rescue guidance is the final field handoff** (L4 → L5) — each
  report compounds the previous one.
- **Streaming-telemetry philosophy** (BLUEPRINT v1.1): later phases re-trigger the graph on new
  telemetry, which requires explicit dependency edges rather than a hardcoded loop.
- A graph makes the pipeline **inspectable, schedulable, and re-triggerable** by the orchestrator
  and testable by unit tests.

## 3. The Graph

### 3.1 Nodes

| Node                  | Produces (writes)            | Consumes (reads)                      | Level |
|-----------------------|------------------------------|----------------------------------------|-------|
| `risk_assessment`     | `risk_report`                | telemetry, environment, evidence       | L1    |
| `victim_localization` | `victim_map`                 | `risk_report`, telemetry, environment, evidence | L2 |
| `resource_coordination`| `resource_allocation`, tasks| `victim_map`, `risk_report`, tasks     | L3    |
| `knowledge_retrieval` | `knowledge_results`          | `resource_allocation`, `risk_report`, `victim_map`, building | L4 |
| `rescue_coordination` | `rescue_guidance`, tasks     | `risk_report`, `victim_map`, `resource_allocation`, `knowledge_results` | L5 |
| `briefing_generator`  | `summary`                    | all owned reports, confidence_scores   | L6    |

### 3.2 Edges (dependencies) — the sequential chain

```
risk_assessment ────────► victim_localization
victim_localization ────► resource_coordination
resource_coordination ──► knowledge_retrieval
knowledge_retrieval ────► rescue_coordination
rescue_coordination ────► briefing_generator
```

### 3.3 Dependency rationale (report handoff)

| Edge                         | What is handed off                                        |
|------------------------------|-----------------------------------------------------------|
| risk → victim                | Risk level drives search prioritization (risk context lands in the victim map) |
| victim → resource            | Victim zones determine team deployment                     |
| resource → knowledge         | The allocation plan scopes which SOPs/codes are relevant   |
| knowledge → rescue           | SOP/code recommendations shape the extraction guidance     |
| rescue → briefing            | The field handoff is the final input to the mission summary |

### 3.4 Levels (topological layers)

| Level | Node                     | Ready when                    |
|-------|--------------------------|-------------------------------|
| L1    | risk_assessment          | evidence ingested             |
| L2    | victim_localization      | risk report complete          |
| L3    | resource_coordination    | victim map complete           |
| L4    | knowledge_retrieval      | resource allocation complete  |
| L5    | rescue_coordination      | knowledge results complete    |
| L6    | briefing_generator       | rescue guidance complete      |

One node per level: the pipeline is strictly sequential, so each agent's report is written and
committed before the next agent starts. A level fires only when the previous level completed
successfully (after retries/fallbacks).

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
  victim_localization:   { level: 2, reads: [risk_report, telemetry, environment, evidence], writes: [victim_map] }
  resource_coordination: { level: 3, reads: [victim_map, risk_report, tasks], writes: [resource_allocation, tasks] }
  knowledge_retrieval:   { level: 4, reads: [resource_allocation, risk_report, victim_map, building], writes: [knowledge_results] }
  rescue_coordination:   { level: 5, reads: [risk_report, victim_map, resource_allocation, knowledge_results], writes: [rescue_guidance, tasks] }
  briefing_generator:    { level: 6, reads: [*], writes: [summary] }

edges:
  risk_assessment        -> victim_localization
  victim_localization    -> resource_coordination
  resource_coordination  -> knowledge_retrieval
  knowledge_retrieval    -> rescue_coordination
  rescue_coordination    -> briefing_generator
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
  - Strict ordering: each agent's completion strictly precedes the next agent's start.
  - Each agent's context carries exactly its predecessor's report.
  - Briefing only after the rescue report exists.
  - A failed node blocks the rest of the chain until retry/fallback resolves.
  - Re-run resets stages correctly and dedupes tasks/HITL.
