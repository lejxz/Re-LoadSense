# Re-LoadSense Socket.io Mini-Service

> Real-time WebSocket service for live fleet + alert updates.

## Why a separate service?

Vercel serverless functions (which run the Next.js app) are short-lived request
handlers — they can't hold persistent WebSocket connections. So the socket.io
service runs as a separate process on port 3001.

## The gateway constraint

The sandbox/preview environment routes all external traffic through a single
gateway. To reach a different port, the client adds `?XTransformPort=3001` to
the connection URL:

```ts
// ✅ Correct — uses the gateway mechanism
io("/?XTransformPort=3001")

// ❌ Wrong — won't work in the sandbox/preview
io("http://localhost:3001")
```

This is documented in the project's gateway constraints.

## How it works

```
sim-tick cron → writes telemetry to DB + Redis
              → publishes to Redis `pubsub:fleet:PH`
                                    ↓
              socket.io service (this) subscribes to Redis
                                    ↓
              emits `fleet:update` to all clients in `fleet:PH` room
                                    ↓
              client hook (use-fleet-socket) invalidates TanStack Query
              → fleet refetches from API (Redis-cached, sub-ms)
              → markers update in place (no flicker)
```

## Rooms

| Room | Who joins | What they receive |
|---|---|---|
| `fleet:PH` | All commuters | `fleet:update` events (position + tier changes) |
| `operator:{id}` | Operator console | `alert:new` events (new alerts for their fleet) |
| `tile:{lat*10}:{lon*10}` | Commuters (optional) | Bounding-box-filtered updates (for large fleets) |

## Running locally

```bash
# From the project root:
bun run dev:ws

# Or directly:
cd mini-services/socket && bun run dev
```

The service starts on port 3001. Health check: `http://localhost:3001/health`

## Running both the app + the socket service

```bash
bun run dev:all
# (uses `concurrently` to run `bun run dev` + `bun run dev:ws` in parallel)
```

## Deployment options (production)

This service needs a persistent process host (not Vercel serverless). Options:

1. **Render.com** (free tier) — Web Service, `bun start`, 512MB RAM, free
2. **Railway** — `bun start`, small instance
3. **Fly.io** — `bun start`, tiny machine

Set these env vars on the host:
- `KV_REST_API_URL` — from Vercel KV dashboard
- `KV_REST_API_TOKEN` — from Vercel KV dashboard
- `LOADSENSE_CORS_ALLOWED_ORIGINS` — your Vercel app URL

## Fallback (if no socket.io host)

If you can't deploy the socket.io service, the client falls back to TanStack
Query polling (5s interval). The map still works — just less smooth. The
`use-fleet-socket.ts` hook handles reconnection gracefully; if the socket
can't connect, it silently falls back to the query's polling.
