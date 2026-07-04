import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { cacheGet, cacheSet } from '@/lib/redis'
import { apiError } from '@/lib/api-error'
import { parseAllowedVehicleTypes } from '@/lib/validators'
import { polylineLength } from '@/lib/geo/haversine'

/**
 * GET /api/v1/routes/:routeId — route detail with polyline + stops.
 * Redis-cached (1h TTL). Accepts id or code.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CACHE_TTL = 3600 // 1 hour

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ routeId: string }> },
) {
  const { routeId } = await params

  // try cache
  const cacheKey = `route:${routeId}:detail`
  const cached = await cacheGet<string>(cacheKey)
  if (cached) {
    return NextResponse.json(JSON.parse(cached))
  }

  const route = await db.route.findFirst({
    where: {
      OR: [{ id: routeId }, { code: routeId }],
      status: 'active',
    },
    include: {
      points: { orderBy: { seq: 'asc' } },
      _count: { select: { vehicles: { where: { status: 'active' } } } },
    },
  })

  if (!route) {
    return apiError('not_found', `Route '${routeId}' not found.`)
  }

  // derive polyline + stops
  const polyline = route.points.map((p) => ({ lat: p.lat, lon: p.lon }))
  const stops = route.points
    .filter((p) => p.isStop)
    .map((p) => ({ seq: p.seq, lat: p.lat, lon: p.lon, stopName: p.stopName }))

  // compute distance if not set
  let distanceKm = route.distanceKm
  if (distanceKm === null && polyline.length >= 2) {
    distanceKm = Math.round((polylineLength(polyline) / 1000) * 100) / 100
    await db.route.update({ where: { id: route.id }, data: { distanceKm } })
  }

  const result = {
    id: route.id,
    code: route.code,
    name: route.name,
    tag: route.tag,
    region: route.region,
    originName: route.originName,
    destinationName: route.destinationName,
    distanceKm,
    capacity: route.capacity,
    allowedVehicleTypes: parseAllowedVehicleTypes(route.allowedVehicleTypes),
    routeType: route.routeType,
    minFare: route.minFare,
    farePerKm: route.farePerKm,
    polyline,
    stops,
    vehicleCount: route._count.vehicles,
  }

  // cache it
  await cacheSet(cacheKey, JSON.stringify(result), CACHE_TTL)

  return NextResponse.json(result)
}
