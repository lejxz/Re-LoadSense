import { Redis } from '@upstash/redis'

/**
 * Vercel KV (Redis) client.
 *
 * In dev without KV_REST_API_URL set, falls back to null — callers should check
 * `redis` before use, or use the `cacheGet`/`cacheSet` helpers which no-op gracefully.
 *
 * In production (Vercel), set KV_REST_API_URL + KV_REST_API_TOKEN in the Vercel dashboard.
 */

declare global {
   
  var __redis: Redis | null | undefined
}

function createRedis(): Redis | null {
  const url = process.env.KV_REST_API_URL
  const token = process.env.KV_REST_API_TOKEN
  if (!url || !token) {
    if (process.env.NODE_ENV !== 'production') {
       
      console.warn('[redis] KV_REST_API_URL not set — caching disabled in dev')
    }
    return null
  }
  return new Redis({ url, token })
}

export const redis: Redis | null =
  globalThis.__redis ?? (globalThis.__redis = createRedis())

/**
 * Cache get — returns null on miss or if Redis is unavailable.
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  if (!redis) return null
  try {
    return (await redis.get<T>(key)) ?? null
  } catch (err) {
    console.error('[redis] get failed:', err)
    return null
  }
}

/**
 * Cache set — no-ops if Redis is unavailable.
 */
export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds?: number,
): Promise<void> {
  if (!redis) return
  try {
    if (ttlSeconds) {
      await redis.set(key, value, { ex: ttlSeconds })
    } else {
      await redis.set(key, value)
    }
  } catch (err) {
    console.error('[redis] set failed:', err)
  }
}

/**
 * Cache delete — no-ops if Redis is unavailable.
 */
export async function cacheDel(key: string): Promise<void> {
  if (!redis) return
  try {
    await redis.del(key)
  } catch (err) {
    console.error('[redis] del failed:', err)
  }
}
