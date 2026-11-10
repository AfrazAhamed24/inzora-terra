# Inzora Terra OS

An AI-Native Disaster Response Operating System. Converts rover telemetry into actionable
rescue intelligence through a multi-agent dependency graph (Risk Assessment, Victim Localization,
Resource Coordination, Knowledge Retrieval) coordinated by an Orchestrator, sharing a structured
mission state (TERRAState).

See `BLUEPRINT.md` for the full product definition (the single source of truth).

## Repository Layout

```
backend/          Python multi-agent pipeline (CLI entry: python -m backend.run)
frontend/         React + Vite command-center UI
docs/             Design, workflow, specs, and archived/frontend notes
ppt/              Presentation content and generator script
vision-prototype/ Standalone INZORA-X vision system (not wired into the mission flow)
```

`BLUEPRINT.md`, `AGENTS.md`, `MEMORY.md`, and `opencode.json` stay at the repository root
because they are the product source of truth and tool configuration.

## Backend

```bash
pip install -r backend/requirements.txt
python -m backend.run          # CLI mission pipeline
python -m backend.api.main     # FastAPI server (http://127.0.0.1:8000)
```

Tests:

```bash
python -m pytest
```

Requires `GROQ_API_KEY` in `.env` (see `.env.example`) for LLM features (Phase 2).
The current agents are rule-based; the demo runs with no external services.
The API exposes REST + SSE under `/api/v1` (missions, telemetry, replay, assistant).

## Frontend

```bash
cd frontend
npm install
npm run dev
```

Build & lint:

```bash
npm run build
npm run lint
```

## Status

- Backend: dependency-graph engine (Phase 1) + FastAPI mission API with SSE streaming (Phase 2A); 221 tests passing
- Frontend: React command center connected to the live API (mission lifecycle, telemetry stream, timeline)
- Mission Assistant: **D.E.X.T.E.R** (Disaster EXecutive Tactical Emergency Responder) — a J.A.R.V.I.S.-style voice conductor that narrates the mission: environment scan → agents activate and report one by one → cinematic final briefing. Voice input/output via the Web Speech API (no keys, offline-safe); agents are rule-based until LLM integration lands.
- **Rescue Coordination Agent**: the last specialist in the dependency graph. It synthesizes risk, victim, resource, and knowledge reports into a field-ready `rescue_guidance` (entry clearance, priority sequence, objectives, extraction techniques, safety constraints, triage + comms notes) that the final briefing surfaces as the Rescue Guidance panel.
- **Terra X**: the single D.E.X.T.E.R companion chat docked bottom-left — quick-query chips (risk, victims, next actions, rescue guidance, who's working) answered from live mission state with voice replies.
- **Voice commands**: press the mic (bottom-right) and say "Dexter, run the mission", "Dexter, status", "Dexter, open the assistant", "Dexter, show the briefing", "Dexter, mute". Any other phrase is answered from live mission state.
