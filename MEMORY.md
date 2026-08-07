# Inzora Terra OS — Memory & State Management

## Global Operating Picture (TERRAState)
Shared state object that all agents read/write. Defined in `backend/core/gop.py`.

```python
class TERRAState(BaseModel):
    incident_id: str
    incident_text: str
    stage: str                       # initialized → risk_assessed → ... → complete
    evidence: List[EvidenceEntry]
    tasks: List[Task]
    agent_outputs: List[AgentOutput]
    risk_report: Dict[str, Any]
    victim_map: Dict[str, Any]
    resource_allocation: Dict[str, Any]
    knowledge_results: Dict[str, Any]
    confidence_scores: Dict[str, float]
    pending_confirmations: List[Dict[str, Any]]
```

## Agent Read/Write Permissions
| Agent | Read | Write |
|-------|------|-------|
| Risk Assessment | sensor, weather, building | risk_report |
| Victim Localization | sensor, thermal, GPR, witness | victim_map |
| Resource Coordination | risk_report, victim_map, tasks | resource_allocation, tasks |
| Knowledge Retrieval | risk_report, victim_map, building | knowledge_results |
| Orchestrator | all | mission_briefing |

## Confidence Tracking
- Each agent outputs confidence (0.0-1.0)
- Orchestrator aggregates agent confidence scores
- Low confidence (<0.5) triggers human verification

## Evidence Chain
- All sensor data logged with timestamp
- Agent outputs linked to source evidence
- Audit trail for compliance
