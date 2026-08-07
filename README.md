# Inzora Terra OS

An AI-Native Disaster Response Operating System. Converts rover telemetry into actionable
rescue intelligence through a multi-agent dependency graph (Risk Assessment, Victim Localization,
Resource Coordination, Knowledge Retrieval) coordinated by an Orchestrator, sharing a structured
mission state (TERRAState).

See `BLUEPRINT.md` for the full product definition (the single source of truth).

## Repository Layout

```
backend/    Python multi-agent pipeline (CLI entry: python -m backend.run)
frontend/   React + Vite command-center UI
docs/       Design, tool, and workflow documentation
```

## Backend

```bash
cd backend
pip install -r requirements.txt
python -m backend.run
```

Requires `GROQ_API_KEY` in `.env` (see `.env.example`) for LLM features (Phase 2).
The current agents are rule-based; the demo runs with no external services.

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

- Backend: working CLI pipeline (sequential; dependency-graph rework planned in Phase 1)
- Frontend: working UI with mock data (backend API integration planned in Phase 1)
- Frontend ↔ backend: not yet connected
