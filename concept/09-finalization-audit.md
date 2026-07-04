# 09 — Finalization Audit

> **The planning sign-off.** This document verifies every proposed improvement is sound and
> achievable for a solo project, audits the logical consistency across all planning docs, and
> confirms the scope is realistic. It is the final pass before implementation begins.

---

## Table of contents

1. [Audit methodology](#1-audit-methodology)
2. [Verification of the 7 improvements](#2-verification-of-the-7-improvements)
3. [Cross-document consistency audit](#3-cross-document-consistency-audit)
4. [Logical consistency audit (feature interactions)](#4-logical-consistency-audit-feature-interactions)
5. [Scope realism audit (solo, ~8 days)](#5-scope-realism-audit-solo-8-days)
6. [Groundedness audit (tracing to the original code)](#6-groundedness-audit-tracing-to-the-original-code)
7. [Residual risks + open decisions for the build](#7-residual-risks--open-decisions-for-the-build)
8. [Planning sign-off](#8-planning-sign-off)

---

## 1. Audit methodology

This audit was performed by:

1. **Re-reading all 11 planning docs** (README + 01–08 + legacy-analysis/README + lessons-learned).
2. **Cross-checking every cross-reference** (section numbers, feature IDs, table names) across docs.
3. **Verifying each of the 7 improvements** against: (a) the original code (does the problem
   really exist?), (b) the proposed fix (is it sound?), (c) the solo-project constraint (is it
   achievable in ~8 days?).
4. **Auditing feature interactions** for logical consistency (does feature X's output match
   feature Y's expected input?).
5. **Running the original LoadSense** (`uvicorn` on port 8050) and testing live endpoints
   (`/api/fleet`, `/api/routes`, `/api/chatbot`) to ground the critique in reality.

The audit found the planning **logically consistent and achievable**, with 3 minor wording
inconsistencies (documented in §7) and 5 open decisions for the build phase (§7).

---

## 2. Verification of the 7 improvements

Each improvement is verified against three criteria: **real problem** (confirmed by code),
**sound fix**, **solo-achievable**.

### Improvement 1 — Chatbot consolidation (was: "hallucination")

| Criterion | Verdict | Evidence |
|---|---|---|
| Real problem? | ✅ Yes (reframed) | The original had 5 chatbot files (`no_API_chatbot.py`, `chatbot.py`, `ollama_chatbot.py`, `phase2.py`, `compat.py`). Grep confirmed `chatbot.py` + `ollama_chatbot.py` are never imported. The heuristic that ran (`no_API_chatbot.py`) was grounded — the live response cited real vehicle `V-ID-01-6` on real route `ID-01`. The problem is messy engineering (5 files, 2 dead) + latent hallucination risk in the dead LLM code, not actual hallucination. |
| Sound fix? | ✅ Yes | Consolidate into one `chatbot-service.ts`. Keep the grounded heuristic. Add RAG-guarded LLM (if ever added) that rejects responses citing non-existent entities. PII redaction. This is sound — it keeps what worked and removes the dead code + latent risk. |
| Solo-achievable? | ✅ Yes | One file, ~200 lines. The intent detection + entity extraction is the core work; it's pattern matching against the route/vehicle tables. ~4 hours. |

### Improvement 2 — Correct calculations (ETA, demand, occupancy)

| Criterion | Verdict | Evidence |
|---|---|---|
| Real problem? | ✅ Yes | Original ETA: `phase2.py` target was a deterministic linear function of features → meaningless evaluation (confirmed by reading `train_eta_model.py:23-25`). Demand: `phase2.py:118` used unseeded `random.uniform` → different numbers every call (confirmed). Occupancy: `demo_simulator.py:55` sine wave oscillated 10-70%, never reaching at_capacity/overloaded tiers. |
| Sound fix? | ✅ Yes | ETA = `haversine_distance / (speed × traffic_factor)` — correct, deterministic, direction-aware. Demand = seeded historical mean, cached. Occupancy = time-of-day-biased pattern that reaches all 4 tiers + 10s hysteresis. All are pure functions, unit-testable. |
| Solo-achievable? | ✅ Yes | Three small files (`eta.ts`, `demand.ts`, `occupancy.ts`), each ~50 lines. Unit tests. ~6 hours total. |

### Improvement 3 — Fast server (no fan-out, cached)

| Criterion | Verdict | Evidence |
|---|---|---|
| Real problem? | ✅ Yes | Original: 5 SQLite files (one per country), `for code in COUNTRY_CODES: query...` in ~11 functions (`sqlite_store.py`). `country_for_route()` called on every telemetry write. Confirmed by reading `sqlite_store.py`. |
| Sound fix? | ✅ Yes | Single Vercel Postgres + `countryCode` column. Redis (Vercel KV) for hot reads. Edge runtime for read routes. Prisma with explicit includes (no N+1). This eliminates the fan-out entirely. |
| Solo-achievable? | ✅ Yes | Prisma + Vercel Postgres + KV is the easy Vercel-native path. No custom connection pooling. ~1 day for the data layer + API routes. |

### Improvement 4 — Map fixes (flicker, color, direction, themes, legend)

| Criterion | Verdict | Evidence |
|---|---|---|
| Real problem? | ✅ Yes (reframed) | Original `map.js:73` `layerGroup.clearLayers()` cleared route polylines on every 3s refresh → route flicker. Route color was `#0b57d0` (blue, violates no-indigo/blue rule). No direction arrows. 3-tier legend (Seats/Standing/Full), missing overloaded. Vehicle markers DID update in place (`setLatLng`) — no vehicle flicker. |
| Sound fix? | ✅ Yes | Fix: only redraw polylines on route-selection change (not every refresh). Teal route color. Direction arrows (▲/▼). 4-tier legend. 5 map themes. Keep the in-place vehicle updates + jeepney SVG markers (they were correct). |
| Solo-achievable? | ✅ Yes | existing Leaflet (kept) + direction arrows added to the existing divIcon + theme switcher button. ~1 day. The 5 tile providers are free. |

### Improvement 5 — Design system (existing CSS + dark mode)

| Criterion | Verdict | Evidence |
|---|---|---|
| Real problem? | ✅ Yes | Original: ~30 hardcoded hex values not in `variables.css` (14 vars only). Three overlapping modal systems. `!important` 18+ times. No dark mode. Fixed-width phone-frame mock. `.hintrc` disabled a11y hints. |
| Sound fix? | ✅ Yes | Keep the existing CSS design system (variables.css + components.css + mobile.css). Add dark mode via a class toggle on <html> + dark CSS variable overrides. The existing CSS is already polished — no rebuild needed. |
| Solo-achievable? | ✅ Yes | The existing CSS is already good. Just add dark mode overrides + the 5th Menu tab. ~0.5 day. |

### Improvement 6 — Honest simulation (no fake CV)

| Criterion | Verdict | Evidence |
|---|---|---|
| Real problem? | ✅ Yes | Original `line_crossing_counter.py:103-104`: `gray_mean = int(frame.mean())`; `movement = ((gray_mean % 17) - 8)`. The `webcam`/`video` modes opened a camera and ignored every pixel. Confirmed by reading the code. |
| Sound fix? | ✅ Yes | The sim uses a real line-crossing counter algorithm (testable) fed synthetic person positions (seeded). Every telemetry event has `source: "simulator"`. UI shows a "SIM" badge. No `webcam` mode that ignores pixels. |
| Solo-achievable? | ✅ Yes | The line-crossing counter is ~50 lines of TS (centroid velocity vs. virtual line). The synthetic position generator is part of the simulator. ~4 hours. |

### Improvement 7 — Real-time (socket.io)

| Criterion | Verdict | Evidence |
|---|---|---|
| Real problem? | ✅ Yes | Original frontend polled every 3s (`mobile.js:634` `setInterval(..., 30000)` — actually 30s for mobile, 15s for operator). No WebSocket. README claimed `/ws/fleet` but it didn't exist (backend had `/ws/telemetry`). |
| Sound fix? | ✅ Yes | socket.io mini-service on port 3001 (via `XTransformPort` gateway mechanism). Redis adapter. Bounding-box room filtering. In-place marker updates on events. Auto-reconnect. |
| Solo-achievable? | ✅ Yes | The socket.io service is ~80 lines. The client hook is ~50 lines. Fallback to polling if budget is zero. ~0.5 day. |

### Verdict: all 7 improvements are real problems, sound fixes, and solo-achievable.

---

## 3. Cross-document consistency audit

### 3.1 Section number consistency

| Doc | Check | Result |
|---|---|---|
| `03-data-model.md` | TOC §1–9 matches actual `## 1`–`## 9` headers | ✅ Consistent |
| `03-data-model.md` | TOC §3.1–3.13 matches actual `### 3.1`–`### 3.13` | ✅ Consistent |
| `04-features.md` | TOC §1–9 matches actual `## 1`–`## 9` | ✅ Consistent |
| `07-ui-ux-design.md` | TOC §1–10 matches actual `## 1`–`## 10` | ✅ Consistent |
| `08-implementation-checklist.md` | Phases 0–7 + summary + final notes | ✅ Consistent |

### 3.2 Feature ID consistency

| Feature ID | In `04-features.md` | In `08-checklist.md` | Consistent? |
|---|---|---|---|
| C-00 (Home tab) | ✅ §2 | ✅ Step 4.4 | ✅ |
| C-01 (Live map) | ✅ §2 | ✅ Step 4.5 | ✅ |
| C-02 (ETA) | ✅ §2 | ✅ Step 4.6/2.4 | ✅ |
| C-03 (Chatbot) | ✅ §2 | ✅ Step 2.7/4.8 | ✅ |
| C-04 (Trip planner) | ✅ §2 | ✅ Step 4.9 | ✅ |
| C-05 (Route directory) | ✅ §2 | ✅ Step 4.6/4.7 | ✅ |
| C-06 (Place search) | ✅ §2 | ✅ Step 2.8 | ✅ |
| C-07 (Dark mode) | ✅ §2 | ✅ Step 4.2/4.10 | ✅ |
| C-08 | ❌ Intentionally cut (notifications — out of scope per `01-overview.md §5`) | — | ✅ Documented |
| C-09 (Menu tab) | ✅ §2 | ✅ Step 4.10 | ✅ |
| O-01–O-04 | ✅ §3 | ✅ Phase 5 | ✅ |
| S-01–S-03 | ✅ §4 | ✅ Phase 1 | ✅ |
| Calc-01–04 | ✅ §5 | ✅ Steps 1.5/1.6/1.4 + 2.4/2.5 | ✅ |
| RT-01–02 | ✅ §6 | ✅ Phase 3 | ✅ |
| X-01–03 | ✅ §7 | ✅ Steps 4.3/4.2/1.9 | ✅ |

### 3.3 Cross-reference integrity

| Reference | Source | Target | Valid? |
|---|---|---|---|
| `03-data-model.md §4.2` | 04-features (S-01, Calc-01) | Route type + direction | ✅ Exists |
| `03-data-model.md §6.1` | 04-features (C-01) | Fleet fetch pattern | ✅ Exists |
| `03-data-model.md §6.5` | 04-features (C-03) | Chatbot fetch pattern | ✅ Exists |
| `03-data-model.md §3.13` | 04-features (C-06) | Place table | ✅ Exists |
| `05-tech-stack.md §6` | 07-ui-ux (Map tab) | Map themes | ✅ Exists |
| `07-ui-ux-design.md §Map tab` | 08-checklist (Step 4.5) | Map UI | ✅ Exists |
| `legacy-analysis §1.5` | 04-features (C-03), 01-overview (Problem 1) | Corrections section | ✅ Exists |

### 3.4 Prisma schema vs field tables

| Table | Field table (§3) matches Prisma model (§7)? | Result |
|---|---|---|
| Route | `tag`, `originName`, `destinationName`, `allowedVehicleTypes`, `routeType` all present in both | ✅ |
| Vehicle | `brand`, `model`, `year`, `driver`, `registrationNo`, `vehicleType` all present in both | ✅ |
| VehicleState | `direction`, `positionIndex` present in both | ✅ |
| Place | All 8 fields present in both | ✅ |

### 3.5 7-problems consistency

The 7 problems appear in both `README.md` (summary table) and `01-overview.md` (detailed §4).
Both are now consistent after the correction pass:

| # | README (short) | 01-overview (detailed) | Consistent? |
|---|---|---|---|
| 1 | Chatbot engineering messy | Problem 1 — Chatbot engineering was messy | ✅ |
| 2 | Calculations were wrong | Problem 2 — Calculations were wrong | ✅ |
| 3 | Server was slow | Problem 3 — Server was slow | ✅ |
| 4 | Map flicker + blue + no arrows | Problem 4 — Map had route polyline flicker + blue color + no direction arrows | ✅ |
| 5 | Design/UI rough | Problem 5 — Design/UI was rough | ✅ |
| 6 | Fake edge CV | Problem 6 — Fake edge CV | ✅ |
| 7 | No real-time | Problem 7 — No real-time updates | ✅ |

**Verdict: cross-document consistency is clean.** No broken references, no orphaned feature IDs, no schema mismatches.

---

## 4. Logical consistency audit (feature interactions)

The `04-features.md §8` inter-feature logic audit already covers 10 interaction tables. This
section verifies the key interactions are logically sound:

### 4.1 Simulator → VehicleState → Map (the core data path)

```
Simulator.tick() → writes VehicleState (lat, lon, direction, positionIndex, tier, occupancy)
                 → publishes to Redis pubsub:fleet:PH
                 → socket.io emits fleet:update
                 → Map updates marker setLatLng + direction arrow in place
```

**Sound?** ✅ Yes. The simulator produces all fields the map needs. The `positionIndex` +
`direction` drive the marker arrow. The `tier` drives the color. The `lat/lon` drive the
position. No missing fields.

### 4.2 Route type → Simulator → ETA (the direction logic)

```
Route.routeType (linear|loop) → Simulator advances positionIndex:
  linear: 0→N, flip direction, N→0, flip, repeat
  loop: 0→N, wrap to 0, repeat
→ VehicleState.direction (forward|backward) + positionIndex
→ ETA uses direction to determine "remaining stops" (forward: seq > positionIndex; backward: seq < positionIndex, descending)
```

**Sound?** ✅ Yes. The direction is set by the simulator based on route type. The ETA reads
the direction to order the stops. A backward-traveling vehicle's "next stop" is the previous
stop in seq order — logically correct.

### 4.3 Route-Vehicle type constraint → Sequenced form → API validation

```
Route.allowedVehicleTypes → Form Step 1 (route select) → loads allowed types
→ Form Step 2 (type dropdown) → shows only allowed types
→ Form Step 3 (details) → unlocks
→ API POST /admin/vehicles → validates vehicleType ∈ route.allowedVehicleTypes → 422 if not
```

**Sound?** ✅ Yes. The constraint is enforced at three layers (UI, API, seed). The form
makes invalid combinations impossible to submit. The API is the source of truth (in case the
route was edited between form render + submit).

### 4.4 Chatbot grounding → Fleet data → Response

```
User query → parse intent + entities → validate entities against Route + Vehicle tables
→ if invalid: "I don't have data for route/vehicle XYZ"
→ if valid: query live fleet → compose response referencing real IDs
→ PII-redact query → log to ChatbotQuery
```

**Sound?** ✅ Yes. The bot never invents — it only references entities that exist in the DB.
The grounding is structural (validate before composing), not just a prompt instruction.

### 4.5 Alert generation → Verification workflow

```
Telemetry upsert → alert service evaluates (overload, deviation, speed, signal_loss)
→ dedup (no duplicate open alerts for same vehicle+type)
→ create OperatorAlert with evidence JSON
→ socket.io pushes to operator:{id} room
→ operator ack/verify/false-alarm → creates OperatorFeedback + updates alert status
```

**Sound?** ✅ Yes. The dedup prevents alert storms. The evidence is frozen at alert time.
The workflow states (open → acknowledged → verified/false_alarm) are clear. Concurrent
operator actions use last-write-wins with both feedback rows logged.

**Verdict: feature interactions are logically consistent.** Every feature's output matches
its consumers' expected input. No orphaned dependencies.

---

## 5. Scope realism audit (solo, ~8 days)

### 5.1 Step count + time estimate

| Phase | Steps | Estimated time | Realistic? |
|---|---|---|---|
| 0 — Bootstrap | 7 | 0.5 day | ✅ Standard Next.js setup |
| 1 — Data + Sim | 9 | 1 day | ✅ Prisma schema + seed + 3 calc functions + simulator |
| 2 — Core API | 11 | 1.5 days | ✅ ~10 route handlers, thin service layer |
| 3 — Real-time | 4 | 0.5 day | ✅ socket.io mini-service + client hook |
| 4 — Commuter App | 11 | 2 days | ✅ 5 tabs + map + chat + trip planner |
| 5 — Operator Console | 5 | 1 day | ✅ Fleet + alerts + vehicle CRUD + routes |
| 6 — Polish | 7 | 1 day | ✅ Skeletons + a11y + perf + Sentry |
| 7 — Deploy + Test | 6 | 0.5 day | ✅ Vercel + unit tests + e2e + writeup |
| **Total** | **60** | **~8 days** | ✅ |

### 5.2 What could blow the timeline

| Risk | Mitigation |
|---|---|
| socket.io mini-service deployment | Fallback to existing JS polling (3-30s) — map still works, less smooth. Documented in `05-tech-stack.md §5`. |
| OSRM polyline fetch at seed time | If OSRM is down, fall back to straight-line interpolation between origin/dest. The original did this (`populate_demo_data.py:36-47`). |
| Playwright e2e flakiness | Only 2 e2e tests (commuter + operator flows). Manual testing is the primary verification. |
| PostGIS unavailability on Vercel Postgres free tier | Use bounding-box TS math for geofencing. Documented in `03-data-model.md §1` + `05-tech-stack.md §4`. |

### 5.3 What's deliberately NOT in scope (to protect the timeline)

- Real edge CV / hardware (sim only)
- Device management / OTA / mTLS (sim devices auto-generated)
- ML platform (MLflow/Feast) — deterministic JS functions
- k8s / Helm / Dockerfile — Vercel handles deployment
- Comprehensive test suite — basic unit + few e2e
- ADRs / runbooks / PIA / DSR — demo with synthetic data
- Multi-country, i18n (except English), PWA (optional), notifications, rate limiting, complex RBAC, OpenAPI spec, SAST/DAST

**Verdict: scope is realistic for a solo developer in ~8 days of part-time work.** The
fallbacks for the two biggest risks (socket.io deployment, OSRM availability) are documented
and don't break the demo.

---

## 6. Groundedness audit (tracing to the original code)

Every claim about the original project was verified by reading the actual code after cloning
and running it. The `legacy-analysis/lessons-learned.md §1.5` corrections section documents
where my initial critiques were wrong and what the actual code does.

### 6.1 What the original did right (kept in Re-LoadSense)

| Original feature | Verified by | Kept in Re-LoadSense? |
|---|---|---|
| In-place vehicle marker updates (`setLatLng`) | `map.js:183` | ✅ Yes (kept) |
| Jeepney SVG marker icons | `map.js:188` | ✅ Yes (kept + direction arrows added) |
| 3-layer route polylines | `map.js:93-95` | ✅ Yes (kept + teal color) |
| Marker clustering | `map.js:49` | ✅ Yes (kept) |
| Grounded heuristic chatbot | `no_API_chatbot.py` (tested live) | ✅ Yes (kept + consolidated) |
| Rich vehicle data (brand/model/year/driver) | `populate_demo_data.py:224-234` | ✅ Yes (adopted) |
| Rich route data (tag/origin/dest/40+ real Cebu routes) | `populate_demo_data.py:59-78` | ✅ Yes (adopted as seed source) |
| Vehicle direction field | `demo_simulator.py:42` | ✅ Yes (kept + route type logic added) |
| Deterministic occupancy (sine wave) | `demo_simulator.py:55` | ✅ Yes (kept the deterministic principle; new pattern reaches all 4 tiers) |
| 4-tier occupancy (green/yellow/red/blinking_red) | `no_API_chatbot.py:8-13` | ✅ Yes (kept) |

### 6.2 What the original did wrong (fixed in Re-LoadSense)

| Original flaw | Verified by | Fixed in Re-LoadSense? |
|---|---|---|
| Fake CV (`frame.mean() % 17`) | `line_crossing_counter.py:103-104` | ✅ Honest sim |
| Vehicle teleporting (`progress % 1.0`) | `demo_simulator.py:46` | ✅ Linear/loop route types |
| 5-file SQLite fan-out | `sqlite_store.py:15-17` | ✅ Single Postgres |
| Dead chatbot code (2 of 5 files) | Grep (never imported) | ✅ One consolidated file |
| Route polyline flicker (`clearLayers` every refresh) | `map.js:73` | ✅ Redraw only on route change |
| Blue route color (`#0b57d0`) | `map.js:94` | ✅ Teal |
| No direction arrows on markers | `map.js:186-208` (no arrow) | ✅ ▲/▼ arrows |
| 3-tier legend (missing overloaded) | `map.js` legend | ✅ 4-tier legend |
| No real-time WS (polled every 3-30s) | `mobile.js:634` | ✅ socket.io |
| No auth on any endpoint | `routes.py` | ✅ NextAuth / demo toggle |
| `pickle.load` RCE | `phase2.py:19` | ✅ No pickle (JS sim) |

**Verdict: the planning is grounded in the actual code.** Every claim about the original is
verifiable. The improvements keep what worked and fix what didn't.

---

## 7. Residual risks + open decisions for the build

### 7.1 Minor wording inconsistencies (non-blocking)

| Location | Issue | Resolution |
|---|---|---|
| `04-features.md` S-01 | Says "time-of-day-biased random walk" for occupancy; the correction says the original used a sine wave. | The new sim can use either — the key point is it reaches all 4 tiers. The builder decides the exact pattern (sine + noise, or biased random walk). Documented here; no doc change needed. |
| `04-features.md` C-08 gap | C-08 (notifications) is missing from the ID sequence. | Intentionally cut (out of scope per `01-overview.md §5`). The gap is fine — IDs are stable, not renumbered. |
| `08-checklist.md` Step 4.4 | The Home tab step is numbered 4.4, but in the previous version the map was 4.4. The renumbering is correct but a builder might be confused if cross-referencing old notes. | Non-issue — the checklist is sequential; the builder follows it top to bottom. |

### 7.2 Open decisions for the build phase

| Decision | Options | Recommendation |
|---|---|---|
| Auth approach | (A) NextAuth credentials, (B) Demo toggle | Start with B (demo toggle) for speed; upgrade to A if time permits. The portfolio story is the UI/map/chatbot, not auth. |
| socket.io host | (A) Render free, (B) Railway, (C) Fly.io, (D) Skip (polling) | Try Render free tier first. If it doesn't hold WS, fall back to polling. Documented in `05-tech-stack.md §5`. |
| Map library | (A) existing Leaflet (kept), (B) MapLibre (future) | existing Leaflet — already works, just add improvements. Documented in `05-tech-stack.md §6`. |
| Occupancy sim pattern | (A) Sine wave + noise, (B) Biased random walk | Either is fine. Key: reaches all 4 tiers (including overloaded during rush hour). Decide during Step 1.3. |
| Regulator dashboard | (A) Build it (simple), (B) Skip | Skip if time is short. The commuter + operator apps are the portfolio piece. Documented as optional in `01-overview.md §5`. |

### 7.3 Risks to monitor during build

1. **Vercel function timeout** (10s hobby / 300s pro): the sim-tick cron runs 12 ticks per
   invocation. If a tick takes >0.8s, it could time out on hobby. Mitigation: batch DB writes,
   keep tick logic pure + fast.
2. **Vercel KV pub/sub**: the socket.io Redis adapter needs pub/sub. Vercel KV (Upstash) may
   have limitations on pub/sub for the free tier. Mitigation: test early; fall back to polling.
3. **Photon geocoder rate limits**: the Home search + trip planner call Photon. Mitigation:
   two-layer cache (Redis + Place table) + debounce. Documented in `03-data-model.md §3.13`.

---

## 8. Planning sign-off

### 8.1 What's complete

| Artifact | Status |
|---|---|
| `01-overview.md` — problem, mission, 7 fixes, scope | ✅ Complete + corrected |
| `02-architecture.md` — system architecture (6 mermaid) | ✅ Complete |
| `03-data-model.md` — 13 tables, full fields, Prisma schema, seed | ✅ Complete + corrected |
| `04-features.md` — 24 features, inter-feature audit, traceability | ✅ Complete + corrected |
| `05-tech-stack.md` — Vercel-native stack, package.json, vercel.json | ✅ Complete |
| `06-project-structure.md` — monorepo tree | ✅ Complete |
| `07-ui-ux-design.md` — 5-tab layout, 2 mermaid nav flowcharts | ✅ Complete |
| `08-implementation-checklist.md` — 60 steps, 7 phases | ✅ Complete |
| `legacy-analysis/lessons-learned.md` — 50 failures + §1.5 corrections | ✅ Complete + corrected |
| `09-finalization-audit.md` (this doc) | ✅ Complete |

### 8.2 Audit verdict

| Audit | Result |
|---|---|
| 7 improvements verified (real problem + sound fix + solo-achievable) | ✅ All 7 pass |
| Cross-document consistency (sections, IDs, refs, schema, 7-problems) | ✅ Clean |
| Logical consistency (5 key feature interactions) | ✅ Sound |
| Scope realism (~8 days, 60 steps, fallbacks documented) | ✅ Realistic |
| Groundedness (every claim verified against original code) | ✅ Grounded |

### 8.3 Ready for implementation

**The planning is complete, consistent, grounded, and achievable.** The next session opens
`08-implementation-checklist.md`, starts at Phase 0 Step 0.1, and builds top to bottom.

The 5 open decisions (§7.2) are build-phase choices, not planning gaps — each has a
recommended default + a fallback. The 3 risks (§7.3) have mitigations.

**Planning phase: COMPLETE.**
**Implementation phase: READY TO BEGIN.**

---

## Next

- [`08-implementation-checklist.md`](./08-implementation-checklist.md) — open this, start at
  Phase 0 Step 0.1.
- [`README.md`](./README.md) — the master index.
