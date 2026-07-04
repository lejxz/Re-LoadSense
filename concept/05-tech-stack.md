# 05 — Tech Stack

> **Hybrid approach:** existing HTML/CSS/JS frontend (from the old LoadSense) + new Next.js 16
> full-stack backend. The old project's UI is kept and improved; the backend is rewritten
> from Python/FastAPI to Next.js for Vercel-native deployment, better performance, and the
> concept's data model improvements.

---

## Table of contents

1. [Stack at a glance](#1-stack-at-a-glance)
2. [Frontend (existing — kept + improved)](#2-frontend-existing--kept--improved)
3. [Backend (new — Next.js API routes)](#3-backend-new--nextjs-api-routes)
4. [Data](#4-data)
5. [Real-time](#5-real-time)
6. [Map](#6-map)
7. [Simulation + calculations](#7-simulation--calculations)
8. [Auth](#8-auth)
9. [Observability](#9-observability)
10. [Deployment](#10-deployment)
11. [package.json](#11-packagejson)
12. [vercel.json](#12-verceljson)

---

## 1. Stack at a glance

| Layer | Choice | Why |
|---|---|---|
| Frontend | **Existing HTML/CSS/JS** (from old project) | Already works, looks good — don't rebuild what works |
| Backend | **Next.js 16** (App Router API routes) | Vercel-native, replaces Python/FastAPI, TypeScript |
| Language | **TypeScript 5** (backend) + **vanilla JS** (frontend) | Backend gets type safety; frontend stays as-is |
| Styling | **Existing CSS** (variables.css, base.css, components.css, mobile.css, map.css) | The old project's design system — already polished |
| Database | **Prisma** + **SQLite** (dev) / **Vercel Postgres** (deploy) | Replaces raw sqlite3 + 5-file fan-out |
| Cache/pubsub | **Vercel KV** (Redis) | Live state + socket.io adapter |
| Real-time | **socket.io** mini-service (port 3001) | Live fleet updates; polling too slow for smooth maps |
| Map | **Existing Leaflet** (vendored) + **leaflet.markercluster** | Already integrated in the old JS — keep it |
| Auth | **Demo toggle** (simplify for portfolio) | The portfolio story is the UI/map/chatbot, not auth |
| Calculations | **Deterministic TS functions** | No Python ML models — correct formulas in TypeScript |
| Scheduler | **Vercel Cron** (every minute) | Replaces the old daemon thread (which can't run on Vercel) |
| Errors | **Sentry** (free tier) | Error tracking |
| Hosting | **Vercel** (region `sin1`) | Singapore for ASEAN latency |

---

## 2. Frontend (existing — kept + improved)

The old LoadSense project's frontend is **kept as-is** and served as static files from the
Next.js `public/` directory. The JS files are adapted to call the new Next.js API routes.

### What's kept (from `app/`)

| File(s) | Purpose | Changes needed |
|---|---|---|
| `css/variables.css` | Design tokens (--teal, --wash, --panel, etc.) | None — already good |
| `css/base.css` | Typography, resets | None |
| `css/components.css` | Buttons, pills, modals, toasts | None |
| `css/mobile.css` | Phone frame, tabs, hero card, chat | Add Menu tab styles |
| `css/map.css` | Map layout, markers, legend | Add theme switcher styles |
| `css/operator.css` | Operator console layout | None |
| `css/portal.css` | Landing portal | None |
| `js/core.js` | Shared state + API helper (`const api = origin + '/api'`) | Keep — API paths match Next.js routes |
| `js/data.js` | Data fetching + dirty-checking | Keep — update paths if needed |
| `js/map.js` | Leaflet map + markers + polylines | Add direction arrows + theme switcher |
| `js/mobile.js` | Commuter app logic (4 tabs) | Add 5th Menu tab |
| `js/operator.js` | Operator console logic | Keep — update paths if needed |
| `js/places.js` | Place search (Photon proxy) | Keep |
| `js/alerts.js` | Alert submission | Keep |
| `js/routes-admin.js` | Route CRUD admin | Keep — add sequenced form |
| `js/main.js` | Entry point | Keep |
| `vendor/leaflet/` | Leaflet + markercluster (vendored) | Keep |
| `mobile.html` | Commuter UI structure | Add Menu tab + nav item |
| `operator.html` | Operator console structure | Keep |
| `index.html` | Landing portal | Keep |

### Why not rebuild the frontend?

The old project's frontend works. It has a polished phone-frame mockup, rounded cards with
soft shadows, a pill-shaped bottom nav, a hero card with "Best boarding option", a chat
interface with bot avatars, a route directory with search, and a live map with clustering.
Rebuilding all of this in React would take days and produce a worse result (as we saw in
the previous attempt). Keeping the HTML/CSS/JS and adapting it is faster and better.

### How the JS talks to the new backend

The old JS uses `const api = \`${location.origin}/api\`` and calls like `fetch(api + path)`.
The new Next.js API routes will match the same `/api/...` paths (e.g., `/api/fleet`,
`/api/routes`, `/api/chatbot`, `/api/alerts`). This means most JS files need **zero changes**
to their fetch calls — the paths already match. Where the old API shape differs from the
new one (e.g., new fields like `direction`, `vehicleType`), the JS is updated to consume
the new fields.

### Improvements to the frontend

1. **5th Menu tab** — add to `mobile.html` + `mobile.js` + `mobile.css` (profile, theme toggle, about)
2. **Direction arrows** on vehicle markers — add to `map.js` (▲ forward / ▼ backward)
3. **Map theme switcher** — add to `map.js` (5 free tile providers)
4. **4-tier legend** — update from 3-tier (Seats/Standing/Full) to 4-tier (Available/Filling/At capacity/Overloaded)
5. **Route polylines in teal** — change from blue (#0b57d0) to teal (#087b68) per the no-indigo/blue rule
6. **SIM badge** — add to the header
7. **Sequenced vehicle-add form** — add to `routes-admin.js` (route → type → details)

---

## 3. Backend (new — Next.js API routes)

The old Python/FastAPI backend is **replaced** by Next.js API route handlers (TypeScript).
This gives us: Vercel-native deployment, TypeScript type safety, no Python runtime needed,
and the concept's data model improvements (Prisma, vehicle types, route constraints).

### What's replaced

| Old (Python) | New (Next.js) | Why |
|---|---|---|
| `backend/app/main.py` (FastAPI) | `src/app/layout.tsx` + Next.js server | Vercel-native |
| `backend/app/api/routes.py` (740 lines) | `src/app/api/v1/*/route.ts` | Type-safe, layered |
| `backend/app/db/sqlite_store.py` (1,208 lines, 5-file fan-out) | `prisma/schema.prisma` + `src/lib/db.ts` | Single DB, no fan-out |
| `backend/app/core/state.py` (FleetStore singleton) | `src/lib/services/fleet-service.ts` + Redis | Scales across workers |
| `backend/app/core/demo_simulator.py` (daemon thread) | `src/lib/simulator.ts` + Vercel Cron | Vercel can't run daemon threads |
| `backend/app/core/transit.py` (1,860-line god-module) | `src/lib/services/*.ts` (split into 6 modules) | Maintainable |
| `backend/app/core/no_API_chatbot.py` (grounded heuristic) | `src/lib/services/chatbot-service.ts` | Consolidate 5 files into 1 |
| `backend/app/core/phase2.py` (ETA + demand) | `src/lib/ml/eta.ts` + `src/lib/ml/demand.ts` | Correct formulas, no pickle |
| `backend/app/core/route_deviation.py` | `src/lib/geo/bbox.ts` | PostGIS-style math in TS |
| `backend/app/core/occupancy.py` | `src/lib/ml/occupancy.ts` | Add hysteresis |
| `config/project_config.json` | `src/lib/config.ts` (typed) | Type-safe config |

### What's deleted (dead code)

- `backend/app/core/chatbot.py` (Gemini — never imported)
- `backend/app/core/ollama_chatbot.py` (Ollama — never imported)
- `backend/app/core/compat.py` (Pydantic v1/v2 shim — unnecessary)
- `backend/app/models/__init__.py` (empty placeholder)
- `cloud/` (ML training scripts — not needed for deterministic TS functions)

---

## 4. Data

- **Prisma ORM**: type-safe queries, migrations, one source of truth for the schema.
- **SQLite** (dev, `file:./prisma/dev.db`) / **Vercel Postgres** (deploy): same Prisma schema works for both.
- **Vercel KV** (Redis-compatible via `@upstash/redis`): live vehicle state cache, socket.io adapter, rate limiting.
- No PostGIS on Vercel Postgres free tier — geofencing uses bounding-box math in TypeScript.

---

## 5. Real-time

- **socket.io mini-service** (`mini-services/socket/`): standalone Bun project on port 3001.
- Vercel serverless can't hold persistent WebSocket connections, so this runs on a tiny persistent host (Render free tier / Railway / Fly.io).
- Redis adapter (Vercel KV) for multi-instance scaling.
- Client connects via `io("/?XTransformPort=3001")` per the gateway constraint.
- **Fallback:** TanStack-style polling (the old JS already polls every 3-30s — if socket.io is unavailable, the polling continues).

---

## 6. Map

- **Existing Leaflet** (vendored in `app/vendor/leaflet/`): kept as-is. Already integrated, clustering works, popups work.
- **5 tile themes** added via a theme switcher: OSM Standard, CartoDB Light, CartoDB Dark, CyclOSM, Esri Satellite.
- **Direction arrows** added to markers (▲/▼).
- **Route polylines** changed from blue to teal.
- **4-tier legend** replaces the 3-tier one.

---

## 7. Simulation + calculations

- **Simulator** (`src/lib/simulator.ts`): pure function `tick(state, dt, seed) => newState`. Seeded RNG. Runs via Vercel Cron (every minute, 12 ticks × 5s).
- **Route type handling**: linear (turn-around) vs loop (wrap) — fixes the old `progress % 1.0` teleporting.
- **ETA** (`src/lib/ml/eta.ts`): `distance / (speed × traffic_factor)`. Direction-aware.
- **Demand** (`src/lib/ml/demand.ts`): seeded historical mean. Deterministic.
- **Occupancy** (`src/lib/ml/occupancy.ts`): 4-tier with 10s hysteresis. Reaches all 4 tiers.
- **Line counter** (`src/lib/edge/line-counter.ts`): real counting algorithm, fed synthetic positions. Honest sim.

---

## 8. Auth

**Demo toggle** — a header toggle switches between "Commuter view" and "Operator view". The
portfolio story is the UI/map/chatbot improvements, not auth. The old project had a login
screen that just hid/showed the app — we keep that pattern but simplify it further.

---

## 9. Observability

- **Sentry** (`@sentry/nextjs`, free tier): exception capture.
- **Vercel built-in logs**: captures console output.
- **pino** (`src/lib/logger.ts`): structured JSON logs.
- No Loki, no Prometheus, no Grafana — overkill for a personal project.

---

## 10. Deployment

- **Vercel** (region `sin1` — Singapore for ASEAN latency).
- **Git-connected**: push to `main` → production. PR → Preview deployment.
- Static files (`app/` folder) served from `public/` or via Next.js static file serving.
- Env vars: `DATABASE_URL`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `SENTRY_DSN`, `CRON_SECRET`.
- Vercel Postgres: automated daily backups (Pro plan).
- Vercel KV: ephemeral (rebuildable from Postgres).

---

## 11. package.json

```json
{
  "name": "re-loadsense",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "dev:ws": "cd mini-services/socket && bun run dev",
    "dev:all": "concurrently \"bun run dev\" \"bun run dev:ws\"",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:e2e": "playwright test",
    "db:push": "prisma db push",
    "db:seed": "tsx prisma/seed.ts",
    "db:studio": "prisma studio"
  },
  "dependencies": {
    "next": "16.0.0",
    "react": "19.0.0",
    "react-dom": "19.0.0",
    "@prisma/client": "6.2.0",
    "@tanstack/react-query": "5.62.0",
    "zod": "3.24.1",
    "socket.io-client": "4.8.1",
    "@upstash/redis": "1.34.3",
    "@sentry/nextjs": "8.47.0",
    "bcryptjs": "2.4.3",
    "pino": "9.6.0",
    "clsx": "2.1.1",
    "tailwind-merge": "2.6.0",
    "date-fns": "4.1.0",
    "lucide-react": "0.469.0"
  },
  "devDependencies": {
    "typescript": "5.7.2",
    "@types/node": "22.10.5",
    "@types/react": "19.0.2",
    "@types/react-dom": "19.0.2",
    "@types/bcryptjs": "2.4.6",
    "prisma": "6.2.0",
    "tsx": "4.19.2",
    "vitest": "2.1.8",
    "@playwright/test": "1.49.1",
    "concurrently": "9.1.2",
    "eslint": "9.17.0",
    "eslint-config-next": "16.0.0",
    "prettier": "3.4.2"
  }
}
```

> Note: Tailwind CSS is NOT used for the frontend — the old project's CSS files handle all
> styling. Tailwind may be included for the Next.js app shell (layout, error pages) but the
> commuter/operator UIs use the old CSS directly.

---

## 12. vercel.json

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "regions": ["sin1"],
  "crons": [
    {
      "path": "/api/cron/sim-tick",
      "schedule": "* * * * *"
    }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        {
          "key": "Strict-Transport-Security",
          "value": "max-age=63072000; includeSubDomains; preload"
        }
      ]
    }
  ]
}
```

**Notes:**
- `regions: ["sin1"]` — Singapore for ASEAN latency.
- `crons` — the simulator tick runs every minute. Each invocation runs 12 sim ticks × 5s = 1 min of sim time.
- Static files from the old project (`app/` folder) are served from `public/` in the Next.js project.
- The old JS files' `const api = \`${location.origin}/api\`` works because Next.js serves API routes at `/api/...` on the same origin.
