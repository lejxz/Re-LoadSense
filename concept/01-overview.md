# 01 — Overview

> What the project is, the problem it solves, the mission it keeps, the seven problems it
> fixes, and the scope of the build.

---

## Table of contents

1. [The problem](#1-the-problem)
2. [The mission](#2-the-mission)
3. [The original concept (kept)](#3-the-original-concept-kept)
4. [The seven problems this project fixes](#4-the-seven-problems-this-project-fixes)
5. [Scope](#5-scope)
6. [Build philosophy](#6-build-philosophy)
7. [What success looks like](#7-what-success-looks-like)

---

## 1. The problem

Cebu's commuters, operators, and regulators all operate blind on the one variable that matters
most: **how full is the next jeepney?**

- **Commuters** wait 20+ minutes for rides that may already be full — there's no way to know
  until the jeepney pulls up.
- **Drivers** routinely exceed legal capacity (*sabit* overloading) because they're paid per
  head and there's no live capacity signal.
- **Operators** can't see which routes are over- or under-served at which hours, so fleet
  allocation is gut-feel.
- **Regulators** have no city-wide compliance dashboard to enforce PUV modernization policy.
- Traffic congestion costs the Philippine economy PHP 3.5 billion daily.

Google Maps shows *where* a jeepney is. None of the existing tools show *whether you can
actually fit inside it.* Re-LoadSense closes that gap.

---

## 2. The mission

Turn every public utility vehicle (PUV) into a real-time occupancy sensor, and make that
information useful to commuters, operators, and regulators.

- **For commuters**: "Is the next jeepney full? When does it arrive? Which one should I take?"
- **For operators**: "Where is my fleet? Which routes need more vehicles? Are my drivers
  safe and compliant?"
- **For regulators**: "Is the city compliant? Where are the overload hotspots?"

---

## 3. The original concept (kept)

The original hackathon submission had a sound high-level architecture. Re-LoadSense keeps it:

### Three-tier platform

1. **Edge (in-vehicle)** — An overhead camera runs YOLOv8-nano offline, performing
   bidirectional passenger counting. The current count maps to a four-tier occupancy state,
   displayed on a **windshield LED strip** so waiting commuters can see — at a glance — whether
   to flag this jeepney down or wait for the next one.

2. **Cloud intelligence** — A backend ingests GPS + occupancy telemetry, predicts ETA,
   detects route deviations and driving anomalies, forecasts demand by route and time of day,
   fires operator-first safety alerts, and powers a context-aware boarding-assistant chatbot.

3. **Clients** — A commuter mobile app with a **5-tab interface** (Home, Map, Routes, Chat,
   Menu) and an operator console (fleet, alerts, verification workflow, vehicle CRUD). The
   Home tab is a search-first discovery surface (search places, landmarks, shops, hotels);
   the Menu tab centralizes profile, preferences, and about.

### Vehicle types and route constraints (improved)

The original treated all PUVs as implicit jeepneys. This project adds a **vehicle type system**:
routes declare which PUV types they allow (`allowedVehicleTypes`: jeepney, minibus, bus,
uv_express), and a vehicle's type must match its route's allowed types. The operator "Add
Vehicle" form is **sequenced** — route first, then type (filtered to allowed), then details —
making invalid combinations impossible to submit. See
[`03-data-model.md §4`](./03-data-model.md#4-vehicle-types-and-the-route-vehicle-type-constraint).

### The four-tier occupancy taxonomy (unchanged)

| Tier | Color | Meaning | LED state |
|---|---|---|---|
| Available | 🟢 Green | Plenty of room | Steady green |
| Filling | 🟡 Yellow | Getting full | Steady yellow |
| At capacity | 🔴 Red | Full | Steady red |
| Overloaded | 🔴-blink | Over capacity (illegal) | Blinking red |

This taxonomy is the core visual language. It survives into Re-LoadSense unchanged — it's
intuitive, actionable, and maps cleanly to both a windshield LED and a map marker.

### Operator-first alert verification (unchanged)

Every alert (overload, route deviation, anomaly) goes through a structured human verification
workflow: **acknowledge → verify (real incident) → false-alarm** (or escalate). No black-box
auto-escalation. Operators are in the loop before any escalation.

---

## 4. The seven problems this project fixes

The original had the right concept but specific, visible implementation problems. This project
exists to fix them:

### Problem 1 — Chatbot engineering was messy (5 files, 2 dead; latent hallucination risk)

**What happened:** The original had 5 chatbot files — a grounded heuristic (`no_API_chatbot.py`,
which actually ran and was correct), a Gemini LLM path (`chatbot.py`, never imported), an
Ollama LLM path (`ollama_chatbot.py`, never imported), plus `phase2.py` and `compat.py`
tangled in. The heuristic was grounded, but the dead LLM code posed a latent hallucination
risk if anyone ever wired it up. The engineering was messy: 5 files for one feature, 2 of
them dead, copy-pasted logic.

**How this project fixes it:** Consolidate into one `chatbot-service.ts`. Keep the grounded
heuristic approach (it was correct). Add more intent types + better entity extraction. If an
LLM is ever added, use RAG with post-processing that rejects responses citing non-existent
routes/vehicles — structurally preventing the hallucination risk. PII-redact queries before
storage. (See [`legacy-analysis/lessons-learned.md §1.5`](./legacy-analysis/lessons-learned.md#15-corrections-after-code-level-review-what-the-original-actually-did-right) for the corrected understanding.)

### Problem 2 — Calculations were wrong (ETA, demand, occupancy)

**What happened:** ETA was a synthetic linear formula with target leakage. Demand used
unseeded `random.uniform` (different numbers every refresh). Occupancy tiers flickered
because there was no hysteresis.

**How this project fixes it:**
- **ETA** = `distance_to_stop / (speed × traffic_factor)`. Correct haversine distance,
  real speed from telemetry, traffic factor from time-of-day. Deterministic, tested.
- **Demand** = seeded historical mean per route × hour. Precomputed, cached in Redis,
  deterministic within a cache window. Honest `source: "historical_mean"` label.
- **Occupancy** = 4-tier with **hysteresis** (must hold a new tier ≥10s before switching).
  No flicker.

### Problem 3 — Server was slow

**What happened:** The backend used 5 separate SQLite files (one per country) and fanned out
queries across all 5 on every read/write — O(countries) per operation. No connection pool.
No cache. A process-local singleton held all live state, so it couldn't scale across workers.

**How this project fixes it:**
- **One PostgreSQL database** (Vercel Postgres) with proper indexes — no file-per-country
  fan-out.
- **Redis cache** (Vercel KV) for live vehicle state, ETA, routes — sub-millisecond hot reads.
- **Edge runtime** for read-heavy API routes — global low latency.
- **No N+1 queries** — Prisma includes are explicit; queries are batched.

### Problem 4 — Map had route polyline flicker + blue color + no direction arrows

**What happened:** The original map actually did several things right (in-place vehicle marker
updates, jeepney SVG icons, 3-layer route polylines, clustering). But: (a) route polylines
were cleared + re-drawn on every 3s refresh (`layerGroup.clearLayers()`) causing the route
lines to flicker, (b) the route color was blue/indigo (`#0b57d0`) violating the no-indigo/blue
project rule, (c) no direction arrows on markers (commuters couldn't tell which way a jeepney
was heading), (d) only a 3-tier legend (Seats/Standing/Full) missing the overloaded tier.

**How this project fixes it:**
- Keep the existing Leaflet (already typed enough for vanilla JS). Keep the in-place vehicle updates (the original was correct here).
- **Fix route polyline flicker**: only redraw polylines when the route selection changes, not
  on every fleet refresh.
- **Teal route color** (not blue) per the project's no-indigo/blue rule.
- **Direction arrows** on markers (▲ forward / ▼ backward) — new, the original had none.
- **4-tier legend** (Available/Filling/At capacity/Overloaded) — the original only had 3.
- **5 map themes** user-switchable (the original had a layer icon but only 2 themes).
- Keep the jeepney SVG marker style (it was good); vary by vehicle type.

### Problem 5 — Design/UI was rough

**What happened:** ~30 hardcoded hex values not in a token system. Three overlapping modal
systems. `!important` used 18+ times. No dark mode. No responsive design — a fixed-width
phone-frame mock. `.hintrc` explicitly disabled accessibility hints.

**How this project fixes it:**
- Keep the existing CSS design system (variables.css + components.css). Add dark mode via a class toggle on <html>.
- Dark mode via vanilla JS class toggle + dark CSS variable overrides.
- **Mobile-first responsive** — designed for a phone in hand, enhanced for desktop.
- **Accessibility basics** — semantic HTML, labels, keyboard nav, ARIA live regions,
  `prefers-reduced-motion`.

### Problem 6 — Fake edge CV

**What happened:** The edge `line_crossing_counter.py` had a `webcam` mode that opened a
camera, read frames, and **ignored every pixel** — using `frame.mean() % 17` as "person
movement." The pitch claimed YOLOv8-nano. The code did not deliver this.

**How this project fixes it:** The edge layer is an **honestly-labeled simulation**. There is
no `webcam` mode. There is no fake CV. The simulator is a pure function `(state, dt) => newState`
with a seeded RNG, running as a Vercel Cron job. Every emitted telemetry event carries
`source: "simulator"`. The UI shows a "SIM" badge. **Honest by design.**

### Problem 7 — No real-time updates

**What happened:** The frontend polled every 30 seconds (mobile) / 15 seconds (operator). No
WebSocket. The README claimed `/ws/fleet` existed but the frontend had zero `new WebSocket`
references. Markers moved in 15-second jumps, not smoothly.

**How this project fixes it:** A **socket.io mini-service** (port 3001, via the gateway
`XTransformPort` mechanism) pushes live fleet updates. The commuter map subscribes to its
visible bounding box. Markers move smoothly (the client interpolates between position updates).
The operator console receives new alerts in real time.

---

## 5. Scope

This is a **solo portfolio project**, not a production system. Buildable in ~8 days of
part-time work.

### Approach: hybrid (old UI + new backend)

The old LoadSense project's **frontend** (HTML/CSS/JS in `app/`) is **kept and improved**.
The **backend** is **rewritten** from Python/FastAPI to **Next.js 16 full-stack** (API routes
in TypeScript, Prisma ORM, Vercel-native deployment). This gives us the best of both worlds:
the polished UI that already works, and a modern, type-safe, Vercel-deployable backend that
fixes the old project's 50 production-readiness failures.

### In scope

- **Existing HTML/CSS/JS frontend** (from old project) — kept as-is in `public/`, improved
  with: 5th Menu tab, direction arrows, map theme switcher, 4-tier legend, teal polylines,
  SIM badge, sequenced vehicle-add form
- **New Next.js 16 backend** — API routes replacing FastAPI, same `/api/...` paths so the
  old JS works with minimal changes
- **Prisma + SQLite** (dev) / **Vercel Postgres** (deploy) — replaces raw sqlite3 + 5-file
  fan-out
- **Vercel KV** (Redis) — live state cache, socket.io adapter
- **socket.io mini-service** — live fleet updates (replaces 3-30s polling)
- **Vercel Cron** — simulator tick (replaces daemon thread)
- **Deploy**: Vercel (Postgres + KV + Cron + Sentry), region `sin1`

### Out of scope (deliberately cut)

| Cut | Why |
|---|---|
| Real edge CV (YOLOv8, ByteTrack, hardware) | Sim only — no hardware for a portfolio piece |
| Device management (registry, provisioning, mTLS, OTA) | Sim devices are auto-generated |
| ML platform (MLflow, Feast, evidently, drift detection) | Deterministic JS functions are enough |
| k8s / Helm / GitOps / Docker | Vercel handles deployment |
| Comprehensive test suite (coverage gate, load, contract) | Basic unit + few e2e is enough |
| ADRs / runbooks / PIA / DSR / retention jobs | Demo with synthetic data |
| SLOs / OTel / Prometheus / Grafana / Loki | Vercel built-in + Sentry |
| Multi-country (ID/MY/TH/VN) | PH/Cebu only |
| i18n (fil/ceb/id/ms/th/vi) | English only |
| PWA / offline / service worker | Optional; add only if easy |
| Notifications / Web Push | Cut |
| Rate limiting | Basic or none (it's a demo) |
| Complex RBAC | Simplified (demo toggle or 2 roles) |
| OpenAPI spec export / AsyncAPI spec | Cut (route handlers are the source of truth) |
| Regulator dashboard (full) | Optional simple page; defer if time is short |
| SAST / DAST / threat model | Cut (basic ESLint security plugin is enough) |

### Simplified (easy version, not production)

| Area | Simplification |
|---|---|
| Auth | NextAuth credentials (email+password) OR a demo-mode toggle |
| RBAC | Two roles max — `commuter` (default) and `operator`. A toggle switches the view. |
| Input validation | Zod on API routes + forms |
| Security headers | `next.config.ts` headers |
| CORS | Same-origin (Next.js serves both); socket.io needs explicit origin |
| Logging | `pino` or structured `console.log` (Vercel captures either) |
| Observability | Vercel dashboard + Sentry |
| Testing | Vitest for unit (calc functions) + a few Playwright e2e |
| CI | GitHub Actions: lint + type-check + build |

---

## 6. Build philosophy

1. **Don't rebuild what works.** The old project's UI (HTML/CSS/JS) is polished and
   functional. Keep it, improve it, don't rewrite it in React.
2. **Rewrite what's broken.** The old backend (Python/FastAPI, 5 SQLite files, daemon
   thread, dead chatbot code, pickle RCE) is rebuilt in Next.js/TypeScript/Prisma.
3. **Same API paths.** The old JS calls `/api/fleet`, `/api/routes`, `/api/chatbot`, etc.
   The new Next.js backend matches these paths so the JS needs minimal changes.
4. **Honest.** Sim data is labeled "SIM". No fake CV. No misleading claims.
5. **Polished where it matters.** The map, chatbot, and trip planner should look great.
6. **Vercel-native.** Next.js API routes, Vercel Postgres, Vercel KV, Vercel Cron.
7. **Fix the seven problems.** Every decision traces back to fixing one of the seven
   original problems.

---

## 7. What success looks like

A deployed Vercel app where:

1. I open the commuter app on my phone → see a live map of Cebu with ~15 jeepneys moving in
   real time, color-coded by occupancy.
2. I tap a jeepney → see its route, ETA to stops, and current occupancy tier.
3. I ask the chatbot "which jeepney is least crowded right now?" → it answers with a real route
   code and real vehicle, no hallucination.
4. I plan a trip from "Colon" to "Ayala" → get ranked multi-leg suggestions with live
   occupancy + ETA.
5. I switch to the operator console → see the fleet table, see alerts, acknowledge one, add a
   vehicle.
6. Everything is fast (no slow server), the map is smooth (no flicker), the design is clean
   (dark mode works, responsive).
7. A "SIM" badge is visible somewhere, honestly labeling the data source.
8. I can put this on my portfolio and explain exactly what I improved and how.

---

## Next

- [`02-architecture.md`](./02-architecture.md) — how the system is structured
- [`03-data-model.md`](./03-data-model.md) — the little things: every field, every type
