import { db } from '@/lib/db'
import { parseAllowedVehicleTypes } from '@/lib/validators'
import type { LatLng } from './haversine'
export interface RouteMatch { routeId: string; routeCode: string; routeName: string; originName: string | null; destinationName: string | null; routeType: string; allowedVehicleTypes: string[]; distanceM: number; boardingPoint: LatLng; boardingSeq: number }
const DEFAULT_RADIUS_M = 500
export async function findRoutesNearPoint(point: LatLng, countryCode = 'PH', radiusM = DEFAULT_RADIUS_M): Promise<RouteMatch[]> {
  const routes = await db.route.findMany({ where: { status: 'active', countryCode }, include: { points: { orderBy: { seq: 'asc' } } } })
  const matches: RouteMatch[] = []
  for (const route of routes) {
    if (route.points.length < 2) continue
    const polyline: LatLng[] = route.points.map(p => ({ lat: p.lat, lon: p.lon }))
    let minDist = Infinity, closestPoint: LatLng = polyline[0]!, closestSeq = 0
    for (let i = 0; i < polyline.length; i++) { const p = polyline[i]!; const d = Math.hypot(p.lat - point.lat, p.lon - point.lon) * 111320; if (d < minDist) { minDist = d; closestPoint = p; closestSeq = i } }
    if (minDist <= radiusM) matches.push({ routeId: route.id, routeCode: route.code, routeName: route.name, originName: route.originName, destinationName: route.destinationName, routeType: route.routeType, allowedVehicleTypes: parseAllowedVehicleTypes(route.allowedVehicleTypes), distanceM: Math.round(minDist), boardingPoint: closestPoint, boardingSeq: closestSeq })
  }
  matches.sort((a, b) => a.distanceM - b.distanceM)
  return matches
}
