/**
 * Trip planning service — multi-leg journey suggestions.
 *
 * Given an origin + destination, finds routes near both, computes legs
 * (walk → board → alight → walk), ranks by total time.
 *
 * See concept/04-features.md C-04.
 */

import { db } from '@/lib/db'
import { haversineDistance, type LatLng } from '@/lib/geo/haversine'
import { findRoutesNearPoint } from '@/lib/geo/route-match'
import { calculateEta } from '@/lib/ml/eta'
import type { RouteMatch } from '@/lib/geo/route-match'

export interface TripLeg {
  type: 'walk' | 'board'
  // for walk legs
  distanceM?: number
  durationMin?: number
  // for board legs
  routeCode?: string
  routeName?: string
  vehicleCode?: string
  occupancy?: number
  capacity?: number
  tier?: string
  etaMin?: number
  boardingPoint?: LatLng
  alightingPoint?: LatLng
}

export interface TripSuggestion {
  id: string
  legs: TripLeg[]
  totalDurationMin: number
  totalWalkingM: number
  transfers: number
  score: number // lower = better
}

const WALK_SPEED_MPS = 1.4 // ~5 km/h

/**
 * Plan a trip from origin to destination.
 */
export async function planTrip(
  origin: LatLng,
  destination: LatLng,
  originName?: string,
  destinationName?: string,
): Promise<TripSuggestion[]> {
  // 1. Find routes near origin + destination
  const [originRoutes, destRoutes] = await Promise.all([
    findRoutesNearPoint(origin),
    findRoutesNearPoint(destination),
  ])

  if (originRoutes.length === 0 || destRoutes.length === 0) {
    return []
  }

  const suggestions: TripSuggestion[] = []

  // 2. Single-leg trips (same route serves both)
  const singleRouteIds = new Set(
    originRoutes.filter((or) => destRoutes.some((dr) => dr.routeId === or.routeId)).map((r) => r.routeId),
  )

  for (const or of originRoutes) {
    if (!singleRouteIds.has(or.routeId)) continue
    const dr = destRoutes.find((d) => d.routeId === or.routeId)!

    const walkToStop = haversineDistance(origin, or.boardingPoint)
    const walkFromStop = haversineDistance(dr.boardingPoint, destination)
    const walkToMin = (walkToStop / WALK_SPEED_MPS) / 60
    const walkFromMin = (walkFromStop / WALK_SPEED_MPS) / 60

    // find a live vehicle on this route for ETA + occupancy
    const vehicle = await db.vehicleState.findFirst({
      where: { online: true, vehicle: { routeId: or.routeId, status: 'active' } },
      include: { vehicle: { select: { vehicleCode: true, capacity: true, route: { select: { code: true, name: true } } } } },
    })

    const rideMin = vehicle ? Math.max(5, haversineDistance(or.boardingPoint, dr.boardingPoint) / ((vehicle.speedKph || 30) * 1000 / 60)) : 15

    const legs: TripLeg[] = [
      { type: 'walk', distanceM: Math.round(walkToStop), durationMin: Math.round(walkToMin) },
      {
        type: 'board',
        routeCode: or.routeCode,
        routeName: or.routeName,
        vehicleCode: vehicle?.vehicle.vehicleCode,
        occupancy: vehicle?.occupancy,
        capacity: vehicle?.vehicle.capacity,
        tier: vehicle?.tier,
        etaMin: Math.round(rideMin),
        boardingPoint: or.boardingPoint,
        alightingPoint: dr.boardingPoint,
      },
      { type: 'walk', distanceM: Math.round(walkFromStop), durationMin: Math.round(walkFromMin) },
    ]

    const totalDurationMin = Math.round(walkToMin + rideMin + walkFromMin)
    const totalWalkingM = Math.round(walkToStop + walkFromStop)

    suggestions.push({
      id: `trip-${or.routeCode}-direct`,
      legs,
      totalDurationMin,
      totalWalkingM,
      transfers: 0,
      score: totalDurationMin,
    })
  }

  // 3. Sort by score (total time)
  suggestions.sort((a, b) => a.score - b.score)

  // return top 5
  return suggestions.slice(0, 5)
}
