import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { cacheGet, cacheSet } from '@/lib/redis'
import { parseAllowedVehicleTypes } from '@/lib/validators'

/**
 * GET /api/v1/routes — list routes, paginated, filterable.
 *
 * Query params:
 *   region, vehicleType, hasLive, countryCode — filters
 *   cursor, limit — pagination
 *
 * See concept/04-features.md C-05 (route directory) + O-04 (operator route list).
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const params = url.searchParams
  const limit = Math.min(Number(params.get('limit') ?? 50), 100)
  const cursor = params.get('cursor') || undefined
  const region = params.get('region') || undefined
  const countryCode = params.get('countryCode') || 'PH'
  const vehicleType = params.get('vehicleType') || undefined

  const where = {
    status: 'active',
    countryCode,
    ...(region && { region }),
  }

  const routes = await db.route.findMany({
    where,
    select: {
      id: true,
      code: true,
      name: true,
      tag: true,
      region: true,
      originName: true,
      destinationName: true,
      distanceKm: true,
      capacity: true,
      allowedVehicleTypes: true,
      routeType: true,
      minFare: true,
      farePerKm: true,
      _count: { select: { vehicles: { where: { status: 'active' } } } },
    },
    take: limit + 1,
    ...(cursor && { skip: 1, cursor: { id: cursor } }),
    orderBy: { code: 'asc' },
  })

  const hasMore = routes.length > limit
  const sliced = hasMore ? routes.slice(0, limit) : routes

  // filter by vehicleType (post-query since allowedVehicleTypes is JSON string in SQLite)
  const filtered = vehicleType
    ? sliced.filter((r) =>
        parseAllowedVehicleTypes(r.allowedVehicleTypes).includes(vehicleType),
      )
    : sliced

  // filter by hasLive (vehicles with online state)
  const hasLive = params.get('hasLive') === 'true'
  let result = filtered.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    tag: r.tag,
    region: r.region,
    originName: r.originName,
    destinationName: r.destinationName,
    distanceKm: r.distanceKm,
    capacity: r.capacity,
    allowedVehicleTypes: parseAllowedVehicleTypes(r.allowedVehicleTypes),
    routeType: r.routeType,
    minFare: r.minFare,
    farePerKm: r.farePerKm,
    vehicleCount: r._count.vehicles,
  }))

  if (hasLive) {
    const liveRouteIds = new Set<string>()
    const states = await db.vehicleState.findMany({
      where: { online: true, vehicle: { status: 'active' } },
      select: { vehicle: { select: { routeId: true } } },
    })
    for (const s of states) liveRouteIds.add(s.vehicle.routeId)
    result = result.filter((r) => liveRouteIds.has(r.id))
  }

  return NextResponse.json({
    routes: result,
    total: result.length,
    hasMore,
    cursor: hasMore ? sliced[sliced.length - 1]?.id ?? null : null,
  })
}
