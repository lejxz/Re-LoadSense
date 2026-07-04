# 06 — Project Structure

> The monorepo directory tree with file purposes. Where each feature from
> [`04-features.md`](./04-features.md) lives in the codebase.

---

## Table of contents

1. [Directory tree](#1-directory-tree)
2. [Key files explained](#2-key-files-explained)
3. [Route groups (the 3 apps)](#3-route-groups-the-3-apps)
4. [API routes](#4-api-routes)
5. [The simulator](#5-the-simulator)
6. [The socket.io mini-service](#6-the-socketio-mini-service)

---

## 1. Directory tree

```
re-loadsense/
├── package.json
├── tsconfig.json
├── next.config.ts
├── tailwind.config.ts
├── postcss.config.mjs
├── vercel.json
├── .env.example
├── .env.local                 # gitignored
│
├── prisma/
│   ├── schema.prisma          # DB schema (see 03-data-model.md §6)
│   ├── seed.ts                # Seeds 1 country, 1 operator, 6 routes, 15 vehicles, 2 users
│   └── migrations/
│
├── public/
│   └── images/                # logo, route thumbnails
│
├── mini-services/
│   └── socket/                # socket.io mini-service (separate port 3001)
│       ├── package.json
│       ├── index.ts
│       └── README.md          # explains XTransformPort=3001
│
└── src/
    ├── app/
    │   ├── layout.tsx         # root layout (providers: Theme, QueryClient)
    │   ├── globals.css        # Tailwind + design tokens
    │   ├── page.tsx           # redirects to /(commuter)
    │   │
    │   ├── (commuter)/        # ── COMMUTER APP (the showcase) ──
    │   │   ├── layout.tsx     # header + bottom nav
    │   │   ├── page.tsx       # Map tab (default) — C-01
    │   │   ├── routes/
    │   │   │   ├── page.tsx   # Route directory — C-05
    │   │   │   └── [routeId]/page.tsx  # Route detail — C-05
    │   │   ├── chat/
    │   │   │   └── page.tsx   # Chatbot — C-03
    │   │   └── plan/
    │   │       └── page.tsx   # Trip planner — C-04
    │   │
    │   ├── (operator)/        # ── OPERATOR CONSOLE (minimal) ──
    │   │   ├── layout.tsx     # top nav + simple sidebar
    │   │   ├── page.tsx       # Fleet table (default) — O-01
    │   │   ├── alerts/
    │   │   │   └── page.tsx   # Alerts + verification — O-02
    │   │   ├── vehicles/
    │   │   │   └── page.tsx   # Vehicle CRUD — O-03
    │   │   └── routes/
    │   │       └── page.tsx   # Route list (read-only) — O-04
    │   │
    │   ├── (regulator)/       # ── REGULATOR (optional, simple) ──
    │   │   ├── layout.tsx
    │   │   └── page.tsx       # Simple KPI page (read-only)
    │   │
    │   └── api/
    │       ├── v1/
    │       │   ├── fleet/
    │       │   │   ├── route.ts           # GET /api/v1/fleet
    │       │   │   └── [vehicleId]/route.ts
    │       │   ├── routes/
    │       │   │   ├── route.ts
    │       │   │   └── [routeId]/route.ts
    │       │   ├── eta/
    │       │   │   └── [vehicleId]/route.ts
    │       │   ├── demand/
    │       │   │   └── forecast/route.ts
    │       │   ├── alerts/
    │       │   │   ├── route.ts
    │       │   │   └── [id]/
    │       │   │       ├── acknowledge/route.ts
    │       │   │       ├── verify/route.ts
    │       │   │       └── false-alarm/route.ts
    │       │   ├── chatbot/route.ts
    │       │   ├── places/route.ts
    │       │   ├── trip-suggestions/route.ts
    │       │   ├── edge/
    │       │   │   └── telemetry/route.ts # sim ingest
    │       │   └── admin/
    │       │       ├── vehicles/route.ts
    │       │       └── routes/route.ts
    │       ├── cron/
    │       │   └── sim-tick/route.ts      # Vercel Cron — S-01
    │       ├── health/route.ts            # X-03
    │       └── ready/route.ts             # X-03
    │
    ├── components/
    │   ├── ui/               # shadcn primitives (button, card, dialog, input, etc.)
    │   ├── shared/            # shared components
    │   │   ├── sim-badge.tsx
    │   │   ├── tier-pill.tsx
    │   │   ├── theme-toggle.tsx
    │   │   └── offline-banner.tsx
    │   ├── commuter/
    │   │   ├── app-shell.tsx
    │   │   ├── bottom-nav.tsx
    │   │   ├── profile-menu.tsx
    │   │   └── vehicle-detail-sheet.tsx
    │   ├── operator/
    │   │   ├── app-shell.tsx
    │   │   ├── sidebar.tsx
    │   │   ├── fleet-table.tsx
    │   │   ├── vehicle-drawer.tsx
    │   │   ├── alerts-list.tsx
    │   │   ├── alert-detail-modal.tsx
    │   │   └── vehicle-form-modal.tsx
    │   ├── map/
    │   │   ├── fleet-map.tsx
    │   │   ├── vehicle-marker.tsx
    │   │   ├── vehicle-popup.tsx
    │   │   └── locate-fab.tsx
    │   └── chat/
    │       ├── chat-messages.tsx
    │       └── chat-input.tsx
    │
    ├── lib/
    │   ├── db.ts              # Prisma client singleton
    │   ├── redis.ts           # Vercel KV client
    │   ├── auth.ts            # NextAuth config (or demo toggle)
    │   ├── logger.ts          # pino logger
    │   ├── config.ts          # env vars (typed)
    │   ├── validators.ts      # Zod schemas (shared) — see 03-data-model.md
    │   ├── api-error.ts       # consistent error response helper
    │   ├── simulator.ts       # ★ the seeded synthetic fleet engine — S-01
    │   ├── ml/
    │   │   ├── eta.ts         # ETA calculation — Calc-01
    │   │   ├── demand.ts      # Demand forecast — Calc-02
    │   │   └── occupancy.ts   # 4-tier classification — S-02
    │   ├── geo/
    │   │   ├── haversine.ts   # distance between two lat/lon
    │   │   ├── bbox.ts        # bounding-box containment
    │   │   └── route-match.ts # match GPS to route polyline — Calc-04
    │   └── services/
    │       ├── fleet-service.ts
    │       ├── alert-service.ts      # S-03 alert generation + verification
    │       ├── chatbot-service.ts    # C-03 grounded chatbot
    │       ├── trip-service.ts       # C-04 trip planning
    │       ├── geocode-service.ts    # C-06 Photon proxy + cache
    │       └── telemetry-service.ts  # S-01 ingest + enrich + publish
    │
    ├── hooks/
    │   ├── use-fleet.ts          # TanStack Query: live fleet
    │   ├── use-fleet-socket.ts   # socket.io connection — RT-01
    │   ├── use-vehicle.ts
    │   ├── use-alerts.ts         # + socket subscription — RT-02
    │   ├── use-chat.ts
    │   ├── use-geolocation.ts
    │   └── use-online-status.ts
    │
    ├── stores/
    │   ├── ui-store.ts           # Zustand: active tab, selected vehicle, map viewport
    │   └── chat-store.ts         # Zustand: chat history
    │
    ├── types/
    │   └── index.ts              # shared TS types (Vehicle, Route, Alert, etc.)
    │
    └── middleware.ts            # auth + role check (if using NextAuth)
│
└── tests/
    ├── e2e/
    │   ├── commuter.spec.ts
    │   └── operator.spec.ts
    └── unit/
        └── lib/
            ├── eta.test.ts
            ├── demand.test.ts
            ├── occupancy.test.ts
            └── simulator.test.ts
```

---

## 2. Key files explained

| File | Purpose | Feature |
|---|---|---|
| `prisma/schema.prisma` | DB schema — see [`03-data-model.md §6`](./03-data-model.md#6-prisma-schema) | Foundation |
| `prisma/seed.ts` | Seeds PH, 1 operator, 6 routes, 15 vehicles, 2 users | Foundation |
| `src/lib/simulator.ts` | The seeded synthetic fleet engine | S-01 |
| `src/lib/ml/eta.ts` | ETA = distance / (speed × traffic_factor) | Calc-01 |
| `src/lib/ml/demand.ts` | Seeded historical mean, cached | Calc-02 |
| `src/lib/ml/occupancy.ts` | 4-tier with hysteresis | S-02 |
| `src/lib/services/chatbot-service.ts` | Grounded chatbot (no hallucination) | C-03 |
| `src/lib/services/alert-service.ts` | Alert generation + verification | S-03, O-02 |
| `src/components/map/fleet-map.tsx` | The live map (clustering, smooth updates) | C-01 |
| `src/app/api/cron/sim-tick/route.ts` | Vercel Cron entry — advances the sim | S-01 |
| `mini-services/socket/index.ts` | socket.io service for live updates | RT-01, RT-02 |

---

## 3. Route groups (the 3 apps)

Next.js route groups `(name)` don't affect the URL but let each app have its own layout:

| Route group | URL prefix | Layout |
|---|---|---|
| `(commuter)` | `/` | Header + bottom nav (mobile-first) |
| `(operator)` | `/operator` | Top nav + simple sidebar |
| `(regulator)` | `/regulator` | Top nav only (simple page) |

A user navigates between them via links in the header/profile menu. One Vercel project, one
domain.

---

## 4. API routes

All under `src/app/api/`. Versioned `/api/v1/` for the main API; `/api/cron/` for Vercel
Cron; `/api/health` + `/api/ready` for probes.

**Read routes** (Edge runtime, fast):
- `GET /api/v1/fleet` — live fleet (Redis-cached)
- `GET /api/v1/fleet/:id` — single vehicle
- `GET /api/v1/routes` — route list
- `GET /api/v1/routes/:id` — route detail + geometry
- `GET /api/v1/eta/:id` — ETA to remaining stops
- `GET /api/v1/demand/forecast` — demand forecast
- `GET /api/v1/alerts` — alerts list
- `GET /api/v1/places` — place search (Photon proxy)

**Write routes** (Node.js runtime):
- `POST /api/v1/chatbot` — chatbot query
- `POST /api/v1/trip-suggestions` — trip planning
- `POST /api/v1/edge/telemetry` — sim telemetry ingest
- `POST /api/v1/alerts/:id/{acknowledge,verify,false-alarm}` — verification workflow
- `POST/PUT/DELETE /api/v1/admin/vehicles` — vehicle CRUD
- `POST/PUT/DELETE /api/v1/admin/routes` — route CRUD (optional)

**Cron + probes**:
- `POST /api/cron/sim-tick` — Vercel Cron (every minute)
- `GET /api/health` — liveness
- `GET /api/ready` — readiness (DB + KV)

---

## 5. The simulator

`src/lib/simulator.ts` is a pure function:

```ts
type SimState = {
  vehicles: Array<{
    vehicleId: string
    routeId: string
    positionIndex: number  // index into the route polyline
    position: { lat: number; lon: number }
    occupancy: number
    tier: 'available' | 'filling' | 'at_capacity' | 'overloaded'
    tierHeldSince: number  // for hysteresis
    speedKph: number
    lastUpdate: number  // epoch ms
  }>
}

// Pure: same input → same output. Seeded RNG.
function tick(state: SimState, dtSeconds: number, seed: number): SimState
```

The cron route calls `tick()` 12 times per invocation (12 × 5s = 1 minute of sim time), writes
the resulting telemetry to DB + Redis, and publishes position updates to socket.io.

---

## 6. The socket.io mini-service

`mini-services/socket/` is a standalone Bun project:

```
mini-services/socket/
├── package.json    # socket.io, @socket.io/redis-adapter, @upstash/redis
├── index.ts        # the server (~80 lines)
└── README.md       # explains XTransformPort=3001
```

**`index.ts`:**
- Creates a socket.io server on port 3001.
- Uses the Redis adapter (Vercel KV) so multiple instances share state.
- On connection: verifies JWT (or demo mode), joins rooms (bbox tile for commuters, operator
  ID for operators).
- Subscribes to Redis `pubsub:fleet:*` + `pubsub:alerts:*`; emits to the relevant rooms.

**Client connects via:** `io("/?XTransformPort=3001")` — per the gateway constraint.

**Deployment:** The socket.io service needs a persistent process host (Vercel serverless
can't hold WS). Options: Render.com free web service, Railway, Fly.io. ~$5/month or free tier.
For a zero-budget fallback, use TanStack Query polling (5s) and skip the socket.io service.

---

## Next

- [`07-ui-ux-design.md`](./07-ui-ux-design.md) — where each feature lives in the UI
