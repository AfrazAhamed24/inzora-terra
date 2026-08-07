# Inzora Terra OS — Configuration Specification

**Spec version:** 1.0 (Phase 1A)
**Status:** Design — implementation reference for Phase 1B
**Target:** evolution of `backend/core/config.py` (currently provider-only)

## 1. Purpose

Centralizes all tunable behavior — LLM provider selection, simulation, orchestration timeouts,
logging, HITL, and API — in one validated settings object loaded from environment variables
(`.env`). No module reads `os.getenv` directly; all configuration flows through this object.

## 2. Principles

1. **Single source of truth.** One settings object, injected into orchestrator/agents/simulation.
2. **Env-first, `.env`-file convenience.** Env vars override; `.env` provides local defaults.
3. **Validated at load.** Bad enums, negative timeouts, and unknown providers fail fast at startup.
4. **Secret discipline.** Keys are loaded but never logged or exposed (LOGGING_SPEC §8, API §6).
5. **Namespaced keys.** Prefixes (`simulation.`, `orchestrator.`, `logging.`, `api.`) mirror the
   subsystem structure.

## 3. Settings Groups

### 3.1 Provider (evolution of today's `Settings`)

| Key                  | Type   | Default              | Notes                              |
|----------------------|--------|----------------------|------------------------------------|
| `llm.provider`       | enum   | `groq`               | `gemini` / `groq` / `openai` / `claude` / `local` |
| `llm.gemini_api_key` | secret | —                    |                                    |
| `llm.gemini_model`   | string | `models/gemini-2.5-flash` |                             |
| `llm.groq_api_key`   | secret | —                    |                                    |
| `llm.groq_model`     | string | `llama-3.3-70b-versatile` |                            |
| `llm.openai_api_key` | secret | —                    |                                    |
| `llm.claude_api_key` | secret | —                    |                                    |
| `llm.local_endpoint` | string?| —                    | for `local` provider               |
| `llm.timeout_seconds`| float  | `30.0`               | per LLM call                       |
| `llm.max_retries`    | int    | `2`                  | per LLM call                       |

`LLMProvider` enum is retained. Agents are rule-based in Phase 1; provider config is used by the
future LLM-backed layers and the Mission Assistant.

### 3.2 Simulation

| Key                          | Type   | Default      | Notes                                      |
|------------------------------|--------|--------------|--------------------------------------------|
| `simulation.source`          | enum   | `simulated`  | `simulated` / future `drone`/`rover`/`gpr` |
| `simulation.scenario`        | enum   | `scenario_collapse_rain` | preset (SIMULATION_SPEC §6) |
| `simulation.tick_seconds`    | float  | `1.0`        | wall-clock gap between ticks               |
| `simulation.time_multiplier` | float  | `1.0`        | mission-minutes per wall-minute            |
| `simulation.ticks_per_cycle` | int    | `60`         | packets per batch emit                     |
| `simulation.seed`            | int    | `20260815`   | determinism seed                           |

### 3.3 Orchestrator

| Key                              | Type   | Default | Notes                                     |
|----------------------------------|--------|---------|-------------------------------------------|
| `orchestrator.agent_timeout`     | float  | `30.0`  | per-agent run timeout (s)                 |
| `orchestrator.level_timeout`     | float  | `70.0`  | whole-level timeout (s)                   |
| `orchestrator.max_retries`       | int    | `2`     | retries per agent cycle                   |
| `orchestrator.retry_backoff_base`| float  | `1.0`   | linear backoff base (s)                   |
| `orchestrator.fallback_source`   | enum   | `simulated` | `simulated` / `none`                  |
| `orchestrator.llm_backed_agents` | bool   | `false` | master switch for LLM-backed agents (Phase ≥ 2) |

### 3.4 Logging

| Key                    | Type   | Default   | Notes                              |
|------------------------|--------|-----------|------------------------------------|
| `logging.level`        | enum   | `INFO`    | `DEBUG`/`INFO`/`WARNING`/`ERROR`/`CRITICAL` |
| `logging.buffer_size`  | int    | `1000`    | in-memory ring buffer              |
| `logging.jsonl_path`   | string?| —         | optional durable JSONL file        |
| `logging.console`      | bool   | `true`    | pretty console sink (dev)          |

### 3.5 HITL

| Key                  | Type   | Default | Notes                                             |
|----------------------|--------|---------|---------------------------------------------------|
| `hitl.timeout`       | float  | `120.0` | decision wait (s)                                 |
| `hitl.timeout_action`| enum   | `escalate` | `escalate` (auto-approve) / `reject` (timeout = overridden w/ default) |
| `hitl.risk_alert_threshold` | float | `0.8` | triggers `confirm` (AGENTS.md)         |
| `hitl.confidence_verify_threshold` | float | `0.5` | triggers `verify` (AGENTS.md)   |

### 3.6 API

| Key                | Type   | Default     | Notes                          |
|--------------------|--------|-------------|--------------------------------|
| `api.host`         | string | `127.0.0.1` | loopback by default (demo)     |
| `api.port`         | int    | `8000`      |                                |
| `api.cors_origins` | list   | `["http://localhost:5173"]` | Vite dev origin |

## 4. Env Var Mapping

Namespaces map to env vars with `__` separators, or `TERRA_` prefix + dot keys. Recommended form:

```
TERRA_LLM_PROVIDER=groq
TERRA_LLM_GROQ_API_KEY=sk-...
TERRA_SIMULATION_SCENARIO=scenario_collapse_rain
TERRA_SIMULATION_SEED=20260815
TERRA_ORCHESTRATOR_AGENT_TIMEOUT=30
TERRA_HITL_TIMEOUT=120
TERRA_API_HOST=127.0.0.1
TERRA_API_PORT=8000
```

Backward compatibility: existing bare keys (`LLM_PROVIDER`, `GROQ_API_KEY`, `GEMINI_MODEL_NAME`,
`OPENAI_API_KEY`, `CLAUDE_API_KEY`) remain accepted during migration and are read as defaults
(MIGRATION_PLAN.md §6).

## 5. Validation Rules

- `llm.provider` must be in the provider enum; unknown → startup error.
- Timeouts, retries, buffer size, tick params must be > 0 (buffer ≥ 1).
- `simulation.source` in `{simulated}` for Phase 1; others deferred.
- `hitl.timeout_action` in `{escalate, reject}`.
- `logging.level` in the five levels.
- `simulation.scenario` must resolve to a registered scenario preset.

## 6. `.env.example` Addition

Update root `.env.example` (and keep `frontend/.env.example` for `VITE_` vars) with the §4 sample,
plus a comment block explaining each group. Secrets remain blank in the example.

## 7. Consumption Pattern

- Components receive the settings object at construction (constructor injection), never global
  reads — enabling deterministic tests (overridden settings per test).
- The orchestrator reads `orchestrator.*`, `hitl.*`; the simulation reads `simulation.*`; the
  EventSink reads `logging.*`; the API server reads `api.*` and exposes a redacted summary via
  `/api/health`.

## 8. Non-Goals (Phase 1)

- No runtime hot-reload of config (process restart required).
- No per-mission config override via API (fixed for a mission; a future `POST /api/missions`
  body may add `environment_id` only).
- No config secrets UI.
