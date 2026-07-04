import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { redis } from '@/lib/redis'

/**
 * Readiness probe — all dependencies reachable.
 * Returns 200 if DB + Redis are up; 503 if any is down.
 * See concept/04-features.md X-03.
 */
export const runtime = 'nodejs'

const CHECK_TIMEOUT_MS = 2000

async function checkDb(): Promise<boolean> {
  try {
    await Promise.race([
      db.$queryRaw`SELECT 1`,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('DB timeout')), CHECK_TIMEOUT_MS),
      ),
    ])
    return true
  } catch {
    return false
  }
}

async function checkRedis(): Promise<boolean> {
  if (!redis) return true // dev without KV is OK (caching disabled gracefully)
  try {
    await Promise.race([
      redis.ping(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Redis timeout')), CHECK_TIMEOUT_MS),
      ),
    ])
    return true
  } catch {
    return false
  }
}

export async function GET() {
  const [dbOk, redisOk] = await Promise.all([checkDb(), checkRedis()])

  const checks = { db: dbOk, redis: redisOk }
  const allOk = dbOk && redisOk

  return NextResponse.json(
    {
      status: allOk ? 'ready' : 'degraded',
      checks,
      timestamp: new Date().toISOString(),
    },
    { status: allOk ? 200 : 503 },
  )
}
