# Inzora Terra OS — Preview Run Doc

How to reproduce uncommitted artifacts and run the live preview for this thread's workspace.

## 1. Reproduce the uncommitted artifacts a fresh checkout needs

The frontend dependencies (`frontend/node_modules`) and backend Python environment are not
committed. Recreate them:

```bash
# Frontend (from repo root)
cd frontend && npm install        # installs deps from package-lock.json (React 19, Vite 8, Tailwind 4, framer-motion, lenis, lucide-react)

# Backend
pip install -r backend/requirements.txt   # pydantic, pydantic-settings, openai, fastapi, uvicorn, pytest, httpx
```

No `.env` file is required for the demo: agents are rule-based and run with no external
services. Optional: copy `.env.example` to `.env` and set `GROQ_API_KEY` (only needed for
Phase 2 LLM features).

## 2. Run the server(s)

Two processes are needed — the backend API and the Vite dev server.

**Backend API (FastAPI)** — run from the repo root (module path is package-relative):

```bash
python -m backend.api.main        # listens on http://127.0.0.1:8000 (TERRA_API_HOST/TERRA_API_PORT)
```

Verify: `curl http://127.0.0.1:8000/api/v1/health` → `{"status":"ok",...}`

**Frontend dev server (Vite)** — from `frontend/`:

```bash
npm run dev                       # listens on http://localhost:5173, proxies /api → http://localhost:8000
```

The app auto-creates and starts a demo mission on load, then streams agent events and
telemetry over SSE (`/api/v1/missions/{id}/stream`). Verify: open `http://localhost:5173`
and confirm the mission ID appears in the nav and the dashboard shows live stages.

### Windows detach recipe (used for the preview)

Start both detached so they outlive the conversation; stdout and stderr must go to different
files:

```powershell
powershell -NoProfile -Command "(Start-Process -FilePath 'npm.cmd' -ArgumentList 'run','dev' -WorkingDirectory '<repo>\frontend' -RedirectStandardOutput '<log>' -RedirectStandardError '<log>.err' -WindowStyle Hidden -PassThru).Id"
```

Note: the invoking shell may appear to hang while the server starts (inherited pipe quirk);
confirm via the log file and `netstat -ano | findstr :5173` rather than the shell prompt.
Backend API can be started the same way with `python.exe -m backend.api.main`.
