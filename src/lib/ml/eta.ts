/**
 * ETA (Estimated Time of Arrival) calculation — direction-aware.
 *
 * Formula: eta_seconds = haversine_distance / (speed_mps × traffic_factor)
 *
 * Direction-aware: a backward-traveling vehicle's "remaining stops" are in
 * reverse seq order. See concept/04-features.md Calc-01 + concept/03-data-model.md §4.2.
 */

import { haversineDistance, type LatLng } from '@/lib/geo/haversine'

export interface VehiclePosition {
  lat: number
  lon: number
  speedKph: number
  direction: 'forward' | 'backward'
  positionIndex: number
}

export interface RouteStop extends LatLng {
  seq: number
  stopName?: string | null
}

export interface StopEta {
  stop: RouteStop
  etaSeconds: number
  distanceM: number
}

/**
 * Derive traffic factor from time-of-day.
 * Rush hours (7-9am, 5-7pm) = 1.3 (slower); off-peak = 0.9 (faster); default 1.0.
 */
export function trafficFactorForHour(hour: number): number {
  if (hour >= 7 && hour < 9) return 1.3 // morning rush
  if (hour >= 17 && hour < 19) return 1.3 // evening rush
  if (hour >= 22 || hour < 5) return 0.85 // late night — faster
  if (hour >= 10 && hour < 16) return 0.9 // midday — slightly faster
  return 1.0
}

/**
 * Get the remaining stops for a vehicle based on its direction + position.
 *
 * Forward: stops with seq > positionIndex, ascending.
 * Backward: stops with seq < positionIndex, descending.
 */
export function remainingStops(
  vehicle: VehiclePosition,
  stops: RouteStop[],
): RouteStop[] {
  if (vehicle.direction === 'forward') {
    return stops
      .filter((s) => s.seq > vehicle.positionIndex)
      .sort((a, b) => a.seq - b.seq)
  }
  return stops
    .filter((s) => s.seq < vehicle.positionIndex)
    .sort((a, b) => b.seq - a.seq)
}

/**
 * Calculate ETA to each remaining stop.
 *
 * @param vehicle   current position + speed + direction
 * @param stops     all stops on the route (will be filtered by direction)
 * @param hour      current hour (0-23) for traffic factor
 * @returns         array of { stop, etaSeconds, distanceM } for upcoming stops
 */
export function calculateEta(
  vehicle: VehiclePosition,
  stops: RouteStop[],
  hour: number,
): StopEta[] {
  const upcoming = remainingStops(vehicle, stops)
  const trafficFactor = trafficFactorForHour(hour)
  const speedMps = vehicle.speedKph / 3.6

  if (speedMps <= 0) {
    // vehicle stopped — ETA infinity (return null-ish)
    return upcoming.map((stop) => ({
      stop,
      etaSeconds: Infinity,
      distanceM: haversineDistance(vehicle, stop),
    }))
  }

  return upcoming.map((stop) => {
    const distanceM = haversineDistance(vehicle, stop)
    const etaSeconds = distanceM / (speedMps * trafficFactor)
    return { stop, etaSeconds: Math.round(etaSeconds), distanceM: Math.round(distanceM) }
  })
}

/**
 * Format ETA seconds as a human string ("2 min", "45 sec", "—").
 */
export function formatEta(seconds: number): string {
  if (!isFinite(seconds)) return '—'
  if (seconds < 60) return `${Math.round(seconds)} sec`
  const min = Math.round(seconds / 60)
  return `${min} min`
}
