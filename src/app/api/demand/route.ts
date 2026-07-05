import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { cacheGet, cacheSet } from '@/lib/redis'
import { apiError } from '@/lib/api-error'
import { forecastDemand } from '@/lib/ml/demand'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET(req: Request) {
  const url = new URL(req.url)
  const routeCode = url.searchParams.get('route') || '04L'
  const cacheKey = `demand:${routeCode}`
  const cached = await cacheGet<string>(cacheKey)
  if (cached) return NextResponse.json(JSON.parse(cached))
  const route = await db.route.findFirst({ where: { OR: [{ code: routeCode }, { tag: routeCode }], status: 'active' }, select: { id: true, code: true, name: true } })
  if (!route) return apiError('not_found', `Route '${routeCode}' not found.`)
  const forecast = forecastDemand(route.id)
  const result = { route: route.code, name: route.name, ...forecast, model: 'historical_mean' }
  await cacheSet(cacheKey, JSON.stringify(result), 3600)
  return NextResponse.json(result)
}
