# Inzora Terra OS — Phase 0.5: Repository Audit & Cleanup Plan

> Engineering audit only. No files moved, renamed, deleted, or modified during this phase.
> Output is pending review and approval before any cleanup begins.

---

## 1. Executive Summary

Inzora Terra OS is currently a **two-project repository fused into one directory**.

1. **A working Python agent backend** (`terra_x/`) — a rule-based multi-agent pipeline that runs successfully from the CLI.
2. **A working React frontend** (`frontend/src/App.jsx`) — a single-file glassmorphism mission-control UI.
3. **A completely unrelated leftover project** ("Catalyst" / "Product Manager Agent") — `frontend/src/components/dashboard/*`, `frontend/src/components/ui/*`, `frontend/src/lib/{api,chat-store,utils,components.json}.ts`, plus broken `terra_x/core/{base,factory,groq}.py`. These reference an AI "Product Manager" chat app with a *different* API contract (`/chat`, `/state`, `StageInfo`, idea→launch journey). They are orphans in this codebase.
4. **An empty `sample bot/` folder** and several prototype leftovers.

The **frontend and backend are completely disconnected**: no API server exists, `frontend/src/lib/api.ts` targets `localhost:8001`/`8002` and does not match the backend, and `App.jsx` renders hardcoded mock data.

**Critical issues** (must fix before anything else):
- No Python dependency manifest (`requirements.txt` / `pyproject.toml`) — backend is unreproducible.
- Broken imports: `terra_x/core/{base,factory,groq}.py` import `from models.base import ...` / `from core.config import ...`, but no `models/` package exists and imports are not package-relative. `groq.py` additionally requires the `openai` package (unlisted).
- Duplicate Vite configs (`vite.config.js` and `vite.config.ts`) — one has the `@` alias and `/api` proxy, the other does not; the browser loads whichever Vite picks.
- API secret committed in **two** `.env` files (root + `terra_x/`).
- Repo is not a git repository — no version control, no baseline.
- `frontend/README.md` is the unmodified Vite template; `AGENTS.md`/`DESIGN.md`/`MEMORY.md`/`TOOLS.md`/`WORKFLOW.md` were written for a different (v3/v4 Apple-green) design and now conflict with the shipped black/white design and the v1.1 blueprint.

**Repository Health Score: 4.1 / 10**

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Backend correctness | 7/10 | Runs end-to-end; rule-based logic is coherent |
| Backend structure | 4/10 | Orphan LLM layer with broken imports; no deps manifest |
| Frontend correctness | 6/10 | Loads and renders; mock data only |
| Frontend structure | 3/10 | 562-line monolith + 16 orphan files + foreign "Catalyst" app |
| Config hygiene | 2/10 | Duplicate vite configs, triple env files, committed secrets |
| Docs alignment | 2/10 | Stale docs contradict shipped design & v1.1 blueprint |
| Git hygiene | 0/10 | No repository |

---

## 2. Repository Tree Review

```
project catalyst/
├── .env                          # GROQ_API_KEY (COMMITTED SECRET)
├── .opencode/                    # opencode config (agents, commands, skills)
│   ├── agent/                    # 5 agent prompt files
│   ├── command/                  # 2 slash commands
│   ├── skills/terra-x-design/    # design skill
│   ├── node_modules/, package.json, package-lock.json
│   └── .gitignore
├── AGENTS.md / DESIGN.md / MEMORY.md / TOOLS.md / WORKFLOW.md   # stale docs
├── BLUEPRINT.md                  # v1.1 — the source of truth (KEEP)
├── opencode.json                 # agent config
├── PHASE-0.5-AUDIT.md            # this document
├── frontend/
│   ├── .env                      # VITE_API_URL=http://localhost:8002
│   ├── .gitignore
│   ├── .oxlintrc.json
│   ├── README.md                 # UNMODIFIED Vite template
│   ├── index.html
│   ├── package.json / package-lock.json
│   ├── terra_x_dashboard.html    # 551-line standalone HTML prototype (orphan)
│   ├── tsconfig.json / tsconfig.app.json / tsconfig.node.json
│   ├── vite.config.js            # NO alias, NO proxy
│   ├── vite.config.ts            # HAS @ alias + /api proxy
│   ├── dist/                     # stale build output (regenerable)
│   ├── public/  favicon.svg, icons.svg
│   └── src/
│       ├── App.jsx               # 562-line monolith (THE working UI)
│       ├── index.css             # working global styles
│       ├── main.tsx              # entry → imports App.jsx
│       ├── assets/  hero.png, react.svg, vite.svg (unused)
│       ├── components/
│       │   ├── HeroSection.jsx        # ORPHAN (v3/v4 green theme)
│       │   ├── ImmersiveMap.jsx       # ORPHAN
│       │   ├── AgentWindows.jsx       # ORPHAN
│       │   ├── BackgroundAtmosphere.jsx  # ORPHAN
│       │   ├── CommandPalette.jsx     # ORPHAN
│       │   ├── MissionTimeline.jsx    # ORPHAN
│       │   ├── Skeleton.jsx           # ORPHAN
│       │   ├── Toast.jsx              # ORPHAN (depends on icons.jsx)
│       │   ├── icons.jsx              # ORPHAN (only used by Toast.jsx)
│       │   ├── dashboard/             # FOREIGN "Catalyst" app (5 files)
│       │   └── ui/                    # FOREIGN shadcn-ish (3 files)
│       ├── hooks/                # EMPTY folder
│       └── lib/
│           ├── api.ts            # FOREIGN API client (localhost:8001)
│           ├── chat-store.ts     # FOREIGN chat hook ("Hello Afraz…")
│           ├── components.json   # misplaced shadcn config (belongs at frontend/)
│           └── utils.ts          # cn() — used only by foreign components
└── terra_x/
    ├── .env                      # GROQ_API_KEY (SECOND COPY)
    ├── run.py                    # CLI entry — works
    ├── __init__.py
    ├── agents/
    │   ├── base.py               # BaseAgent (KEEP)
    │   ├── risk_assessment/agent.py     # works
    │   ├── victim_localization/agent.py # works
    │   ├── resource_coordination/agent.py  # works
    │   └── knowledge/agent.py    # works (keyword matching, NOT real RAG)
    ├── core/
    │   ├── base.py               # ORPHAN LLM ABC (broken import)
    │   ├── factory.py            # ORPHAN LLM factory (broken import)
    │   ├── groq.py               # ORPHAN Groq client (broken import)
    │   ├── config.py             # Settings (KEEP)
    │   ├── gop.py                # TERRAState (KEEP)
    │   ├── tools.py              # Sensor/weather/building mocks (KEEP)
    │   └── __init__.py
    ├── interfaces/
    │   └── protocol.py           # AgentProtocol (KEEP)
    └── orchestration/
        └── orchestrator.py       # Sequential pipeline (KEEP; Phase 1 reworks)
```

---

## 3. Folder Structure Problems

| # | Problem | Detail |
|---|---------|--------|
| F1 | **Foreign "Catalyst" app fused in** | `frontend/src/components/dashboard/*`, `frontend/src/components/ui/*`, `frontend/src/lib/{api,chat-store,components.json}.ts` implement a *Product Manager chat agent* (idea→launch journey, `StageInfo`, "New Project" sidebar). Unrelated to Terra OS. |
| F2 | **Empty folder** | `sample bot/` — zero files. Delete. |
| F3 | **Empty hooks folder** | `frontend/src/hooks/` — no hooks. Remove until needed. |
| F4 | **Monolithic single file** | `frontend/src/App.jsx` (562 lines) contains Nav, Hero, Dashboard, Agent, RAG, Timeline, Bot, StatusPill, SensorBadge, LegendItem inline. Should decompose per blueprint (Phase 6). |
| F5 | **Orphan components split from the app** | Standalone `components/{HeroSection,ImmersiveMap,AgentWindows,...}.jsx` are the rejected v3/v4 green-theme versions, never imported by `App.jsx` (verified 0 import refs). |
| F6 | **Misplaced config** | `frontend/src/lib/components.json` is a shadcn config file; belongs at `frontend/` root per shadcn convention. |
| F7 | **Standalone HTML prototype** | `frontend/terra_x_dashboard.html` — a 551-line self-contained dashboard using CDN Tailwind/Phosphor; superseded by the React app. |
| F8 | **Backend LLM layer interleaved with Terra core** | `terra_x/core/{base,factory,groq}.py` are an LLM-client layer copied from a "catalyst.llm" project, sitting inside Terra's core but unused by agents. |
| F9 | **No Python package manifest** | No `requirements.txt` or `pyproject.toml` anywhere — can't reproduce the environment. |
| F10 | **Build artifacts committed** | `frontend/dist/` is stale output; regenerable. |
| F11 | **No top-level `.gitignore`** | Root has no ignore file; `.env` files with secrets are unguarded. |
| F12 | **Agent prompts live outside the backend** | `.opencode/agent/*.md` duplicate the role definitions already in `terra_x/agents/*` — two sources of truth for the same 4 agents + orchestrator. |

---

## 4. Naming Problems

| # | Current | Problem | Recommendation |
|---|---------|---------|----------------|
| N1 | `KnowledgeRAGAgent` / `knowledge_rag` | Misleading: it is keyword matching, not RAG (BLUEPRINT v1.1 explicitly brands it "Knowledge Retrieval Engine (Prototype)"). | Rename to `KnowledgeRetrievalAgent` / `knowledge_retrieval`. |
| N2 | `terra_x/core/groq.py` | Implies generic Groq client; it is a Catalyst-project LLM adapter with broken imports. | Delete or move to `terra_x/llm/` during Phase 2 (LLM integration), fixing imports. |
| N3 | `models.base`, `core.config` imports | Import paths that don't exist in this package. | Fix to `terra_x.core.config` (package-relative) or delete. |
| N4 | `TERRA-X` (UI) vs `Inzora Terra OS` (blueprint) | UI header/branding says TERRA-X; product name in BLUEPRINT is Inzora Terra OS. | Align UI copy to "Inzora Terra OS". |
| N5 | `RAG` / `RAG_DOCS` / `RAGSection` / "Powered by RAG" in `App.jsx` | False claim (no RAG). | Rename to "Knowledge" / `KNOWLEDGE_DOCS`; change "Powered by RAG" to "Knowledge Retrieval (Prototype)". |
| N6 | `.opencode/agent/*.md` vs `opencode.json` agent keys | Agent files are `risk-assessment.md` etc. but `opencode.json` defines `terra-risk`, `terra-victim`, `terra-resource`, `terra-knowledge`, `orchestrator`. Mismatch. | Reconcile names to one convention (e.g. `risk-assessment`). |
| N7 | `frontend` package name | `package.json` name is generic `"frontend"`. | Rename to `terra-x-frontend` (or `inzora-frontend`). |
| N8 | `terraform`-adjacent package dir `terra_x` | Underscore+`x` reads like Terraform. | Consider `backend/` or `inzora/` in the migration plan (optional). |

---

## 5. Dead Code Report

Legend: **KEEP** = used by the running app/backend; **DELETE** = unreferenced anywhere in the shipped surface; **MERGE** = extract value into another file then delete; **RENAME** = keep but fix identity; **MOVE** = relocate to its correct home.

### 5.1 Frontend

| File | Verdict | Evidence |
|------|---------|----------|
| `src/App.jsx` | KEEP | Entry point via `main.tsx`; the working UI. (Decompose in Phase 6.) |
| `src/main.tsx` | KEEP | Bootstrap; imports `App.jsx`. |
| `src/index.css` | KEEP | Working global stylesheet. |
| `src/components/HeroSection.jsx` | DELETE | 0 import refs; v3/v4 green theme; superseded by inline hero in App.jsx. |
| `src/components/ImmersiveMap.jsx` | DELETE | 0 import refs. |
| `src/components/AgentWindows.jsx` | DELETE | 0 import refs. |
| `src/components/BackgroundAtmosphere.jsx` | DELETE | 0 import refs; 7-line no-op. |
| `src/components/CommandPalette.jsx` | DELETE | 0 import refs (no Cmd+K handler in App.jsx). |
| `src/components/MissionTimeline.jsx` | DELETE | 0 import refs. |
| `src/components/Skeleton.jsx` | DELETE | 0 import refs. |
| `src/components/Toast.jsx` | DELETE | 0 import refs. |
| `src/components/icons.jsx` | DELETE | Only imported by `Toast.jsx` (also orphaned). App.jsx uses `lucide-react`. |
| `src/components/dashboard/ChatWorkspace.tsx` | DELETE | Foreign Catalyst app; 0 import refs; uses `@/lib/chat-store` + `StageInfo`. |
| `src/components/dashboard/MessageInput.tsx` | DELETE | Foreign; 0 refs. |
| `src/components/dashboard/Sidebar.tsx` | DELETE | Foreign; 0 refs. |
| `src/components/dashboard/SummaryPanel.tsx` | DELETE | Foreign; 0 refs. |
| `src/components/dashboard/TypingIndicator.tsx` | DELETE | Foreign; only used by ChatWorkspace. |
| `src/components/ui/button.tsx` | DELETE | Only used by foreign dashboard files. (App.jsx has its own buttons.) |
| `src/components/ui/scroll-area.tsx` | DELETE | Only used by foreign files. |
| `src/components/ui/separator.tsx` | DELETE | 0 refs anywhere. |
| `src/lib/api.ts` | DELETE | Foreign contract (`/chat`, `/state`, localhost:8001). Backend has no such endpoints. |
| `src/lib/chat-store.ts` | DELETE | Foreign hook ("Hello Afraz 👋 I'm your Product Manager Agent"). |
| `src/lib/utils.ts` (`cn`) | DELETE | Only consumed by foreign `ui/*`/`dashboard/*`. |
| `src/lib/components.json` | MOVE | shadcn config → `frontend/components.json`. |
| `src/hooks/` | DELETE | Empty folder. |
| `src/assets/hero.png`, `react.svg`, `vite.svg` | DELETE | Unused (App.jsx uses Unsplash URLs; Vite boilerplate svgs). |
| `public/icons.svg` | DELETE | Unreferenced (check index.html — not loaded). |
| `public/favicon.svg` | KEEP | Referenced by `index.html`. |
| `dist/` | DELETE | Stale build output. |
| `terra_x_dashboard.html` | DELETE | Superseded standalone prototype. |
| `README.md` | REPLACE | Unmodified Vite template → project README. |

### 5.2 Backend

| File | Verdict | Evidence |
|------|---------|----------|
| `run.py` | KEEP | CLI entry — runs successfully. |
| `core/gop.py` | KEEP | `TERRAState` — used by all agents. |
| `core/tools.py` | KEEP | Mock sensor/weather/building tools — used by run.py. |
| `core/config.py` | KEEP | `Settings` — used. |
| `core/base.py` | DELETE | LLM ABC with broken `models.base` import; unused by agents. (Recreate properly in Phase 2.) |
| `core/factory.py` | DELETE | LLM factory with broken `models.*` imports; unused. |
| `core/groq.py` | DELETE | Groq client with broken `models.base` import; unused. (Recreate in Phase 2.) |
| `interfaces/protocol.py` | KEEP | `AgentProtocol` — used by orchestrator. |
| `agents/base.py` | KEEP | `BaseAgent` — used by all agents. |
| `agents/{risk_assessment,victim_localization,resource_coordination,knowledge}/agent.py` | KEEP | All four run successfully. |
| `orchestration/orchestrator.py` | KEEP | Works; sequential (Phase 1 reworks to dependency graph). |

### 5.3 OpenCode / Tooling

| File | Verdict | Evidence |
|------|---------|----------|
| `opencode.json` | KEEP | Active config; reconcile agent names with `.opencode/agent/*.md`. |
| `.opencode/agent/*.md` | MERGE | Role prompts duplicate `terra_x/agents/*` responsibilities; keep as agent orchestration prompts but align names & RAG→Retrieval. |
| `.opencode/command/*.md` | KEEP | Slash commands (update to new names). |
| `.opencode/skills/terra-x-design/SKILL.md` | KEEP | Design skill (align to new design tokens). |

---

## 6. Duplicate File Report

| # | Duplicate set | Why it happened | Which survives |
|---|---------------|-----------------|----------------|
| D1 | `frontend/vite.config.js` **and** `frontend/vite.config.ts` | `.ts` created with alias+proxy; `.js` created later/earlier without them; both committed. | **Single `vite.config.ts`** (has `@` alias + `/api` proxy). Delete `.js`. |
| D2 | `.env` (root), `terra_x/.env`, `frontend/.env` | Secret copied into two places; frontend var in third. | **One root `.env.example`** + documented env vars; delete committed real `.env` files; add `.env` to `.gitignore`. |
| D3 | `models.*` LLM layer (`core/{base,factory,groq}.py`) vs `openai` usage | Copied from an unrelated "Catalyst/LLM factory" project into Terra core. | **Delete all three**; rebuild a thin LLM adapter in Phase 2 inside `terra_x/llm/`. |
| D4 | Standalone `components/*.jsx` vs inline sections in `App.jsx` | Two successive redesigns; old design kept as files, new design inlined. | **App.jsx inline version** (current shipped). Delete the orphan files. |
| D5 | `icons.jsx` vs `lucide-react` | Early custom icon set before lucide was adopted. | **lucide-react**. Delete `icons.jsx`. |
| D6 | Docs (AGENTS/DESIGN/MEMORY/TOOLS/WORKFLOW) vs BLUEPRINT v1.1 | Docs describe v3/v4 green design & sequential/parallel pipeline; blueprint v1.1 describes black/white design + dependency graph + Retrieval naming. | **BLUEPRINT.md is source of truth**; rewrite/trim the five `.md` files to match v1.1 (see §8). |
| D7 | `.opencode/agent/*.md` vs `opencode.json` agent keys | Two naming conventions created at different times. | **One convention** — pick `risk-assessment`, `victim-localization`, `resource-coordination`, `knowledge-retrieval`, `orchestrator`; update `opencode.json`. |
| D8 | `dist/` build vs `src/` | Regenerable artifact committed. | Delete `dist/`; ensure `.gitignore` covers it. |

---

## 7. Dependency Report

### 7.1 Frontend (`frontend/package.json`)

**Used (KEEP):**
| Package | Used by |
|---------|---------|
| `react`, `react-dom` | App entry |
| `framer-motion` | App.jsx animations |
| `lenis` | App.jsx smooth scroll |
| `lucide-react` | App.jsx icons |
| `tailwindcss`, `@tailwindcss/vite` | index.css + build |
| `vite`, `@vitejs/plugin-react` | build/dev |
| `typescript`, `oxlint` | build + lint |

**Unused / Foreign (REMOVE):**
| Package | Evidence |
|---------|----------|
| `@radix-ui/react-avatar` | 0 refs; foreign dashboard only |
| `@radix-ui/react-collapsible` | 0 refs |
| `@radix-ui/react-dialog` | 0 refs |
| `@radix-ui/react-dropdown-menu` | 0 refs |
| `@radix-ui/react-scroll-area` | 0 refs (ui/scroll-area is hand-rolled) |
| `@radix-ui/react-separator` | 0 refs |
| `@radix-ui/react-slot` | 0 refs |
| `@radix-ui/react-tooltip` | 0 refs |
| `@types/react-syntax-highlighter` | 0 refs |
| `class-variance-authority` | 0 refs (ui/button is hand-rolled) |
| `clsx`, `tailwind-merge` | Only via `lib/utils.ts` (foreign-only) |
| `gsap` | 0 refs |
| `motion` | 0 refs (App.jsx uses `framer-motion`; `motion` is the v12 successor name — pick ONE) |
| `react-markdown` | 0 refs |
| `react-syntax-highlighter` | 0 refs |
| `recharts` | 0 refs |

> Note: `framer-motion@12` and `motion@12` are the same library renamed. Keep `motion` (the modern name) or `framer-motion` (current code) — not both.

### 7.2 Backend

**No manifest exists.** Imports actually required at runtime:
- `pydantic` (gop.py, base.py)
- `pydantic-settings` (config.py)
- `openai` (groq.py — orphan, but listed so Phase 2 build works)
- `fastapi` + `uvicorn` — **future** (Phase 1 API) — not yet needed

**Action:** create `backend/requirements.txt` (or `pyproject.toml`) with `pydantic`, `pydantic-settings`, `openai`; add `fastapi`/`uvicorn` in Phase 1.

---

## 8. Documentation Report

| Doc | Status | Problem | Action |
|-----|--------|---------|--------|
| `BLUEPRINT.md` | **AUTHORITATIVE** | v1.1 — the single source of truth. | KEEP; reference from all other docs. |
| `AGENTS.md` | KEEP (trim) | Role rules mostly valid; mentions "Knowledge/RAG Agent" | Update to "Knowledge Retrieval Agent (Prototype)"; align risk thresholds to blueprint. |
| `DESIGN.md` | REWRITE | Describes Apple-green v3/v4 vision, "interface should disappear", dashboard-like layout — all **rejected**; shipped design is black `#09090b` + `#fafafa` glassmorphism. | Rewrite as design tokens + component spec for the shipped design; or delete and move to `docs/`. |
| `MEMORY.md` | KEEP (align) | TERRAState schema mostly matches `core/gop.py`; minor drift (fields list). | Update to match `gop.py` exactly. |
| `TOOLS.md` | REWRITE | Describes tools (`get_thermal_data`, `get_gpr_data`, OpenWeatherMap) that **don't exist** in `core/tools.py`. | Rewrite to describe the actual mock tools; mark "simulated". |
| `WORKFLOW.md` | REWRITE | Describes sequential + "Knowledge can run in parallel" — conflicts with blueprint dependency graph. | Rewrite to dependency-graph execution. |
| `frontend/README.md` | REPLACE | Vite boilerplate. | Project README (setup, env vars, run commands). |
| Missing: `README.md` at root | ADD | No root README. | Short product README. |
| Missing: `CHANGELOG.md`, `ARCHITECTURE.md` | OPTIONAL | For long-term maintainability. | Add in later phase if desired. |

---

## 9. Technical Debt Report

### CRITICAL (blocks everything)
| ID | Debt | Why |
|----|------|-----|
| T1 | No Python dependency manifest | Environment unreproducible; new devs can't run backend. |
| T2 | Broken imports in `core/{base,factory,groq}.py` | `from models.base import …` — module doesn't exist; code is dead but if imported it crashes. |
| T3 | Committed API secrets (2 × `.env`) | GROQ key leaked in repo; no `.gitignore` protection. |
| T4 | No version control | No history, no rollback, no baseline for cleanup. |
| T5 | Frontend/backend disconnected | `lib/api.ts` contract (localhost:8001, `/chat`, `/state`) doesn't match backend; UI is 100% mock. Core product promise unfulfilled. |

### HIGH
| ID | Debt | Why |
|----|------|-----|
| T6 | Duplicate Vite configs | Ambiguous which is used; alias `@` and `/api` proxy only exist in `.ts`. |
| T7 | 562-line `App.jsx` monolith | Unmaintainable; every new feature grows it. (Phase 6 decomposition.) |
| T8 | 16 orphan files + foreign Catalyst app in `src/` | Confuses developers; `tsc -b`/lint may choke on foreign types. |
| T9 | Stale docs contradict blueprint | New devs follow DESIGN.md and rebuild the rejected green theme. |
| T10 | Agents are hardcoded rule engines with no test suite | No tests anywhere in repo; refactors (Phase 1) risk silent regressions. |
| T11 | Orchestrator is sequential, blueprint says dependency graph | Behavioral mismatch; Phase 1 must reconcile. |
| T12 | "RAG" claims in UI/code with no RAG | Misrepresents capability (audit judges). |
| T13 | No backend logging/config separation | run.py prints to stdout; no structured logging. |

### MEDIUM
| ID | Debt | Why |
|----|------|-----|
| T14 | `dist/` committed | Stale artifacts; churn on every build. |
| T15 | Standalone HTML prototype + empty `sample bot/` | Confusion; prototype leftovers. |
| T16 | `opencode.json` agent names ≠ `.opencode/agent/*.md` filenames | Broken agent wiring risk. |
| T17 | Config `LLMProvider` enum lists 5 providers; only GROQ wired | Dead configuration surface. |
| T18 | No lint/format for Python | No ruff/black/type hints enforcement. |
| T19 | `frontend/.oxlintrc.json` only; no ESLint/Prettier | Inconsistent frontend style enforcement. |
| T20 | Hardcoded incident/evidence in `run.py` | No way to vary scenarios except editing code. |

### LOW
| ID | Debt | Why |
|----|------|-----|
| T21 | Unused assets (`hero.png`, `react.svg`, `vite.svg`, `public/icons.svg`) | Dead bytes. |
| T22 | Generic package name `frontend` | Cosmetic. |
| T23 | Empty `hooks/` folder | Noise. |
| T24 | `components.json` misplaced in `src/lib` | shadcn convention break. |

---

## 10. Proposed New Folder Structure

```
project catalyst/
├── README.md                     # NEW: product readme
├── AGENTS.md / MEMORY.md         # updated
├── BLUEPRINT.md                  # unchanged (source of truth)
├── opencode.json                 # agent names reconciled
├── .env.example                  # NEW: template (no secrets)
├── .gitignore                    # NEW: root ignore (.env, node_modules, dist, __pycache__)
├── docs/                         # NEW: DESIGN.md, TOOLS.md, WORKFLOW.md (rewritten)
├── backend/                      # renamed from terra_x/
│   ├── requirements.txt          # NEW
│   ├── run.py                    # CLI entry (KEEP)
│   ├── app/                      # Phase 1: FastAPI lives here (future)
│   ├── agents/
│   │   ├── base.py
│   │   ├── risk_assessment/agent.py
│   │   ├── victim_localization/agent.py
│   │   ├── resource_coordination/agent.py
│   │   └── knowledge/agent.py    # renamed KnowledgeRetrievalAgent
│   ├── core/
│   │   ├── config.py             # Settings
│   │   ├── gop.py                # TERRAState
│   │   └── tools.py              # mocks
│   ├── interfaces/protocol.py
│   ├── orchestration/orchestrator.py
│   └── tests/                    # NEW: pytest suite (Phase 1+)
└── frontend/
    ├── components.json           # moved from src/lib
    ├── README.md                 # rewritten
    ├── vite.config.ts            # single config (keep alias+proxy)
    ├── src/
    │   ├── main.tsx
    │   ├── App.jsx               # will decompose in Phase 6
    │   ├── index.css
    │   ├── components/           # ONLY used components (empty after cleanup until Phase 5/6)
    │   ├── features/             # NEW: per-feature folders in Phase 5/6
    │   ├── lib/                  # empty until real API client in Phase 1/5
    │   └── hooks/                # empty until needed
    ├── public/favicon.svg
    └── package.json              # trimmed dependencies
```

---

## 11. File Migration Plan

### 11.1 Frontend

| # | Current Location | → New Location | Reason | Risk | Priority |
|---|---|----------------|--------|------|----------|
| M1 | `frontend/vite.config.js` | DELETE | Duplicate config; keep `.ts` (has alias+proxy) | Low (no import refs) | P0 |
| M2 | `frontend/vite.config.ts` | KEEP (unchanged) | Active config | – | – |
| M3 | `frontend/src/components/dashboard/*` (5 files) | DELETE | Foreign Catalyst app | Low | P0 |
| M4 | `frontend/src/components/ui/*` (3 files) | DELETE | Foreign; 0 refs | Low | P0 |
| M5 | `frontend/src/lib/api.ts`, `chat-store.ts`, `utils.ts` | DELETE | Foreign contract; backend has no endpoints | Medium (if referenced anywhere — verified none) | P0 |
| M6 | `frontend/src/lib/components.json` | `frontend/components.json` | shadcn convention | Low | P1 |
| M7 | `frontend/src/components/{HeroSection,ImmersiveMap,AgentWindows,BackgroundAtmosphere,CommandPalette,MissionTimeline,Skeleton,Toast,icons}.jsx` | DELETE | Orphan v3/v4 designs; 0 refs | Low | P0 |
| M8 | `frontend/src/hooks/` | DELETE (folder) | Empty | Low | P1 |
| M9 | `frontend/src/assets/{hero.png,react.svg,vite.svg}` | DELETE | Unused | Low | P1 |
| M10 | `frontend/public/icons.svg` | DELETE | Unreferenced | Low | P1 |
| M11 | `frontend/dist/` | DELETE | Stale build | Low | P1 |
| M12 | `frontend/terra_x_dashboard.html` | DELETE | Superseded prototype | Low | P1 |
| M13 | `frontend/README.md` | REWRITE | Vite boilerplate → project doc | Low | P1 |
| M14 | `frontend/package.json` | TRIM deps | Remove radix/clsx/gsap/motion/recharts/etc. (see §7.1) | Low | P0 |
| M15 | `frontend/.env` | DELETE (document in `.env.example`) | Secret-free setup | Medium | P0 |

### 11.2 Backend

| # | Current Location | → New Location | Reason | Risk | Priority |
|---|---|----------------|--------|------|----------|
| M16 | `terra_x/` | `backend/` | Clear naming; separates backend from root docs | Medium (update all imports `terra_x.` → `backend.` or run via module path) | P1 |
| M17 | `terra_x/core/base.py` | DELETE | Broken import; unused | Low | P0 |
| M18 | `terra_x/core/factory.py` | DELETE | Broken import; unused | Low | P0 |
| M19 | `terra_x/core/groq.py` | DELETE (recreate in Phase 2 as `backend/llm/groq.py`) | Broken import; unused | Low | P0 |
| M20 | `terra_x/core/config.py` | KEEP → `backend/core/config.py` | Used | – | – |
| M21 | `terra_x/core/gop.py` | KEEP → `backend/core/gop.py` | Used | – | – |
| M22 | `terra_x/core/tools.py` | KEEP → `backend/core/tools.py` | Used | – | – |
| M23 | `terra_x/interfaces/protocol.py` | KEEP → `backend/interfaces/protocol.py` | Used | – | – |
| M24 | `terra_x/agents/*/agent.py` + `base.py` | KEEP → `backend/agents/*` | Used | – | – |
| M25 | `terra_x/agents/knowledge/agent.py` | RENAME class/name to `KnowledgeRetrievalAgent` | Blueprint v1.1 branding | Medium (orchestrator import) | P1 |
| M26 | `terra_x/orchestration/orchestrator.py` | KEEP → `backend/orchestration/orchestrator.py` | Used; sequential → dependency graph in Phase 1 | – | – |
| M27 | `terra_x/run.py` | KEEP → `backend/run.py` | CLI entry | – | – |
| M28 | (none) | ADD `backend/requirements.txt` | Reproducible env | n/a | P0 |
| M29 | (none) | ADD `backend/tests/` | Test suite start | n/a | P1 |
| M30 | `terra_x/.env` | DELETE | Secret duplication | Medium | P0 |

### 11.3 Root / Docs / Config

| # | Current Location | → New Location | Reason | Risk | Priority |
|---|---|----------------|--------|------|----------|
| M31 | `.env` (root) | DELETE + ADD `.env.example` | Secret hygiene | Medium | P0 |
| M32 | (none) | ADD root `.gitignore` | Ignore `.env`, `node_modules`, `dist`, `__pycache__`, `.venv` | Low | P0 |
| M33 | `sample bot/` | DELETE | Empty folder | Low | P0 |
| M34 | `DESIGN.md` | `docs/DESIGN.md` (rewritten) | Match shipped black/white design + v1.1 | Medium | P1 |
| M35 | `TOOLS.md` | `docs/TOOLS.md` (rewritten) | Describe actual mock tools | Low | P1 |
| M36 | `WORKFLOW.md` | `docs/WORKFLOW.md` (rewritten) | Dependency-graph execution | Low | P1 |
| M37 | `AGENTS.md` | KEEP (edit names/thresholds) | Align to blueprint | Low | P1 |
| M38 | `MEMORY.md` | KEEP (sync schema to gop.py) | Align to code | Low | P1 |
| M39 | `opencode.json` | EDIT agent names | Match `.opencode/agent/*.md` convention | Medium | P1 |
| M40 | `.opencode/agent/knowledge-rag.md` | RENAME `knowledge-retrieval.md` + content | Blueprint v1.1 branding | Low | P1 |
| M41 | (none) | ADD root `README.md` | Product overview + setup | Low | P1 |
| M42 | `frontend/.oxlintrc.json` | KEEP | Lint works | – | – |

---

## 12. Recommended Execution Order (for the approved cleanup phase)

1. **P0 — Safety**: add root `.gitignore`, `git init`, delete real `.env` files → `.env.example`, remove secrets from history.
2. **P0 — Backend**: add `requirements.txt`; delete broken `core/{base,factory,groq}.py`.
3. **P0 — Frontend**: delete foreign `dashboard/*`, `ui/*`, `lib/{api,chat-store,utils}.ts`; delete 9 orphan components; trim `package.json` deps; delete duplicate `vite.config.js`.
4. **P1 — Reorganize**: rename `terra_x/` → `backend/` (update imports); move `components.json`; delete leftover artifacts (`dist`, `sample bot/`, `terra_x_dashboard.html`, unused assets).
5. **P1 — Docs**: rewrite DESIGN/TOOLS/WORKFLOW; sync AGENTS/MEMORY; write READMEs; reconcile `opencode.json`.
6. **P1 — Verify**: `python -m backend.run` (or updated entry), `npm run dev`, `npm run build`, `npm run lint`; confirm UI unchanged.
7. **Phase 1 (next)**: FastAPI server + WebSocket, orchestrator dependency graph, real API client, tests.

---

## 13. Post-Cleanup Definition of Done

- `python -m <backend>.run` prints the same mission briefing as today (no behavior change).
- `npm run dev` renders the identical UI with identical mock data.
- `npm run build` and `npm run lint` pass.
- `pip install -r backend/requirements.txt` works on a fresh machine.
- `git status` shows a clean baseline; `.env` files ignored; no secrets in tree.
- Every source file in `frontend/src/` is referenced; every `backend/` module is reachable.
- Docs all agree with BLUEPRINT v1.1 and with the shipped code.

---

*Audit conducted 2026-08-01. No files were modified during this audit.*
