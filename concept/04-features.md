# 04 — Features

> The features this project builds, matching the original hackathon concept, with the variables
> and data each feature needs. Every feature traces to the data model in
> [`03-data-model.md`](./03-data-model.md) and to one of the seven problems in
> [`01-overview.md`](./01-overview.md).

---

## Table of contents

1. [Feature list (matching the original concept)](#1-feature-list-matching-the-original-concept)
2. [Commuter app features (5-tab: Home / Map / Routes / Chat / Menu)](#2-commuter-app-features-5-tab-home--map--routes--chat--menu)
3. [Operator console features](#3-operator-console-features)
4. [Simulation features](#4-simulation-features)
5. [Calculation features](#5-calculation-features)
6. [Real-time features](#6-real-time-features)
7. [Cross-cutting features](#7-cross-cutting-features)
8. [Inter-feature logic consistency audit](#8-inter-feature-logic-consistency-audit)
9. [Feature → problem → data traceability](#9-feature--problem--data-traceability)

---

## 1. Feature list (matching the original concept)

The original hackathon submission had these features (from the roadmap PDF):
- Four-tier occupancy classification + windshield LED display
- ETA prediction (gradient boosting)
- Demand forecasting (Prophet)
- Route deviation + driving anomaly detection
- Operator-first alert verification workflow
- Boarding-assistant chatbot (LLM API)
- Commuter mobile app (map, ETA, chatbot)
- Operator dashboard (fleet, alerts, demand)

This project keeps the **same concept** for each, with a better implementation. Here's the
mapping:

| Original feature | This project's feature | What improved |
|---|---|---|
| 4-tier occupancy + LED | 4-tier occupancy (sim LED badge in UI) | Hysteresis (no flicker); honest sim label |
| ETA (gradient boosting) | ETA (deterministic formula) | Correct formula; no target leakage; tested |
| Demand (Prophet) | Demand (seeded historical mean) | Deterministic; honest `source` label |
| Route deviation + anomaly | Route deviation + anomaly alerts | Correct geofence math; dedup |
| Alert verification workflow | Alert verification (ack → verify → false-alarm) | Evidence snapshot; audited |
| Chatbot (LLM API) | Chatbot (grounded heuristic) | No hallucination; only real entities |
| Commuter app (map + ETA + chat) | Commuter PWA (map + ETA + chat + trip planner) | Clustering; smooth; responsive; dark mode |
| Operator dashboard | Operator console (fleet + alerts + CRUD) | Minimal but functional; real-time alerts |

---

## 2. Commuter app features (5-tab: Home / Map / Routes / Chat / Menu)

The commuter app has a **5-tab bottom navigation**: **Home, Map, Routes, Chat, Menu**. This is
an improvement over the original (which had no Home tab and no Menu tab — just Map, Routes,
Chat, Plan). The Home tab is a search-first discovery surface; the Menu tab centralizes
profile, preferences, and about. The Plan tab's trip-planning is now launched from the Home
tab's search results (tap a place → "Plan trip to here"). See
[`07-ui-ux-design.md §3`](./07-ui-ux-design.md#3-commuter-app-layout).

### C-00 — Home tab (search-first discovery) ★ NEW

**What it does:** A search-first landing screen. The commuter opens the app and immediately
can search for places, landmarks, shops, hotels, terminals — anything they want to go to.
Results show nearby routes + live vehicles. This is the "I know where I want to go, help me
get there" entry point.

**Variables/data it needs:**
- User's search query (text) — e.g., "SM City", "Colon", "Ayala", "hotel"
- `Place` table (warm cache) + Photon geocoder (external, cached) — for place results
- `Route` geometry (bounding-box) — for finding routes near the searched place
- `VehicleState` — for showing live vehicles on those routes

**How it works:**
1. Search bar at top (debounced 300ms) → `GET /api/v1/places?q=...`.
2. Results list: each place shows name, type (landmark/shop/hotel/terminal), distance from
   user (if geolocation available).
3. Tap a place → shows nearby routes (routes whose polyline passes within 500m) + live
   vehicles on those routes + a "Plan trip to here" button (jumps to Plan with the place
   pre-filled as destination).
4. Below the search: quick shortcuts — "Nearby stops", "Least crowded now" (jumps to Chat
   with that query), "My saved routes" (if any).

**How it's fetched:** `GET /api/v1/places` (Redis + `Place` table + Photon fallback). Then
`GET /api/v1/routes?near={lat,lon}` for nearby routes. Then `GET /api/v1/fleet?routeId=...`
for live vehicles.

**Fixes:** #3 (cached — two-layer place cache), #5 (clean UI — search-first home).

**Acceptance:**
- "SM City" → place result + nearby routes + live vehicles.
- "hotel" → multiple hotel places.
- Tap a place → nearby routes + "Plan trip" button works (jumps to Plan, pre-filled).
- Search is debounced; results cache for 5min.

---

### C-01 — Live fleet map with color-coded markers + theme switcher

**What it does:** A full-screen map showing all active PUVs as markers, color-coded by the
four-tier occupancy state, with direction arrows showing travel direction. The map supports
**5 user-selectable themes**. Markers update in real time.

**Variables/data it needs (from [`03-data-model.md`](./03-data-model.md)):**
- `VehicleState.lat`, `lon` — marker position
- `VehicleState.tier` — marker color (🟢🟡🔴🔴-blink)
- `VehicleState.direction` — marker direction arrow (▲ forward / ▼ backward) — see
  [`03-data-model.md §4.2`](./03-data-model.md#42-route-type-linear-vs-loop-and-vehicle-direction)
- `VehicleState.heading` — marker rotation (optional, for a rotated arrow)
- `VehicleState.speedKph` — popup detail
- `Vehicle.vehicleCode`, `Vehicle.vehicleType` — popup detail
- `Route.code`, `Route.name`, `Route.routeType` — popup detail + polyline rendering
- `RoutePoint` array — route polyline (when a route is selected)
- `VehicleState.lastTelemetryAt` — "last updated" + online status

**Map themes (user customizability):** 5 free tile providers, switchable via a layer-stack
button (bottom-right). See [`05-tech-stack.md §6`](./05-tech-stack.md#6-map):
- `osm-standard` (OSM standard street)
- `carto-light` (CartoDB clean light)
- `carto-dark` (CartoDB Dark Matter — auto-selected in dark mode)
- `cyclosm` (cycle-friendly)
- `esri-satellite` (satellite imagery)

The selected theme persists in localStorage. Auto-switches to `carto-dark` when the app is in
dark mode (unless the user has manually chosen a specific theme).

**4-tier occupancy legend** (bottom-left of the map): green (Available), amber (Filling), red
(At capacity), blinking-red (Overloaded). The original only had 3 tiers (Seats/Standing/Full)
— missing the critical "overloaded/illegal" tier. This project adds it.

**Route polylines:** when a commuter taps a route (from Routes tab or Home search), its
polyline renders on the map as a teal line with stop markers (small dots). The original had
no visible route lines — commuters couldn't see the path.

**How it's fetched:** `GET /api/v1/fleet` → Redis `fleet:PH:live` + `vehicle:{id}:state` (see
[`03-data-model.md §6.1`](./03-data-model.md#61-get-apiv1fleet-live-fleet-for-the-map)). Route
polylines from `GET /api/v1/routes/:id` (Redis-cached).

**Real-time:** socket.io `fleet:update` events update marker positions + direction in place
(no clear + re-add = no flicker).

**Fixes:** #4 (map rendering — clustering + smooth + themes + direction arrows + polylines),
#7 (real-time).

**Acceptance:**
- Map renders ~15 markers within 2s on a mid-range phone.
- Markers reflect the current tier with color + accessible text label + direction arrow.
- Markers update within 3s of a sim tick.
- Clustering works when zoomed out (no overlapping markers).
- No flicker on updates.
- Theme switcher offers 5 themes; selection persists; auto-switches in dark mode.
- 4-tier legend visible (green/amber/red/blink-red).
- Route polylines render when a route is selected, with stop dots.
- A vehicle on a `linear` route visibly turns around at the endpoint (direction arrow flips).

---

### C-02 — Stop-level ETA display

**What it does:** For a selected vehicle, show predicted arrival time at each upcoming stop on
its route.

**Variables/data it needs:**
- `VehicleState.lat`, `lon`, `speedKph` — current position + speed
- `RoutePoint.lat`, `lon`, `seq`, `isStop` — upcoming stops
- `traffic_factor` — derived from time-of-day (rush = 1.3, off-peak = 0.9)

**How it's calculated:** `eta_seconds = haversine_distance(current_pos, stop) /
(speed_mps × traffic_factor)`. See [`05-features §calc-eta`](#calc-01--eta-calculation).

**How it's fetched:** `GET /api/v1/eta/:vehicleId` → calculates per stop, caches each in Redis
`eta:{vehicleId}:{stopSeq}` (30s TTL).

**Fixes:** #2 (correct ETA — no target leakage, deterministic, tested).

**Acceptance:**
- A vehicle 1km from a stop at 30kph → ETA ~120s.
- ETA refreshes when the vehicle moves or every 30s.
- Values are deterministic within the cache window (no jitter between refreshes).
- If data is unavailable, shows "ETA unavailable" (no fake numbers).

---

### C-03 — Boarding-assistant chatbot (grounded heuristic)

**What it does:** A natural-language assistant answering "which jeepney is least crowded right
now?" and similar queries — grounded in live fleet data, referencing only real routes/vehicles.

**What the original did right:** The original's heuristic chatbot (`no_API_chatbot.py`) WAS
grounded — it did intent detection (least_crowded, avoid, boarding_followup, route_info),
extracted route codes via regex against the real route table, and composed responses
referencing real vehicles. The live response was fully grounded. (See
[`legacy-analysis/lessons-learned.md §1.5`](./legacy-analysis/lessons-learned.md#15-corrections-after-code-level-review-what-the-original-actually-did-right).)

**What this project improves:**
- **Consolidate** the original's 5 chatbot files (2 dead) into one `chatbot-service.ts`.
- **More intent types** (add "where is vehicle X", "how full is route Y", "when is next Z").
- **Better entity extraction** (route codes, vehicle codes, place names from the `Place` table).
- **If an LLM is ever added** (optional), use RAG with post-processing that rejects any
  response citing non-existent routes/vehicles — so the latent hallucination risk the
  original's dead LLM code had is structurally prevented.
- **PII redaction** before logging queries (the original stored raw queries).

**Variables/data it needs:**
- `VehicleState.tier`, `occupancy` — for finding least-crowded vehicles
- `Vehicle.vehicleCode`, `Route.code`, `Route.name`, `Route.tag` — for citing in the response
- `VehicleState.lat`, `lon` — for "where is it" queries
- The user's query (PII-redacted before logging to `ChatbotQuery`)

**How it works (the grounding guarantee):**
1. Parse the query: detect intent (`least_crowded`, `eta`, `how_full`, `where_is`, `avoid`)
   + entities (route codes, vehicle codes).
2. **Validate entities**: query the `Route` + `Vehicle` tables for any mentioned codes. If a
   code doesn't exist, respond "I don't have data for route/vehicle XYZ."
3. Query live fleet for the intent: e.g., for `least_crowded`, find vehicles with
   `tier = 'available'` ordered by `occupancy ASC`.
4. Compose a response referencing **only** real vehicle IDs + route codes from the query
   results. Never invent.
5. PII-redact the query, log to `ChatbotQuery` with detected intent + entities.

**How it's fetched:** `POST /api/v1/chatbot` → see
[`03-data-model.md §6.5`](./03-data-model.md#65-post-apiv1chatbot-grounded-chatbot).

**Fixes:** #1 (chatbot — consolidate 5 files into 1; prevent latent LLM hallucination risk;
add more intents; PII redaction). The original heuristic was already grounded — this project
keeps that and improves the surrounding engineering.

**Acceptance:**
- "least crowded now?" → response cites a real route code + vehicle ID.
- "when is next 04L?" → response uses the real 04L route + its live vehicles.
- "how full is route XYZ?" (nonexistent) → "I don't have data for route XYZ."
- No invented route codes or vehicle IDs, ever.
- Query is PII-redacted before storage.

---

### C-04 — Multi-leg trip planner

**What it does:** Given an origin and destination, suggest multi-leg journeys (walk → board →
alight → walk) with live occupancy and ETA for each leg.

**Variables/data it needs:**
- Origin/destination lat/lon (from place search or geolocation)
- `Route.geometry` (the `RoutePoint` array) — for matching origin/destination to nearby routes
- `VehicleState` — for live occupancy on each route
- `RoutePoint.isStop`, `stopName` — for boarding/alighting points

**How it works:**
1. Geocode origin + destination (Photon API, cached).
2. Find routes whose polyline passes within 500m of the origin (bounding-box check).
3. Find routes whose polyline passes within 500m of the destination.
4. For each (origin_route, destination_route) pair:
   - If same route: single-leg trip.
   - If different: find a transfer point where the two routes intersect (within 300m).
5. For each leg, compute: walk distance, board stop, ETA (live), live occupancy tier, alight
   stop.
6. Rank by total time; return top 3-5.

**How it's fetched:** `POST /api/v1/trip-suggestions` → see
[`03-data-model.md §5`](./03-data-model.md#5-how-data-is-fetched-query-patterns).

**Fixes:** #2 (correct trip calculations).

**Acceptance:**
- "Colon to Ayala" → ≥3 ranked suggestions.
- Each suggestion shows: total time, walking distance, legs with occupancy + ETA.
- "No route found" when origin/destination have no nearby routes.

---

### C-05 — Route directory + detail (with filtering)

**What it does:** A searchable, filterable list of routes; tapping a route shows its geometry
on a map + live vehicles + stops with ETAs.

**Variables/data it needs:**
- `Route.code`, `name`, `region`, `allowedVehicleTypes` — list display + filters
- `RoutePoint` array — geometry for the map
- `VehicleState` — live vehicles on the route
- `RoutePoint.isStop`, `stopName` — stop list

**Filters available:**
- **By region** (e.g., "Cebu City", "Mandaue")
- **By vehicle type** (e.g., "jeepney only", "bus only", "minibus") — uses
  `Route.allowedVehicleTypes`
- **Has live vehicles** (only routes with online vehicles right now)

**How it's fetched:** `GET /api/v1/routes?region=...&vehicleType=...&hasLive=true` (list,
paginated, Redis-cached); `GET /api/v1/routes/:id` (detail, Redis-cached polyline + stops).

**Acceptance:**
- Search filters by route code or name.
- Filter by region, vehicle type, has-live-vehicles.
- Route detail shows the polyline + live vehicles + stops.
- Stops list shows ETAs for the nearest live vehicle.

---

### C-06 — Place search (geocoding)

**What it does:** Search for places (landmarks, streets, shops, hotels, terminals) to use as
trip origin/destination or from the Home tab. Results are categorized by place type.

**How it works:** Proxies the Photon geocoder API. Results cached in **two layers**: Redis
(`places:{queryHash}`, 5min TTL, bounded LRU max 500) + the `Place` table (warm cache,
persistent across restarts). On a cache miss, calls Photon, caches in both.

**Variables/data it needs:**
- User's query (text)
- `Place` table (warm cache) — see [`03-data-model.md §3.13`](./03-data-model.md#313-place)
- Photon API (external)

**Fixes:** #3 (cached — two-layer cache, no repeated slow external calls).

**Acceptance:**
- "Colon" → returns Cebu places with type (landmark, street, etc.).
- "hotel" → returns hotel places.
- Debounced (300ms) on the client.
- Graceful degradation if Photon is down (falls back to `Place` table cache).
- Repeated searches hit the cache, not Photon.

---

### C-07 — Dark mode + responsive

**What it does:** System-following + manual dark mode; mobile-first responsive design.

**Variables/data:** UI preference (stored in a Zustand store + localStorage).

**Fixes:** #5 (design — dark mode + responsive).

**Acceptance:**
- `prefers-color-scheme` respected by default.
- Manual toggle (light / dark / system).
- Map tiles swap (OSM light → CartoDB dark).
- All pages work at sm (640), md (768), lg (1024), xl (1280).

---

### C-09 — Menu tab ★ NEW

**What it does:** The 5th bottom-nav tab. Centralizes profile, preferences, and about — the
things that don't belong on the other 4 tabs. The original had no menu tab; profile/settings
were scattered. This gives them a home.

**What's inside the Menu tab:**
- **Profile**: avatar/name, email (if auth), "Switch to operator view" (demo toggle).
- **Preferences**: theme toggle (light/dark/system), language (English only for now).
- **About**: what Re-LoadSense is, the "SIM" data explanation, link to the portfolio
  writeup, link to the concept docs.
- **Data & privacy**: "Download my data" + "Delete my account" (if auth); explanation of
  what data is collected (chatbot queries, PII-redacted).
- **Logout** (if auth).

**Variables/data it needs:** `User` (if auth), UI preferences (Zustand + localStorage).

**Fixes:** #5 (clean UI — centralized menu instead of scattered profile popups).

**Acceptance:**
- Menu tab is the 5th bottom-nav item.
- All profile/preference/about actions are reachable from here.
- Theme toggle works.
- "Switch to operator view" navigates to `/operator`.
- About page explains the SIM data honestly.

---

## 3. Operator console features

### O-01 — Fleet table (live)

**What it does:** A table of all vehicles owned by the operator, with live status.

**Variables/data it needs:**
- `Vehicle.vehicleCode`, `plateNo`, `capacity` — static columns
- `Route.code` — assigned route
- `VehicleState.tier`, `speedKph`, `lastTelemetryAt`, `online` — live columns

**How it's fetched:** `GET /api/v1/fleet?operatorId=...` (filtered by operator).

**Real-time:** socket.io updates the table rows in place.

**Acceptance:**
- Table shows all operator vehicles with live tier, speed, last-seen, online status.
- Filter by route, tier, status.
- Row click → vehicle drawer with details + recent telemetry.

---

### O-02 — Alert verification workflow

**What it does:** The structured ack → verify → false-alarm workflow on alerts.

**Variables/data it needs:**
- `OperatorAlert` — the alert (type, severity, status, evidence, raisedAt)
- `Vehicle.vehicleCode`, `Route.code` — context
- `OperatorFeedback` — audit trail of actions

**How it works:**
1. `GET /api/v1/alerts?status=open,acknowledged` — list of active alerts.
2. `POST /api/v1/alerts/:id/acknowledge` — sets `status = 'acknowledged'`, `acknowledgedAt`,
   `acknowledgedBy`. Creates an `OperatorFeedback` row.
3. `POST /api/v1/alerts/:id/verify` — sets `status = 'verified'`, `resolvedAt`, `resolvedBy`.
4. `POST /api/v1/alerts/:id/false-alarm` — sets `status = 'false_alarm'`, `resolvedAt`,
   `resolvedBy`.

**The evidence field:** Each alert's `evidence` JSON contains the telemetry snapshot that
triggered it (lat, lon, speed, tier, occupancy, timestamp). The operator sees this in the
alert detail modal — so they can judge whether it's a real incident.

**Real-time:** New alerts push via socket.io (`alerts:{operatorId}` room).

**Acceptance:**
- Alerts list shows open + acknowledged alerts.
- Each alert shows type, severity, vehicle, route, raised time, evidence.
- Ack/verify/false-alarm buttons update the status + create feedback rows.
- New alerts appear without refresh.

---

### O-03 — Vehicle CRUD (sequenced form)

**What it does:** Create, edit, deactivate vehicles — with a **sequenced form** that prevents
invalid route+type combinations.

**Variables/data it needs (the form fields, in sequence):**
- `Vehicle.routeId` — select (from `Route` list) — **required first; other fields unlock after**
- `Vehicle.vehicleType` — select (filtered to `Route.allowedVehicleTypes` of the selected
  route) — **unlocks after route is selected; only shows allowed types**
- `Vehicle.vehicleCode` — text, pattern `^[A-Z0-9-]+$`, unique — unlocks after type is selected
- `Vehicle.plateNo` — text, pattern `^[A-Z0-9]+$` — unlocks after type is selected
- `Vehicle.capacity` — number, ≥1, **default = typical capacity for the selected vehicle type**
  (jeepney=20, minibus=30, bus=50, uv_express=18) — editable
- `Vehicle.operatorId` — set to the current operator (hidden)
- `Vehicle.countryCode` — set to "PH" (hidden)

**The sequenced form UX (see [`07-ui-ux-design.md`](./07-ui-ux-design.md)):**
1. **Step 1 — Route** (only field visible): operator selects a route. The route's
   `allowedVehicleTypes` is loaded.
2. **Step 2 — Vehicle type** (unlocks): a dropdown showing ONLY the types in the selected
   route's `allowedVehicleTypes`. Selecting a type pre-fills the capacity default.
3. **Step 3 — Details** (unlock): vehicleCode, plateNo, capacity (pre-filled, editable).
4. **Submit**: validates `vehicleType ∈ route.allowedVehicleTypes` on the client (Zod) AND on
   the server (API). If the route was edited to remove the type between client render + server
   submit, the server returns 422 and the form re-renders with the updated allowed types.

**Why sequenced:** The original's form had all fields open at once. An operator could select a
route and a vehicle type that don't match (e.g., a bus on a jeepney-only route). The sequenced
form makes invalid combinations **impossible to submit**, not just invalid after submission.

**The constraint (see [`03-data-model.md §4`](./03-data-model.md#4-vehicle-types-and-the-route-vehicle-type-constraint)):**
A vehicle's `vehicleType` must be in its route's `allowedVehicleTypes`. Enforced at:
- Client (Zod schema + the sequenced form)
- Server (API validation before write)
- Seed data (respects the constraint)

**How it's fetched:** `POST/PUT/DELETE /api/v1/admin/vehicles`. The route list for Step 1 comes
from `GET /api/v1/routes`. The allowed types come from the selected route's
`allowedVehicleTypes` field.

**Acceptance:**
- Step 1 (route) is the only visible field initially; Steps 2-3 are disabled.
- After selecting a route, Step 2 shows only that route's allowed vehicle types.
- After selecting a type, Step 3 unlocks with capacity pre-filled.
- Submit validates the constraint on client + server.
- Edit vehicle: all fields editable except vehicleCode; changing the route re-filters the type
  dropdown (if the current type isn't allowed on the new route, it's cleared + a warning shows).
- Deactivate vehicle (soft delete — `status = 'inactive'`).
- Plate uniqueness enforced within operator.

---

### O-04 — Route list (read-only)

**What it does:** A simple list of routes with their live vehicle counts + allowed vehicle
types. (No add/edit — keep it minimal.)

**Variables/data it needs:**
- `Route.code`, `name`, `region` — list display
- Count of `Vehicle` per route — live vehicle count

**How it's fetched:** `GET /api/v1/routes` + a count query.

**Acceptance:**
- List shows all routes with code, name, region, live vehicle count.
- Tap → route detail (geometry + vehicles + stops).

---

## 4. Simulation features

### S-01 — Seeded synthetic fleet simulator

**What it does:** Generates realistic PUV telemetry for ~15 vehicles on ~6 Cebu routes, every
5 seconds (via Vercel Cron every minute, running 12 ticks).

**The CV/sim approach (honest):** The original's sin was a `webcam` mode that opened a camera
and ignored every pixel (`frame.mean() % 17`). This project takes a different approach: the
**counting algorithm is real, but the input is synthetic**. The simulator includes a real
bidirectional line-crossing counter algorithm (`src/lib/edge/line-counter.ts`) that takes
"detected person positions" and correctly increments board/alight counts by tracking centroid
velocity across a virtual line. In the demo, the "detected person positions" come from a
seeded synthetic generator (not a real camera/YOLO). So: **real counting logic + synthetic
detector output = honest simulation**. The counting algorithm is testable and correct; the
detection is synthetic and labeled. If you later pointed a real YOLO detector at it, the
counting logic would work unchanged.

**Variables it produces (written to `TelemetryLog` + `VehicleState` + Redis):**
- `vehicleId`, `deviceId` — which vehicle/device
- `timestamp` — event time
- `lat`, `lon` — interpolated position along the route polyline
- `speedKph` — derived from distance moved per tick
- `heading` — derived from direction of movement (0-360 degrees)
- `direction` — `forward` or `backward` (for `linear` routes); always `forward` for `loop`
  routes. See [`03-data-model.md §4.2`](./03-data-model.md#42-route-type-linear-vs-loop-and-vehicle-direction).
- `positionIndex` — index into the route polyline (advances or retreats based on direction)
- `occupancy` — time-of-day-biased random walk, bounded [0, capacity]
- `tier` — computed from occupancy % with hysteresis (S-02)
- `boarded`, `alighted` — from the real line-crossing counter algorithm (fed synthetic
  positions)
- `signalQuality` — always "good" in sim
- `source` — always `"simulator"` (honest label)
- `seq` — monotonic per device

**How it works:** Pure function `tick(state, dt, seed) => newState`. Seeded RNG for
reproducibility. See [`02-architecture.md §4`](./02-architecture.md#4-the-simulation-engine).
**Route type handling** (see [`03-data-model.md §4.2`](./03-data-model.md#42-route-type-linear-vs-loop-and-vehicle-direction)):
- `linear` routes: `positionIndex` advances forward; at the last point, `direction` flips to
  `backward` and `positionIndex` retreats; at point 0, `direction` flips back to `forward`.
  No teleporting — the vehicle visibly turns around.
- `loop` routes: `positionIndex` advances forward; at the last point, it wraps to 0.
  `direction` stays `forward` always.
- `heading` is computed from the bearing between the current and next polyline point (in the
  travel direction), so the map marker arrow points correctly.

**Fixes:** #6 (honest sim — real counting algorithm, synthetic input, clearly labeled; no
fake `frame.mean() % 17`); also fixes the original's teleporting-vehicle bug (vehicles jumped
from end to start via `points[sent % len]`).

**Acceptance:**
- Same seed → same fleet behavior (reproducible).
- Vehicles move smoothly along their routes.
- A vehicle on a `linear` route turns around at the endpoint (direction flips, no teleport).
- A vehicle on a `loop` route wraps from end to start.
- `heading` is correct (the marker arrow points the right way).
- Occupancy varies realistically with time-of-day.
- Tiers transition without flicker (hysteresis).
- Every telemetry event has `source: "simulator"`.
- The line-crossing counter algorithm passes unit tests with synthetic frame data (verifies
  the counting logic is correct, independent of where the positions come from).

---

### S-02 — Four-tier occupancy classification with hysteresis

**What it does:** Maps a raw occupancy count to one of four tiers, with hysteresis to prevent
flicker.

**Variables/data it needs:**
- `Vehicle.capacity` — max passengers (for percentage)
- `VehicleState.occupancy` — current count
- `VehicleState.tier` — previous tier (for hysteresis)
- Time held in new tier (for the 10s hysteresis window)

**Tier boundaries (configurable per route, default):**
- `available`: 0% – 60%
- `filling`: 60% – 90%
- `at_capacity`: 90% – 100%
- `overloaded`: > 100%

**Hysteresis:** A tier change must hold for ≥10 seconds before it takes effect. This prevents
the flicker the original had (a vehicle at 89-91% occupancy would flicker between `filling`
and `at_capacity` every tick).

**Fixes:** #2 (correct occupancy — no flicker).

**Acceptance:**
- A vehicle at 50% → `available`.
- A vehicle at 95% → `at_capacity`.
- A vehicle at 105% → `overloaded`.
- A vehicle oscillating around 90% → steady tier (no flicker).

---

### S-03 — Alert generation

**What it does:** Evaluates alert conditions on each telemetry tick and raises alerts.

**Alert types + conditions:**
| Type | Condition | Severity |
|---|---|---|
| `overload` | `tier = 'overloaded'` held > 10s | high |
| `route_deviation` | vehicle > 200m from route polyline (bounding-box check) | medium |
| `speed_anomaly` | `speedKph > 80` | medium |
| `signal_loss` | no telemetry from vehicle for > 5 min | low |

**Dedup:** Before raising, check for an existing `open` or `acknowledged` alert with the same
`(vehicleId, type)`. If exists, don't raise a duplicate.

**Evidence:** The telemetry snapshot at the moment of alert is frozen as the `evidence` JSON.

**Acceptance:**
- A simulated overloaded vehicle → an `overload` alert appears.
- A vehicle > 200m from its route → a `route_deviation` alert.
- A vehicle > 80kph → a `speed_anomaly` alert.
- No duplicate alerts for the same vehicle + type while one is open.

---

## 5. Calculation features

These are the "calculations were wrong" fixes. Each is a pure, tested function.

### Calc-01 — ETA calculation (direction-aware)

**Formula:** `eta_seconds = haversine_distance(current_pos, stop) / (speed_mps × traffic_factor)`

**Variables:**
- `current_pos` = `{lat, lon}` from `VehicleState`
- `stop` = `{lat, lon}` from `RoutePoint` where `isStop = true`
- `speed_mps` = `VehicleState.speedKph / 3.6`
- `traffic_factor` = derived from time-of-day:
  - Rush hours (7-9am, 5-7pm): 1.3 (slower)
  - Off-peak: 0.9 (faster)
  - Default: 1.0
- `VehicleState.direction` = `forward` or `backward` (determines stop ordering)

**Direction-aware stop ordering:** The "remaining stops" for a vehicle depend on its
direction. A forward-traveling vehicle's next stops are the stops with `seq` greater than its
current `positionIndex`, in ascending order. A backward-traveling vehicle's next stops are
those with `seq` less than its `positionIndex`, in **descending** order. For `loop` routes
(always forward), stops wrap around. See
[`03-data-model.md §4.2`](./03-data-model.md#42-route-type-linear-vs-loop-and-vehicle-direction).

**Haversine distance:** Standard formula for distance between two lat/lon points on Earth.

**Fixes:** #2 (correct ETA — no target leakage, deterministic, tested).

**Location:** `src/lib/ml/eta.ts` + `src/lib/geo/haversine.ts`.

**Test:** A vehicle 1km from a stop at 30kph, off-peak → `1000 / ((30/3.6) × 0.9) ≈ 133s`.

---

### Calc-02 — Demand forecast

**Formula:** `forecast[hour] = seeded_historical_mean[routeId][hour]`

**How it works:**
1. At seed time, generate a deterministic "historical mean" per route × hour using a seeded
   RNG. Store in a JSON file or a `DemandForecast` table.
2. At runtime, `forecastDemand(routeId, hour)` looks up the precomputed value.
3. Cache in Redis `demand:{routeId}:{hour}` (1h TTL) for determinism.
4. Return `{"source": "historical_mean", "values": [...]}` — honest label.

**Fixes:** #2 (correct demand — deterministic, not random; honest label).

**Location:** `src/lib/ml/demand.ts`.

**Test:** Same `routeId + hour` → same forecast, every time.

---

### Calc-03 — Occupancy tier classification

See [S-02 above](#s-02--four-tier-occupancy-classification-with-hysteresis).

---

### Calc-04 — Route deviation (geofence)

**What it does:** Checks if a vehicle is within 200m of its assigned route polyline.

**How it works (no PostGIS — Vercel Postgres free tier doesn't have it):**
1. Load the route's polyline (Redis-cached).
2. For each segment in the polyline, compute the perpendicular distance from the vehicle's
   position to the segment (using the cross-track distance formula).
3. If the minimum distance > 200m, the vehicle has deviated.

**Why bounding-box + haversine, not PostGIS `ST_DWithin`:** Vercel Postgres free tier
doesn't include PostGIS. The TS math is slightly less precise but fine for a demo. (Production
would use PostGIS.)

**Fixes:** #2 (correct deviation detection).

**Location:** `src/lib/geo/bbox.ts` + `src/lib/services/alert-service.ts`.

---

## 6. Real-time features

### RT-01 — socket.io live fleet updates

**What it does:** Pushes vehicle position + tier updates to connected commuter maps in real
time.

**Variables/data:**
- `VehicleState` changes (position, tier, occupancy)
- Client's visible bounding box (for filtering)

**How it works:** See [`02-architecture.md §5`](./02-architecture.md#5-real-time-update-flow).

**Fixes:** #7 (real-time — no 15s polling jumps).

**Acceptance:**
- A sim tick → connected client's markers move within 3s.
- Client subscribes to its visible bbox; only relevant updates are pushed.
- Auto-reconnect with backoff on disconnect.

---

### RT-02 — socket.io live alert updates (operator)

**What it does:** Pushes new alerts to the operator console in real time.

**Acceptance:**
- A new alert → operator console shows it without refresh.
- Alert status changes (ack/verify) propagate to all operator clients.

---

## 7. Cross-cutting features

### X-01 — Honest simulation labeling

**What it does:** Every piece of simulated data is visibly labeled as simulated.

**Where the labels live:**
- `TelemetryLog.source = "simulator"` — in the data
- A "SIM" badge in the header of all 3 apps
- A "SIM" reminder at the top of the chatbot
- A "SIM" note in the vehicle detail sheet

**Fixes:** #6 (honest — no fake CV, clearly labeled).

---

### X-02 — Dark mode + design system

**What it does:** Tailwind 4 + shadcn/ui with a full token scale; dark mode via `next-themes`.

**Tier colors (the semantic palette):**
- Available: green `#16a34a`
- Filling: amber `#eab308`
- At capacity: red `#dc2626`
- Overloaded: blinking red

**Brand colors (NOT indigo/blue per project rules):** teal `#0d9488` primary, slate for
backgrounds/text.

**Fixes:** #5 (design — cohesive system, dark mode, no hardcoded hex).

---

### X-03 — Health + readiness endpoints

**What it does:** `GET /api/health` (liveness) + `GET /api/ready` (readiness, checks DB + KV).

**Acceptance:**
- `/health` returns 200 in < 50ms.
- `/ready` returns 200 when DB + KV are up; 503 when either is down.

---

## 8. Inter-feature logic consistency audit

The previous project failed here — features were specified in isolation without checking how
they interact. This section audits every feature interaction for logical consistency. If a
feature's behavior depends on another feature's state, that dependency is explicit here, and
the edge cases are resolved.

### 8.1 Route ↔ Vehicle (the type constraint)

**Interaction:** A vehicle is assigned to a route. The vehicle's `vehicleType` must be in the
route's `allowedVehicleTypes`.

| Scenario | Resolution |
|---|---|
| Add a vehicle to a route | Form is sequenced — route first, then type (filtered to allowed). API validates. ✓ |
| Edit a vehicle's route to a new route that doesn't allow its type | Type dropdown clears + warning. Operator must select a valid type before saving. ✓ |
| Edit a route's `allowedVehicleTypes` to remove a type that 3 vehicles use | API returns 409: "Cannot remove type 'jeepney' — 3 vehicles use it. Reassign first." ✓ |
| Deactivate a route | Vehicles on that route keep their `routeId` but the route shows `status: inactive`. The fleet API filters out vehicles on inactive routes (or shows them greyed out). Operator must reassign them. ✓ |
| Delete a route (hard delete) | **Not allowed** in this project — only deactivate. Prevents orphaned vehicles. ✓ |

### 8.2 Vehicle ↔ Device (one-to-one)

**Interaction:** A vehicle has at most one active device (`Device.vehicleId` is unique). A
device produces telemetry for its bound vehicle.

| Scenario | Resolution |
|---|---|
| Bind a device to a vehicle that already has a device | API returns 409: "Vehicle already has a device. Unbind the old one first." ✓ |
| Revoke a device | `Device.status = 'revoked'`. Future telemetry from it → 401. The vehicle's `VehicleState.online` becomes false after 5 min (no telemetry). An alert (`signal_loss`) may fire. ✓ |
| Unbind a device | `Device.vehicleId = null`. The vehicle has no device → no new telemetry. `VehicleState.online` becomes false after 5 min. ✓ |
| Deactivate a vehicle | Its device stays bound but telemetry ingest checks `Vehicle.status` — if inactive, telemetry is rejected (409). The device should be unbound first. ✓ |

### 8.3 Vehicle ↔ TelemetryLog ↔ VehicleState

**Interaction:** Every telemetry event appends to `TelemetryLog` (history) and upserts
`VehicleState` (latest). The simulator produces telemetry; the ingest route writes both.

| Scenario | Resolution |
|---|---|
| Telemetry arrives for a vehicle that doesn't exist | 404 (device auth maps to a vehicle; if the vehicle was deleted, reject). ✓ |
| Telemetry arrives with a `seq` ≤ the last seen | Dedup — reject with 409 (duplicate). ✓ |
| Telemetry arrives for an inactive vehicle | 409 (vehicle not active). ✓ |
| `VehicleState.online` calculation | `online = true` if `lastTelemetryAt` within 5 min. The sim-tick cron updates this; a separate check (or the cron) marks stale vehicles offline. ✓ |
| A vehicle goes offline (no telemetry for 5 min) | `VehicleState.online = false`. The map hides it (or shows it greyed). A `signal_loss` alert fires if it was previously online. ✓ |

### 8.4 Telemetry ↔ Alert generation

**Interaction:** On each telemetry upsert, the alert service evaluates conditions. Alerts must
dedup against open alerts.

| Scenario | Resolution |
|---|---|
| Vehicle is overloaded for 15s | `overload` alert fires (condition: tier=overloaded > 10s). ✓ |
| Vehicle is overloaded for 5s then drops to at_capacity | No alert (didn't hold 10s). ✓ |
| Open `overload` alert exists; vehicle is still overloaded next tick | No new alert (dedup: same vehicle+type, status open/acknowledged). ✓ |
| Open `overload` alert; operator verifies it; vehicle still overloaded next tick | No new alert (status=verified is still "resolved" — no duplicate until the vehicle drops below overloaded AND rises again). ✓ Edge case: if the vehicle drops to at_capacity then back to overloaded, a NEW alert fires (the cycle reset). ✓ |
| Route deviation alert fires; vehicle returns to route | The alert stays open until the operator resolves it (verify/false-alarm). The system doesn't auto-resolve — operator-first. ✓ |
| Vehicle is deactivated while it has open alerts | Alerts stay open. Operator should resolve them (false-alarm or verify) before deactivation. The UI shows a warning: "This vehicle has N open alerts." ✓ |

### 8.5 Alert ↔ OperatorFeedback (verification workflow)

**Interaction:** Each ack/verify/false-alarm creates an `OperatorFeedback` row and updates the
alert's status.

| Scenario | Resolution |
|---|---|
| Acknowledge an already-acknowledged alert | 409 (already acknowledged). ✓ |
| Verify an alert that's not acknowledged yet | Auto-acknowledge first, then verify (or 409 requiring ack first — decide in build; recommend auto-ack for speed). ✓ |
| False-alarm a verified alert | 409 (already resolved). ✓ |
| Two operators act on the same alert simultaneously | Last-write-wins (the status + feedback reflect whoever acted last). Both feedback rows are logged (audit). ✓ |

### 8.6 Chatbot ↔ Fleet data (grounding)

**Interaction:** The chatbot queries live fleet data and composes responses. It must never
reference a route or vehicle that doesn't exist.

| Scenario | Resolution |
|---|---|
| "least crowded now?" but no vehicles are online | "No vehicles are currently online. Try again later." (honest, no hallucination). ✓ |
| "when is next 04L?" but route 04L doesn't exist | "I don't have data for route 04L." (honest). ✓ |
| "when is next 04L?" but 04L has no live vehicles | "Route 04L has no active vehicles right now." (honest). ✓ |
| "how full is PH-MJ01?" but PH-MJ01 is offline | "Vehicle PH-MJ01 is currently offline." (honest). ✓ |
| The LLM (optional) generates a response citing route "XYZ" that doesn't exist | Post-processing rejects the response; falls back to the heuristic. The heuristic only uses validated entities. ✓ |

### 8.7 ETA ↔ Route stops

**Interaction:** ETA is calculated to stops (`RoutePoint` where `isStop = true`). A route
with no stops can't have ETA.

| Scenario | Resolution |
|---|---|
| Route has 0 stops (only polyline points) | ETA API returns "No stops defined for this route." The UI shows "ETA unavailable." ✓ |
| Vehicle is past the last stop | ETA to remaining stops = empty array. UI shows "At final stop." ✓ |
| Vehicle's current position is not on the route polyline (deviation) | ETA uses the vehicle's actual position (haversine to stops), not a snapped position. The deviation alert fires separately. ✓ |

### 8.8 Trip planner ↔ Route geometry

**Interaction:** Trip planning matches origin/destination to nearby routes via bounding-box
checks on route polylines.

| Scenario | Resolution |
|---|---|
| Origin has no routes within 500m | "No routes found near your origin. Try a different starting point." ✓ |
| Destination has no routes within 500m | "No routes found near your destination." ✓ |
| Origin and destination are on the same route | Single-leg trip (walk → board → alight → walk). ✓ |
| Origin and destination are on different routes with no transfer point | "No single-transfer trip found. You may need multiple transfers." ✓ |
| A route in the result has no live vehicles | The leg shows "No live vehicles — check schedule." The trip is still suggested (the route exists, just no live data). ✓ |

### 8.9 Home search ↔ Places ↔ Routes

**Interaction:** Home tab searches places (Photon + cache), then finds nearby routes.

| Scenario | Resolution |
|---|---|
| Search returns a place but no routes are within 500m | "No routes near this place. It may be outside the service area." ✓ |
| Search returns no places | "No results found. Try a different search." ✓ |
| Photon is down | Fall back to the `Place` table (warm cache). If the query was never cached, "Search unavailable. Please try again later." ✓ |
| User taps "Plan trip to here" from a Home search result | Jumps to the Plan tab with the place pre-filled as the destination. The origin is empty (or the user's geolocation if available). ✓ |

### 8.10 Simulator ↔ Everything (the demo's heartbeat)

**Interaction:** The Vercel Cron sim-tick advances the fleet every minute. Every downstream
feature depends on this.

| Scenario | Resolution |
|---|---|
| Cron doesn't fire (Vercel issue) | Vehicles go stale → `online = false` after 5 min → map shows them offline → `signal_loss` alerts. The demo "freezes" but doesn't break. The operator console shows all vehicles offline. ✓ |
| Cron fires but DB write fails | Telemetry is lost for that tick. The sim state in Redis is the source of truth for the next tick (it advances regardless). On DB recovery, new ticks write normally (the gap is visible in `TelemetryLog` but the sim continues). ✓ |
| Two cron invocations overlap (rare, but possible) | The `seq` dedup prevents double-writes. The second invocation's ticks are rejected if their `seq` ≤ the last seen. ✓ |

### 8.11 Summary: no orphaned dependencies

Every feature's dependencies on other features are explicit (above). No feature assumes data
that another feature doesn't produce. No feature produces data that nothing consumes. The
interactions are consistent — which is what the previous project failed to verify.

---

## 9. Feature → problem → data traceability

| Feature | Fixes problem | Data tables touched |
|---|---|---|
| C-00 Home tab (search) | #3 (cached), #5 (UI) | `Place`, `Route`, `RoutePoint`, `VehicleState` + Redis |
| C-01 Live map | #4 (map), #7 (real-time) | `Vehicle`, `VehicleState`, `Route` + Redis |
| C-02 ETA | #2 (calcs) | `VehicleState`, `RoutePoint` + Redis |
| C-03 Chatbot | #1 (hallucination) | `Vehicle`, `VehicleState`, `Route`, `ChatbotQuery` |
| C-04 Trip planner | #2 (calcs) | `Route`, `RoutePoint`, `VehicleState` |
| C-05 Route directory (filtering) | — | `Route`, `RoutePoint`, `VehicleState` + Redis |
| C-06 Place search (cached) | #3 (cached) | `Place` + (external Photon) + Redis |
| C-07 Dark mode + responsive | #5 (design) | (UI only) |
| C-09 Menu tab | #5 (design) | `User` (if auth) |
| O-01 Fleet table | #7 (real-time) | `Vehicle`, `VehicleState`, `Route` |
| O-02 Alert verification | — | `OperatorAlert`, `OperatorFeedback`, `User` |
| O-03 Vehicle CRUD (sequenced) | — | `Vehicle`, `Route`, `Operator` |
| O-04 Route list | — | `Route`, `Vehicle` |
| S-01 Simulator | #6 (honest sim) | `Vehicle`, `Device`, `TelemetryLog`, `VehicleState` + Redis |
| S-02 Occupancy tier | #2 (calcs — no flicker) | `VehicleState` |
| S-03 Alert generation | #2 (correct alerts) | `OperatorAlert`, `VehicleState` |
| Calc-01 ETA | #2 (calcs) | `VehicleState`, `RoutePoint` |
| Calc-02 Demand | #2 (calcs) | (precomputed) + Redis |
| Calc-04 Route deviation | #2 (calcs) | `RoutePoint`, `VehicleState` |
| RT-01 Live fleet updates | #7 (real-time) | `VehicleState` + Redis pub/sub |
| RT-02 Live alert updates | #7 (real-time) | `OperatorAlert` + Redis pub/sub |
| X-01 Honest labeling | #6 (honest) | `TelemetryLog.source` |
| X-02 Design system | #5 (design) | (UI only) |

Every feature traces to a problem it fixes and to the data tables it touches. This is the
traceability that makes the planning a contract: if a feature is built, you can verify it
against the data model; if a table changes, you can see which features are affected.

---

## Next

- [`05-tech-stack.md`](./05-tech-stack.md) — the exact build setup
- [`06-project-structure.md`](./06-project-structure.md) — where each feature lives in the codebase
- [`07-ui-ux-design.md`](./07-ui-ux-design.md) — where each feature lives in the UI
