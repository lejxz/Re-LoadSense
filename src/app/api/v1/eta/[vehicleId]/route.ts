import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { cacheGet, cacheSet } from '@/lib/redis'
import { apiError } from '@/lib/api-error'
import { calculateEta, formatEta, type VehiclePosition, type RouteStop } from '@/lib/ml/eta'

/**
 * GET /api/v1/eta/:vehicleId — ETA to remaining stops (direction-aware).
 * Cached in Redis (30s TTL). See concept/04-features.md C-02 + Calc-01.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CACHE_TTL = 30

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ vehicleId: string }> },
) {
  const { vehicleId } = await params

  // try cache
  const cacheKey = `eta:${vehicleId}`
  const cached = await cacheGet<string>(cacheKey)
  if (cached) return NextResponse.json(JSON.parse(cached))

  // load vehicle + state + route stops
  const vehicle = await db.vehicle.findFirst({
    where: { OR: [{ id: vehicleId }, { vehicleCode: vehicleId }], status: 'active' },
    include: { state: true, route: { include: { points: { where: { isStop: true }, orderBy: { seq: 'asc' } } } } },
  })
  if (!vehicle) return apiError('not_found', `Vehicle '${vehicleId}' not found.`)
  if (!vehicle.state) return apiError('not_found', `No state for vehicle '${vehicleId}'.`)

  const vp: VehiclePosition = {
    lat: vehicle.state.lat,
    lon: vehicle.state.lon,
    speedKph: vehicle.state.speedKph,
    direction: vehicle.state.direction as 'forward' | 'backward',
    positionIndex: vehicle.state.positionIndex,
  }

  const stops: RouteStop[] = vehicle.route.points.map((p) => ({
    lat: p.lat,
    lon: p.lon,
    seq: p.seq,
    stopName: p.stopName,
  }))

  const hour = new Date().getHours()
  const etaResults = calculateEta(vp, stops, hour)

  const result = {
    vehicleId: vehicle.id,
    vehicleCode: vehicle.vehicleCode,
    direction: vp.direction,
    stops: etaResults.map((e) => ({
      seq: e.stop.seq,
      stopName: e.stop.stopName,
      lat: e.stop.lat,
      lon: e.stop.lon,
      etaSeconds: e.etaSeconds,
      etaFormatted: formatEta(e.etaSeconds),
      distanceM: e.distanceM,
    })),
    cached: false,
    source: 'heuristic',
  }

  await cacheSet(cacheKey, JSON.stringify(result), CACHE_TTL)
  return NextResponse.json(result)
}
