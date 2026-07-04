# 06 — Project Structure

> Hybrid: existing HTML/CSS/JS frontend (from old project) + new Next.js 16 backend.

---

## Table of contents

1. [Directory tree](#1-directory-tree)
2. [Key files explained](#2-key-files-explained)
3. [How the old JS talks to the new backend](#3-how-the-old-js-talks-to-the-new-backend)

---

## 1. Directory tree

```
re-loadsense/
├── package.json
├── tsconfig.json
├── next.config.ts
├── vercel.json
├── .env.example
├── .env.local                 # gitignored
├── prisma/
│   ├── schema.prisma          # 13-model DB schema (see 03-data-model.md)
│   ├── seed.ts                # Seeds 8 Cebu routes + 16 vehicles + 2 users
│   └── migrations/
│
├── public/
│   └── app/                   # ── OLD PROJECT FRONTEND (kept as-is) ──
│       ├── mobile.html        # Commuter UI (4 tabs + new 5th Menu tab)
│       ├── operator.html      # Operator console
│       ├── index.html         # Landing portal
│       ├── favicon.ico
│       ├── css/
│       │   ├── variables.css  # Design tokens (--teal, --wash, --panel, etc.)
│       │   ├── base.css       # Typography, resets
│       │   ├── components.css  # Buttons, pills, modals, toasts
│       │   ├── mobile.css     # Phone frame, tabs, hero card, chat
│       │   ├── map.css        # Map layout, markers, legend
│       │   ├── operator.css   # Operator console layout
│       │   └── portal.css     # Landing portal
│       ├── js/
│       │   ├── core.js        # Shared state + API helper (const api = origin + '/api')
│       │   ├── data.js        # Data fetching + dirty-checking
│       │   ├── map.js         # Leaflet map + markers + polylines + clustering
│       │   ├── mobile.js      # Commuter app logic (tabs, home, routes, chat)
│       │   ├── operator.js    # Operator console logic
│       │   ├── places.js      # Place search (Photon proxy)
│       │   ├── alerts.js      # Alert submission
│       │   ├── routes-admin.js # Route/vehicle CRUD admin
│       │   ├── socket.js      # NEW: socket.io-client integration
│       │   └── main.js        # Entry point
│       └── vendor/
│           └── leaflet/       # Vendored Leaflet + markercluster
│
├── mini-services/
│   └── socket/                # socket.io mini-service (port 3001)
│       ├── package.json
│       ├── index.ts
│       └── README.md
│
└── src/
    ├── app/
    │   ├── layout.tsx         # Root layout (providers)
    │   ├── page.tsx           # Redirects to /app/mobile.html
    │   └── api/               # ── NEW NEXT.JS BACKEND ──
    │       ├── health/        # GET /api/health
    │       ├── ready/         # GET /api/ready
    │       ├── cron/
    │       │   └── sim-tick/  # POST /api/cron/sim-tick (Vercel Cron)
    │       └── v1/            # Versioned API (or unversioned to match old paths)
    │           ├── fleet/     # GET /api/fleet, /api/fleet/:id
    │           ├── routes/    # GET /api/routes, /api/routes/:id
    │           ├── eta/       # GET /api/eta/:id
    │           ├── demand/    # GET /api/demand
    │           ├── alerts/    # GET /api/alerts + POST verify/ack/false-alarm
    │           ├── chatbot/   # POST /api/chatbot
    │           ├── places/    # GET /api/places
    │           ├── trip-suggestions/ # POST /api/trip-suggestions
    │           ├── edge/
    │           │   └── telemetry/ # POST /api/edge/telemetry
    │           └── admin/
    │               ├── vehicles/ # CRUD with type constraint
    │               └── routes/    # CRUD with 409 on used-type removal
    │
    ├── lib/
    │   ├── db.ts              # Prisma client singleton
    │   ├── redis.ts           # Vercel KV client
    │   ├── config.ts          # Typed env config
    │   ├── logger.ts          # pino structured logger
    │   ├── api-error.ts       # Consistent error response helper
    │   ├── validators.ts      # Zod schemas (shared)
    │   ├── simulator.ts       # Seeded synthetic fleet engine
    │   ├── map-themes.ts      # 5 tile provider configs
    │   ├── ml/
    │   │   ├── eta.ts         # ETA = distance / (speed × traffic_factor)
    │   │   ├── demand.ts      # Seeded historical mean
    │   │   └── occupancy.ts   # 4-tier with hysteresis
    │   ├── geo/
    │   │   ├── haversine.ts   # Distance between lat/lon
    │   │   ├── bearing.ts     # Compass heading + point interpolation
    │   │   ├── bbox.ts        # Bounding-box + geofence
    │   │   └── route-match.ts # Match GPS to route polyline
    │   ├── edge/
    │   │   └── line-counter.ts # Real counting algorithm (honest sim)
    │   └── services/
    │       ├── fleet-service.ts
    │       ├── alert-service.ts
    │       ├── chatbot-service.ts
    │       ├── trip-service.ts
    │       ├── geocode-service.ts
    │       └── telemetry-service.ts
    │
    └── types/
        └── index.ts          # Shared TS types
│
└── tests/
    └── unit/
        └── lib/
            ├── eta.test.ts
            ├── demand.test.ts
            ├── occupancy.test.ts
            └── simulator.test.ts
```

---

## 2. Key files explained

| File | Purpose | Source |
|---|---|---|
| `public/app/js/core.js` | Shared state + `const api = origin + '/api'` | Old project (kept) |
| `public/app/js/map.js` | Leaflet map, markers, polylines, clustering | Old project (kept + improved) |
| `public/app/js/mobile.js` | Commuter app logic (tabs, home, routes, chat) | Old project (kept + 5th tab added) |
| `public/app/css/mobile.css` | Phone frame, tabs, hero card, chat styling | Old project (kept) |
| `prisma/schema.prisma` | 13-model DB schema | New (from concept) |
| `src/lib/simulator.ts` | Seeded fleet engine | New (replaces demo_simulator.py) |
| `src/lib/services/chatbot-service.ts` | Grounded heuristic chatbot | New (consolidates 5 old files) |
| `src/app/api/` | All REST API routes | New (replaces FastAPI routes.py) |
| `mini-services/socket/index.ts` | socket.io live updates | New |

---

## 3. How the old JS talks to the new backend

The old JS files use a simple pattern in `core.js`:

```js
const api = `${location.origin}/api`;
// ...
const response = await fetch(api + path, options);
```

This means calls like `fetch(api + '/fleet')` resolve to `http://localhost:3000/api/fleet` —
which is exactly where the new Next.js API route `src/app/api/fleet/route.ts` serves.

**Key principle:** the new API routes match the old `/api/...` paths. Where response shapes
differ (new fields like `direction`, `vehicleType`), the old JS is updated to consume them.
Where the old API had paths the new one doesn't (e.g., `/api/database/reset`), those are
simply not implemented (they were unauthenticated destructive endpoints — good riddance).
