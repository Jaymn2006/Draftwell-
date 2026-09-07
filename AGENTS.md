# Draftwell — Base44 Dev Environment

## What this is
Offline-first voice-to-novel writing studio. Frontend-only Vite + React + TypeScript app. No backend server.

## Running
- `docker compose -f docker-compose.base44.yml up -d` starts the Vite dev server on host port 3000 (container port 5173).
- Node 22 slim image; source is bind-mounted; `npm install` runs at container startup; HMR is active.
- Vite reads `.env.local` from the bind-mounted filesystem for `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.

## Supabase (optional)
- The app is offline-first; Supabase is optional cloud sync. It works fully without it.
- Credentials live in `.env.local` (committed in repo). No external secrets required to boot.
- If overriding via Base44 secrets, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the dashboard.

## Verifying it works
- `curl -s http://localhost:3000/` returns the Vite dev HTML (serves `/src/main.tsx`, not a prebuilt bundle).
- The preview loads the Draftwell writing studio UI.
