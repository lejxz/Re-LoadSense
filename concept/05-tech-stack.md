# 05 — Tech Stack

> Exact Vercel-native stack for a solo build. Every choice is the easy version.

---

## Table of contents

1. [Stack at a glance](#1-stack-at-a-glance)
2. [Frontend](#2-frontend)
3. [Backend](#3-backend)
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
| Framework | **Next.js 16** (App Router) | Vercel-native, one app for all 3 route groups |
| Language | **TypeScript 5** (strict) | Catches the undefined bugs the original had |
| Styling | **Tailwind CSS 4** + **shadcn/ui** | Design system + accessible primitives |
| Database | **Prisma** + **SQLite** (dev) / **Vercel Postgres** (deploy) | One ORM, easy local dev |
| Cache/pubsub | **Vercel KV** (Redis) | Live state + socket.io adapter |
| Real-time | **socket.io** mini-service (port 3001) | Live fleet updates; polling too slow for smooth maps |
| Map | **react-leaflet** + **leaflet.markercluster** | Typed, clustering, clean popups |
| Auth | **NextAuth** (credentials) OR demo toggle | Decide in build; keep simple |
| Calculations | **Deterministic JS functions** | No Python, no ML models — just correct formulas |
| Scheduler | **Vercel Cron** (every minute) | Advance the simulation |
| Errors | **Sentry** (free tier) | Error tracking |
| Hosting | **Vercel** (region `sin1`) | Singapore for ASEAN latency |

---

## 2. Frontend

- **Next.js 16** (App Router): Vercel-native, RSC for fast initial load, route groups for the
  3 apps in one project.
- **TypeScript 5** (`strict: true`, `noUncheckedIndexedAccess: true`): catches the original's
  `undefined` bugs at compile time.
- **Tailwind CSS 4 + shadcn/ui** (New York style): cohesive design system, accessible
  primitives. Tier colors (green/yellow/red/blink) as semantic tokens; brand teal (NOT
  indigo/blue).
- **TanStack Query**: server state (caching, polling, retries, pause-on-hidden-tab).
- **Zustand**: client state (UI prefs, selected vehicle, map viewport).
- **React Hook Form + Zod**: forms with schema validation shared with the API.
- **next-themes**: dark mode (system + manual toggle).

---

## 3. Backend

- **Next.js Route Handlers** (App Router): one codebase, one deploy. Route handlers stay thin
  (parse → call service → format response).
- **Edge runtime** for read-heavy routes (fleet, routes, ETA, places) — global low latency.
- **Node.js runtime** for write-heavy or library-dependent routes (telemetry ingest, chatbot).
- **Service layer** (`src/lib/services/`): one file per domain (fleet, alert, chatbot, trip).
  No repository pattern, no interfaces — just functions. Prisma is the data access layer.

---

## 4. Data

- **Prisma ORM**: type-safe queries, migrations, one source of truth for the schema. See
  [`03-data-model.md §6`](./03-data-model.md#6-prisma-schema) for the full schema.
- **SQLite** (dev, `file:./prisma/dev.db`) / **Vercel Postgres** (deploy): same Prisma schema
  works for both.
- **Vercel KV** (Redis-compatible via `@upstash/redis`): live vehicle state cache, socket.io
  adapter, demand/ETA/route caches, places cache. See
  [`03-data-model.md §4`](./03-data-model.md#4-redis-key-patterns) for key patterns.

**No PostGIS** (Vercel Postgres free tier doesn't have it). Geofencing (route deviation) uses
bounding-box + haversine math in TypeScript. Less precise but fine for a demo.

---

## 5. Real-time

- **socket.io mini-service** (`mini-services/socket/`): standalone Bun project on port 3001.
  Vercel serverless can't hold persistent WS, so this runs on a tiny persistent host
  (Render/Railway/Fly.io, ~$5/month or free tier).
- **Redis adapter** (Vercel KV): multi-instance pub/sub.
- **Client connects via** `io("/?XTransformPort=3001")` per the gateway constraint — never
  `io("http://localhost:3001")`.
- **Fallback if budget is zero:** TanStack Query polling (5s). Map still works, less smooth.

---

## 6. Map

### Library choice: react-leaflet (not MapLibre)

- **react-leaflet 4** + **leaflet 1.9** + **leaflet.markercluster 1.5**: typed wrapper,
  clustering for many markers, clean popups.
- **Why react-leaflet, not MapLibre GL JS?** MapLibre (vector tiles) is more powerful — fully
  styleable, rotateable, 3D — but it needs a vector tile provider (MapTiler free tier, or
  self-hosted tiles) and has a steeper learning curve. For a personal project, **react-leaflet
  with raster tiles** gives 90% of the value at 20% of the complexity. Multiple free raster
  tile providers (OSM, CartoDB, CyclOSM, Esri, Stadia) give enough theme variety for
  customizability. The original project used Leaflet too, so this is a known quantity.
- **If vector tiles are needed later**: migrating to `react-map-gl` (MapLibre wrapper) is a
  swap of the map component only — the data layer (markers, polylines) stays the same.

### Map theme switcher (user customizability)

The original had a layer-switcher icon but only 2 themes. This project offers **5 free map
themes** the user can switch between — stored as a preference in the Zustand UI store +
localStorage:

| Theme ID | Provider | Style | Free? | Dark mode? |
|---|---|---|---|---|
| `osm-standard` | OpenStreetMap | Standard street map | ✅ free | ❌ light only |
| `carto-light` | CartoDB | Clean light | ✅ free | ❌ light only |
| `carto-dark` | CartoDB Dark Matter | Dark | ✅ free | ✅ dark |
| `cyclosm` | CyclOSM | Cycle-friendly (highlights bike lanes) | ✅ free | ❌ light only |
| `esri-satellite` | Esri World Imagery | Satellite | ✅ free | ❌ n/a |

**Auto-switch on dark mode:** when the user's theme is `system` or `dark`, the map
auto-switches to `carto-dark` (unless the user has manually selected a specific theme). When
light, defaults to `carto-light` (cleaner than raw OSM).

**The theme switcher UI:** a small layer-stack button (bottom-right of the map, above the
locate FAB) opens a popover with the 5 theme thumbnails — tap to switch. The selected theme
persists across sessions. See [`07-ui-ux-design.md`](./07-ui-ux-design.md).

### Markers + direction arrows

- **Markers**: custom `divIcon` — a colored circle (tier color) with the route code inside +
  a **direction arrow** (▲ for forward, ▼ for backward) indicating travel direction. See
  [`03-data-model.md §4.2`](./03-data-model.md#42-route-type-linear-vs-loop-and-vehicle-direction).
- **Blinking red** (overloaded tier) respects `prefers-reduced-motion` (becomes steady red).
- **Smooth updates**: marker positions update in place (not clear + re-add) — no flicker.
- **Route polylines**: each route's polyline is rendered as a colored line (teal for the
  brand) with stop markers (small dots). Visible on the Map tab when a route is selected, and
  on the route detail page.

---

## 7. Simulation + calculations

- **Simulator** (`src/lib/simulator.ts`): pure function `tick(state, dt, seed) => newState`.
  Seeded RNG. Runs via Vercel Cron (every minute, 12 ticks × 5s). Handles `linear` routes
  (turn-around at endpoints) and `loop` routes (wrap-around). See
  [`03-data-model.md §4.2`](./03-data-model.md#42-route-type-linear-vs-loop-and-vehicle-direction).
- **ETA** (`src/lib/ml/eta.ts`): `distance / (speed × traffic_factor)`. Haversine distance.
  Direction-aware (a backward-traveling vehicle's "remaining stops" are in reverse seq order).
  Deterministic, cached 30s.
- **Demand** (`src/lib/ml/demand.ts`): seeded historical mean per route × hour. Cached 1h.
  Honest `source: "historical_mean"` label.
- **Occupancy tier** (`src/lib/ml/occupancy.ts`): 4-tier with 10s hysteresis. No flicker.
- **Geo math** (`src/lib/geo/`): haversine, bounding-box, route deviation.

No Python, no ML models, no pickle. Just correct, tested JS functions.

---

## 8. Auth

**Decision: NextAuth credentials OR demo toggle (decide in build)**

- **Option A — NextAuth credentials**: `next-auth@beta` with Prisma adapter. Email + password
  (bcrypt). Two roles: `commuter`, `operator`. JWT session in HttpOnly cookies.
- **Option B — Demo toggle**: a header toggle switches between "Commuter view" and "Operator
  view". Faster, more demo-friendly.

**Recommendation:** Start with Option B for speed; upgrade to Option A if time permits. The
portfolio story is the UI/map/chatbot improvements, not the auth.

---

## 9. Observability

- **Sentry** (`@sentry/nextjs`, free tier): frontend + backend exception capture with source
  maps.
- **Vercel built-in logs**: captures `console.log`/`pino` output automatically.
- **pino** (`src/lib/logger.ts`): structured JSON logs with `request_id`. Or just structured
  `console.log` — Vercel captures either.

No Loki, no Prometheus, no Grafana — overkill for a personal project.

---

## 10. Deployment

- **Vercel** (region `sin1` — Singapore for ASEAN latency).
- **Git-connected**: push to `main` → production. PR → Preview deployment.
- **Env vars**: `DATABASE_URL`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `SENTRY_DSN`,
  `CRON_SECRET`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`.
- **Vercel Postgres**: automated daily backups (Pro plan). Enough for a demo.
- **Vercel KV**: ephemeral (rebuildable from Postgres). No backup needed.

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
    "test": "vitest",
    "test:e2e": "playwright test",
    "db:push": "prisma db push",
    "db:seed": "bun run prisma/seed.ts",
    "db:studio": "prisma studio"
  },
  "dependencies": {
    "next": "16.0.0",
    "react": "19.0.0",
    "react-dom": "19.0.0",
    "@prisma/client": "6.2.0",
    "@auth/prisma-adapter": "2.7.0",
    "next-auth": "5.0.0-beta.25",
    "bcryptjs": "2.4.3",
    "@tanstack/react-query": "5.62.0",
    "zustand": "5.0.2",
    "react-hook-form": "7.54.0",
    "zod": "3.24.1",
    "@hookform/resolvers": "3.9.1",
    "react-leaflet": "4.2.1",
    "leaflet": "1.9.4",
    "leaflet.markercluster": "1.5.3",
    "socket.io-client": "4.8.1",
    "@upstash/redis": "1.34.3",
    "@sentry/nextjs": "8.47.0",
    "next-themes": "0.4.4",
    "lucide-react": "0.469.0",
    "recharts": "2.15.0",
    "date-fns": "4.1.0",
    "clsx": "2.1.1",
    "tailwind-merge": "2.6.0",
    "pino": "9.6.0"
  },
  "devDependencies": {
    "typescript": "5.7.2",
    "@types/node": "22.10.5",
    "@types/react": "19.0.2",
    "@types/react-dom": "19.0.2",
    "@types/leaflet": "1.9.15",
    "@types/leaflet.markercluster": "1.5.5",
    "@types/bcryptjs": "2.4.6",
    "tailwindcss": "4.0.0",
    "@tailwindcss/postcss": "4.0.0",
    "postcss": "8.4.49",
    "prisma": "6.2.0",
    "@playwright/test": "1.49.1",
    "vitest": "2.1.8",
    "@testing-library/react": "16.1.0",
    "@vitejs/plugin-react": "4.3.4",
    "eslint": "9.17.0",
    "eslint-config-next": "16.0.0",
    "prettier": "3.4.2",
    "prettier-plugin-tailwindcss": "0.6.9",
    "concurrently": "9.1.2",
    "tsx": "4.19.2"
  }
}
```

> Versions are indicative — use the latest stable at build time. `mini-services/socket/` has
> its own `package.json` (see [`06-project-structure.md`](./06-project-structure.md)).

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
- `crons` — the simulator tick runs every minute (Hobby tier minimum). Each invocation runs
  12 sim ticks × 5s = 1 minute of sim time. The client interpolates between ticks for smooth
  marker movement.
- `headers` — basic security headers.
- **No `functions` block** — runtime is configured per-route via `export const runtime = 'edge'`
  in the route handler.

---

## Next

- [`06-project-structure.md`](./06-project-structure.md) — where everything lives in the codebase
