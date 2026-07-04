/**
 * Re-LoadSense socket.io mini-service
 *
 * Runs on port 3001 (separate from the Next.js app on 3000) because Vercel
 * serverless functions can't hold persistent WebSocket connections.
 *
 * The client connects via `io("/?XTransformPort=3001")` per the gateway
 * constraint — never `io("http://localhost:3001")`.
 *
 * Subscribes to Redis pub/sub channels:
 *   - `pubsub:fleet:PH` — fleet updates (from sim-tick / telemetry ingest)
 *   - `pubsub:alerts:*` — alert updates (from alert service)
 *
 * Emits to rooms:
 *   - `fleet:PH` — all connected commuters (fleet position updates)
 *   - `operator:{id}` — operator-specific alert updates
 *
 * See concept/04-features.md RT-01, RT-02 + concept/06-project-structure.md §6.
 */

import { createServer } from 'http'
import { Server } from 'socket.io'
import { createAdapter } from '@socket.io/redis-adapter'
import { Redis } from '@upstash/redis'

const PORT = 3001

// ── Redis clients for the adapter (pub/sub) ──
const kvUrl = process.env.KV_REST_API_URL
const kvToken = process.env.KV_REST_API_TOKEN

let pubClient: Redis | null = null
let subClient: Redis | null = null

if (kvUrl && kvToken) {
  pubClient = new Redis({ url: kvUrl, token: kvToken })
  subClient = new Redis({ url: kvUrl, token: kvToken })
  console.log('[socket] Redis adapter configured')
} else {
  console.warn('[socket] KV_REST_API_URL not set — running without Redis adapter (single-instance only)')
}

// ── HTTP server + Socket.io ──
const httpServer = createServer((req, res) => {
  // health check
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', port: PORT, uptime: process.uptime() }))
    return
  }
  res.writeHead(404)
  res.end('Not found')
})

const io = new Server(httpServer, {
  cors: {
    origin: process.env.LOADSENSE_CORS_ALLOWED_ORIGINS?.split(',') ?? [
      'http://localhost:3000',
    ],
    methods: ['GET', 'POST'],
    credentials: true,
  },
})

// ── Redis adapter for multi-instance scaling ──
if (pubClient && subClient) {
  io.adapter(createAdapter(pubClient, subClient))
}

// ── Connection handling ──
io.on('connection', (socket) => {
  console.log(`[socket] client connected: ${socket.id}`)

  // Client sends its role + optional bounding box / operator ID
  socket.on('subscribe', (data: { role?: 'commuter' | 'operator'; operatorId?: string; bbox?: unknown }) => {
    // Join fleet room (all commuters get fleet updates)
    if (data.role === 'commuter' || !data.role) {
      socket.join('fleet:PH')
      console.log(`[socket] ${socket.id} joined fleet:PH`)
    }

    // Join operator room (operator-specific alert updates)
    if (data.role === 'operator' && data.operatorId) {
      socket.join(`operator:${data.operatorId}`)
      console.log(`[socket] ${socket.id} joined operator:${data.operatorId}`)
    }

    // Acknowledge subscription
    socket.emit('subscribed', { rooms: Array.from(socket.rooms) })
  })

  // Client can also join a bounding-box tile room for filtered updates
  socket.on('subscribe:bbox', (bbox: { minLat: number; maxLat: number; minLon: number; maxLon: number }) => {
    const tileKey = `tile:${Math.floor(bbox.minLat * 10)}:${Math.floor(bbox.minLon * 10)}`
    socket.join(tileKey)
    console.log(`[socket] ${socket.id} joined ${tileKey}`)
  })

  socket.on('disconnect', (reason) => {
    console.log(`[socket] client disconnected: ${socket.id} (${reason})`)
  })

  socket.on('error', (err) => {
    console.error(`[socket] error from ${socket.id}:`, err)
  })
})

// ── Redis pub/sub subscription (listen for fleet + alert updates) ──
// When the sim-tick or telemetry ingest publishes to Redis, this service
// picks it up and emits to the connected clients.
if (subClient) {
  // Use a separate subscriber connection for pub/sub
  const subscriber = new Redis({ url: kvUrl!, token: kvToken! })

  subscriber.subscribe('pubsub:fleet:PH').then(() => {
    console.log('[socket] subscribed to pubsub:fleet:PH')
  })

  subscriber.subscribe('pubsub:alerts').then(() => {
    console.log('[socket] subscribed to pubsub:alerts')
  })

  subscriber.on('message', (channel: string, message: string) => {
    try {
      const data = JSON.parse(message)

      if (channel === 'pubsub:fleet:PH') {
        // Emit fleet update to all commuters in the fleet room
        io.to('fleet:PH').emit('fleet:update', data)
        console.log(`[socket] emitted fleet:update to fleet:PH (${data.count ?? '?'} vehicles)`)
      } else if (channel === 'pubsub:alerts') {
        // Emit alert to the relevant operator room
        const operatorId = data.operatorId ?? 'operator-cebu-transport'
        io.to(`operator:${operatorId}`).emit('alert:new', data)
        console.log(`[socket] emitted alert:new to operator:${operatorId}`)
      }
    } catch (err) {
      console.error('[socket] failed to parse pub/sub message:', err)
    }
  })
} else {
  // No Redis — poll the Next.js API for fleet updates (fallback)
  console.warn('[socket] No Redis — real-time updates disabled. Clients should use polling.')
}

// ── Start the server ──
httpServer.listen(PORT, () => {
  console.log(`[socket] Re-LoadSense socket.io service running on port ${PORT}`)
  console.log(`[socket] Health check: http://localhost:${PORT}/health`)
  console.log(`[socket] Connect from client: io("/?XTransformPort=${PORT}")`)
})
