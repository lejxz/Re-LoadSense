# 08 — Implementation Checklist

> **Hybrid approach:** keep the old project's HTML/CSS/JS frontend, rewrite the backend in
> Next.js 16. The old JS calls `/api/...` — the new Next.js API routes match those paths.
> ~50 steps across 7 phases. Each step is 1–3 hours.

---

## Table of contents

1. [How to use this checklist](#1-how-to-use-this-checklist)
2. [Phase 0 — Bootstrap (Next.js + old UI)](#phase-0--bootstrap-nextjs--old-ui)
3. [Phase 1 — Data + Simulation](#phase-1--data--simulation)
4. [Phase 2 — Core API (match old paths)](#phase-2--core-api-match-old-paths)
5. [Phase 3 — Real-time](#phase-3--real-time)
6. [Phase 4 — UI improvements (old HTML + new features)](#phase-4--ui-improvements-old-html--new-features)
7. [Phase 5 — Operator console improvements](#phase-5--operator-console-improvements)
8. [Phase 6 — Polish](#phase-6--polish)
9. [Phase 7 — Deploy + Test](#phase-7--deploy--test)
10. [Phase summary](#phase-summary)

---

## 1. How to use this checklist

- **Order matters.** Phases respect dependencies.
- **One step = one commit.**
- The old project's frontend (`app/` folder) is kept and served from `public/`.
- The old JS calls `const api = \`${location.origin}/api\`` — new API routes match these paths.
- **When stuck**: [`03-data-model.md`](./03-data-model.md) for fields; [`05-tech-stack.md`](./05-tech-stack.md) for stack; [`07-ui-ux-design.md`](./07-ui-ux-design.md) for UI placement.

---

## Phase 0 — Bootstrap (Next.js + old UI)

**Goal:** Next.js project with the old UI served as static files. (~0.5 day)

- [ ] **Step 0.1 — Init Next.js 16 in the project root**
  - **Build**: `bunx create-next-app@latest` with App Router, TS. Install into the existing project alongside the old `app/` folder (rename old `app/` to `public/app/` so Next.js serves it as static files).
  - **Where**: project root (`package.json`, `tsconfig.json`, `next.config.ts`)
  - **Done when**: `bun run dev` serves `http://localhost:3000/app/mobile.html` (the old commuter UI renders).

- [ ] **Step 0.2 — Install backend dependencies**
  - **Build**: Install Prisma, @upstash/redis, socket.io-client, pino, zod, bcryptjs, @sentry/nextjs, tsx, vitest, concurrently.
  - **Where**: `package.json`
  - **Done when**: `bun install` completes.

- [ ] **Step 0.3 — Configure TypeScript strict + project structure**
  - **Build**: `tsconfig.json` strict + `noUncheckedIndexedAccess`. Create `src/lib/`, `src/app/api/`, `prisma/`, `mini-services/socket/` directories.
  - **Where**: `tsconfig.json`, `src/`
  - **Done when**: `bun run typecheck` passes.

- [ ] **Step 0.4 — Set up Prisma + SQLite**
  - **Build**: `prisma/schema.prisma` with all 13 models per `03-data-model.md`. `src/lib/db.ts` Prisma client singleton. `bun run db:push` creates the DB.
  - **Where**: `prisma/schema.prisma`, `src/lib/db.ts`
  - **Done when**: `prisma studio` shows all 13 tables.

- [ ] **Step 0.5 — Set up Vercel KV (Redis) + config + vercel.json**
  - **Build**: `src/lib/redis.ts`, `src/lib/config.ts`, `src/lib/logger.ts`, `src/lib/api-error.ts`, `src/lib/validators.ts`, `vercel.json`.
  - **Where**: `src/lib/`, `vercel.json`
  - **Done when**: health/ready endpoints work.

- [ ] **Step 0.6 — Seed script**
  - **Build**: `prisma/seed.ts` — 8 real Cebu routes (from old `tools/populate_demo_data.py` CEBU_ROUTES), 16 vehicles with types, 16 devices, 2 users. Uses OSRM for polylines with straight-line fallback.
  - **Where**: `prisma/seed.ts`
  - **Done when**: `bun run db:seed` populates the DB.

- [ ] **Step 0.7 — Health + ready endpoints**
  - **Build**: `src/app/api/health/route.ts` + `src/app/api/ready/route.ts`.
  - **Where**: `src/app/api/`
  - **Done when**: `GET /api/health` → 200; `GET /api/ready` → 200 with DB + Redis checks.

---

## Phase 1 — Data + Simulation

**Goal:** Seeded simulator + calculation functions. (~1 day)

- [ ] **Step 1.1 — Geo utilities**
  - **Build**: `src/lib/geo/haversine.ts`, `bearing.ts`, `bbox.ts`, `route-match.ts`.
  - **Where**: `src/lib/geo/`

- [ ] **Step 1.2 — Occupancy tier calculator (with hysteresis)**
  - **Build**: `src/lib/ml/occupancy.ts` — 4-tier with 10s hysteresis.
  - **Where**: `src/lib/ml/occupancy.ts`

- [ ] **Step 1.3 — ETA calculator (direction-aware)**
  - **Build**: `src/lib/ml/eta.ts` — `distance / (speed × traffic_factor)`, direction-aware stop ordering.
  - **Where**: `src/lib/ml/eta.ts`

- [ ] **Step 1.4 — Demand forecast (deterministic)**
  - **Build**: `src/lib/ml/demand.ts` — seeded historical mean, cached, honest `source` label.
  - **Where**: `src/lib/ml/demand.ts`

- [ ] **Step 1.5 — Line-crossing counter (honest CV)**
  - **Build**: `src/lib/edge/line-counter.ts` — real counting algorithm, fed synthetic positions.
  - **Where**: `src/lib/edge/line-counter.ts`

- [ ] **Step 1.6 — Simulator core (seeded, route-type-aware)**
  - **Build**: `src/lib/simulator.ts` — pure `tick(state, dt) => newState`. Linear (turn-around) + loop (wrap). Bearing heading. 4-tier occupancy reaching overloaded.
  - **Where**: `src/lib/simulator.ts`

- [ ] **Step 1.7 — Alert service**
  - **Build**: `src/lib/services/alert-service.ts` — overload, deviation, speed anomaly. Dedup. Evidence JSON. Verification workflow (ack/verify/false-alarm).
  - **Where**: `src/lib/services/alert-service.ts`

- [ ] **Step 1.8 — sim-tick cron route**
  - **Build**: `POST /api/cron/sim-tick` — verifies `X-Cron-Secret`, runs 12 ticks × 5s, writes to DB + Redis, evaluates alerts, publishes to Redis pub/sub.
  - **Where**: `src/app/api/cron/sim-tick/route.ts`

- [ ] **Step 1.9 — Unit tests for calc functions**
  - **Build**: Vitest tests for haversine, bearing, bbox, occupancy, eta, demand, simulator.
  - **Where**: `tests/unit/lib/`

---

## Phase 2 — Core API (match old paths)

**Goal:** All Next.js API routes matching the old `/api/...` paths so the old JS works. (~1.5 days)

- [ ] **Step 2.1 — Fleet API**
  - **Build**: `GET /api/fleet` (live fleet, Redis-cached, no N+1) + `GET /api/fleet/:id`. Match the old response shape the JS expects.
  - **Where**: `src/app/api/fleet/route.ts`, `src/app/api/fleet/[vehicleId]/route.ts`, `src/lib/services/fleet-service.ts`
  - **Key**: the old `core.js` calls `fetch(api + '/fleet')` — match the response shape.

- [ ] **Step 2.2 — Routes API**
  - **Build**: `GET /api/routes` (list, paginated, filterable) + `GET /api/routes/:id` (detail with polyline + stops, Redis-cached).
  - **Where**: `src/app/api/routes/route.ts`, `src/app/api/routes/[routeId]/route.ts`

- [ ] **Step 2.3 — ETA API**
  - **Build**: `GET /api/eta/:vehicleId` — direction-aware, cached 30s.
  - **Where**: `src/app/api/eta/[vehicleId]/route.ts`

- [ ] **Step 2.4 — Demand API**
  - **Build**: `GET /api/demand` — deterministic, cached 1h, `source` label.
  - **Where**: `src/app/api/demand/route.ts`

- [ ] **Step 2.5 — Alerts API + verification workflow**
  - **Build**: `GET /api/alerts` + `POST /api/alerts/:id/{acknowledge,verify,false-alarm}`.
  - **Where**: `src/app/api/alerts/route.ts`, `src/app/api/alerts/[id]/*/route.ts`

- [ ] **Step 2.6 — Chatbot API (grounded)**
  - **Build**: `POST /api/chatbot` — grounded heuristic, intent detection, entity validation, PII redaction. Consolidate the old 5 chatbot files into 1.
  - **Where**: `src/app/api/chatbot/route.ts`, `src/lib/services/chatbot-service.ts`

- [ ] **Step 2.7 — Places API (Photon proxy)**
  - **Build**: `GET /api/places?q=...` — two-layer cache (Redis + Place table).
  - **Where**: `src/app/api/places/route.ts`, `src/lib/services/geocode-service.ts`

- [ ] **Step 2.8 — Trip suggestions API**
  - **Build**: `POST /api/trip-suggestions` — multi-leg, ranked.
  - **Where**: `src/app/api/trip-suggestions/route.ts`, `src/lib/services/trip-service.ts`

- [ ] **Step 2.9 — Telemetry ingest route**
  - **Build**: `POST /api/edge/telemetry` — validates payload, writes to DB + Redis, evaluates alerts, publishes to pub/sub. Seq dedup.
  - **Where**: `src/app/api/edge/telemetry/route.ts`

- [ ] **Step 2.10 — Vehicle + Route admin API (with type constraint)**
  - **Build**: `POST/PUT/DELETE /api/admin/vehicles` (validates `vehicleType ∈ route.allowedVehicleTypes` → 422) + `POST/PUT/DELETE /api/admin/routes` (409 if removing a used type).
  - **Where**: `src/app/api/admin/vehicles/route.ts`, `src/app/api/admin/routes/route.ts`

- [ ] **Step 2.11 — Wire old JS to new API**
  - **Build**: Check each `fetch(api + '...')` call in `app/js/*.js` against the new API response shapes. Update field names where they differ (e.g., `vehicle_id` → `vehicleId`, `tier: "green"` → `tier: "available"`). Add a compatibility layer if needed.
  - **Where**: `public/app/js/core.js`, `data.js`, `map.js`, `mobile.js`, `operator.js`, `places.js`, `routes-admin.js`
  - **Done when**: the old commuter UI (`/app/mobile.html`) loads fleet data from the new Next.js backend and renders vehicles on the map.

---

## Phase 3 — Real-time

**Goal:** socket.io mini-service + live updates. (~0.5 day)

- [ ] **Step 3.1 — socket.io mini-service**
  - **Build**: `mini-services/socket/index.ts` — port 3001, Redis adapter, rooms, pub/sub.
  - **Where**: `mini-services/socket/`

- [ ] **Step 3.2 — Client socket integration in old JS**
  - **Build**: Add socket.io-client to `public/app/js/core.js` (or a new `socket.js`). Connect via `/?XTransformPort=3001`. On fleet:update, trigger a data refresh (call the existing `refreshData()` function).
  - **Where**: `public/app/js/core.js` or `public/app/js/socket.js`
  - **Done when**: sim-tick → markers move within 3s (via socket) instead of waiting for the next 3-30s poll.

- [ ] **Step 3.3 — Alert socket (operator)**
  - **Build**: Operator JS subscribes to `operator:{id}` room; new alerts push in real time.
  - **Where**: `public/app/js/operator.js`

---

## Phase 4 — UI improvements (old HTML + new features)

**Goal:** Improve the existing UI with the concept's new features. (~1.5 days)

- [ ] **Step 4.1 — Add 5th Menu tab to mobile.html + mobile.js + mobile.css**
  - **Build**: Add a 5th nav button "Menu" to the bottom nav. Create a Menu tab panel with: Profile (demo toggle), Preferences (theme toggle), About (SIM explanation), Data & privacy.
  - **Where**: `public/app/mobile.html`, `public/app/js/mobile.js`, `public/app/css/mobile.css`

- [ ] **Step 4.2 — Add direction arrows to vehicle markers in map.js**
  - **Build**: In the marker `divIcon` HTML, add a ▲ or ▼ overlay based on `vehicle.direction`.
  - **Where**: `public/app/js/map.js`

- [ ] **Step 4.3 — Add map theme switcher to map.js**
  - **Build**: Add a layer-stack button that cycles through 5 tile themes (OSM, CartoDB light/dark, CyclOSM, Esri satellite). Persist selection in localStorage.
  - **Where**: `public/app/js/map.js`, `public/app/css/map.css`

- [ ] **Step 4.4 — Update 3-tier legend to 4-tier**
  - **Build**: Change the map legend from "Seats/Standing/Full" to "Available/Filling/At capacity/Overloaded" with the blink animation for overloaded.
  - **Where**: `public/app/js/map.js` or `public/app/mobile.html`, `public/app/css/map.css`

- [ ] **Step 4.5 — Change route polylines from blue to teal**
  - **Build**: In `map.js`, change the polyline colors from `#0b57d0` (blue) to `#087b68` (teal) per the no-indigo/blue rule.
  - **Where**: `public/app/js/map.js`

- [ ] **Step 4.6 — Add SIM badge to the header**
  - **Build**: Add an amber "SIM" pill to the mobile header + operator header.
  - **Where**: `public/app/mobile.html`, `public/app/operator.html`, `public/app/css/mobile.css`

- [ ] **Step 4.7 — Add sequenced vehicle-add form to operator console**
  - **Build**: In `routes-admin.js`, make the vehicle-add form sequenced (route → type filtered to allowed → details with capacity pre-filled).
  - **Where**: `public/app/js/routes-admin.js`, `public/app/operator.html`, `public/app/css/operator.css`

- [ ] **Step 4.8 — Add Home tab search (place search on the home tab)**
  - **Build**: Add a search bar to the Home tab that searches places (Photon) + shows nearby routes + "Plan trip to here" button.
  - **Where**: `public/app/mobile.html`, `public/app/js/mobile.js`, `public/app/js/places.js`

---

## Phase 5 — Operator console improvements

**Goal:** Minimal operator console improvements. (~0.5 day)

- [ ] **Step 5.1 — Ensure operator console works with new API**
  - **Build**: Verify `operator.js` calls match the new API response shapes. Update field names.
  - **Where**: `public/app/js/operator.js`

- [ ] **Step 5.2 — Add vehicle type + route type display**
  - **Build**: Show `vehicleType` and `routeType` in the fleet table + vehicle detail.
  - **Where**: `public/app/js/operator.js`, `public/app/operator.html`

---

## Phase 6 — Polish

**Goal:** Loading states, error handling, dark mode, performance. (~0.5 day)

- [ ] **Step 6.1 — Dark mode support**
  - **Build**: Add a dark theme to `variables.css` (dark variants of --wash, --panel, --ink, etc.). Wire the theme toggle from the Menu tab to add/remove a `.dark` class on `<html>`.
  - **Where**: `public/app/css/variables.css`, `public/app/js/mobile.js`

- [ ] **Step 6.2 — Loading + error states in the old JS**
  - **Build**: Add "Loading..." states and error toasts where missing. The old project has some; fill the gaps.
  - **Where**: `public/app/js/*.js`, `public/app/css/components.css`

- [ ] **Step 6.3 — Sentry integration**
  - **Build**: `@sentry/nextjs` for the Next.js backend. Add error capture to the old JS via Sentry browser SDK.
  - **Where**: `src/app/`, `public/app/js/core.js`

- [ ] **Step 6.4 — Performance pass**
  - **Build**: Ensure the old JS polls aren't too aggressive. Add `document.hidden` check to pause polling when the tab is inactive.
  - **Where**: `public/app/js/core.js`, `public/app/js/data.js`

---

## Phase 7 — Deploy + Test

**Goal:** Live on Vercel, basic tests. (~0.5 day)

- [ ] **Step 7.1 — Unit tests for calc functions**
  - **Build**: Vitest tests for haversine, bearing, bbox, occupancy, eta, demand, simulator.
  - **Where**: `tests/unit/lib/`

- [ ] **Step 7.2 — Vercel deployment**
  - **Build**: Connect repo to Vercel. Set env vars. Deploy. Verify `/app/mobile.html` loads and the API works.
  - **Where**: Vercel dashboard

- [ ] **Step 7.3 — Smoke test the deployed app**
  - **Build**: Verify fleet loads, map renders, chatbot answers, sim-tick cron runs.
  - **Where**: manual

- [ ] **Step 7.4 — GitHub Actions CI**
  - **Build**: lint + type-check + build on every PR.
  - **Where**: `.github/workflows/ci.yml`

- [ ] **Step 7.5 — Portfolio writeup**
  - **Build**: Update `README.md` with screenshots, demo URL, the 7 improvements story.
  - **Where**: `README.md`

---

## Phase summary

| Phase | Steps | Effort | Outcome |
|---|---|---|---|
| 0 — Bootstrap | 7 | 0.5 day | Next.js + old UI served as static files |
| 1 — Data + Sim | 9 | 1 day | Prisma schema, seed, simulator, calcs |
| 2 — Core API | 11 | 1.5 days | All API routes matching old `/api/...` paths |
| 3 — Real-time | 3 | 0.5 day | socket.io + old JS integration |
| 4 — UI improvements | 8 | 1.5 days | Menu tab, direction arrows, themes, legend, sequenced form |
| 5 — Operator | 2 | 0.5 day | Console improvements |
| 6 — Polish | 4 | 0.5 day | Dark mode, loading states, Sentry, perf |
| 7 — Deploy + Test | 5 | 0.5 day | Vercel live, tests, CI, writeup |
| **Total** | **49** | **~6.5 days** | **Deployed portfolio demo** |

---

## Final notes

- **The old UI is the starting point, not a blank page.** Don't rewrite HTML/CSS/JS that
  works. Improve it incrementally.
- **The backend is the rewrite.** Python/FastAPI → Next.js/TypeScript/Prisma. Same API
  paths so the old JS works with minimal changes.
- **The portfolio story is the 7 improvements** — each visible in the running app.
- **When done**: update README with screenshots + demo URL.
