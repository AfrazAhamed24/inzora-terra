# Inzora Terra OS — Frontend

React 19 + Vite 8 + Tailwind CSS v4 + Framer Motion + Lenis command-center UI.

## Setup

```bash
npm install
npm run dev
```

## Scripts

- `npm run dev` — Vite dev server
- `npm run build` — production build
- `npm run lint` — oxlint
- `npm run preview` — preview production build

## Env

Copy `.env.example` to `.env` to set `VITE_API_URL` (backend API added in Phase 1).
The UI currently renders mock mission data.

## Structure

- `src/main.tsx` — entry
- `src/App.jsx` — single-file UI (Nav, Hero, Dashboard, Agents, Knowledge, Timeline, Bot)
- `src/index.css` — global styles + design tokens
