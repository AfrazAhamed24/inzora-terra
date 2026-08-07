# Inzora Terra OS — Agent Workflow

Aligns with `BLUEPRINT.md` (v1.1): agents execute via a **dependency graph**, not a strict sequence.

## Execution Model

```
1. Incident Input
   |
2. [concurrent] Risk Assessment Agent        Victim Localization Agent
      writes risk_report                          writes victim_map
      |                                           |
      +--------------------+----------------------+
                           v
3. [concurrent] Resource Coordination Agent   Knowledge Retrieval Agent
      writes resource_allocation                 writes knowledge_results
                           |
                           v
4. Orchestrator
      reads all outputs, writes mission_briefing
                           |
                           v
5. Frontend Display
```

- **Risk + Victim** run concurrently (independent).
- **Resource** depends on Risk + Victim outputs.
- **Knowledge Retrieval** depends on Risk + Victim outputs (prototype retriever, not RAG).
- **Orchestrator** aggregates everything.

## Error Handling
- Agent timeout: 30s max per agent
- Fallback: use simulated data
- Logging: all agent outputs logged to `agent_log`

## Current Status
The current `backend/orchestration/orchestrator.py` still executes sequentially
(Risk → Victim → Resource → Knowledge). Phase 1 reworks it to true concurrent
dependency-graph execution.
