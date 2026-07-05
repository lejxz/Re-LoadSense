import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { redis } from '@/lib/redis'

export const runtime = 'nodejs'

async function checkDb(): Promise<boolean> {
  try {
    await Promise.race([db.$queryRaw`SELECT 1`, new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 2000))])
    return true
  } catch { return false }
}

async function checkRedis(): Promise<boolean> {
  if (!redis) return true
  try { await Promise.race([redis.ping(), new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 2000))]); return true } catch { return false }
}

export async function GET() {
  const [dbOk, redisOk] = await Promise.all([checkDb(), checkRedis()])
  const allOk = dbOk && redisOk
  return NextResponse.json({ status: allOk ? 'ready' : 'degraded', checks: { db: dbOk, redis: redisOk }, timestamp: new Date().toISOString() }, { status: allOk ? 200 : 503 })
}
