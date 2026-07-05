import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { haversineDistance } from '@/lib/geo/haversine'
import { findRoutesNearPoint } from '@/lib/geo/route-match'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  if (!body?.origin || !body?.destination) return NextResponse.json({ error: 'Missing origin/destination' }, { status: 422 })
  const origin = { lat: body.origin.lat, lon: body.origin.lon }
  const dest = { lat: body.destination.lat, lon: body.destination.lon }
  const [originRoutes, destRoutes] = await Promise.all([findRoutesNearPoint(origin), findRoutesNearPoint(dest)])
  if (!originRoutes.length || !destRoutes.length) return NextResponse.json({ suggestions: [], message: 'No routes found near origin or destination.' })
  const suggestions: any[] = []
  for (const or of originRoutes) {
    const dr = destRoutes.find(d => d.routeId === or.routeId)
    if (!dr) continue
    const walkTo = haversineDistance(origin, or.boardingPoint), walkFrom = haversineDistance(dr.boardingPoint, dest)
    const vehicle = await db.vehicleState.findFirst({ where: { online: true, vehicle: { routeId: or.routeId, status: 'active' } }, include: { vehicle: { select: { vehicleCode: true, capacity: true, route: { select: { code: true, name: true } } } } } })
    const rideMin = vehicle ? Math.max(5, haversineDistance(or.boardingPoint, dr.boardingPoint) / ((vehicle.speedKph || 30) * 1000 / 60)) : 15
    suggestions.push({ id: `trip-${or.routeCode}`, legs: [{ type: 'walk', distanceM: Math.round(walkTo), durationMin: Math.round(walkTo / 1.4 / 60) }, { type: 'board', routeCode: or.routeCode, routeName: or.routeName, vehicleCode: vehicle?.vehicle.vehicleCode, occupancy: vehicle?.occupancy, capacity: vehicle?.vehicle.capacity, tier: vehicle?.tier, etaMin: Math.round(rideMin), boardingPoint: or.boardingPoint, alightingPoint: dr.boardingPoint }, { type: 'walk', distanceM: Math.round(walkFrom), durationMin: Math.round(walkFrom / 1.4 / 60) }], totalDurationMin: Math.round(walkTo / 1.4 / 60 + rideMin + walkFrom / 1.4 / 60), totalWalkingM: Math.round(walkTo + walkFrom), transfers: 0, score: Math.round(walkTo / 1.4 / 60 + rideMin + walkFrom / 1.4 / 60) })
  }
  suggestions.sort((a, b) => a.score - b.score)
  return NextResponse.json({ suggestions: suggestions.slice(0, 5), count: suggestions.length })
}
