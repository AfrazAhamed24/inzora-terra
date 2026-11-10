# D.E.X.T.E.R — GAI Review Presentation Content

> All content below is ready to paste directly into each slide of the GAI review PPT template.
> The structure mirrors the original 11-slide format.

---

## SLIDE 1 — Title Slide

**BEACH SAND GRAIN ANALYSIS & COASTAL MONITORING**
*(replace with)*

**D.E.X.T.E.R — AI-NATIVE DISASTER RESPONSE OPERATING SYSTEM**

**Name:**
Vijayashiyamala V (927624BAM056)
Girujashri (927624BAM017)
Qoraisha Lovely R (927624BAM036)

**Department:** CSE [AIML] | **Year:** 2026–2027

> *"The goal is not to build AI. The goal is to save lives. AI is just how we get there."*

---

## SLIDE 2 — Real-Time Problem Statement

### The Problem

Conventional disaster response relies on manual reconnaissance and fragmented communication between field teams, making coordination slow, error-prone, and dangerous for responders.

**Key Gaps in Current Disaster Response:**

1. **No real-time telemetry processing** — Sensor data from field equipment is collected manually and analysed offline, delaying critical decisions by hours.
2. **Single-AI limitations** — A single general-purpose LLM cannot separate risk assessment from victim localization from resource coordination; it mixes concerns and produces unstructured text.
3. **No structured decision chain** — Decisions are not traceable; there is no audit trail showing which evidence led to which recommendation.
4. **Information overload** — Commanders receive raw sensor feeds instead of actionable intelligence, leading to delayed or incorrect resource deployment.
5. **No human-in-the-loop workflow** — Critical actions (entering unstable structures, deploying rescue teams) happen without structured approval workflows.

---

## SLIDE 3 — Project Objectives

### D.E.X.T.E.R aims to:

1. **Orchestrate a multi-agent dependency graph** — Specialized AI agents (Risk, Victim, Resource, Knowledge, Rescue) execute concurrently or sequentially based on data dependencies, not a fixed pipeline.
2. **Convert rover telemetry into actionable rescue intelligence** — Real-time sensor streams (GPR, thermal, GPS, IMU, gas, weather) are processed into structured agent outputs with confidence scores.
3. **Provide explainable, traceable decisions** — Every agent produces typed, validated data with reasoning chains; no black-box outputs.
4. **Implement human-in-the-loop workflows** — HIGH/CRITICAL actions require structured commander approval with audit trails.
5. **Deliver a J.A.R.V.I.S.-style command interface** — Voice-initiated mission execution via D.E.X.T.E.R, with a cinematic boot sequence and real-time tactical dashboard.
6. **Enable real-time GPS-tactical mapping** — Leaflet-powered map with live sensor intensity overlays (seismic, thermal, structural, gas) and zone inspection.

---

## SLIDE 4 — Existing System & Its Limitations

### Existing Methodology

- Manual incident assessment by field commanders
- Radio-based team coordination
- Spreadsheet-based resource tracking
- Paper-based SOPs and building code references
- Post-incident manual documentation

### Technical Constraints

- **No real-time sensor integration** — Telemetry is collected manually and entered into systems after the fact.
- **Single-agent analysis** — One AI or one analyst produces a single, monolithic report mixing all concerns.
- **No dependency-aware execution** — All analysis steps run sequentially regardless of whether they can be parallelized.
- **No confidence calibration** — Recommendations lack domain-specific confidence scores.
- **No explainability** — Decisions cannot be traced back to the specific sensor data that caused them.
- **No structured HITL** — Critical actions are approved verbally, with no audit trail.

---

## SLIDE 5 — Proposed System

### D.E.X.T.E.R Architecture

D.E.X.T.E.R introduces a **multi-agent dependency graph** that processes real-time rover telemetry into structured rescue intelligence through specialized AI agents, each with one responsibility.

**Core Innovation: One Agent, One Responsibility**

| Agent | Purpose | Inputs | Outputs |
|-------|---------|--------|---------|
| **Risk Assessment** | Evaluate structural risk | Tilt, weather, building data | Risk score (0–1), likelihood, hazards, recommendation |
| **Victim Localization** | Locate victims via sensor fusion | Thermal, GPR, witness data | Zone probabilities, primary search zone, victim count |
| **Resource Coordination** | Assign teams & equipment | Risk + victim data | Task assignments, ETAs, resource utilization |
| **Knowledge Retrieval** | Query SOPs & building codes | Risk + victim data | Matched protocols, recommendations, confidence |
| **Rescue Coordination** | Synthesize all reports | All specialist outputs | Entry clearance, priority sequence, extraction techniques, safety constraints |
| **Orchestrator** | Coordinate the graph | All agent outputs | Unified mission briefing |

**Why Multi-Agent Beats Single-AI:**
- **Focused reasoning** — Each agent processes only relevant inputs
- **Concurrent execution** — Independent agents run in parallel (Risk + Victim simultaneously)
- **Composability** — New agents can be added without modifying existing ones
- **Traceable decisions** — Every output is typed, validated, and inspectable

---

## SLIDE 6 — System Architecture

### Dependency Graph

```
Risk Assessment ─────┐
                     ├──→ Resource Coordination ──→ Orchestrator ──→ Mission Briefing
Victim Localization ─┘        │
                              └──→ Knowledge Retrieval ──┘
                                        │
                              Rescue Coordination ──┘
```

### Technology Stack (Backend)

| Component | Technology |
|-----------|-----------|
| Agent Framework | Python 3.11, Dependency Graph Engine |
| API Server | FastAPI + SSE (Server-Sent Events) |
| State Management | TERRAState (shared mission state) |
| Simulation | Telemetry packet generator (GPR, Thermal, GPS, IMU, Gas, Weather) |
| Tests | 221 passing unit + integration tests |

### Technology Stack (Frontend)

| Component | Technology |
|-----------|-----------|
| UI Framework | React 19 + Vite |
| State | MissionContext (React Context + SSE streaming) |
| Map | Leaflet (dark tactical + satellite basemap) |
| Styling | Tailwind CSS + Glassmorphism design system |
| Animations | Framer Motion + Lenis smooth scroll |
| Voice | Web Speech API (no external keys, offline-safe) |

---

## SLIDE 7 — Flowchart

### Mission Lifecycle Flow

```
┌──────────────────────────────────────────────────────────┐
│  INCIDENT REPORTED                                        │
│  Commander initializes mission with incident description  │
└──────────────────────┬───────────────────────────────────┘
                       ▼
┌──────────────────────────────────────────────────────────┐
│  BOOT SEQUENCE — D.E.X.T.E.R ONLINE                      │
│  Sensors come online: GPR ✓ Thermal ✓ GPS ✓ IMU ✓       │
│  Telemetry stream begins                                 │
└──────────────────────┬───────────────────────────────────┘
                       ▼
┌──────────────────────────────────────────────────────────┐
│  CONCURRENT BATCH 1                                       │
│  ┌─────────────────┐  ┌─────────────────────┐            │
│  │ Risk Assessment  │  │ Victim Localization │            │
│  │ (no deps)        │  │ (no deps)            │            │
│  └────────┬────────┘  └──────────┬──────────┘            │
└───────────┼───────────────────────┼───────────────────────┘
            └───────────┬───────────┘
                        ▼
┌──────────────────────────────────────────────────────────┐
│  CONCURRENT BATCH 2                                       │
│  ┌─────────────────────┐  ┌─────────────────────┐        │
│  │ Resource Coordination│  │ Knowledge Retrieval  │        │
│  │ (deps: Risk+Victim)  │  │ (deps: Risk+Victim)  │        │
│  └────────┬────────────┘  └──────────┬──────────┘        │
└───────────┼───────────────────────────┼───────────────────┘
            └───────────┬───────────────┘
                        ▼
┌──────────────────────────────────────────────────────────┐
│  RESCUE COORDINATION                                      │
│  Synthesizes all reports → field-ready guidance           │
└──────────────────────┬───────────────────────────────────┘
                       ▼
┌──────────────────────────────────────────────────────────┐
│  ORCHESTRATOR → MISSION BRIEFING                          │
│  Structured summary: Risk, Zones, Victims, Actions       │
│  Commander reviews → HITL approval → Deployment          │
└──────────────────────────────────────────────────────────┘
```

---

## SLIDE 8 — Technology Stack

### Backend

| Layer | Technology | Purpose |
|-------|-----------|---------|
| API | FastAPI + Uvicorn | REST + SSE endpoints |
| Agents | Python 3.11 | Rule-based reasoning (LLM-ready) |
| State | TERRAState (Pydantic) | Append-only shared mission state |
| Simulation | ScenarioEngine | Real-time telemetry packet generation |
| Testing | pytest | 221 tests, full coverage |

### Frontend

| Layer | Technology | Purpose |
|-------|-----------|---------|
| UI | React 19 + Vite | Command center interface |
| Styling | Tailwind CSS + Custom Glass | Frosted-glass HUD design system |
| Map | Leaflet + CartoDB dark tiles | GPS tactical command map |
| Animation | Framer Motion + Lenis | Cinematic transitions + smooth scroll |
| Voice | Web Speech API | Wake-word detection + TTS narration |
| Streaming | SSE + EventSource | Real-time telemetry + timeline updates |

### AI / NLP

| Component | Approach |
|-----------|----------|
| Agent Reasoning | Rule-based with structured prompts (Groq LLM integration ready) |
| Knowledge Retrieval | Prototype keyword matcher (RAG-ready: embeddings + vector store planned) |
| Voice Assistant | D.E.X.T.E.R brain: wake-word parsing → command routing → response generation |
| Prompt Engineering | Structured prompts per agent; context-aware; prompt chaining for briefing generation |

---

## SLIDE 9 — Prompt Engineering

### D.E.X.T.E.R's Prompt Engineering Strategy

**1. Structured Agent Prompts**
Each agent receives a structured prompt containing only its relevant inputs (sensor data, weather, building info) and produces typed, validated outputs (risk score, zone probabilities, task assignments). No free-text reasoning — every output is schema-validated.

**2. Context-Aware Prompting**
The Orchestrator's briefing prompt receives all agent outputs and produces a structured mission summary. The prompt is context-aware: it references specific evidence chains, confidence scores, and agent reasoning.

**3. Prompt Chaining**
The mission lifecycle follows a prompt chain:
- Agent 1 (Risk) → output feeds Agent 3 (Resource)
- Agent 2 (Victim) → output feeds Agent 4 (Knowledge)
- Agents 3+4 → output feeds Agent 5 (Rescue Coordination)
- All → output feeds Orchestrator briefing

**4. Wake-Word Voice Interaction**
D.E.X.T.E.R parses partial speech transcripts in real-time for the wake word "dexter" (or "d.e.x.t.e.r"), strips it from the command, and routes the remaining text to the appropriate action (run mission, status, briefing, etc.).

**5. Explanation Prompts**
The Terra X chatbot receives the full mission state and answers contextual queries ("Why is B2 critical?", "Who is assigned?") with references to specific agent outputs and evidence.

**Honest Status:** Agents are currently rule-based. LLM integration via Groq is planned for Phase 2, which will enable genuine AI reasoning within each agent's structured prompt framework.

---

## SLIDE 10 — Expected Outcome

### Expected Outcomes

1. **Autonomous multi-agent disaster response** — 5 specialized agents + Orchestrator execute a dependency graph in < 15 seconds
2. **Real-time telemetry processing** — 288+ sensor packets per mission processed into structured intelligence
3. **Explainable AI decisions** — Every recommendation traces back to specific sensor data with confidence scores
4. **Voice-initiated mission execution** — "Dexter" wake-word triggers full system boot and mission launch
5. **GPS-tactical command map** — Real Leaflet map with 4 sensor layers (seismic, thermal, structural, gas) and zone inspector
6. **Human-in-the-loop workflow** — Commander approval required for HIGH/CRITICAL actions with full audit trail
7. **Cinematic command interface** — J.A.R.V.I.S.-style boot sequence, glassmorphism HUD, neural network backdrop

### Future Scope

1. **LLM-powered agent reasoning** — Groq integration for genuine AI analysis within each agent
2. **Full RAG knowledge base** — Vector embeddings + semantic search over NDRF SOPs, building codes, rescue protocols
3. **Real rover telemetry integration** — Connect to actual field sensors via MQTT/WebSocket
4. **Multi-mission support** — Dashboard for active and completed missions with historical analysis
5. **AR field visualization** — Overlay agent data on camera feed for field teams
6. **UAV-assisted reconnaissance** — Drone integration for aerial damage assessment
7. **Digital twin simulation** — Real-time building collapse simulation for training

---

## SLIDE 11 — Timeline & Team Responsibility

### Development Timeline

| Phase | Duration | Deliverables |
|-------|----------|-------------|
| Phase 1: Backend Engine | 2 weeks | Dependency-graph agent framework, TERRAState, FastAPI server |
| Phase 2: Agent Intelligence | 2 weeks | Risk, Victim, Resource, Knowledge agents with rule-based reasoning |
| Phase 3: Simulation | 1 week | Telemetry packet generator, scenario presets, environment modeling |
| Phase 4: Frontend Command Center | 2 weeks | React UI, glassmorphism design, Leaflet map, timeline |
| Phase 5: Voice & Mission Assistant | 1 week | D.E.X.T.E.R voice system, Terra X chatbot, boot sequence |
| Phase 6: Polish & Integration | 1 week | Glassmorphism refinement, smooth scroll, accessibility, 221 tests |

### Team Roles

| Member | Role | Responsibility |
|--------|------|---------------|
| Vijayashiyamala V | Backend Lead | Agent framework, FastAPI, state management, testing |
| Girujashri | Frontend Lead | React UI, Leaflet map, glassmorphism design, animations |
| Qoraisha Lovely R | AI/Integration Lead | Prompt engineering, voice system, knowledge retrieval, integration |

### Key Metrics

- **221 backend tests passing**
- **6 specialized agents** in dependency graph
- **< 15 seconds** total mission execution time
- **288+ telemetry packets** processed per mission
- **0 lint errors**, clean production build
