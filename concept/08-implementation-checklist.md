# 08 — Implementation Checklist

> The ordered, checkable build plan for a solo developer. ~60 steps across 7 phases.
> Achievable in ~8 days of part-time work. Each step is 1–3 hours.

---

## Table of contents

1. [How to use this checklist](#1-how-to-use-this-checklist)
2. [Phase 0 — Bootstrap](#phase-0--bootstrap)
3. [Phase 1 — Data + Simulation](#phase-1--data--simulation)
4. [Phase 2 — Core API](#phase-2--core-api)
5. [Phase 3 — Real-time](#phase-3--real-time)
6. [Phase 4 — Commuter App](#phase-4--commuter-app)
7. [Phase 5 — Operator Console (minimal)](#phase-5--operator-console-minimal)
8. [Phase 6 — Polish](#phase-6--polish)
9. [Phase 7 — Deploy + Test](#phase-7--deploy--test)
10. [Phase summary](#phase-summary)

---

## 1. How to use this checklist

- **Order matters.** Phases respect dependencies (data before API, API before UI).
- **One step = one commit.** Small and reviewable.
- **Check the box when "Done when" passes.** No partial credit.
- **When stuck**: [`03-data-model.md`](./03-data-model.md) for *the fields*; [`04-features.md`](./04-features.md)
  for *what each feature does*; [`07-ui-ux-design.md`](./07-ui-ux-design.md) for *where it
  lives*.
- **Every step traces to a feature** (C-01, O-02, etc.) from [`04-features.md`](./04-features.md)
  and a data table from [`03-data-model.md`](./03-data-model.md).

**Step format:**
```
- [ ] **Step X.Y — Title**
  - **Build**: what to do
  - **Where**: file path(s)
  - **Feature**: feature ID from 04-features.md
  - **Done when**: testable criterion
```

---

## Phase 0 — Bootstrap

**Goal:** Empty Next.js project, configured, on Vercel, with deps installed. (~0.5 day)

- [ ] **Step 0.1 — Scaffold Next.js 16 + TypeScript + Tailwind 4**
  - **Build**: `bunx create-next-app@latest` with App Router, TS, Tailwind, ESLint.
  - **Where**: repo root
  - **Feature**: foundation
  - **Done when**: `bun run dev` serves the default page on `localhost:3000`.

- [ ] **Step 0.2 — Install all dependencies + shadcn/ui**
  - **Build**: Install per [`05-tech-stack.md §11`](./05-tech-stack.md#11-packagejson). Run
    `bunx shadcn@latest init` (New York style). Add: `button card input dialog dropdown-menu
    sheet sonner`.
  - **Where**: `package.json`, `components.json`, `src/components/ui/`
  - **Feature**: foundation
  - **Done when**: `bun install` completes; `bunx shadcn add button` works.

- [ ] **Step 0.3 — Configure TypeScript strict + ESLint + Prettier**
  - **Build**: `"strict": true`, `"noUncheckedIndexedAccess": true` in `tsconfig.json`. ESLint
    config. Prettier + `prettier-plugin-tailwindcss`.
  - **Where**: `tsconfig.json`, `.eslintrc.json`, `.prettierrc`
  - **Feature**: foundation
  - **Done when**: `bun run lint` passes; `bun run typecheck` passes.

- [ ] **Step 0.4 — Set up Prisma + SQLite + Vercel Postgres**
  - **Build**: `bunx prisma init`. Provider `sqlite` for dev. Create Vercel Postgres; add
    `DATABASE_URL` to `.env.local` + Vercel. `src/lib/db.ts` Prisma client singleton.
  - **Where**: `prisma/schema.prisma`, `src/lib/db.ts`, `.env.example`, `.env.local`
  - **Feature**: foundation
  - **Done when**: `bun run db:push` creates the DB; `prisma studio` opens.

- [ ] **Step 0.5 — Set up Vercel KV (Redis)**
  - **Build**: Create Vercel KV; add `KV_REST_API_URL` + `KV_REST_API_TOKEN` to env.
    `src/lib/redis.ts` using `@upstash/redis`.
  - **Where**: `src/lib/redis.ts`, `.env.example`
  - **Feature**: foundation
  - **Done when**: `await redis.set('test', '1')` works.

- [ ] **Step 0.6 — Connect Vercel + create vercel.json**
  - **Build**: Link repo to Vercel. Set all env vars (DATABASE_URL, KV_*, SENTRY_DSN,
    CRON_SECRET, NEXTAUTH_SECRET). Create `vercel.json` per [`05-tech-stack.md §12`](./05-tech-stack.md#12-verceljson).
  - **Where**: `vercel.json`, Vercel dashboard
  - **Feature**: foundation
  - **Done when**: Push to `main` triggers a Vercel deploy; the default page loads.

- [ ] **Step 0.7 — Create `.env.example` + `.gitignore`**
  - **Build**: Document all env vars (no real values). gitignore `.env.local`,
    `node_modules`, `.next`, `prisma/*.db`.
  - **Where**: `.env.example`, `.gitignore`
  - **Feature**: foundation
  - **Done when**: `git status` clean; `.env.example` lists all vars.

---

## Phase 1 — Data + Simulation

**Goal:** Prisma schema (all 12 tables), seeded Cebu data, and a working seeded simulator.
(~1 day)

- [ ] **Step 1.1 — Define all Prisma models**
  - **Build**: All 13 models per [`03-data-model.md §7`](./03-data-model.md#7-prisma-schema):
    `Country`, `Operator`, `Route` (with `allowedVehicleTypes: String[]`), `RoutePoint`,
    `Vehicle` (with `vehicleType: String`), `Device`, `TelemetryLog`, `VehicleState`,
    `OperatorAlert`, `OperatorFeedback`, `User`, `ChatbotQuery`, `Place`. Every field, every
    type, every constraint, every index.
  - **Where**: `prisma/schema.prisma`
  - **Feature**: foundation (all tables)
  - **Done when**: `bun run db:push` creates all 13 tables; `prisma studio` shows them.

- [ ] **Step 1.2 — Write the seed script (Cebu, neutral, with vehicle types)**
  - **Build**: Seed: 1 country (PH), 1 operator, 6 Cebu routes (04L, 17C, 62C, 13C, 08A, 12B)
    — each with `allowedVehicleTypes` (mostly `["jeepney"]`, one route `["jeepney",
    "minibus"]` for variety) — with ~80 RoutePoint each (~12 isStop), 15 vehicles (PH-MJ01
    through PH-MJ15) with `vehicleType` matching each route's allowed types, 15 devices (one
    per vehicle, auto-generated keys), 2 users (commuter@demo.com, operator@demo.com). Seeded
    RNG. Neutral data. **Respects the route-vehicle type constraint** (§4 of data model).
  - **Where**: `prisma/seed.ts`
  - **Feature**: foundation
  - **Done when**: `bun run db:seed` populates the DB; `prisma studio` shows 15 vehicles on 6
    routes with polylines; every vehicle's `vehicleType` is in its route's
    `allowedVehicleTypes`.

- [ ] **Step 1.3 — Build the simulator core (seeded, route-type-aware)**
  - **Build**: `src/lib/simulator.ts` — pure function `tick(state, dtSeconds, seed) => newState`.
    For each vehicle: advance `positionIndex` along route polyline (interpolate by speed × dt),
    update occupancy via time-of-day-biased random walk, compute tier. **Route type handling**:
    `linear` routes turn around at endpoints (direction flips forward↔backward, no teleport);
    `loop` routes wrap from end to start (always forward). Compute `heading` from bearing
    between current + next point. Pure + seeded. See
    [`03-data-model.md §4.2`](./03-data-model.md#42-route-type-linear-vs-loop-and-vehicle-direction).
  - **Where**: `src/lib/simulator.ts`, `src/lib/geo/bearing.ts`
  - **Feature**: S-01
  - **Done when**: Same seed + inputs → same outputs. Unit test: a `linear`-route vehicle
    turns around at the endpoint (direction flips, no teleport); a `loop`-route vehicle wraps;
    `heading` is correct.

- [ ] **Step 1.4 — Build the occupancy tier calculator**
  - **Build**: `src/lib/ml/occupancy.ts` — `classifyTier(occupancy, capacity, previousTier,
    tierHeldSince)`. 4 tiers with 10s hysteresis.
  - **Where**: `src/lib/ml/occupancy.ts`
  - **Feature**: S-02
  - **Done when**: Unit test: count transitions produce stable tiers; no flicker.

- [ ] **Step 1.5 — Build the ETA calculator**
  - **Build**: `src/lib/ml/eta.ts` — `calculateEta(vehicle, remainingStops, trafficFactor)`.
    `eta_seconds = haversine_distance / (speed_mps × traffic_factor)`. Plus
    `src/lib/geo/haversine.ts`.
  - **Where**: `src/lib/ml/eta.ts`, `src/lib/geo/haversine.ts`
  - **Feature**: Calc-01
  - **Done when**: Unit test: vehicle 1km away at 30kph → ~120s ETA.

- [ ] **Step 1.6 — Build the demand forecast (deterministic)**
  - **Build**: `src/lib/ml/demand.ts` — `forecastDemand(routeId, hour)`. Seeded historical
    mean per route × hour. Honest `source: "historical_mean"`.
  - **Where**: `src/lib/ml/demand.ts`
  - **Feature**: Calc-02
  - **Done when**: Same route+hour → same forecast; `source` labeled.

- [ ] **Step 1.7 — Build the sim-tick cron route**
  - **Build**: `POST /api/cron/sim-tick` — verifies `X-Cron-Secret`; loads state from Redis
    (or DB if cold); runs `tick()` 12× (5s each = 1 min); writes telemetry to DB
    (`TelemetryLog` + `VehicleState`) + Redis (`vehicle:{id}:state`); evaluates alerts;
    publishes to Redis `pubsub:fleet:PH`.
  - **Where**: `src/app/api/cron/sim-tick/route.ts`
  - **Feature**: S-01
  - **Done when**: Hitting the route (with secret) advances the fleet; `prisma studio` shows
    new `TelemetryLog` rows; `VehicleState` updates.

- [ ] **Step 1.8 — Build the alert evaluation service**
  - **Build**: `src/lib/services/alert-service.ts` — on each telemetry upsert, check: overload
    (tier=overloaded >10s), route deviation (>200m via bounding-box), speed anomaly (>80kph).
    Dedup: no duplicate open alerts for same `(vehicleId, type)`. Create `OperatorAlert` rows
    with `evidence` JSON.
  - **Where**: `src/lib/services/alert-service.ts`, `src/lib/geo/bbox.ts`
  - **Feature**: S-03
  - **Done when**: A simulated overloaded vehicle → an `OperatorAlert` appears in the DB.

- [ ] **Step 1.9 — Build health + ready endpoints**
  - **Build**: `GET /api/health` (200 fast); `GET /api/ready` (pings DB + KV, 200 or 503).
  - **Where**: `src/app/api/health/route.ts`, `src/app/api/ready/route.ts`
  - **Feature**: X-03
  - **Done when**: `/health` < 50ms; `/ready` → 200 when up, 503 when DB down.

---

## Phase 2 — Core API

**Goal:** All REST routes for fleet, routes, ETA, demand, alerts, chatbot, places,
trip-suggestions, telemetry ingest, vehicle CRUD. (~1.5 days)

- [ ] **Step 2.1 — Build shared validators + error helper**
  - **Build**: `src/lib/validators.ts` — Zod schemas for `TelemetryIngest`, `Vehicle`, `Route`,
    `Alert`, `ChatQuery`, `PlaceQuery`, `TripSuggestion`. `src/lib/api-error.ts` —
    `apiError(code, message, status)` returning `{"error": {"code", "message", "request_id"}}`.
  - **Where**: `src/lib/validators.ts`, `src/lib/api-error.ts`
  - **Feature**: foundation
  - **Done when**: Schemas export; invalid payload → 422 with field errors.

- [ ] **Step 2.2 — Fleet API (Edge runtime, Redis-cached)**
  - **Build**: `GET /api/v1/fleet` — reads live state from Redis `fleet:PH:live` +
    `vehicle:{id}:state`, joins with DB for static data. Cursor-paginated. `GET /api/v1/fleet/:id`.
    **No N+1** — one Redis MGET + one Postgres query.
  - **Where**: `src/app/api/v1/fleet/route.ts`, `src/app/api/v1/fleet/[vehicleId]/route.ts`,
    `src/lib/services/fleet-service.ts`
  - **Feature**: C-01, O-01
  - **Done when**: Returns fleet in < 100ms; paginated; cached.

- [ ] **Step 2.3 — Routes API**
  - **Build**: `GET /api/v1/routes` (list, paginated); `GET /api/v1/routes/:id` (detail with
    polyline + stops). Redis-cached (1h TTL).
  - **Where**: `src/app/api/v1/routes/route.ts`, `src/app/api/v1/routes/[routeId]/route.ts`
  - **Feature**: C-05, O-04
  - **Done when**: Returns routes; geometry is a valid lat/lon array.

- [ ] **Step 2.4 — ETA API**
  - **Build**: `GET /api/v1/eta/:vehicleId` — uses `calculateEta()` from Step 1.5. Cached in
    Redis `eta:{vehicleId}:{stopSeq}` (30s TTL).
  - **Where**: `src/app/api/v1/eta/[vehicleId]/route.ts`
  - **Feature**: C-02
  - **Done when**: Returns ETA per stop; deterministic within cache window.

- [ ] **Step 2.5 — Demand API**
  - **Build**: `GET /api/v1/demand/forecast?route=04L` — uses `forecastDemand()` from Step 1.6.
    Cached (1h). Honest `source` label.
  - **Where**: `src/app/api/v1/demand/forecast/route.ts`
  - **Feature**: Calc-02
  - **Done when**: Returns forecast; same input → same output; `source` labeled.

- [ ] **Step 2.6 — Alerts API + verification workflow**
  - **Build**: `GET /api/v1/alerts` (list, filterable); `POST /api/v1/alerts/:id/acknowledge`,
    `/verify`, `/false-alarm`. Each updates status + creates an `OperatorFeedback` row.
  - **Where**: `src/app/api/v1/alerts/route.ts`, `src/app/api/v1/alerts/[id]/*/route.ts`,
    `src/lib/services/alert-service.ts`
  - **Feature**: O-02
  - **Done when**: List returns; each action updates the alert status + creates feedback.

- [ ] **Step 2.7 — Chatbot API (grounded heuristic) ★**
  - **Build**: `POST /api/v1/chatbot` — `src/lib/services/chatbot-service.ts`. Parse intent +
    entities. **Validate entities**: check mentioned route codes exist in `Route` table. Query
    live fleet. Compose response referencing real vehicle IDs + route codes. **Never invent.**
    PII-redact before logging to `ChatbotQuery`.
  - **Where**: `src/app/api/v1/chatbot/route.ts`, `src/lib/services/chatbot-service.ts`
  - **Feature**: C-03
  - **Done when**: "least crowded now?" → grounded response with real route + vehicle. "route
    XYZ" (nonexistent) → "I don't have data for route XYZ." No invented codes.

- [ ] **Step 2.8 — Places API (Photon proxy)**
  - **Build**: `GET /api/v1/places?q=Colon` — proxies Photon geocoder. Redis-cached (5min TTL,
    bounded LRU max 500).
  - **Where**: `src/app/api/v1/places/route.ts`, `src/lib/services/geocode-service.ts`
  - **Feature**: C-06
  - **Done when**: "Colon" → Cebu places; cached; degrades gracefully if Photon down.

- [ ] **Step 2.9 — Trip suggestions API**
  - **Build**: `POST /api/v1/trip-suggestions` — origin + destination → ranked multi-leg
    suggestions. Match origin/destination to nearby routes (bounding-box). Compute legs with
    live occupancy + ETA. Rank by total time.
  - **Where**: `src/app/api/v1/trip-suggestions/route.ts`, `src/lib/services/trip-service.ts`,
    `src/lib/geo/route-match.ts`
  - **Feature**: C-04
  - **Done when**: "Colon to Ayala" → ≥3 ranked suggestions; each shows legs + occupancy + ETA.

- [ ] **Step 2.10 — Telemetry ingest route (sim)**
  - **Build**: `POST /api/v1/edge/telemetry` — validates payload (Zod); writes to
    `TelemetryLog` + `VehicleState` + Redis `vehicle:{id}:state`; evaluates alerts; publishes
    to Redis `pubsub:fleet:PH`. For sim, auth is a simple `X-Device-Key`.
  - **Where**: `src/app/api/v1/edge/telemetry/route.ts`, `src/lib/services/telemetry-service.ts`
  - **Feature**: S-01
  - **Done when**: POST a telemetry event → fleet reflects it; an alert fires if overloaded.

- [ ] **Step 2.11 — Vehicle + Route admin API (with type constraint)**
  - **Build**: `POST/PUT/DELETE /api/v1/admin/vehicles` — validates `vehicleType ∈
    route.allowedVehicleTypes` before write (returns 422 if violated). `POST/PUT/DELETE
    /api/v1/admin/routes` — on edit of `allowedVehicleTypes`, returns 409 if removing a type
    that existing vehicles use. See [`03-data-model.md §4`](./03-data-model.md#4-vehicle-types-and-the-route-vehicle-type-constraint).
  - **Where**: `src/app/api/v1/admin/vehicles/route.ts`, `src/app/api/v1/admin/routes/route.ts`
  - **Feature**: O-03
  - **Done when**: CRUD works; a bus on a jeepney-only route → 422; removing a used type from
    a route → 409; plate pattern + capacity ≥1 enforced.

---

## Phase 3 — Real-time

**Goal:** socket.io mini-service + live fleet updates on the map. (~0.5 day)

- [ ] **Step 3.1 — Build the socket.io mini-service**
  - **Build**: `mini-services/socket/index.ts` — socket.io server on port 3001. Redis adapter
    (Vercel KV). Rooms: `fleet:PH`, `operator:{id}`. Subscribes to Redis `pubsub:fleet:PH` +
    `pubsub:alerts:*`; emits to rooms.
  - **Where**: `mini-services/socket/index.ts`, `mini-services/socket/package.json`
  - **Feature**: RT-01, RT-02
  - **Done when**: `bun run dev:ws` starts on 3001; a test client connects.

- [ ] **Step 3.2 — Build the client socket hook**
  - **Build**: `src/hooks/use-fleet-socket.ts` — connects to `/?XTransformPort=3001`;
    auto-reconnect with backoff; on fleet events, updates TanStack Query cache
    (`queryClient.setQueryData`). Markers move smoothly without a full refetch.
  - **Where**: `src/hooks/use-fleet-socket.ts`
  - **Feature**: RT-01
  - **Done when**: A sim-tick → connected client's markers move within 3s; no flicker.

- [ ] **Step 3.3 — Alert socket (operator)**
  - **Build**: Operator console subscribes to `operator:{id}` room; new alerts push in real
    time.
  - **Where**: `src/hooks/use-alerts.ts` (add socket subscription)
  - **Feature**: RT-02
  - **Done when**: A new alert → operator console shows it without refresh.

- [ ] **Step 3.4 — Document the gateway constraint**
  - **Build**: `mini-services/socket/README.md` — explains `XTransformPort=3001`, why it's a
    separate service, deployment options.
  - **Where**: `mini-services/socket/README.md`
  - **Feature**: foundation
  - **Done when**: README clearly explains the mechanism + deployment.

---

## Phase 4 — Commuter App

**Goal:** The showcase — 5-tab interface (Home, Map, Routes, Chat, Menu), vehicle detail, chatbot, trip planner. (~2 days)

- [ ] **Step 4.1 — Build the commuter app shell + 5-tab bottom nav**
  - **Build**: `src/app/(commuter)/layout.tsx` — header (logo, "Cebu" city label, SIM badge) +
    main + **5-tab bottom nav: Home, Map, Routes, Chat, Menu**. Mobile-first. Home is the
    default landing tab.
  - **Where**: `src/app/(commuter)/layout.tsx`, `src/components/commuter/app-shell.tsx`,
    `src/components/commuter/bottom-nav.tsx`
  - **Feature**: foundation, C-00, C-09
  - **Done when**: Layout renders; 5-tab bottom nav switches tabs; Home is default; responsive.

- [ ] **Step 4.2 — Set up design tokens + dark mode**
  - **Build**: Tailwind config with tier colors (green/yellow/red/blink) as semantic tokens;
    brand teal (NOT indigo/blue); `next-themes` for dark mode; `ThemeToggle` in profile menu.
    See [`07-ui-ux-design.md §2`](./07-ui-ux-design.md#2-color-system-the-tier-palette).
  - **Where**: `tailwind.config.ts`, `src/app/globals.css`, `src/components/shared/theme-toggle.tsx`
  - **Feature**: C-07
  - **Done when**: Dark mode toggles; tier colors are tokens; no hardcoded hex.

- [ ] **Step 4.3 — Build the SIM badge component**
  - **Build**: `src/components/shared/sim-badge.tsx` — amber pill "SIM" with tooltip. Shown in
    the header on all apps.
  - **Where**: `src/components/shared/sim-badge.tsx`
  - **Feature**: X-01
  - **Done when**: Badge visible in header; tooltip explains.

- [ ] **Step 4.4 — Build the Home tab (search-first discovery) ★**
  - **Build**: `src/app/(commuter)/page.tsx` — Home tab (default landing). Search bar
    (debounced 300ms) → `GET /api/v1/places`. Results list (name, type icon, distance). Tap a
    place → expands to nearby routes + live vehicles + "Plan trip to here" button (jumps to
    `/plan` with destination pre-filled). Quick shortcuts: "Nearby stops" → Map tab,
    "Least crowded now" → Chat tab with query, "My routes" → Routes tab.
  - **Where**: `src/app/(commuter)/page.tsx`, `src/components/commuter/home-search.tsx`,
    `src/components/commuter/place-result-card.tsx`
  - **Feature**: C-00
  - **Done when**: "SM City" → place result + nearby routes + live vehicles + "Plan trip"
    button; "hotel" → multiple hotels; search is debounced + cached.

- [ ] **Step 4.5 — Build the live map (react-leaflet + themes + direction arrows + polylines) ★**
  - **Build**: `src/components/map/fleet-map.tsx` — react-leaflet with **5 tile themes**
    (OSM, CartoDB light/dark, CyclOSM, Esri satellite) + a **theme switcher popover**
    (layer-stack button, bottom-right). `VehicleMarker` (custom divIcon: tier color + route
    code + **direction arrow** ▲/▼). `leaflet.markercluster` for clustering. **Route
    polylines** (teal line + stop dots) when a route is selected. **4-tier legend**
    (bottom-left). **Smooth updates**: on socket events, update marker positions + direction
    in place (don't clear + re-add). `LocateFAB` (geolocation). Theme persists in localStorage;
    auto-switches to CartoDB dark in dark mode. See
    [`05-tech-stack.md §6`](./05-tech-stack.md#6-map) +
    [`07-ui-ux-design.md §Map tab`](./07-ui-ux-design.md#map-tab-map--feature-c-01).
  - **Where**: `src/components/map/fleet-map.tsx`, `src/components/map/vehicle-marker.tsx`,
    `src/components/map/theme-switcher.tsx`, `src/components/map/route-polyline.tsx`,
    `src/components/map/legend.tsx`, `src/components/map/locate-fab.tsx`,
    `src/app/(commuter)/map/page.tsx`, `src/lib/map-themes.ts` (the 5 tile provider configs)
  - **Feature**: C-01
  - **Done when**: Map renders ~15 markers with direction arrows; clustering works; theme
    switcher offers 5 themes + persists; 4-tier legend visible; route polylines render with
    stops; markers move smoothly on sim-tick; dark mode auto-swaps to carto-dark; no flicker;
    a linear-route vehicle's arrow flips at the endpoint.

- [ ] **Step 4.6 — Build the vehicle detail bottom sheet**
  - **Build**: `src/components/commuter/vehicle-detail-sheet.tsx` — on marker tap, sheet slides
    up (mobile) / side panel (desktop). Shows: vehicle ID, route code + name, tier pill, ETA
    to next 3 stops (from `/api/v1/eta/:id`), last updated, "track" button.
  - **Where**: `src/components/commuter/vehicle-detail-sheet.tsx`
  - **Feature**: C-01, C-02
  - **Done when**: Tapping a marker opens the sheet; data is accurate; ETA shows.

- [ ] **Step 4.6 — Build the Routes tab**
  - **Build**: `src/app/(commuter)/routes/page.tsx` — search bar (debounced), filter chips (All
    / Has live vehicles), route cards (code, name, region, live count, tier dot). Tap → route
    detail.
  - **Where**: `src/app/(commuter)/routes/page.tsx`, `src/components/commuter/route-card.tsx`
  - **Feature**: C-05
  - **Done when**: Search filters; cards render; tap opens detail.

- [ ] **Step 4.7 — Build the route detail page**
  - **Build**: `src/app/(commuter)/routes/[routeId]/page.tsx` — map with route geometry
    (polyline) + live vehicles; stop list with ETAs for the nearest live vehicle.
  - **Where**: `src/app/(commuter)/routes/[routeId]/page.tsx`
  - **Feature**: C-05, C-02
  - **Done when**: Geometry renders; vehicles on route show; stops list with ETAs.

- [ ] **Step 4.8 — Build the Chat tab ★**
  - **Build**: `src/app/(commuter)/chat/page.tsx` — message list, quick-reply chips ("Least
    crowded now?", "When is next 04L?"), input bar, typing indicator. ARIA live region. SIM
    badge reminder at top.
  - **Where**: `src/app/(commuter)/chat/page.tsx`, `src/components/chat/chat-messages.tsx`,
    `src/components/chat/chat-input.tsx`, `src/hooks/use-chat.ts`
  - **Feature**: C-03
  - **Done when**: "least crowded now?" → grounded response with real route + vehicle; "route
    XYZ" (fake) → "I don't have data for that route"; typing indicator; ARIA announces.

- [ ] **Step 4.9 — Build the Plan tab (trip planner)**
  - **Build**: `src/app/(commuter)/plan/page.tsx` — origin input (place search), destination
    input, "use my location" button, search button. Results as ranked cards (total time,
    walking, legs with occupancy + ETA). Tap → detail with mini-map.
  - **Where**: `src/app/(commuter)/plan/page.tsx`, `src/components/commuter/trip-result-card.tsx`,
    `src/components/commuter/place-search.tsx`
  - **Feature**: C-04, C-06
  - **Done when**: "Colon to Ayala" → ≥3 ranked suggestions; each shows legs + occupancy + ETA.

- [ ] **Step 4.10 — Build the Menu tab (profile, preferences, about) ★**
  - **Build**: `src/app/(commuter)/menu/page.tsx` — the 5th bottom-nav tab. Sections: Profile
    (avatar, "Switch to operator view" demo toggle), Preferences (theme toggle light/dark/
    system, language English), About (what Re-LoadSense is, SIM explanation, portfolio link),
    Data & privacy (download/delete my data, if auth), Logout (if auth).
  - **Where**: `src/app/(commuter)/menu/page.tsx`, `src/components/commuter/menu-section.tsx`
  - **Feature**: C-09, C-07
  - **Done when**: Menu tab is the 5th nav item; all sections render; theme toggle works;
    "Switch to operator view" navigates to `/operator`; About explains SIM data honestly.

- [ ] **Step 4.11 — Set up TanStack Query + Zustand**
  - **Build**: `src/lib/query-client.ts` (staleTime 30s, retry 2, refetchOnWindowFocus);
    `src/stores/ui-store.ts` (active tab, selected vehicle, map viewport);
    `src/stores/chat-store.ts` (chat history). Providers in root layout.
  - **Where**: `src/lib/query-client.ts`, `src/stores/`, `src/app/layout.tsx`
  - **Feature**: foundation
  - **Done when**: `useQuery` works; Zustand store updates trigger re-renders.

---

## Phase 5 — Operator Console (minimal)

**Goal:** Functional operator console — fleet, alerts, vehicle CRUD. (~1 day)

- [ ] **Step 5.1 — Build the operator shell + sidebar**
  - **Build**: `src/app/(operator)/layout.tsx` — top nav (logo, "Operator" label, SIM badge,
    back-to-commuter link) + simple sidebar (Fleet, Alerts, Vehicles, Routes). Collapses to
    hamburger below `lg`.
  - **Where**: `src/app/(operator)/layout.tsx`, `src/components/operator/app-shell.tsx`,
    `src/components/operator/sidebar.tsx`
  - **Feature**: foundation
  - **Done when**: Sidebar navigates; responsive collapse works.

- [ ] **Step 5.2 — Build the Fleet page**
  - **Build**: `src/app/(operator)/page.tsx` — table (Vehicle ID, Plate, Route, Tier pill,
    Speed, Last seen, Status). Filter bar (by route, tier, status). Row click → vehicle
    drawer. Live updates via socket.
  - **Where**: `src/app/(operator)/page.tsx`, `src/components/operator/fleet-table.tsx`,
    `src/components/operator/vehicle-drawer.tsx`
  - **Feature**: O-01
  - **Done when**: Table renders; filters work; drawer opens; live updates.

- [ ] **Step 5.3 — Build the Alerts page + verification workflow**
  - **Build**: `src/app/(operator)/alerts/page.tsx` — alerts table (Type, Severity, Vehicle,
    Route, Raised, Status). Filter by status/type. Row click → alert detail modal with
    evidence + Acknowledge/Verify/False-alarm buttons. Live updates via socket.
  - **Where**: `src/app/(operator)/alerts/page.tsx`, `src/components/operator/alerts-list.tsx`,
    `src/components/operator/alert-detail-modal.tsx`
  - **Feature**: O-02
  - **Done when**: Alerts list; modal opens; actions update status; new alerts appear live.

- [ ] **Step 5.4 — Build the Vehicles page (CRUD with sequenced form) ★**
  - **Build**: `src/app/(operator)/vehicles/page.tsx` — table with edit/delete actions. "Add
    Vehicle" button → **sequenced form modal** (Step 1: route → Step 2: vehicle type, filtered
    to route's `allowedVehicleTypes` → Step 3: code/plate/capacity, pre-filled from type).
    Edit → pre-filled modal (changing route re-filters type dropdown). Delete → confirm modal
    (soft delete). See [`07-ui-ux-design.md §Vehicles page`](./07-ui-ux-design.md#vehicles-page-operatorvehicles--feature-o-03).
  - **Where**: `src/app/(operator)/vehicles/page.tsx`,
    `src/components/operator/vehicle-form-modal.tsx` (the sequenced form)
  - **Feature**: O-03
  - **Done when**: Step 1 (route) is the only enabled field initially; Step 2 shows only the
    selected route's allowed types; Step 3 unlocks after type selected with capacity
    pre-filled; create/edit/delete works; a bus on a jeepney-only route is impossible to
    submit (client + server validation).

- [ ] **Step 5.5 — Build the Routes page (read-only)**
  - **Build**: `src/app/(operator)/routes/page.tsx` — simple list of routes (code, name,
    region, vehicle count). Tap → route detail mini-map. No add/edit.
  - **Where**: `src/app/(operator)/routes/page.tsx`
  - **Feature**: O-04
  - **Done when**: List renders; detail opens.

---

## Phase 6 — Polish

**Goal:** Loading states, error states, responsiveness, a11y basics, performance. (~1 day)

- [ ] **Step 6.1 — Loading skeletons + error states**
  - **Build**: Skeleton screens (shadcn `Skeleton`) for fleet, routes, alerts, chat. Error
    boundary with retry. Empty states.
  - **Where**: `src/components/shared/skeleton.tsx`, `src/components/shared/error-boundary.tsx`,
    `src/components/shared/empty-state.tsx`
  - **Feature**: foundation
  - **Done when**: Every async view has skeleton → content → error path; no blank flashes.

- [ ] **Step 6.2 — Toast notifications**
  - **Build**: shadcn `Sonner` — success/error toasts for actions (alert verified, vehicle
    added, etc.).
  - **Where**: `src/components/shared/toaster.tsx`
  - **Feature**: foundation
  - **Done when**: Actions trigger toasts; errors are visible.

- [ ] **Step 6.3 — Mobile responsiveness audit**
  - **Build**: Test all pages at sm (640), md (768), lg (1024). Fix overflow, touch targets
    < 44px, horizontal scroll.
  - **Where**: all components
  - **Feature**: C-07
  - **Done when**: No layout breaks at any breakpoint; all touch targets ≥ 44px.

- [ ] **Step 6.4 — Accessibility basics**
  - **Build**: Skip-to-content link; labels on all inputs; ARIA live region on chat; focus
    traps in modals; ESC closes; `prefers-reduced-motion` (overloaded marker → steady red).
  - **Where**: all components
  - **Feature**: foundation
  - **Done when**: Manual screen-reader check passes on key flows; keyboard nav works.

- [ ] **Step 6.5 — Performance pass (Lighthouse)**
  - **Build**: `next/image` for images; lazy-load below-fold; code-split the map (dynamic
    import); prefetch route links. Check Lighthouse.
  - **Where**: all pages
  - **Feature**: foundation
  - **Done when**: Lighthouse performance ≥ 90 on commuter app; LCP < 2.5s.

- [ ] **Step 6.6 — Sentry integration**
  - **Build**: `@sentry/nextjs`; `sentry.client.config.ts` + `sentry.server.config.ts`;
    `withSentry` in `next.config.ts`; `SENTRY_DSN` env var.
  - **Where**: `sentry.*.config.ts`, `next.config.ts`
  - **Feature**: foundation
  - **Done when**: A forced error appears in Sentry with a stack trace.

- [ ] **Step 6.7 — Offline banner + PWA manifest (optional)**
  - **Build**: `src/hooks/use-online-status.ts` + `src/components/shared/offline-banner.tsx`.
    `public/manifest.json` (installable). If easy, add `next-pwa`; if not, skip the SW.
  - **Where**: `src/components/shared/offline-banner.tsx`, `public/manifest.json`
  - **Feature**: foundation
  - **Done when**: Offline → banner appears; manifest makes it installable.

---

## Phase 7 — Deploy + Test

**Goal:** Live on Vercel, basic tests, CI. (~0.5 day)

- [ ] **Step 7.1 — Unit tests for calc functions**
  - **Build**: Vitest tests for `eta.ts`, `demand.ts`, `occupancy.ts`, `simulator.ts`. These
    are the "calculations were wrong" fixes — test them.
  - **Where**: `tests/unit/lib/*.test.ts`
  - **Feature**: Calc-01, Calc-02, S-02, S-01
  - **Done when**: Tests pass; edge cases covered (empty route, full vehicle, etc.).

- [ ] **Step 7.2 — Playwright e2e (commuter flow)**
  - **Build**: `tests/e2e/commuter.spec.ts` — open map → see markers → tap a vehicle → see
    detail → ask chatbot "least crowded" → get grounded answer.
  - **Where**: `tests/e2e/commuter.spec.ts`
  - **Feature**: C-01, C-02, C-03
  - **Done when**: E2E passes against local dev.

- [ ] **Step 7.3 — GitHub Actions CI**
  - **Build**: `.github/workflows/ci.yml` — on PR: lint, type-check, build. That's it.
  - **Where**: `.github/workflows/ci.yml`
  - **Feature**: foundation
  - **Done when**: CI runs on PR; all checks pass.

- [ ] **Step 7.4 — Deploy the socket.io mini-service**
  - **Build**: Deploy `mini-services/socket/` to a persistent host (Render free, Railway, or
    Fly.io). Set env vars (KV_*, NEXTAUTH_SECRET). Note the public URL.
  - **Where**: Render/Railway/Fly
  - **Feature**: RT-01, RT-02
  - **Done when**: The service is live; a client can connect from the Vercel app.

- [ ] **Step 7.5 — Production deploy + smoke test**
  - **Build**: Merge to `main` → Vercel production deploy. Set the socket.io service URL in
    the Vercel env. Smoke test: commuter map loads, markers move, chatbot answers, operator
    console works.
  - **Where**: Vercel
  - **Feature**: all
  - **Done when**: Production URL loads; sim fleet moves; chatbot grounded; operator can
    verify an alert.

- [ ] **Step 7.6 — Portfolio writeup**
  - **Build**: A `README.md` for the repo explaining: what the original was, the 7 problems,
    how this project fixes each, screenshots, the live demo URL, the tech stack.
  - **Where**: repo `README.md`
  - **Feature**: (the portfolio story)
  - **Done when**: README clearly tells the improvement story with screenshots + demo link.

---

## Phase summary

| Phase | Steps | Effort | Outcome |
|---|---|---|---|
| 0 — Bootstrap | 7 | 0.5 day | Next.js on Vercel, deps installed |
| 1 — Data + Sim | 9 | 1 day | Schema, seed, simulator running, calcs correct |
| 2 — Core API | 11 | 1.5 days | All REST routes, grounded chatbot |
| 3 — Real-time | 4 | 0.5 day | socket.io live updates |
| 4 — Commuter App | 11 | 2 days | The showcase (map, chat, plan, routes) |
| 5 — Operator Console | 5 | 1 day | Minimal functional console |
| 6 — Polish | 7 | 1 day | Loading states, a11y, perf, Sentry |
| 7 — Deploy + Test | 6 | 0.5 day | Live on Vercel, tests, CI |
| **Total** | **60** | **~8 days part-time** | **Deployed portfolio demo** |

---

## Final notes

- **This checklist is the contract.** 60 steps, each 1–3 hours, each a single commit.
- **The seven problems are the story.** Every step traces to fixing one. The portfolio writeup
  (Step 7.6) ties it together.
- **Don't gold-plate.** If a step feels too long, simplify. The goal is a deployed, working,
  honest demo — not a production system.
- **The operator console is minimal on purpose.** Don't add device management, demand charts,
  audit logs, or reports. Those are production scope. The portfolio value is in the commuter
  app + the seven fixes.
- **When done**: update the repo README with screenshots + the live demo URL + the improvement
  story. Put it on your portfolio.

**Next session: open Phase 0, Step 0.1, and begin.**
