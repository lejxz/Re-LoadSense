# 01 — Lessons Learned: Forensic Audit of the Original LoadSense

> This document is a candid, evidence-based audit of the original
> [LoadSense](https://github.com/lejxz/LoadSense) repository. It catalogues what the
> prototype did well and — more importantly — every structural weakness that a production
> rebuild must avoid. Every finding below is backed by a file path and line reference in the
> original repo so it can be independently verified.

---

## Table of contents

1. [What the original got right](#1-what-the-original-got-right)
2. [Backend failures](#2-backend-failures)
3. [Frontend failures](#3-frontend-failures)
4. [Edge-layer integrity failures](#4-edge-layer-integrity-failures)
5. [ML / MLOps failures](#5-ml--mlops-failures)
6. [Documentation drift](#6-documentation-drift)
7. [Testing failures](#7-testing-failures)
8. [Security & privacy failures](#8-security--privacy-failures)
9. [Operability & DevOps failures](#9-operability--devops-failures)
10. [Consolidated mistake → remediation matrix](#10-consolidated-mistake--remediation-matrix)

---

## 1. What the original got right

Before cataloguing failures, it is only fair to acknowledge the original's genuine strengths.
A 48-hour hackathon that shipped a working end-to-end demo — synthetic fleet simulator, live
map, operator console, alert workflow, and a chatbot — is a real achievement. Specifically:

- **Problem framing was excellent.** The "how full is the next jeepney?" gap is real,
  underserved, and aligns cleanly with UN SDG 9 and SDG 11. The dual-layer (edge + cloud)
  mental model is the correct architecture for this problem class.
- **The four-tier occupancy taxonomy** (🟢 available / 🟡 filling / 🔴 at capacity / 🔴-blink
  overloaded) is intuitive, actionable, and maps cleanly to both a windshield LED and a map
  marker. This design choice survives into Re-LoadSense unchanged.
- **Operator-first alert verification** (ack → verify → false-alarm / escalate) is a
  thoughtful safety pattern that avoids black-box auto-escalation. It reflects genuine
  domain understanding of transit operations.
- **ASEAN expansion intent** — seeding route data for PH / ID / MY / TH / VN and planning a
  GTFS import path — showed the right ambition, even though the execution was uneven.
- **Contract-faithful simulation as a demo strategy** is, in principle, the right call for a
  hackathon: produce the same data shape a real deployment would emit, so downstream code is
  real even if the upstream is faked. (The execution of this principle was flawed — see
  §4 — but the principle is sound and Re-LoadSense retains it, honestly labeled.)
- **Config-driven thresholds** — occupancy tiers, geofence radius, and capacity defaults
  live in `config/project_config.json` rather than being hardcoded. This is good practice
  and Re-LoadSense generalizes it into a full typed configuration system.
- **Parameterized SQL** — `sqlite_store.py` uses parameterized queries throughout. No SQL
  injection vectors. This is a non-trivial discipline that many hackathon projects skip.

These strengths are preserved in Re-LoadSense. Everything below is what must change.

---

## 1.5. Corrections after code-level review (what the original actually did right)

After cloning and running the original repo, reading the actual implementation code, and
testing the live demo endpoints, several of my initial critiques were **wrong**. This section
corrects the record so the new planning doesn't repeat a misunderstanding.

### The original DID have incremental marker updates (no vehicle flicker)

**Initial critique (wrong):** "The map cleared all layers + re-added them on every refresh —
causing visible flicker every 15 seconds."

**Actual code (`app/js/map.js:170-225`):** Vehicle markers were updated **in place** via
`existing.marker.setLatLng([lat, lon])`. Only the icon was updated (`setIcon`) when the tier
changed. The `layerGroup.clearLayers()` call was only for **route polylines**, not vehicle
markers. There was **no vehicle flicker** — the map was smooth for vehicles.

**What was actually rough:** The route polylines WERE cleared + re-drawn on every refresh
(line 73: `layerGroup.clearLayers()`), which caused the route lines to flicker. And the
3-second polling interval (not 15s as I initially said) was the cadence.

**Corrected improvement in Re-LoadSense:** Keep the in-place vehicle updates (they were
correct). Fix the route polyline flicker by only redrawing polylines when the route selection
changes, not on every fleet refresh.

### The original DID render route polylines (3-layer blue)

**Initial critique (wrong):** "The original had no visible route lines — commuters couldn't
see the path."

**Actual code (`app/js/map.js:81-95`):** Routes were rendered as a **3-layer polyline** — a
white shadow (weight 12), a blue middle (weight 8, `#0b57d0`), and a light-blue top (weight 3,
`#58a6ff`). Route points had markers with popups. The route lines were visible and styled.

**What was actually rough:** The route color was **blue/indigo** (`#0b57d0`), which violates
the "no indigo/blue" project rule. And the polylines flickered on every refresh (see above).

**Corrected improvement in Re-LoadSense:** Keep the 3-layer polyline effect (it looked good)
but change the color to **teal** (the brand color). Fix the flicker by only redrawing on
route selection change.

### The original markers were jeepney SVG icons (not plain circles)

**Initial critique (incomplete):** I planned "colored circle with route code inside."

**Actual code (`app/js/map.js:186-208`):** Markers were custom `divIcon` with an **SVG jeepney
icon** (a detailed vehicle shape with windows + wheels) colored by tier. The SVG path was
`M6 3h12a3 3 0 0 1 3 3v9...` — a real vehicle silhouette. This was more detailed than plain
circles.

**Corrected improvement in Re-LoadSense:** Keep the jeepney SVG icon style (it was good), add
a **direction arrow** overlay (▲/▼) which the original lacked, and vary the icon by vehicle
type (jeepney vs bus vs minibus silhouette).

### The chatbot heuristic WAS grounded (the LLM path was the issue, not hallucination)

**Initial critique (misframed):** "Chatbot hallucinated route codes."

**Actual code (`backend/app/core/no_API_chatbot.py`):** The heuristic chatbot (the one that
actually runs) was **sophisticated and grounded**: intent detection (least_crowded, avoid,
boarding_followup, route_info, greeting), route code extraction via regex against the real
route table, tier penalties, avoidance reasons. It only referenced real routes/vehicles. The
live response was: *"Least crowded option for the live fleet: V-ID-01-6 on Route ID-01. It has
6/60 riders (54 seats available), green, ETA 6.8 min."* — fully grounded, no hallucination.

**What was actually rough:** The **LLM path** (`chatbot.py` Gemini, `ollama_chatbot.py`
Ollama) was dead code that COULD hallucinate if wired up — but it was never imported. The
`state.py:FleetStore.recommendation()` explicitly bypassed the LLM and called the grounded
heuristic. So the "hallucination" risk was latent, not actual.

**Corrected improvement in Re-LoadSense:** Keep the grounded heuristic approach (it was
correct). The improvement is: (a) consolidate the 5 chatbot files into one, (b) if an LLM is
ever added, use RAG with post-processing to reject ungrounded responses, (c) add more intent
types + better entity extraction.

### The original DID have vehicle_type, brand, model, year, driver, registration

**Initial critique (wrong):** "The original had no concept of vehicle type — every vehicle was
implicitly a jeepney."

**Actual code (`tools/populate_demo_data.py:224-234`):** Vehicles had `vehicle_type` (PUJ/BUS),
`brand` (Isuzu/Volvo), `model` (Jeepney/Bus), `year`, `driver`, `plate_number`,
`registration_number`, `max_occupancy`. The data was rich.

**What was actually rough:** The original's `vehicle_type` values were `PUJ`/`BUS` (short
codes) without a constraint linking them to routes. There was no `allowedVehicleTypes` on
routes — any vehicle could be on any route.

**Corrected improvement in Re-LoadSense:** Keep the rich vehicle fields (brand, model, year,
driver, registration — they add operator-console realism). Add the `allowedVehicleTypes`
constraint (§4) which the original lacked. Use clearer type names (`jeepney`/`bus`/`minibus`/
`uv_express` instead of `PUJ`/`BUS`).

### The original DID have route_type, origin_name, destination_name, tag

**Initial critique (wrong):** I omitted these fields from my data model.

**Actual code (`tools/populate_demo_data.py:59-78`):** Routes had `type` (PUJ/BUS/TRAIN),
`origin`/`dest` (coordinates), `tag` (short code like "NAGA-IT", "CIBUS", "MYBUS"), and the
name included origin/destination (e.g., "04L Lahug - SM City"). 40+ real Cebu routes were
defined with real coordinates.

**Corrected improvement in Re-LoadSense:** Adopt these fields (`tag`, `originName`,
`destinationName`) — they're valuable for search + chatbot matching + display. Use the
original's real Cebu route data as the seed source. Add `routeType` (linear/loop) which the
original lacked (it used `progress % 1.0` teleporting instead of turn-around logic).

### The original simulator used a sine wave (not random walk) for occupancy

**Initial critique (wrong):** "Occupancy is a time-of-day-biased random walk."

**Actual code (`demo_simulator.py:55-57`):** Occupancy was a **deterministic sine wave**:
`wave = math.sin((tick + route_index*3 + vehicle_index*5) / 7)`;
`occupancy = max(0, min(max_occ, int(max_occ * 0.4 + wave * max_occ * 0.3)))`. Not random —
fully deterministic. My "random walk" description was wrong.

**What was actually rough:** The sine wave oscillated between ~10% and ~70% — it never reached
"at capacity" or "overloaded," so the red/blink-red tiers were rarely demonstrated. And the
`progress % 1.0` teleporting (vehicles jumping from end to start) was the real simulator bug.

**Corrected improvement in Re-LoadSense:** Use a time-of-day-biased pattern that CAN reach all
4 tiers (including overloaded during rush hour) so the full tier range is demonstrated. Fix
the teleporting with linear/loop route type handling (§4.2).

### Summary of corrections

| Initial critique | Verdict | Corrected understanding |
|---|---|---|
| Vehicle markers flickered | ❌ Wrong | Markers updated in place; only route polylines flickered |
| No visible route lines | ❌ Wrong | 3-layer blue polylines existed; color was blue (rule violation) |
| Markers were plain circles | ❌ Incomplete | They were jeepney SVG icons (more detailed) |
| Chatbot hallucinated | ❌ Misframed | Heuristic was grounded; LLM path was dead code |
| No vehicle type concept | ❌ Wrong | Had PUJ/BUS + brand/model/year/driver; lacked route constraint |
| Occupancy was random walk | ❌ Wrong | It was a deterministic sine wave |
| Vehicles teleported | ✅ Correct | `progress % 1.0` did teleport — fixed with linear/loop route types |
| Fake CV (webcam ignored pixels) | ✅ Correct | `frame.mean() % 17` was fake — fixed with honest sim |
| 5-file SQLite fan-out | ✅ Correct | N+5 queries — fixed with single Postgres |
| Dead chatbot code (2 of 5 files) | ✅ Correct | chatbot.py + ollama_chatbot.py never imported |
| No real-time WS | ✅ Correct | Frontend polled every 3s — fixed with socket.io |

The new planning (`03-data-model.md`, `04-features.md`, `07-ui-ux-design.md`) incorporates
these corrections: it keeps what the original did right (in-place updates, SVG markers, 3-layer
polylines, grounded chatbot, rich vehicle/route fields) and fixes what it did wrong
(teleporting, fake CV, fan-out, dead code, blue route color, no type constraint).

---

## 2. Backend failures

The backend (`backend/app/`) is a FastAPI app with ~740 lines of route handlers, a 1,208-line
SQLite store, a 1,860-line god-module (`transit.py`), and five — *five* — chatbot files, two
of which are dead code.

### 2.1 Five chatbot files, three of them dead

The repo contains `chatbot.py` (Gemini), `no_API_chatbot.py` (heuristic), `ollama_chatbot.py`
(Ollama), plus `phase2.py` and `compat.py` tangled into the same concern. Grep confirms that
**`chatbot.py` and `ollama_chatbot.py` are never imported by the running application**. The
live code path (`state.py:FleetStore.recommendation()`) explicitly bypasses the LLM paths and
calls only `get_no_api_recommendation()`.

Yet `requirements.txt` still ships `google-genai>=0.3.0` as a hard dependency, and the README
advertises the Gemini chatbot as a feature. The Gemini file also contains a live bug
(`chatbot.py:69`) papered over with a comment that literally says *"wait, should be
destination string"* — a developer's mid-fix note shipped to production.

**Remediation:** One chatbot module with a strategy interface. Provider selection is a config
or feature-flag decision, not five copy-pasted files. Dead code is deleted, not archived.

### 2.2 Zero authentication or authorization

No endpoint has any auth. Anyone who can reach the API can:

- `POST /api/database/reset` — wipe everything (then auto-seeded with fake drivers).
- `POST /api/alerts/reset`, `POST /api/demand/reset` — wipe alerts / demand artifacts.
- `DELETE /api/routes/{route}`, `DELETE /api/vehicles/{vehicle_id}` — silent deletion.
- `POST /api/vehicles`, `POST /api/routes`, `POST /api/alerts` — inject arbitrary data.
- Connect to `WS /ws/telemetry` and inject fake vehicle telemetry.
- `POST /api/chatbot` — potentially expensive NLP/LLM calls.

There are no API keys, no JWT, no OAuth, no role separation between commuters, operators, and
admins. The static frontend is served from the same origin, so CSRF is also a concern for
every state-changing endpoint.

**Remediation:** Re-LoadSense ships auth in the first vertical slice. JWT access tokens +
refresh tokens, role-based access control (commuter / operator / admin / edge-device), per-
device credentials for edge telemetry, and CSRF protection on cookie-authenticated mutations.

### 2.3 SQLite as the sole data store, with per-country fan-out

The persistence layer is raw `sqlite3` (stdlib), no ORM, no async driver. Worse, it maintains
**five separate SQLite files** — one per country (PH, TH, VN, MY, ID) — and almost every read
operation iterates all five:

- `list_vehicles()`, `list_incidents()`, `load_alerts()`, `load_vehicle_states()`,
  `has_open_alert()`, `has_recent_vehicle_alert()`, `country_for_route()`, `route_exists()`,
  `delete_vehicle()`, `load_route_polyline()`, `database_status()` all do
  `for code in COUNTRY_CODES: ... query ...` then merge in Python.
- `country_for_route()` is called on **every telemetry write** (`save_vehicle_state`), every
  alert save, every chat save — that's 5 `SELECT`s per write.
- `has_open_alert()` and `has_recent_vehicle_alert()` iterate all 5 DBs per alert check, and
  these are called on **every** telemetry upsert (`state.py:196, 231`).
- `database_status()` runs ~10 aggregate queries × 5 countries = **50 queries per call**.

Additionally, module-level shared state is accessed across threads without locking:
`_connections` dict, `_LAST_TELEMETRY_LOG_WRITE` dict (read-modify-write race), and
`_ROUTE_CACHE` are all touched by both the Uvicorn request threadpool and the demo simulator
daemon thread.

**Remediation:** PostgreSQL as the primary OLTP store with a proper connection pool
(asyncpg/SQLAlchemy async). Multi-tenancy via a `country_code` column + indexes + row-level
security, not file-per-country. Redis for ephemeral live-fleet state and caching. SQLite
remains only as an edge-device local buffer.

### 2.4 No service layer — business logic in route handlers

`api/routes.py` contains ~740 lines with inline business logic: `parse_route_file`,
`parse_geojson_routes`, `parse_csv_routes`, `parse_gtfs_routes`, `validate_polyline`,
`validate_imported_routes`, `simplify_polyline` (Ramer-Douglas-Peucker). The `get_fleet`
handler merges DB vehicles with live state directly in the handler function. There is no
service / repository separation.

`core/transit.py` is a **1,860-line god-module** mixing: place search, geocoding, route
matching, multi-leg routing, vehicle ranking, fare estimation, NLP pattern matching,
translation, fuzzy matching, and language detection. Massive single-responsibility violation.

**Remediation:** Layered architecture: routes → services → repositories → models. `transit.py`
splits into `geocoding`, `route_matching`, `multi_leg`, `fare`, `nlp`, `i18n` modules. Each
service has an interface and is unit-testable in isolation.

### 2.5 No input validation beyond type checks

Pydantic models validate types but almost no constraints:

- `Telemetry.latitude` / `longitude` are bare `float` — a client can send `lat=999`.
- `occupancy: int` has no `ge=0`.
- `timestamp: str` accepts any string (should be `datetime`).
- `vehicle_id`, `route`, `driver` — `str` with no length limit.
- `ChatQuery.history: Optional[list[dict]]` — no schema for the dicts.
- `SuggestionQuery.limit: int = 5` — no upper bound (could be 10,000,000).
- `POST /routes/import` reads the entire upload into memory with no size limit — DoS vector.

**Remediation:** Every Pydantic model uses `Field(..., ge=, le=, min_length=, max_length=,
pattern=)` constraints. File uploads are streaming-parsed with a hard size cap. A shared
`validators` module centralizes reusable constraints (lat/lon bounds, ISO timestamps, vehicle
ID patterns).

### 2.6 No API versioning, no response models, no OpenAPI discipline

All endpoints live under `/api` with no version prefix. No `response_model` on any endpoint,
so the auto-generated OpenAPI schema has no response definitions. No `tags`, so `/docs` is a
flat list. No `responses=` to document error codes. The README documents endpoints that
**do not exist**: `/api/demand/forecast`, `/api/eta/{vehicle_id}`,
`/api/alerts/{id}/false-alarm`, `/api/alerts/{id}/escalate`, `/ws/fleet`.

**Remediation:** `/api/v1/` prefix. Every endpoint declares `response_model`, `tags`,
`summary`, `description`, and `responses=`. OpenAPI spec is exported, committed, and diffed in
CI — breaking schema changes fail the build. README is generated from the spec, not hand-
written.

### 2.7 Hardcoded values and magic numbers (partial list)

| Location | Value | Problem |
|---|---|---|
| `chatbot.py:106` | `"gemini-2.5-flash-lite"` | Model name hardcoded |
| `ollama_chatbot.py:10-11` | `OLLAMA_API_URL = "http://localhost:11434"`, `MODEL_NAME = "llama3.2:3b"` | Won't work in container |
| `routes.py:107` | `route="04L"`, `time_of_day=8.0`, `traffic_factor=1.0` | PH-specific defaults leak into other countries |
| `state.py:246` | `self._alerts = self._alerts[-100:]` | Magic 100 cap |
| `state.py:249-255` | traffic-factor weights `0.9, 1.05, 1.2, 1.35` | Magic |
| `sqlite_store.py:22` | `TELEMETRY_LOG_INTERVAL_SECONDS = 15` | Magic |
| `transit.py:13-27` | 9 magic constants (radii, speeds, ratios, TTLs) | Not in config |
| `transit.py:373` | `urlopen(request, timeout=1.8)` | 1.8 s — unusual |
| `transit.py:1006-1009` | `min_fare = 13.0`, `per_km = 2.25`, free km = 4.0 | PH fare constants hardcoded |
| `demo_simulator.py:32` | `random.seed(2026)` | OK (seeded) but the rest of the codebase is unseeded |
| `phase2.py:110-118` | Gaussian peaks, `noise = random.uniform(-0.5, 0.5)` | Non-deterministic "forecast" |
| `seed_demo_vehicles` | Hardcoded Filipino driver names ("Jun Mercado", "Rico Santos") inserted into all 5 country DBs | Culturally biased for TH/VN/ID/MY |

**Remediation:** All thresholds, fares, model names, timeouts, and radii move into a typed
config system (pydantic-settings) with per-country overrides. Seed data is culturally neutral
or per-country appropriate.

### 2.8 DEMO_MODE defaults to true

`is_demo_mode()` (`config.py:58-61`) reads the `DEMO_MODE` env var and **defaults to "true"**.
This means a production deployment, unless someone explicitly sets `DEMO_MODE=false`, will run
the synthetic fleet simulator — a daemon thread that pollutes `telemetry_logs` with fake
vehicle data every 3 seconds. The demo simulator lives inside `core/` (the production
package), not in `dev/` or `tools/`.

**Remediation:** `DEMO_MODE` defaults to `false`. The simulator moves to `dev/simulator/` and
is launched explicitly. Production images do not contain simulator code.

### 2.9 No structured logging, no metrics, no tracing

The entire backend uses `print()` for logging (`chatbot.py:137`, `ollama_chatbot.py:211`,
`sqlite_store.py:580`). No `logging` module, no structlog/loguru, no log levels, no JSON log
format. No Prometheus metrics endpoint. No OpenTelemetry tracing. No Sentry. The `/health`
endpoint returns `{"status": "ok"}` with no DB check, no model-load check, no dependency
check — no liveness/readiness split.

**Remediation:** structlog with JSON output and correlation IDs. Prometheus `/metrics`
endpoint with RED metrics (rate, errors, duration) per route. OpenTelemetry traces with
auto-instrumentation for FastAPI, asyncpg, and HTTP clients. Sentry for error tracking.
`/health` (liveness) and `/ready` (readiness) split, with readiness checking DB + cache +
model availability.

### 2.10 No rate limiting

No `slowapi` or equivalent. `/chatbot` could trigger expensive NLP regex matching (or LLM
calls if wired). `/places` makes external HTTP calls to Photon with a 1.8 s timeout — easy to
abuse. `/routes/import` parses uploaded files with no size limit.

**Remediation:** Token-bucket rate limiting per IP and per API key, configurable per route.
The chatbot and places endpoints get stricter limits. A middleware-based limiter backed by
Redis so it works across multiple workers.

---

## 3. Frontend failures

The frontend (`app/`) is vanilla HTML/CSS/JS — three static HTML pages (`index.html`,
`mobile.html`, `operator.html`), seven CSS files, eight JS files totaling ~3,605 lines, plus
~181 KB of vendored Leaflet committed to the repo. No build step, no module system, no type
safety, no framework, no tests.

### 3.1 No build step and no module system

Eight JS files served as raw text via classic `<script src>` tags. All top-level function
declarations become implicit `window` globals. Load order is critical and undocumented. A
function defined in `routes-admin.js` silently overrides the same-named function in `map.js`
(both define `setupRecenterButtons`, `fitRoute`, `fitFleet`, `previewRoute`, `zoomVehicle`).
The `operator.js` version of `renderRouteDirectory` references an **undefined variable
`groupBy`** (`operator.js:282, 285`) — it would throw `ReferenceError` if ever called, but
it's dead-but-overriding code from copy-paste.

**Remediation:** TypeScript + Vite. ES modules with explicit imports/exports. Build step
gives minification, tree-shaking, code-splitting, and source maps. Load-order bugs become
impossible.

### 3.2 XSS risks via innerHTML and inline onclick

~50+ `innerHTML` assignments. Most use `escapeHtml()`, but `escapeHtml` does **not** escape
backticks or `$`, so interpolating its output into JS template literals is unsafe. Map popups
(`map.js:197, 209`) use inline `onclick="showVehicleDetailsModal('${escapeHtml(...)}')"` —
inside an HTML attribute, entities are decoded, so an apostrophe in `vehicle_id` breaks the JS
string syntax. `mobile.js:127, 177` interpolate `route` and `vehicle_id` into `innerHTML`
**without** `escapeHtml` at all — currently benign only because the simulator uses safe
strings.

**Remediation:** React (or Svelte) with JSX — XSS-safe by default because interpolation is
auto-escaped. No `dangerouslySetInnerHTML` without DOMPurify sanitization. No inline event
handlers.

### 3.3 No accessibility

- No skip-to-content link.
- No ARIA live regions for chat (screen readers don't announce new bot messages).
- Custom searchable dropdown (`core.js:451`) has no `role="listbox"`/`role="option"`, no
  `aria-expanded`/`aria-haspopup`, no keyboard arrow navigation.
- Mobile bottom nav and operator tabs lack `role="tablist"`/`role="tab"`/`role="tabpanel"`.
- Modals are `<div class="modal hidden">`, not `<dialog>`, with no `role="dialog"`, no
  `aria-modal="true"`, no focus trap, no ESC handler.
- Chat `<input>` has no `<label>`.
- SVG icons mostly lack `aria-hidden="true"`.
- `blink` animation has no `prefers-reduced-motion` override.
- `.hintrc` **explicitly disables** `button-type`, `label`, and `select-name` a11y hints.

**Remediation:** axe-core in the test suite (fails CI on violations). Headless UI primitives
(Radix UI) for dropdowns/dialogs/tabs that ship with correct ARIA out of the box. Keyboard
navigation tested with Playwright. `prefers-reduced-motion` respected everywhere.

### 3.4 No internationalization despite ASEAN target

Zero i18n. All UI strings hardcoded English. Currency hardcoded "PHP" despite targeting
PH/ID/MY/TH/VN (IDR/MYR/THB/VND). Demo phone number is PH format. The chatbot backend claims
Tagalog/Cebuano/Bahasa/Thai/Vietnamese support but the frontend sends raw text only and there
is no language detection.

**Remediation:** i18next (or equivalent) with locale switching. Per-country currency
formatting via `Intl.NumberFormat`. RTL support (not needed for ASEAN but good practice).
Locale-negotiated chatbot. Translatable route metadata.

### 3.5 No PWA / offline support

No `manifest.json`, no service worker, no Workbox. Map tiles cached only by the browser HTTP
cache — a hard refresh or first-load offline yields a blank map. No network-status detection;
if the browser goes offline, all polling fetches fail silently.

**Remediation:** PWA with a service worker (Workbox) for app-shell caching, offline route
cache, and stale-while-revalidate for map tiles. Network-status detection with a visible
"offline" banner. Install prompt for commuter app.

### 3.6 No state management, no server-state library

A single mutable `state` object with 40+ properties (`core.js:2-42`) shared across all 8
scripts. Any function can mutate any field. Re-rendering is manual (`renderMobile()` /
`renderOperator()`) and easy to forget. The same "vehicle card" is rendered in 5+ places with
subtle differences. Polling uses `setInterval` every 30s (mobile) / 15s (operator) with no
backoff, no pause-on-hidden-tab, no overlap protection. No WebSocket — the README claims
`/ws/fleet` exists but the frontend has zero `new WebSocket` references and the backend
endpoint is `/ws/telemetry` (not `/ws/fleet`).

**Remediation:** TanStack Query for server state (caching, polling, retries, dedup, pause on
hidden tab). Zustand for client state. React Server Components / Next.js for the shell.
WebSocket (socket.io) for live fleet updates with auto-reconnect.

### 3.7 No dark mode, no design system

Zero `prefers-color-scheme` matches. The "Dark" map tile layer only changes map tiles, not
UI. `variables.css` defines only 14 CSS custom properties, but ~30 different hex values are
hardcoded across JS and CSS *not* in the variable set. Three overlapping modal systems
(`.ls-modal-*`, `.modal`/`.modal-content`, `.action-modal*`). `!important` used 18+ times.
`map.css` defines the same `.map-type-card` rules verbatim in two places (lines 602-645 and
797-844).

**Remediation:** Tailwind CSS 4 with a full design-token scale (color, spacing, typography,
radius, shadow, motion). Dark mode via token swap. shadcn/ui component library for consistent
primitives. `stylelint` + `eslint-plugin-tailwindcss` to enforce token usage.

### 3.8 Vendored libraries committed uncompressed

`app/vendor/leaflet/` contains `leaflet.js` (147 KB uncompressed), `leaflet.markercluster.js`
(34 KB), CSS, and PNG marker assets — all committed with no version pin, no SRI, no license
file. No minification, no tree-shaking (only a fraction of Leaflet's API is used).

**Remediation:** npm-managed dependencies with pinned versions and `package-lock.json`. Vite
handles bundling, tree-shaking, and minification. SRI hashes on third-party CDN assets.

---

## 4. Edge-layer integrity failures

This is the most serious category. The original LoadSense **pitched YOLOv8-nano computer
vision** but the edge code does not do computer vision.

### 4.1 `line_crossing_counter.py` `webcam`/`video` modes are fake CV

The file has three modes via `--source`:

- `sim` (default): pure random-walk in pixel space. Honest, labeled as simulation.
- `webcam` / `video`: `import cv2`, `cv2.VideoCapture(source)`, reads frames in a loop —
  **then ignores every pixel of every frame**. The only frame-derived value is
  `gray_mean = int(frame.mean())` (line 103), and `movement = ((gray_mean % 17) - 8)` (line
  104). **No object detection, no tracking, no YOLO, no DeepSORT/ByteTrack.** Frame brightness
  mod 17 is treated as "person movement".

Yet `docs/loadsense_pitch_outline.md` Section 5A explicitly states: *"We run a lightweight
computer vision model—specifically object detection like YOLO—to track passengers crossing
the door threshold."* The code does not deliver this; the pitch does. This is an **integrity
gap**, not merely a technical debt item.

**Remediation:** Re-LoadSense is honest. The edge layer is either (a) real YOLOv8-nano via
Ultralytics running on a Raspberry Pi 5 / Jetson Nano, with ByteTrack for identity tracking,
or (b) a clearly-labeled `sim` mode that emits the same contract. There is no `webcam` mode
that opens a camera and ignores pixels. The contract between edge and cloud is a versioned
protobuf/JSON Schema, not ad-hoc.

### 4.2 No edge-cloud contract schema

The telemetry payload is ad-hoc JSON with no formal schema, no version field, no device
identity, no firmware version, no auth token, no heartbeat. `mock_telemetry.py` and
`line_crossing_counter.py` emit slightly different field sets. No protobuf, no Avro, no JSON
Schema, no AsyncAPI.

**Remediation:** Versioned edge-cloud contract (protobuf or JSON Schema with a `schema_version`
field). AsyncAPI spec for the telemetry channel. Device identity, firmware version, and auth
token in every payload. Heartbeat/liveness separate from telemetry.

### 4.3 No offline buffer, no device management, no OTA

- HTTP failure on the edge = data loss. `post_telemetry` prints to stderr and drops the row.
- No device registry (which Pi is on which vehicle).
- No device provisioning flow, no device-to-vehicle binding API.
- No OTA firmware updates, no A/B partition, no rollback.
- No edge ML lifecycle — no model download from cloud to edge, no versioned edge model, no
  edge inference metric reporting.
- No edge auth — no API key, no mTLS, no JWT, no per-device credentials.
- No edge runtime — no container image, no systemd unit, no K3s/balena.

**Remediation:** A real edge platform: device registry + provisioning API, mTLS device
certificates, offline buffer (SQLite/RocksDB queue on device), batched compressed upload with
retry/backoff, OTA firmware pipeline with A/B partitions and automatic rollback, edge model
download with version negotiation, edge inference metrics reported to cloud, containerized
edge runtime (balena/balenaCloud or K3s).

### 4.4 Privacy leakage pattern

The pitch claims "no video leaves the device" but `line_crossing_counter.py` writes
`centroid_x`, `centroid_y`, `density_zone` per frame to a CSV committed to the repo. This is
a metadata leakage pattern that real YOLO bbox data would inherit unless explicitly redacted.

**Remediation:** Edge devices emit only aggregate counts (boarded, alighted, current
occupancy, density-zone histogram). No per-frame coordinates, no bboxes, no images ever leave
the device. A privacy impact assessment (PIA) is written and reviewed before any pilot.

---

## 5. ML / MLOps failures

The ML layer (`cloud/` + `backend/app/core/phase2.py`) is broken end-to-end.

### 5.1 Trained artifacts do not exist

README, `phase-2.md`, `cloud/README.md`, and `DATA_SOURCES_AND_APIS.md` all claim "checked-in
artifacts" but `cloud/artifacts/` **does not exist in the repo**. `phase2.py:load_eta_model()`
returns `None` (line 20) and `predict_eta_details` silently falls back to a config-driven
heuristic returning `{"source": "fallback"}`. The trained model is effectively dead code in
production.

### 5.2 Train/serve path mismatch for demand forecast

`train_demand_forecast.py` writes to `cloud/artifacts/demand_forecast.json` (single file).
`phase2.py:60-61` reads `cloud/artifacts/demand/{COUNTRY}_demand_forecast.json` (5 per-country
files). **They never connect.** Even if you run the trainer successfully, the backend will
never pick up the output.

### 5.3 Target leakage in ETA training

`train_eta_model.py:build_target()` (lines 23-25) constructs the target as a deterministic
linear function of three of the four input features:

```python
noise = (frame["stop_index"] % 3) * 0.2
return 4.5 + frame["stop_index"] * 0.8 + frame["time_of_day"] * 0.06
            + frame["traffic_factor"] * 1.9 + frame["count"] * 0.08 + noise
```

The GradientBoostingRegressor trivially memorizes the linear coefficients and reports an MAE
near the noise floor (~0.2 minutes). The reported evaluation is **meaningless**. No held-out
route, no held-out time period, no k-fold CV, no baseline comparison.

### 5.4 Non-deterministic demand forecast in production

`phase2.py:118` (the no-artifact fallback) uses `random.uniform(-0.5, 0.5)` without a seed.
Every call to `GET /api/demand` returns **different numbers** for the same route and hour. The
`model` field is `"dynamic_simulation"` but the API gives no indication the values are non-
deterministic. Operators would see the dashboard "jitter" between refreshes.

### 5.5 `pickle.load` is an RCE vector

`phase2.py:19` does `pickle.load(handle)` on `cloud/artifacts/eta_model.pkl`. `pickle.load`
executes arbitrary code from the file. Combined with `CORS allow_origins=["*"]` and no auth,
this is a critical-severity issue: if an attacker can write the `.pkl` (path traversal,
supply-chain compromise, misconfigured CI), they get remote code execution on every `/api/eta`
call.

### 5.6 Heavy deps for dead code

`requirements.txt` ships `xgboost>=2.0`, `prophet>=1.1`, `google-genai>=0.3.0`. Grep confirms
**xgboost is never imported** (only sklearn's `GradientBoostingRegressor` is used). `prophet`
(~200 MB with cmdstanpy) is used by a trainer whose output is never wired into production.
`google-genai` is consumed only by dead `chatbot.py`. These bloat the Docker image by hundreds
of MB for no benefit.

### 5.7 No MLOps whatsoever

No model registry (MLflow/W&B), no experiment tracking, no feature store (train-serve skew is
structurally guaranteed), no data validation (Great Expectations/Pandera), no drift detection
(evidently/alibi-detect), no production monitoring (no Prometheus metrics on `/api/eta` or
`/api/demand`), no A/B testing, no canary, no CI/CD for ML, no model serving infrastructure
(no Triton/BentoML/TorchServe). The "MLOps" is: developer runs a script locally, commits a
`.pkl`, FastAPI loads it via `@lru_cache`.

### 5.8 Synthetic data is unrealistic and unseeded

`data/generate_synthetic_history.py` produces 500 rows, 15-min intervals, 4 routes cycled
(only 4 of 74 PH routes), `count` as a linear function of `stop_index` and `traffic_factor`.
`random` is **unseeded** — every run produces a different CSV. No day-of-week, no holiday
effects, no weather, no events, no spatial correlation. The committed snapshot is one
arbitrary realization.

**Remediation (all of §5):** Real MLOps stack — MLflow for registry + tracking, Feast (or
inline typed feature definitions) for feature parity, evidently for drift detection,
Prometheus metrics on inference endpoints, joblib/ONNX for safe model serialization (never
pickle for untrusted paths), seeded reproducible data generation, train/serve schema
validation, champion/challenger promotion pipeline, CI/CD that retrains on data refresh and
promotes models through dev → staging → prod with automated rollback.

---

## 6. Documentation drift

The docs systematically overclaim. A cross-check of cited files/endpoints against the actual
repo:

| Cited in | Cites | Actual status |
|---|---|---|
| `DATA_SOURCES_AND_APIS.md:7` | `data/cebu_osm_routes.geojson` | **Does not exist** (actual: `data/countries/PH/routes/PH_routes.geojson`) |
| `DATA_SOURCES_AND_APIS.md:9` | `tools/fetch_osm_routes.py` | **Does not exist** |
| `DATA_SOURCES_AND_APIS.md:11` | `data/loadsense_demo.sqlite` | **Does not exist** (actual: 5 per-country files) |
| `DATA_SOURCES_AND_APIS.md:23` | `cloud/artifacts/demand_forecast.json` | **Does not exist** (dir missing) |
| `DATA_SOURCES_AND_APIS.md:27` | `/api/alerts/{alert_id}/ack` | **Does not exist** (only `/verify`) |
| `DATA_SOURCES_AND_APIS.md:49` | `app/styles.css` | **Does not exist** (actual: `app/css/` with 7 files) |
| `docs/README.md:8` | `REQUIREMENTS_COVERAGE.md` | **Does not exist** |
| `README.md:170-177` | `/api/demand/forecast`, `/api/eta/{vehicle_id}`, `/api/alerts/{id}/false-alarm`, `/api/alerts/{id}/escalate`, `/ws/fleet` | **Do not exist** |
| `phase-2.md` | "checked-in artifacts" | **False** |
| `AI_USE_ETHICS_REPORT.md:29` | "xgboost-style ETA modeling" | **xgboost is never imported** |
| `AI_USE_ETHICS_REPORT.md:30` | "httpx2" | Typo (`httpx`) |
| `AI_USE_ETHICS_REPORT.md:41` | Tagalog/Cebuano/Bahasa/Thai/Vietnamese chatbot support | **Unsupported** — English keyword matching only |

**Missing docs for production:** API reference (curated, not just auto-generated), ADRs,
deployment guide, incident runbooks, model cards, data lineage, threat model (STRIDE),
privacy impact assessment, SLO/SLI definitions, capacity/scaling plan, disaster recovery,
compliance docs (Philippines DPA 2012, ISO 27001, SOC 2), data retention policy, change
management process.

**Remediation:** Docs are generated from code where possible (OpenAPI → API reference,
TypeDoc → frontend docs). A "docs drift" CI check verifies every cited file path and endpoint
actually exists. ADRs are required for every significant architectural decision. Every model
has a model card. A PIA is written before any pilot.

---

## 7. Testing failures

### 7.1 Only 3 real pytest assertions in the entire repo

`backend/tests/test_transit.py` — 3 test functions, 114 lines, tests only
`find_transit_suggestions`. That's the **only** real pytest test.

The `tests/` directory has 4 scripts that must be run manually (no pytest discovery, no CI):
- `run_health_check.py` (22 lines) — hits `/health`, **no assertion**, just prints.
- `run_api_smoke.py` (102 lines) — hits 10 endpoints, uses `raise SystemExit(response.text)`
  on failure. Works but isn't pytest. Writes to the real DB.
- `run_chatbot_regression.py` (162 lines) — 16 chatbot assertions + 3 places assertions.
  Hardcodes expectations ("44", "PH-MJ01") that depend on demo simulator state — flaky.
- `run_demo_state_check.py` (28 lines) — `time.sleep(2.5)` then prints. **No assertion.**

### 7.2 Coverage gaps

**Zero tests** for: `edge/*`, `cloud/*`, `data/generate_synthetic_history.py`, `phase2.py`
(including the `pickle.load` path and non-deterministic fallback), `sqlite_store.py`,
`route_deviation.py`, `occupancy.py`, `demo_simulator.py`, `config.py`, `state.py` (the most
critical state object), `tools/*`, all API error paths (4xx/5xx), auth/security, edge-cloud
contract.

### 7.3 Test infrastructure gaps

No `pytest.ini`, no `pyproject.toml`, no `conftest.py`, no shared fixtures, no DB isolation
(every `TestClient(app)` import starts the demo simulator thread and mutates 5 SQLite files on
disk), no mocking (OSRM/Photon/OSM hit real network), no coverage measurement, no mutation
testing, no property-based testing, no load testing, no contract testing, no e2e testing.

**Remediation:** pytest with `pyproject.toml` config, `conftest.py` with shared fixtures, test
DB on tmpfs (not the demo DB), `pytest-asyncio`, `pytest-cov` with coverage gates, `respx` /
`responses` for HTTP mocking, factory_boy for test data, Playwright for e2e, Hypothesis for
property-based tests, k6/locust for load tests, schemathesis for OpenAPI contract tests.
Coverage gate: ≥80% on backend, ≥70% on frontend. CI runs the full suite on every PR.

---

## 8. Security & privacy failures

Consolidated from the sections above:

1. **CORS `allow_origins=["*"]`** (`main.py:36`) — fully open to any website.
2. **No auth on any endpoint** including destructive resets and deletions.
3. **No rate limiting** anywhere.
4. **`pickle.load` RCE** (`phase2.py:19`).
5. **Information disclosure** via `str(exc)` in `HTTPException(500, ...)` (6+ handlers) and
   WebSocket error messages (`routes.py:101`).
6. **No input size limits** on `/routes/import`.
7. **No PII redaction** in `chatbot_queries` persistence; chat history (which may contain
   phone numbers and addresses) is sent on every subsequent chat request.
8. **Generic User-Agent** for Nominatim/Photon — violates Nominatim usage policy.
9. **`DEMO_MODE` defaults to true** — production runs the synthetic fleet simulator.
10. **No HTTPS enforcement**, no HSTS, no secure cookies.
11. **`reset_database`** is unauthenticated, irreversible, AND seeds fake vehicles with
    hardcoded culturally-specific names.
12. **No CSRF protection** for state-changing endpoints.
13. **No security headers** (CSP, X-Frame-Options, X-Content-Type-Options).
14. **No dependency audit** — `>=` pins, no `pip-audit`/`safety`/SBOM.
15. **No privacy impact assessment** despite passenger-counting from cameras. No Philippines
    Data Privacy Act 2012 compliance review. No consent flow. No retention policy. No data
    subject rights mechanism.
16. **Edge metadata leakage** — per-frame coordinates written to CSV.

**Remediation:** Security is a first-class concern in Re-LoadSense, not a phase-2 item. See
`02-improved-concept.md` §9 (Security) and §10 (Privacy & Compliance) for the full model:
authn/authz, RBAC, mTLS for edge devices, rate limiting, CSP, dependency scanning, SAST/DAST,
threat model (STRIDE), PIA, DPA 2012 compliance, data retention, data subject rights.

---

## 9. Operability & DevOps failures

1. **No CI/CD** — no `.github/workflows/`, no `Makefile`, no CI config anywhere.
2. **No health checks** in `docker-compose.yml`.
3. **No monitoring** — no Prometheus, no structured logs, no dashboards.
4. **No graceful shutdown** — `lifespan` stops the simulator but doesn't close DB connections.
5. **No DB backups** — SQLite files on local disk, no scheduled backups.
6. **No secrets management** — `.env` file expected, no vault.
7. **Single-stage Dockerfile** — no multi-stage build, runs as root, `COPY . .` copies the
   entire repo including `docs/`, `tests/`, `.git/`.
8. **Uvicorn runs as root** with 1 worker, no `--workers`.
9. **No pinned dependencies** — `>=` everywhere, non-reproducible builds.
10. **Heavy deps for dead code** — prophet, xgboost, google-genai bloat the image.
11. **Tests are scripts** — not discoverable by pytest, no CI, write to real DB.
12. **No staging environment**, no prod deployment guide.
13. **No load testing**, no operational runbooks, no on-call, no incident response docs.

**Remediation:** Multi-stage Dockerfile, non-root user, distroless or slim base, pinned deps
with hashes. GitHub Actions CI (lint, type-check, test, build, security scan, docs drift
check). Docker Compose with healthchecks for dev; Helm chart / k8s manifests for prod.
Prometheus + Grafana for metrics, Loki for logs, OpenTelemetry for traces. Runbooks per
service. SLO/SLI definitions with error budgets.

---

## 10. Consolidated mistake → remediation matrix

This matrix is the single most important artifact in this document. Every row maps a concrete
original-repo failure to a concrete Re-LoadSense remediation. The improved concept
(`02-improved-concept.md`) and feature list (`03-features-list.md`) are built to satisfy every
row.

| # | Original failure | Evidence | Re-LoadSense remediation |
|---|---|---|---|
| 1 | Fake CV in `webcam`/`video` mode | `line_crossing_counter.py:103-104` | Real YOLOv8-nano via Ultralytics, or honestly-labeled `sim` mode only |
| 2 | Dead chatbot code (2 of 5 files never imported) | `chatbot.py`, `ollama_chatbot.py` | Single chatbot module with strategy interface; dead code deleted |
| 3 | No auth on any endpoint | `main.py`, `routes.py` | JWT + RBAC in first vertical slice; mTLS for edge devices |
| 4 | SQLite with 5-file per-country fan-out | `sqlite_store.py:15-17` | PostgreSQL + Redis; multi-tenancy via column + RLS |
| 5 | No service layer; 1,860-line god-module | `transit.py` | Layered architecture; `transit.py` split into 6 modules |
| 6 | No input validation beyond types | `routes.py` Pydantic models | `Field(ge=, le=, pattern=)` on every model; streaming upload parsing |
| 7 | No API versioning or response models | `main.py:42` | `/api/v1/`; `response_model`/`tags`/`responses=` on every endpoint |
| 8 | Hardcoded values & magic numbers | ~30+ instances | Typed config system (pydantic-settings) with per-country overrides |
| 9 | `DEMO_MODE` defaults to true | `config.py:58-61` | Defaults to `false`; simulator moves to `dev/` |
| 10 | `print()` instead of logging | multiple files | structlog (JSON) + Prometheus + OpenTelemetry + Sentry |
| 11 | No rate limiting | — | Token-bucket per IP/API-key, Redis-backed, per-route config |
| 12 | No build step / no modules (frontend) | `app/*.js` classic scripts | TypeScript + Vite + ES modules |
| 13 | XSS via `innerHTML` + inline `onclick` | `map.js:197,209`; `mobile.js:127,177` | React JSX (auto-escaped); DOMPurify for any raw HTML |
| 14 | No accessibility | `core.js:451`, `mobile.html:188` | Radix UI primitives; axe-core in CI; keyboard nav tested |
| 15 | No i18n despite ASEAN target | — | i18next; per-country currency via `Intl`; locale-negotiated chatbot |
| 16 | No PWA / offline support | — | Workbox service worker; offline route cache; install prompt |
| 17 | No state management / server-state lib | `core.js:2-42` | TanStack Query + Zustand; WebSocket for live updates |
| 18 | No dark mode / no design system | `variables.css` (14 vars) | Tailwind 4 + full token scale + shadcn/ui |
| 19 | Vendored Leaflet committed uncompressed | `app/vendor/leaflet/` | npm-managed, pinned, tree-shaken, minified |
| 20 | No edge-cloud contract schema | ad-hoc JSON | Versioned protobuf/JSON Schema + AsyncAPI spec |
| 21 | No offline edge buffer | `post_telemetry` drops on failure | SQLite/RocksDB queue on device; batched compressed upload |
| 22 | No device management / OTA | — | Device registry + provisioning + mTLS + OTA with A/B rollback |
| 23 | Edge metadata leakage (per-frame coords) | `line_crossing_counter.py` CSV | Only aggregate counts leave the device; PIA before any pilot |
| 24 | Trained artifacts don't exist | `cloud/artifacts/` missing | Artifacts versioned in MLflow; CI verifies artifact presence |
| 25 | Train/serve path mismatch (demand) | trainer vs `phase2.py:60-61` | Single feature definition module; train/serve schema validation |
| 26 | Target leakage in ETA training | `train_eta_model.py:23-25` | Real features; held-out route + time CV; baseline comparison |
| 27 | Non-deterministic demand in prod | `phase2.py:118` unseeded `random` | Seeded RNG; cached forecast; `model` field honest about source |
| 28 | `pickle.load` RCE | `phase2.py:19` | joblib allowlist or ONNX; never pickle untrusted paths |
| 29 | Heavy deps for dead code | xgboost, prophet, google-genai | Deps pruned to what's imported; `pip-audit` in CI |
| 30 | No MLOps | — | MLflow + Feast + evidently + Prometheus + champion/challenger |
| 31 | Unseeded synthetic data | `generate_synthetic_history.py` | Seeded reproducible generation; realistic patterns (day-of-week, weather) |
| 32 | Documentation drift (9+ ghost citations) | see §6 table | CI docs-drift check; API ref generated from OpenAPI |
| 33 | Only 3 real tests; no CI | `test_transit.py` | pytest + Playwright + k6; ≥80% backend coverage gate; CI on every PR |
| 34 | No test DB isolation | `TestClient(app)` mutates real DBs | Test DB on tmpfs; factory_boy fixtures; respx for HTTP mocking |
| 35 | CORS `*` | `main.py:36` | Explicit allowlist per environment |
| 36 | `str(exc)` in 500s and WS errors | `routes.py:101,266,...` | Structured error responses; internal details logged, not returned |
| 37 | No security headers | — | CSP, HSTS, X-Frame-Options, X-Content-Type-Options via middleware |
| 38 | No dependency pinning / audit | `requirements.txt` `>=` | Pinned with hashes; `pip-audit`/`safety`/trivy in CI; SBOM |
| 39 | No PIA / DPA 2012 compliance | — | PIA written and reviewed before pilot; DPA 2012 compliance matrix |
| 40 | No CI/CD | no `.github/` | GitHub Actions: lint, type-check, test, build, scan, docs-drift, deploy |
| 41 | Single-stage Dockerfile, runs as root | `Dockerfile` | Multi-stage, non-root, distroless base |
| 42 | No monitoring / runbooks / SLOs | — | Prometheus + Grafana + Loki + OTel; runbooks per service; SLO/SLI |
| 43 | No graceful shutdown | `main.py:20-26` | Signal handlers; drain in-flight; close DB/cleanup |
| 44 | No backups | — | Scheduled pg backups; point-in-time recovery tested |
| 45 | No secrets management | `.env` | Vault / cloud secret manager; no secrets in env vars in prod |
| 46 | No threat model | — | STRIDE threat model; security review before each release |
| 47 | Culturally biased seed data | `seed_demo_vehicles` Filipino names in all 5 DBs | Per-country neutral or locale-appropriate seed data |
| 48 | `tools/scrape_cebu_routes.py` unrunnable | hardcoded Windows paths | CLI args; or deleted if not needed |
| 49 | `populate_demo_data.py` hardcoded `distance_km=5.0` | line 314 | Compute distance from polyline; per-route fare config |
| 50 | Ethics report overclaims | xgboost, multilingual | Ethics report audited against code before publish |

---

## Conclusion

The original LoadSense was a strong hackathon prototype with a correct problem framing and a
sound high-level architecture — and roughly fifty concrete production-readiness failures
spanning backend, frontend, edge, ML, docs, tests, security, and operability.

The Re-LoadSense concept does not discard the original's ideas; it **disciplines** them. Every
row in the matrix above is satisfied by an explicit design decision in
[`02-improved-concept.md`](./02-improved-concept.md) and an explicit feature in
[`03-features-list.md`](./03-features-list.md). The roadmap in
[`04-roadmap-and-milestones.md`](./04-roadmap-and-milestones.md) sequences the work so that
the most integrity-critical fixes (honest edge, real auth, reproducible ML) land first.
