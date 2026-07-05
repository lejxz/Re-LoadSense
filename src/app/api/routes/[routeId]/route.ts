import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { cacheGet, cacheSet } from '@/lib/redis'
import { apiError } from '@/lib/api-error'
import { parseAllowedVehicleTypes } from '@/lib/validators'
import { polylineLength } from '@/lib/geo/haversine'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET(_req: Request, { params }: { params: Promise<{ routeId: string }> }) {
  const { routeId } = await params
  const cacheKey = `route:${routeId}:detail`
  const cached = await cacheGet<string>(cacheKey)
  if (cached) return NextResponse.json(JSON.parse(cached))
  const route = await db.route.findFirst({ where: { OR: [{ id: routeId }, { code: routeId }], status: 'active' }, include: { points: { orderBy: { seq: 'asc' } } } })
  if (!route) return apiError('not_found', `Route '${routeId}' not found.`)
  const polyline = route.points.map(p => ({ latitude: p.lat, longitude: p.lon, is_stop: p.isStop, stop_name: p.stopName, seq: p.seq }))
  let distanceKm = route.distanceKm
  if (distanceKm === null && polyline.length >= 2) { distanceKm = Math.round((polylineLength(polyline.map(p => ({ lat: p.latitude, lon: p.longitude }))) / 1000) * 100) / 100 }
  const result = {
    route: route.code, name: route.name, country: route.countryCode, region: route.region,
    tag: route.tag, route_type: route.routeType === 'linear' ? 'PUJ' : 'BUS',
    origin_name: route.originName, destination_name: route.destinationName,
    distance_km: distanceKm, description: '', minimum_fare: route.minFare, fare_per_km: route.farePerKm,
    allowedVehicleTypes: parseAllowedVehicleTypes(route.allowedVehicleTypes), routeType: route.routeType,
    polyline,
  }
  await cacheSet(cacheKey, JSON.stringify(result), 3600)
  return NextResponse.json(result)
}
