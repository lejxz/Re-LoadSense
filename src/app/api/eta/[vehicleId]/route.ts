import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { cacheGet, cacheSet } from '@/lib/redis'
import { apiError } from '@/lib/api-error'
import { calculateEta, formatEta, type VehiclePosition, type RouteStop } from '@/lib/ml/eta'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET(req: Request, { params }: { params: Promise<{ vehicleId: string }> }) {
  const { vehicleId } = await params
  const url = new URL(req.url)
  const stopId = parseInt(url.searchParams.get('stop_id') || '0')
  const cacheKey = `eta:${vehicleId}:${stopId}`
  const cached = await cacheGet<string>(cacheKey)
  if (cached) return NextResponse.json(JSON.parse(cached))
  const vehicle = await db.vehicle.findFirst({ where: { OR: [{ id: vehicleId }, { vehicleCode: vehicleId }], status: 'active' }, include: { state: true, route: { include: { points: { where: { isStop: true }, orderBy: { seq: 'asc' } } } } } })
  if (!vehicle) return apiError('not_found', `Vehicle '${vehicleId}' not found.`)
  if (!vehicle.state) return apiError('not_found', `No state for vehicle '${vehicleId}'.`)
  const vp: VehiclePosition = { lat: vehicle.state.lat, lon: vehicle.state.lon, speedKph: vehicle.state.speedKph, direction: vehicle.state.direction as 'forward' | 'backward', positionIndex: vehicle.state.positionIndex }
  const stops: RouteStop[] = vehicle.route.points.map(p => ({ lat: p.lat, lon: p.lon, seq: p.seq, stopName: p.stopName }))
  const hour = new Date().getHours()
  const etas = calculateEta(vp, stops, hour)
  const result = { vehicle_id: vehicle.vehicleCode, direction: vp.direction, stops: etas.map(e => ({ seq: e.stop.seq, stop_name: e.stop.stopName, lat: e.stop.lat, lon: e.stop.lon, eta_seconds: e.etaSeconds, eta_formatted: formatEta(e.etaSeconds), distance_m: e.distanceM })), source: 'heuristic' }
  await cacheSet(cacheKey, JSON.stringify(result), 30)
  return NextResponse.json(result)
}
