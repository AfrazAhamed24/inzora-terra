# Inzora Terra OS — Phase 0: Product Blueprint

> "The goal is not to build AI. The goal is to save lives. AI is just how we get there."

---

## Executive Summary

Inzora Terra OS is an AI-Native Disaster Response Operating System that converts rover telemetry into actionable rescue intelligence through a multi-agent dependency graph. It is not a chatbot, not a dashboard, not an AI wrapper. It is an operating system for disaster response coordination.

The system receives continuous telemetry streams from a rover deployed into a disaster zone. Specialized AI agents execute according to a dependency graph — independent agents run concurrently, dependent agents wait for prerequisites. Each agent performs one responsibility, writes structured results to a shared mission state, and logs its reasoning. The Orchestrator manages the dependency graph and produces a unified mission briefing. The Mission Assistant is the sole conversational interface, translating structured agent outputs into natural language explanations.

The product is designed for hackathon demonstration and future production deployment. The current implementation has a working backend agent chain and a visually polished but disconnected frontend. This blueprint defines what the product should become.

---

## Product Vision

**Vision Statement:**
Every disaster response team deserves an AI operating system that thinks faster than the crisis.

**Mission:**
Transform raw sensor telemetry into life-saving decisions through specialized AI collaboration, delivered through an interface that feels like operating a command center, not using software.

**Core Principles:**
1. Intelligence is structured, not conversational. Agents produce data, not dialogue.
2. Every AI decision must be explainable. No black boxes.
3. The interface should feel effortless. Every element earns its presence. Nothing is decorative.
4. One agent, one responsibility. No exceptions.
5. Speed saves lives. The system must feel instant.

**Long-term Direction:**
Phase 1-2 establish the backend and agent intelligence. Phase 3-4 add knowledge retrieval and telemetry simulation. Phase 5-6 build and polish the Mission Control UI. Phase 7 adds the Mission Assistant. The long-term vision is a deployable system used by actual disaster response teams. Production infrastructure (Docker, cloud, auth) is deferred to a Future Production phase after the demo is polished.

**Product Identity:**
Inzora Terra OS is a professional-grade command center. It is not playful, not casual, not experimental. It is serious software for serious situations.

**Brand Personality:**
Precise. Calm. Intelligent. Trustworthy. The product should feel like a system that has been used in real operations, not a prototype.

---

## What This Product IS

- An AI-Native Operating System for disaster response
- A multi-agent dependency graph that processes telemetry into intelligence
- A command center interface for mission operators
- A system where specialized AI agents collaborate through shared state
- A product that demonstrates multi-agent AI architecture
- A platform where every AI decision is traceable and explainable
- A tool that converts sensor data into actionable rescue tasks

## What This Product IS NOT

- A chatbot (the Mission Assistant translates structured agent outputs into natural language; it does not generate independent analysis)
- A dashboard (there are no KPI widgets, no analytics charts)
- An AI wrapper (the agents have genuine multi-agent coordination through a dependency graph)
- A simulation game (this is a real operating system with simulated data)
- A data visualization tool (visualization supports decisions, not replaces them)
- A generic AI tool (every component serves disaster response specifically)
- A proof of concept (this is designed for production deployment)

---

## Target Users

### Primary User: Mission Commander

**Role:** Overall incident commander responsible for coordinating rescue operations.

**Responsibilities:**
- Initialize missions from incoming incident reports
- Monitor agent execution and confidence scores
- Review mission briefings and approve resource deployment
- Make final decisions on evacuation and rescue priorities
- Coordinate with field teams through the system

**Goals:**
- Understand the situation within 30 seconds of mission start
- Trust the AI recommendations enough to act on them
- See exactly what each agent decided and why
- Deploy resources with confidence

**Pain Points:**
- Information overload from multiple sensor feeds
- Delayed analysis from manual interpretation
- Uncertainty about which zones to prioritize
- Difficulty coordinating multiple teams simultaneously

**Interaction:** Opens the system, initializes a mission, watches agents execute, reviews the briefing, deploys resources, monitors progress through the timeline.

### Secondary User: Rover Operator

**Role:** Controls the rover and monitors telemetry quality.

**Responsibilities:**
- Ensure rover is transmitting valid data
- Monitor sensor health and calibration
- Adjust rover position for better coverage
- Report anomalies in telemetry

**Goals:**
- Confirm telemetry is reaching the AI system
- Understand what data the agents need
- Verify sensor readings are being interpreted correctly

**Interaction:** Views telemetry feed, checks sensor status, adjusts rover parameters.

### Tertiary User: Field Team Leader

**Role:** Leads a rescue team deployed to a specific zone.

**Responsibilities:**
- Receive task assignments from the system
- Report progress back through the interface
- Request additional resources if needed
- Confirm or override AI recommendations

**Goals:**
- Clear, specific task instructions
- Real-time updates on zone conditions
- Ability to report back through the system

**Interaction:** Receives tasks, views zone-specific data, reports status.

---

## User Journey

### Stage 1: Landing

**What the user sees:**
The Inzora Terra OS splash screen. A single word: TERRA. Below it: "AI-Native Disaster Response Operating System." A status indicator: "SYSTEM READY." The background is dark, minimal, professional.

**What the user feels:**
This is serious software. This is not a toy.

**Duration:** 2-3 seconds before auto-transition.

### Stage 2: Mission Creation

**What the user sees:**
A mission initialization panel. Two input fields: Incident Description and Incident Location. A "Start Mission" button. Below: recent missions list (empty for first run).

**What the user types:**
"Two-floor residential building collapsed after heavy rainfall. Three persons missing. Last known location: basement level."

**What the user feels:**
I am telling the system what happened. The system will take it from here.

### Stage 3: Telemetry Connection

**What the user sees:**
A connection status panel showing the rover coming online. Sensor indicators light up one by one: GPR ✓, Thermal ✓, GPS ✓, IMU ✓, Gas ✓. A small map showing the rover position. A telemetry feed begins streaming raw packets.

**What the user feels:**
The system is alive. Data is flowing. The AI is receiving input.

**Duration:** 3-5 seconds (simulated connection sequence).

### Stage 4: Mission Initialization

**What the user sees:**
The Orchestrator activates. A status line appears: "Orchestrator online. Analyzing dependency graph." Four agent cards appear: Risk Assessment, Victim Localization, Resource Coordination, Knowledge Retrieval. Dependencies are visualized: Risk and Victim show "READY" (no dependencies). Resource and Knowledge show "WAITING" (depend on Risk + Victim). Each shows "STANDBY" status.

**What the user feels:**
The system is preparing. It understands which agents can run concurrently and which must wait.

### Stage 5: Agent Execution

**What the user sees:**
Risk Assessment and Victim Localization activate simultaneously. "Risk Assessment Agent: ANALYZING." "Victim Localization Agent: SCANNING." Both show progress indicators. Both complete within 2-3 seconds. Risk produces: risk score 0.91, likelihood HIGH, confidence 94%. Victim produces: 3 zones, primary B2, confidence 87%.

Resource Coordination and Knowledge Retrieval activate next (dependencies satisfied). "Resource Coordination Agent: PLANNING." "Knowledge Retrieval Agent: QUERYING." Both run concurrently. Resource produces: team assignments, ETAs, confidence 91%. Knowledge produces: matched SOPs, building codes, recommendations, confidence 78%.

**What the user feels:**
I am watching specialists think in parallel. The system is efficient. Independent agents run simultaneously. Dependent agents wait their turn.

**Duration:** 6-8 seconds total (2-3 seconds per concurrent batch).

### Stage 6: Mission Summary

**What the user sees:**
The Orchestrator produces the mission briefing. A structured panel showing: Overall Risk (HIGH), Priority Zones (A, B), Estimated Victims (3), Immediate Actions (3), Resource Status (Deployed). Below: the complete agent log showing every decision.

**What the user feels:**
I understand the situation. I know what to do. I trust the recommendations.

### Stage 7: Mission Assistant

**What the user sees:**
The Mission Assistant panel is available. The assistant greets: "Mission initialized. I can explain any decision, summarize findings, or answer questions about the current situation." The user asks: "Why is Zone B2 critical?" The assistant responds: "Zone B2 has the highest victim probability (82%) confirmed by thermal imaging and witness report. The Risk Assessment Agent classified this as HIGH likelihood due to 4.2-degree tilt with increasing trend. The Knowledge Retrieval Agent matched FEMA USAR Protocol 7.3 for this scenario."

**What the user feels:**
The AI understands my mission. It can explain any decision in plain language. It references actual agent outputs, not generic responses.

### Stage 8: Mission Complete

**What the user sees:**
A timeline view showing the entire mission progression. Every agent decision, every timestamp, every confidence score. An export button for the mission report.

**What the user feel:**
I have a complete record. I can review every decision. I can share this with my team.

---

## System Story

### Incident: Building Collapse, Sector 7

**09:41:00** — A two-floor residential building in Sector 7 collapses after 6 hours of heavy rainfall. Three residents are missing. A neighbor reports hearing the collapse and seeing dust from the basement level.

**09:41:15** — The Incident Commander opens Inzora Terra OS and initializes a mission: "Two-floor residential building collapsed after heavy rainfall. Three persons missing. Last known location: basement level."

**09:41:20** — The rover is deployed to the site. Telemetry connection established. Sensors come online: Ground Penetrating Radar, Thermal Camera, GPS, IMU, Gas Sensors, Temperature/Humidity.

**09:41:25** — The Orchestrator activates. It analyzes the dependency graph. Risk Assessment and Victim Localization have no dependencies — they can run concurrently. Resource Coordination and Knowledge Retrieval depend on both — they must wait.

**09:41:27** — Risk Assessment Agent and Victim Localization Agent begin simultaneously.

Risk Assessment reads north wall sensor: tilt 4.2 degrees, increasing. Weather: heavy rain. Building: concrete frame, 20 years old. It reasons: tilt exceeds threshold, trend worsening, rain compounds instability. Risk score: 0.91. Likelihood: HIGH. Confidence: 94%.

Victim Localization reads thermal camera: heat signature at basement. GPR: subsurface void at 3.2 meters. Witness report: three persons last seen in basement. It reasons: thermal correlates with GPR void, witness confirms. Primary zone: B2. Probability: 82%. Total victims: 3. Confidence: 87%.

Both complete at 09:41:29. Dependencies satisfied.

**09:41:29** — Resource Coordination Agent and Knowledge Retrieval Agent begin simultaneously.

Resource Coordination reads risk=HIGH, victim_map=3 zones. It reasons: Alpha to B2, Bravo to B1, Charlie to perimeter. Equipment: hydraulic spreaders, thermal suits. ETA: 8 minutes. Confidence: 91%.

Knowledge Retrieval reads risk=HIGH, building=concrete frame. It queries SOPs: matches "Earthquake Response Protocol" (relevance: 0.94), "Building Collapse Assessment" (relevance: 0.89). It queries building codes: IBC-2021-1604. It reasons: evacuate, deploy monitors, prioritize B2, establish perimeter. Confidence: 78%.

Both complete at 09:41:31.

**09:41:31** — Orchestrator generates mission briefing. Overall Risk: HIGH. Priority Zones: B2, B1. Estimated Victims: 3. Immediate Actions: Evacuate, Deploy monitors, Establish perimeter. Resource Status: Deployed.

**09:41:33** — The Mission Commander sees the briefing. Reviews the agent log. Confirms resource deployment. Team Alpha en route to Zone B2.

**09:42:00** — The Mission Commander asks the Mission Assistant: "Why B2 first?" The assistant responds: "Zone B2 has the highest victim probability (82%) confirmed by both thermal imaging and witness report. The Risk Assessment Agent classified structural risk as HIGH due to 4.2-degree tilt with increasing trend. FEMA USAR Protocol 7.3 recommends prioritizing zones with correlated thermal and witness evidence."

**09:45:00** — Mission timeline shows complete execution. Every decision logged. Every confidence score recorded. Export available.

---

## Product Features

### Core Features (Must Have)

1. **Mission Initialization** — User creates a mission from incident description
2. **Telemetry Stream** — Continuous sensor packets simulated in real-time
3. **Dependency Graph Execution** — Agents execute according to dependencies, not fixed sequence
4. **Concurrent Agent Execution** — Independent agents run in parallel
5. **Shared Mission State** — TERRAState holds all data, read/written by agents
6. **Mission Briefing** — Orchestrator produces structured summary
7. **Agent Visualization** — Real-time display of agent execution and confidence
8. **Mission Timeline** — Chronological log of all agent decisions
9. **Mission Assistant** — Context-aware translator that explains agent outputs in natural language
10. **Zone Map** — Visual representation of risk zones and team positions

### Future Features (Phase 2+)

1. **Real-time Streaming** — Agent reasoning streamed to frontend as it happens
2. **Multi-Mission Support** — Dashboard showing active and completed missions
3. **Role-Based Access** — Different views for Commander, Operator, Field Leader
4. **Export & Reporting** — PDF/CSV mission reports
5. **Historical Analysis** — Compare past missions, identify patterns

### Enterprise Features (Phase 3+)

1. **Real Sensor Integration** — Connect to actual rover telemetry
2. **Multi-Rover Support** — Multiple rovers in different zones
3. **Team Coordination** — Push tasks to field team mobile devices
4. **Audit Trail** — Complete decision log for compliance
5. **API Access** — Third-party integration
6. **Deployment Infrastructure** — Docker, cloud, monitoring

### Experimental Features

1. **Predictive Analytics** — Predict collapse progression over time
2. **Natural Language Mission Creation** — Voice-to-mission
3. **AR Visualization** — Overlay agent data on camera feed
4. **Swarm Intelligence** — Multiple rovers coordinating autonomously

---

## Multi-Agent Philosophy

### Why One AI Is Insufficient

A single LLM prompted to "analyze disaster data" will produce a single analysis. It will not separate risk assessment from victim localization from resource coordination. It will mix concerns. It will produce a paragraph of text instead of structured data. It will not explain its reasoning step by step. It will not produce confidence scores per domain.

A single LLM is a generalist. Disaster response requires specialists.

### Why Specialists Are Better

The Risk Assessment Agent needs only: sensor tilt, weather, building data. It produces: risk score, likelihood, hazards, recommendation. It does not need to know about victims, resources, or protocols. Its reasoning is focused. Its confidence is meaningful.

The Victim Localization Agent needs only: thermal, GPR, witness data. It produces: zone probabilities, victim count, primary search zone. It does not need to know about structural risk or resource availability. Its reasoning is focused. Its confidence is meaningful.

Specialization produces:
- **Focused reasoning** — Each agent processes only relevant inputs
- **Structured outputs** — Each agent produces typed, validated data
- **Traceable decisions** — Each agent's reasoning is isolated and inspectable
- **Composability** — New agents can be added without modifying existing ones
- **Confidence calibration** — Each agent's confidence reflects its specific domain

### How Agents Communicate

Agents do not communicate directly. They communicate through shared state (TERRAState). The Orchestrator manages a dependency graph that determines execution order.

**Dependency Graph:**
```
Risk Assessment ─────┐
                     ├──→ Resource Coordination ──→ Orchestrator ──→ Mission Briefing
Victim Localization ─┘        │
                              └──→ Knowledge Retrieval ──┘
```

- Risk Assessment and Victim Localization have no dependencies. They execute concurrently.
- Resource Coordination depends on Risk + Victim. It waits for both to complete.
- Knowledge Retrieval depends on Risk + Victim. It waits for both to complete.
- Resource and Knowledge can execute concurrently after their dependencies are satisfied.
- The Orchestrator aggregates all outputs and produces the final briefing.

This architecture is superior because:
- **Scalability** — New agents can be added with custom dependencies without modifying existing agents
- **Performance** — Independent agents run in parallel, reducing total execution time
- **Maintainability** — Each agent's dependencies are explicit, not buried in sequential code
- **Flexibility** — The graph can be reconfigured for different mission types

### How Agents Share Memory

TERRAState is the shared memory. It contains:
- Evidence (sensor data, weather, building info, witness reports)
- Agent outputs (risk_report, victim_map, resource_allocation, knowledge_results)
- Tasks (generated by agents, prioritized, assigned)
- Confidence scores (per agent)
- Timeline (every decision logged)

All memory is structured. No free-text reasoning is stored.

### How Trust Is Built

Trust is built through:
1. **Transparency** — Every agent's reasoning is logged and visible
2. **Confidence scores** — Users see how confident each agent is
3. **Explainability** — Every recommendation traces back to specific evidence
4. **Consistency** — Same inputs produce same outputs
5. **Human-in-the-loop** — Critical decisions require human confirmation

### How Explainability Is Improved

Every agent output includes:
- The specific evidence it used
- The reasoning it performed
- The confidence it has
- The action it recommends

The Mission Timeline shows this chain for every decision. The Mission Assistant can explain any decision in natural language.

### Human-in-the-Loop Workflow

The system recommends. The human decides. HITL is not a notification — it is a defined workflow with roles, triggers, and an audit trail.

**Who approves what:**

| Decision | Approver | Workflow |
|----------|----------|----------|
| Deploy a rescue team | Incident Commander | Confirm / re-assign / decline |
| Enter a CRITICAL-risk zone | Incident Commander | Confirm with justification required |
| Override an agent recommendation | Mission Operator | Confirm + reason recorded |
| Abort a mission | Incident Commander | Confirm + reason recorded |
| Approve resource allocation | Incident Commander | Batch confirm or edit assignments |

**Triggers:**
- Any HIGH or CRITICAL recommendation (risk > 0.7)
- Overall confidence below 0.5
- Multiple HIGH-risk zones in one mission
- Conflicting agent outputs (e.g., Resource Agent bottlenecks vs. Victim priority)
- Any request to enter an unstable structure

**Workflow states:**
1. **AWAITING_CONFIRMATION** — system shows the recommendation, its evidence chain, and confidence
2. **CONFIRMED** — action dispatched, logged with approver identity and timestamp
3. **OVERRIDDEN** — agent output replaced; override reason logged for later review
4. **TIMEOUT** — no response within a defined window; system escalates to a human supervisor rather than auto-executing

**Guarantees:**
- No HIGH/CRITICAL action executes without human confirmation
- Every confirmation or override is written to TERRAState logs with identity + timestamp + reason
- The mission briefing distinguishes *executed* actions from *pending* actions
- A "pending actions" queue is always visible in the command center, never buried in a feed

---

## Agent Catalog

### Agent 1: Risk Assessment Agent

**Purpose:** Evaluate structural risk and collapse likelihood.

**Responsibility:** Process sensor tilt, weather, and building data to produce a risk assessment.

**Inputs:** Sensor data (tilt, vibration), weather data (rain, wind), building data (age, material, code compliance).

**Outputs:** Risk score (0.0-1.0), likelihood (CRITICAL/HIGH/MEDIUM/LOW), hazards list, recommendation, confidence score.

**Dependencies:** None (independent — runs concurrently with Victim Localization Agent).

**Reasoning:** Threshold-based assessment. Tilt > 3 degrees adds risk. Increasing trend adds risk. Rain adds risk. Score mapped to likelihood levels.

**Confidence:** Calculated from data completeness and risk score magnitude.

**Handoff:** Writes risk_report to TERRAState. Victim and Resource agents read this output.

### Agent 2: Victim Localization Agent

**Purpose:** Locate potential victims using sensor fusion.

**Responsibility:** Process thermal imaging, GPR data, and witness reports to produce a zone probability map.

**Inputs:** Thermal camera data, GPR subsurface data, witness reports, sensor data.

**Outputs:** Zone probability map, primary search zone, total victims estimated, confidence score.

**Dependencies:** None (can run in parallel with Risk Agent).

**Reasoning:** Correlates thermal signatures with GPR voids. Validates against witness reports. Assigns probabilities per zone.

**Confidence:** Calculated from correlation strength and data agreement.

**Handoff:** Writes victim_map to TERRAState. Resource and Knowledge agents read this output.

### Agent 3: Resource Coordination Agent

**Purpose:** Assign teams and equipment to priority zones.

**Responsibility:** Read risk and victim data, generate task assignments with teams, equipment, and ETAs.

**Dependencies:** Risk Agent and Victim Agent must complete first (they run concurrently, then Resource Agent starts).

**Reasoning:** Match team capabilities to zone requirements. Prioritize HIGH probability zones. Balance workload across teams. Identify resource constraints.

**Confidence:** Calculated from assignment completeness and resource availability.

**Handoff:** Writes resource_allocation to TERRAState. Adds tasks to TERRAState.tasks.

### Agent 4: Knowledge Retrieval Agent (Prototype)

**Purpose:** Query relevant protocols, codes, and procedures.

**Responsibility:** Match mission context against knowledge base to produce actionable recommendations.

**Inputs:** risk_report, victim_map, building information, incident description.

**Outputs:** Relevant SOPs, building codes, recommendations, confidence score.

**Dependencies:** Risk Agent and Victim Agent must complete first (they run concurrently, then Knowledge Agent starts).

**Reasoning:** Keyword and semantic matching of mission context against knowledge documents. Ranking by relevance. Extracting applicable recommendations. **This is a prototype retriever, not full RAG — see Knowledge Retrieval Philosophy below.**

**Confidence:** Calculated from document relevance scores and coverage.

**Handoff:** Writes knowledge_results to TERRAState. Orchestrator reads this for final briefing.

### Agent 5: Orchestrator

**Purpose:** Coordinate the agent dependency graph and produce the mission briefing.

**Responsibility:** Initialize agents, resolve execution order from the dependency graph, run independent agents concurrently, aggregate results, generate final output.

**Inputs:** All agent outputs (risk_report, victim_map, resource_allocation, knowledge_results).

**Outputs:** Mission briefing (structured summary), agent execution log, overall confidence.

**Dependencies:** All four specialist agents.

**Reasoning:** Dependency-graph scheduling (Risk + Victim in parallel → Resource + Knowledge in parallel → briefing), result aggregation, briefing generation.

**Confidence:** Weighted average of all agent confidence scores.

**Handoff:** Produces final mission briefing for the user.

---

## Knowledge Retrieval Philosophy

> **Honest status:** The current system is a *prototype retriever* — keyword + basic semantic matching over a small in-memory document set. It is **not** Retrieval-Augmented Generation (RAG). It is branded "Knowledge Retrieval Engine (Prototype)" until real embeddings, a vector store, and LLM grounding land (see Roadmap Phase 3). The interface must never imply AI grounding that does not exist.

### Why Knowledge Retrieval Exists

Disaster response has established protocols, building codes, medical procedures, and equipment manuals. An AI system that ignores this knowledge is dangerous. Knowledge retrieval ensures the AI system references authoritative sources rather than generating recommendations from memory alone.

### When Knowledge Retrieval Should Be Used

- When the mission context matches a known disaster type
- When building codes are relevant to structural assessment
- When medical protocols apply to victim treatment
- When equipment specifications affect resource allocation
- When safety procedures must be followed

### When Knowledge Retrieval Should NOT Be Used

- When the query is about current mission state (use TERRAState)
- When the query is about sensor readings (use telemetry data)
- When the query is about team assignments (use resource_allocation)
- When the AI is reasoning about probabilities (use agent logic)

### Knowledge Sources

| Source | Purpose | Priority |
|--------|---------|----------|
| NDRF SOPs | Standard operating procedures for national disaster response | Critical |
| Building Codes | IBC, IS codes for structural assessment | Critical |
| Medical Protocols | Triage, first aid, victim treatment | High |
| Hazmat Procedures | Chemical, biological hazard response | High |
| Rescue Guidelines | Search and rescue techniques | High |
| Equipment Manuals | Rover and rescue equipment specifications | Medium |
| Historical Incidents | Past disaster data for pattern matching | Medium |
| Weather Protocols | Weather-related disaster procedures | Medium |

### What Must Change to Claim RAG

The product may be described as "Knowledge Retrieval" today, but the moment we call it RAG, these must be true:

1. **Embeddings** — documents and queries embedded into a shared vector space (not keyword matching).
2. **Vector store** — semantic search over a real corpus (ChromaDB/Qdrant), not a hardcoded array.
3. **LLM grounding** — retrieved passages are injected into an LLM prompt with strict citation, and the model is instructed to answer only from retrieved context.
4. **Citation fidelity** — every claim renders with its source SOP / code section; no hallucinated references.
5. **Coverage** — the corpus is versioned, loadable, and sized beyond toy examples.

Until all five hold, the honest label is **"Knowledge Retrieval Engine (Prototype)"**.

---

## Mission State

### What Information Exists Throughout a Mission

**Mission Metadata:**
- Mission ID (unique identifier)
- Incident description (free text)
- Incident location
- Creation timestamp
- Current stage (initialized → risk_assessed → victims_localized → resources_allocated → knowledge_queried → complete)
- Overall status (ACTIVE, PAUSED, COMPLETE, ABORTED)

**Telemetry (continuous stream, not a snapshot):**
- Raw sensor packets (timestamped) — every reading carries a timestamp
- Processed sensor readings (tilt, temperature, gas levels)
- Thermal camera frames
- GPR scan data
- GPS coordinates
- IMU orientation
- Weather feed (rain, wind, temperature) — updating periodically, not once
- Network / signal quality per rover
- Live values are always current; history is retained for trend analysis

**Telemetry pacing philosophy:** telemetry is a *stream*. Values tick, sensors drop out and reconnect, degradation appears over time. The frontend must simulate this continuous flow (even when fed by mock data) so the interface behaves identically when real rovers are wired in. No static numbers. No values that never change.

**Environment:**
- Weather conditions (rain, wind, temperature)
- Time of day
- Visibility conditions
- Seismic activity

**Agent Results:**
- Risk report (score, likelihood, hazards, recommendation)
- Victim map (zones, probabilities, primary zone)
- Resource allocation (assignments, utilization, bottlenecks)
- Knowledge results (SOPs, codes, recommendations)

**Confidence:**
- Per-agent confidence scores
- Overall system confidence
- Low-confidence triggers (alerts)

**Logs:**
- Agent execution log (timestamp, agent, message, phase)
- Decision trace (evidence → reasoning → output)
- User actions (mission created, resources deployed, decisions confirmed)

**Knowledge References:**
- Matched SOPs with relevance scores
- Applicable building codes
- Referenced procedures

**Timeline:**
- Every event in chronological order
- Agent activations and completions
- User interactions
- System events

**Resources:**
- Team roster and assignments
- Equipment inventory and allocation
- Deployment status and ETAs

**Final Report:**
- Mission summary
- Complete decision log
- Confidence analysis
- Lessons learned
- Export format

---

## UI/UX Philosophy

The interface should feel **effortless** — supervision should be instinctive and the mission should stay the center of attention. The product is not a chat-first tool; the Mission Assistant is the *only* conversational surface, and it is a panel within the command center, not the command center itself.

### The Interface Must Never Resemble

- ChatGPT or any chat interface
- A dashboard with KPI cards
- An analytics platform
- A generic SaaS product
- A Bootstrap admin template
- A Grafana monitoring screen

### The Interface Must Resemble

- NASA Mission Control Center
- A military command center
- A futuristic operating system
- A professional emergency response tool

### Visual Identity

**Color Palette:**
- Background: Deep black (#09090b) with subtle noise texture
- Primary: Electric blue (#3B82F6) for active elements
- Success: Emerald (#22C55E) for healthy status
- Warning: Amber (#F59E0B) for caution
- Critical: Red (#EF4444) for danger
- Text: Near-white (#FAFAFA) at varying opacities

**Typography:**
- Headings: Inter, tight tracking, light weight
- Body: Inter, regular weight
- Data: JetBrains Mono, monospace
- Labels: Inter, uppercase, wide tracking, small size

**Spacing:**
- Generous whitespace between sections
- Compact spacing within components
- Consistent 4px grid system

### Motion Philosophy

**Principles:**
- Motion communicates progress, not decoration
- Every animation has purpose
- Nothing appears instantly
- Nothing disappears without transition
- Loading states must feel alive

**Specific Animations:**
- Agent activation: Fade in + subtle lift
- Agent reasoning: Pulsing status indicator
- Agent completion: Confidence bar fills
- Mission briefing: Staggered reveal
- Timeline events: Slide in from left
- Bot sidebar: Slide in from right

### Interaction Style

**Click:** Compress and release
**Hover:** Subtle lift with shadow
**Scroll:** Smooth, physical, velocity-based
**Focus:** Ring outline with glow

### Component Style

**Panels:** Rounded corners, semi-transparent backgrounds, subtle borders
**Cards:** No obvious borders, depth through opacity layers
**Buttons:** Ghost style with hover fill
**Inputs:** Dark background, subtle border, focus glow
**Status Indicators:** Dots with pulse animation

### Mission Timeline

- Chronological left-to-right flow
- Each event shows: timestamp, agent icon, message, confidence
- Color-coded by agent
- Current event highlighted
- Scrollable but with snap points

### Agent Visualization

- Agent cards show: name, status, confidence, latency
- Active agent has pulsing glow
- Completed agent shows confidence bar
- Thinking agent shows animated dots

### Telemetry Visualization

- Live data feed with scroll
- Values update in real-time
- Color-coded by status (green/yellow/red)
- Mini sparklines for trends

### Explainability

- Every recommendation links to source evidence
- Every agent output shows reasoning chain
- Confidence scores are always visible
- User can click any result to see how it was derived

### Accessibility

- WCAG 2.1 AA compliance minimum
- Keyboard navigation for all actions
- Screen reader labels on all interactive elements
- High contrast mode available
- Reduced motion mode available

---

## Design Inspiration

### NASA Mission Control
**Learn from:** Layout structure, information hierarchy, real-time data display, mission timeline, status boards. NASA controls complex operations with clarity. Their interface communicates urgency without chaos.

### Palantir
**Learn from:** Data fusion, analytical workflows, structured intelligence presentation. Palantir turns complex data into actionable decisions. Their Gotham platform shows how to present multi-source intelligence.

### Linear
**Learn from:** Motion design, keyboard-first interaction, minimal UI, performance. Linear proves that professional software can be beautiful. Their animation philosophy is worth studying deeply.

### Arc Browser
**Learn from:** Spatial navigation, command palette, contextual interfaces. Arc shows how to make complex software feel simple through intelligent defaults.

### Stripe
**Learn from:** Documentation quality, developer experience, API design. Stripe sets the standard for how technical products should present themselves.

### Apple Vision Pro
**Learn from:** Spatial computing, depth layering, gesture interaction, premium feel. VisionOS shows the future of immersive interfaces.

### Figma
**Learn from:** Collaborative editing, real-time cursors, component systems. Figma shows how complex tools can feel lightweight.

### High-End Command Centers
**Learn from:** Information density management, alert systems, status monitoring, emergency protocols. Real command centers prioritize information hierarchy above all else.

---

## Product Principles

### Non-Negotiable Rules

1. **Never expose raw AI prompts.** The user should never see system prompts, chain-of-thought, or raw LLM outputs.

2. **Never overwhelm the user.** Show one important thing at a time. Progressive disclosure. Reveal complexity gradually.

3. **Every AI decision must be explainable.** If an agent recommends something, the user must be able to trace why.

4. **Every agent must have one responsibility.** No agent does two things. No agent encroaches on another's domain.

5. **The UI should tell a story.** From mission start to mission complete, the interface narrates the operation.

6. **Animations must communicate progress.** If something is loading, show it. If something is thinking, show it. If something is complete, show it.

7. **Telemetry must feel alive.** Numbers update. Charts pulse. The system feels like it is processing real data.

8. **The product should feel like software used by professionals.** Not a demo. Not a prototype. Not a toy.

9. **Confidence is always visible.** The user must always know how confident the system is.

10. **Human-in-the-loop for critical decisions.** The system recommends. The human decides. For HIGH/CRITICAL actions, confirmation is required.

---

## Success Criteria

### At the End of Development

1. **Judges understand the workflow within one minute.** They see: incident → telemetry → agents → briefing → action.

2. **Every agent has a clear purpose.** No judge asks "what does this agent do?"

3. **Users trust the recommendations.** The confidence scores, explainability, and structured reasoning build trust.

4. **Mission execution feels cinematic.** From start to finish, the experience is engaging and professional.

5. **The backend remains modular and scalable.** Adding a new agent takes less than 100 lines of code.

6. **The frontend feels like an operating system.** Not a website. Not a dashboard. An OS.

7. **Every decision is traceable.** Given any recommendation, you can trace it back to the sensor data that caused it.

8. **The system handles edge cases gracefully.** Missing data, low confidence, conflicting evidence — all handled.

9. **Performance is instant.** Agent execution completes in under 15 seconds total.

10. **The codebase is clean.** No orphaned files. No broken imports. No dead code.

---

## Development Roadmap

### Phase 1: Backend Evolution
**Objective:** Transform the CLI script into a proper FastAPI server with structured endpoints.

**Deliverables:**
- FastAPI application with proper middleware
- POST /missions endpoint (create mission)
- GET /missions/{id} endpoint (get mission status)
- POST /missions/{id}/run endpoint (execute dependency graph)
- WebSocket endpoint for real-time streaming
- Proper error handling and validation

### Phase 2: Multi-Agent Intelligence
**Objective:** Make agents genuinely intelligent by integrating LLM reasoning.

**Deliverables:**
- Each agent calls Groq LLM in reason() step
- Structured prompts that produce typed outputs
- Agent parallel execution (Risk + Victim concurrent)
- Human-in-the-loop confirmation for HIGH priority tasks
- Agent retry logic and timeout handling

### Phase 3: Knowledge Retrieval → Full RAG
**Objective:** Upgrade the prototype retriever to true retrieval-augmented generation.

**Deliverables:**
- Embedding model integration (sentence-transformers)
- Vector database (ChromaDB or Qdrant)
- NDRF SOPs, building codes, rescue guidelines loaded
- Semantic search in Knowledge Agent
- Source citation in recommendations
- **Gate:** product may only claim RAG once all five criteria in the Knowledge Retrieval Philosophy are met

### Phase 4: Telemetry Simulation
**Objective:** Create a realistic telemetry simulation layer.

**Deliverables:**
- Telemetry packet generator (GPR, Thermal, GPS, IMU, Gas, Weather)
- Time-based simulation with realistic degradation
- Anomaly injection for testing
- Rover connection simulation
- Data quality monitoring

### Phase 5: Mission Control UI
**Objective:** Build the complete command center interface.

**Deliverables:**
- Mission creation flow
- Real-time agent visualization
- Zone map with live data
- Mission timeline
- Agent confidence displays
- Task management panel
- Responsive layout

### Phase 6: Premium Experience
**Objective:** Polish the UI to production quality.

**Deliverables:**
- Lenis smooth scrolling
- Framer Motion animations
- Glassmorphism design system
- Loading skeletons
- Error states
- Empty states
- Keyboard shortcuts
- Command palette

### Phase 7: Mission Assistant
**Objective:** Build a context-aware mission assistant — the sole conversational surface.

**Deliverables:**
- Chat interface integrated with mission state
- LLM-powered responses using mission context
- Retrieval-augmented answers with source citations (once RAG lands)
- Conversation memory per mission
- Ability to explain any agent decision
- Human-in-the-loop actions surfaced as cards, not raw text

### Future Production (Post-Demo)

The following are explicitly **post-demo**. They are not required to win a hackathon or impress an evaluator, and should not consume polish time. They exist to keep the product honest about what "production" means, and to be picked up only after the demo is polished.

### Phase 8: Analytics
**Objective:** Add mission analytics and reporting.

**Deliverables:**
- Mission history dashboard
- Agent performance metrics
- Confidence trend analysis
- Export to PDF/CSV
- Comparative analysis across missions

### Phase 9: Production Readiness
**Objective:** Make the system deployment-ready.

**Deliverables:**
- Docker containerization
- Cloud deployment (AWS/GCP)
- Authentication and authorization
- Rate limiting and security
- Monitoring and alerting
- Documentation
- API versioning

### Roadmap Priority Rule

Polish beats scope. The demo is won in the first seven phases. Phases 8-9 must never block a shipping demo.

---

## Final Product Definition

Inzora Terra OS is an AI-Native Disaster Response Operating System that converts rover telemetry into actionable rescue intelligence through a multi-agent dependency graph. It features four specialized agents (Risk Assessment, Victim Localization, Resource Coordination, Knowledge Retrieval) coordinated by an Orchestrator, all sharing a structured mission state (TERRAState). The system includes a Mission Assistant for contextual queries, a Mission Timeline for decision tracking, and a command center interface designed for professional disaster response operations.

The product is built on the principle that specialized AI agents, each with one responsibility, produce better, more explainable, and more trustworthy results than a single general-purpose LLM. The interface is designed to feel effortless — supervision should be instinctive, and the mission should stay the center of attention.

This blueprint is the single source of truth. Every future development decision must reference this document.

---

*Document Version: 1.1*
*Last Updated: 2026-08-01*
*Status: Approved*

*v1.1: Integrated seven refinements — dependency-graph execution model, Mission Assistant as sole conversational surface, honest "Knowledge Retrieval Engine (Prototype)" branding (RAG renamed with claim gate), streaming telemetry philosophy, "effortless" UI language, dedicated Human-in-the-Loop workflow, and roadmap restructured with Future Production phased out.*
