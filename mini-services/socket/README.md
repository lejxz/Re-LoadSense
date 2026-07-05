# Re-LoadSense Socket.io Mini-Service

Runs on port 3001. Connect via `io("/?XTransformPort=3001")`.

## Why separate?
Vercel serverless can't hold persistent WebSocket connections.

## Run
```bash
bun run dev:ws  # from project root
cd mini-services/socket && bun run dev  # direct
```

## Deploy
Render.com / Railway / Fly.io (needs persistent process). Set KV_REST_API_URL + KV_REST_API_TOKEN.

## Fallback
Without this service, the old JS polls every 3-30s. The map still works, just less smooth.
