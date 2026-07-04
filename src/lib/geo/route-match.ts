/**
 * Route matching — find routes whose polyline passes near a point.
 * Used by the trip planner to match origin/destination to routes.
 *
 * See concept/04-features.md C-04 + concept/03-data-model.md §6.
 */

import { db } from '@/lib/db'
import { distanceToPolyline } from "@/lib/geo/bbox"
import type { LatLng } from "@/lib/geo/haversine"
import { parseAllowedVehicleTypes } from '@/lib/validators'

export interface RouteMatch {
  routeId: string
  routeCode: string
  routeName: string
  originName: string | null
  destinationName: string | null
  routeType: string
  allowedVehicleTypes: string[]
  distanceM: number
  /** the closest point on the route to the query point */
  boardingPoint: LatLng
  /** the seq index of the closest point */
  boardingSeq: number
}

const DEFAULT_RADIUS_M = 500

/**
 * Find routes whose polyline passes within `radiusM` of the given point.
 */
export async function findRoutesNearPoint(
  point: LatLng,
  countryCode = 'PH',
  radiusM = DEFAULT_RADIUS_M,
): Promise<RouteMatch[]> {
  // load all active routes with their points
  const routes = await db.route.findMany({
    where: { status: 'active', countryCode },
    include: { points: { orderBy: { seq: 'asc' } } },
  })

  const matches: RouteMatch[] = []

  for (const route of routes) {
    if (route.points.length < 2) continue
    const polyline: LatLng[] = route.points.map((p) => ({ lat: p.lat, lon: p.lon }))

    // find the closest point on the route
    let minDist = Infinity
    let closestPoint: LatLng = polyline[0]!
    let closestSeq = 0

    for (let i = 0; i < polyline.length; i++) {
      const p = polyline[i]!
      const dx = p.lat - point.lat
      const dy = p.lon - point.lon
      const d = Math.hypot(dx, dy) * 111_320 // rough meters
      if (d < minDist) {
        minDist = d
        closestPoint = p
        closestSeq = i
      }
    }

    if (minDist <= radiusM) {
      matches.push({
        routeId: route.id,
        routeCode: route.code,
        routeName: route.name,
        originName: route.originName,
        destinationName: route.destinationName,
        routeType: route.routeType,
        allowedVehicleTypes: parseAllowedVehicleTypes(route.allowedVehicleTypes),
        distanceM: Math.round(minDist),
        boardingPoint: closestPoint,
        boardingSeq: closestSeq,
      })
    }
  }

  // sort by distance (closest first)
  matches.sort((a, b) => a.distanceM - b.distanceM)
  return matches
}
