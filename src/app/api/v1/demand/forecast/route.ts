import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { cacheGet, cacheSet } from '@/lib/redis'
import { apiError } from '@/lib/api-error'
import { forecastDemand } from '@/lib/ml/demand'

/**
 * GET /api/v1/demand/forecast?route=04L — demand forecast per route × hour.
 * Cached (1h TTL). Honest `source: "historical_mean"` label.
 * See concept/04-features.md Calc-02.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CACHE_TTL = 3600

export async function GET(req: Request) {
  const url = new URL(req.url)
  const routeCode = url.searchParams.get('route')
  if (!routeCode) return apiError('validation_error', 'Missing `route` query param.')

  // try cache
  const cacheKey = `demand:${routeCode}`
  const cached = await cacheGet<string>(cacheKey)
  if (cached) return NextResponse.json(JSON.parse(cached))

  // verify route exists
  const route = await db.route.findFirst({
    where: { OR: [{ code: routeCode }, { tag: routeCode }], status: 'active' },
    select: { id: true, code: true, name: true },
  })
  if (!route) return apiError('not_found', `Route '${routeCode}' not found.`)

  const forecast = forecastDemand(route.id)

  const result = {
    routeCode: route.code,
    routeName: route.name,
    ...forecast,
    cached: false,
  }

  await cacheSet(cacheKey, JSON.stringify(result), CACHE_TTL)
  return NextResponse.json(result)
}
