---
description: Run full Inzora Terra OS agent pipeline
agent: orchestrator
---

# Run Mission Command

## Usage
/run-mission <incident_type> <zone>

## Arguments
- incident_type: earthquake, fire, flood, collapse
- zone: building zone identifier (e.g., A1, B2)

## Example
/run-mission earthquake A1

## What Happens
1. Orchestrator receives incident input
2. Triggers Risk Assessment Agent
3. Triggers Victim Localization Agent
4. Triggers Resource Coordination Agent
5. Triggers Knowledge Retrieval Agent
6. Produces unified mission briefing
7. Updates frontend with results
