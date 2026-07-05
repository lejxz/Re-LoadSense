import { Redis } from '@upstash/redis'

declare global {
  var __redis: Redis | null | undefined
}

function createRedis(): Redis | null {
  const url = process.env.KV_REST_API_URL
  const token = process.env.KV_REST_API_TOKEN
  if (!url || !token) return null
  return new Redis({ url, token })
}

export const redis: Redis | null = globalThis.__redis ?? (globalThis.__redis = createRedis())

export async function cacheGet<T>(key: string): Promise<T | null> {
  if (!redis) return null
  try { return (await redis.get<T>(key)) ?? null } catch { return null }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
  if (!redis) return
  try { ttlSeconds ? await redis.set(key, value, { ex: ttlSeconds }) : await redis.set(key, value) } catch {}
}

export async function cacheDel(key: string): Promise<void> {
  if (!redis) return
  try { await redis.del(key) } catch {}
}
