# Inzora Terra OS — Agent Behavior Rules

## Agent Roles
- **Risk Assessment Agent**: Evaluates structural risk (0.0-1.0)
- **Victim Localization Agent**: Locates victims by zone probability
- **Resource Coordination Agent**: Allocates teams and equipment
- **Knowledge Retrieval Agent (Prototype)**: Queries SOPs and building codes (not RAG)
- **Rescue Coordination Agent**: Synthesizes all specialist reports into field-ready rescue guidance (entry clearance, priority sequence, extraction techniques, safety constraints, triage, comms)
- **Orchestrator**: Coordinates all agents, produces mission briefing

## Communication Protocol
- Agents write to shared TERRAState (Global Operating Picture)
- Each agent reads relevant state, writes its output
- Orchestrator reads all outputs, produces final briefing

## Output Format
- Risk Level: CRITICAL/HIGH/MEDIUM/LOW
- Confidence: 0.0-1.0
- Hazards: List of identified hazards
- Recommendation: ACTION NOW / MONITOR / STANDBY

## Human-in-the-Loop Triggers
- Risk score > 0.8: Alert supervisor
- Confidence < 0.5: Request manual verification
- Multiple HIGH risk zones: Request resource allocation approval

## Priority Levels
1. CRITICAL (0.9-1.0): Immediate action required
2. HIGH (0.7-0.89): Urgent, deploy within 1 hour
3. MEDIUM (0.4-0.69): Monitor, deploy within 4 hours
4. LOW (0.0-0.39): Routine check
