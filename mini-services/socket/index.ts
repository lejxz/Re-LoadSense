import { createServer } from 'http'
import { Server } from 'socket.io'
import { createAdapter } from '@socket.io/redis-adapter'
import { Redis } from '@upstash/redis'

const PORT = 3001

const kvUrl = process.env.KV_REST_API_URL
const kvToken = process.env.KV_REST_API_TOKEN
let pubClient: Redis | null = null, subClient: Redis | null = null
if (kvUrl && kvToken) { pubClient = new Redis({ url: kvUrl, token: kvToken }); subClient = new Redis({ url: kvUrl, token: kvToken }); console.log('[socket] Redis adapter configured') }
else console.warn('[socket] No KV — single-instance mode, no pub/sub')

const httpServer = createServer((req, res) => {
  if (req.url === '/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ status: 'ok', port: PORT, uptime: process.uptime() })); return }
  res.writeHead(404); res.end('Not found')
})

const io = new Server(httpServer, { cors: { origin: process.env.LOADSENSE_CORS_ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:3000'], methods: ['GET', 'POST'], credentials: true } })
if (pubClient && subClient) io.adapter(createAdapter(pubClient, subClient))

io.on('connection', (socket) => {
  console.log(`[socket] connected: ${socket.id}`)
  socket.on('subscribe', (data: { role?: string; operatorId?: string }) => {
    if (data.role === 'commuter' || !data.role) { socket.join('fleet:PH'); console.log(`[socket] ${socket.id} joined fleet:PH`) }
    if (data.role === 'operator' && data.operatorId) { socket.join(`operator:${data.operatorId}`); console.log(`[socket] ${socket.id} joined operator:${data.operatorId}`) }
    socket.emit('subscribed', { rooms: Array.from(socket.rooms) })
  })
  socket.on('disconnect', (reason) => console.log(`[socket] disconnected: ${socket.id} (${reason})`))
})

if (subClient) {
  const subscriber = new Redis({ url: kvUrl!, token: kvToken! })
  subscriber.subscribe('pubsub:fleet:PH').then(() => console.log('[socket] subscribed to pubsub:fleet:PH'))
  subscriber.subscribe('pubsub:alerts').then(() => console.log('[socket] subscribed to pubsub:alerts'))
  subscriber.on('message', (channel: string, message: string) => {
    try {
      const data = JSON.parse(message)
      if (channel === 'pubsub:fleet:PH') { io.to('fleet:PH').emit('fleet:update', data); console.log(`[socket] emitted fleet:update to fleet:PH`) }
      else if (channel === 'pubsub:alerts') { const opId = data.operatorId ?? 'operator-cebu-transport'; io.to(`operator:${opId}`).emit('alert:new', data); console.log(`[socket] emitted alert:new to operator:${opId}`) }
    } catch (err) { console.error('[socket] parse error:', err) }
  })
} else { console.warn('[socket] No Redis — real-time disabled. Clients use polling.') }

httpServer.listen(PORT, () => { console.log(`[socket] Re-LoadSense socket.io on port ${PORT}`); console.log(`[socket] Health: http://localhost:${PORT}/health`); console.log(`[socket] Client: io("/?XTransformPort=${PORT}")`) })
