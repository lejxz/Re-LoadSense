/**
 * Bearing (compass heading) from point A to point B, in degrees [0, 360).
 *
 * Used by the simulator to compute `heading` for each vehicle, so map markers
 * can show a direction arrow pointing the right way.
 *
 * See concept/03-data-model.md §4.2.
 */

import type { LatLng } from './haversine'

export function bearing(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const toDeg = (rad: number) => (rad * 180) / Math.PI

  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const dLon = toRad(b.lon - a.lon)

  const y = Math.sin(dLon) * Math.cos(lat2)
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)

  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

/**
 * Interpolate a point at a given ratio (0..1) along a polyline.
 * Returns the {lat, lon, heading} at that position.
 *
 * The simulator uses this to place a vehicle at `progress` along its route.
 * For `backward` direction, the ratio is inverted (1 - progress) and the
 * heading is reversed (bearing of the reversed segment).
 */
export function pointAtRatio(
  points: LatLng[],
  ratio: number,
  direction: 'forward' | 'backward' = 'forward',
): { lat: number; lon: number; heading: number } {
  if (points.length === 0) return { lat: 0, lon: 0, heading: 0 }
  if (points.length === 1) return { lat: points[0]!.lat, lon: points[0]!.lon, heading: 0 }

  const r = direction === 'backward' ? 1 - ratio : ratio

  // compute cumulative distances
  const dists: number[] = [0]
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!
    const curr = points[i]!
    // cheap distance for interpolation (fine for short segments)
    const dLat = curr.lat - prev.lat
    const dLon = curr.lon - prev.lon
    dists.push(dists[dists.length - 1]! + Math.hypot(dLat, dLon))
  }

  const total = dists[dists.length - 1]!
  if (total === 0) return { lat: points[0]!.lat, lon: points[0]!.lon, heading: 0 }

  const target = r * total
  let i = 1
  while (i < dists.length && dists[i]! < target) i++
  i = Math.min(i, points.length - 1)

  const segStart = points[i - 1]!
  const segEnd = points[i]!
  const segLen = dists[i]! - dists[i - 1]!
  const blend = segLen === 0 ? 0 : (target - dists[i - 1]!) / segLen

  const lat = segStart.lat + (segEnd.lat - segStart.lat) * blend
  const lon = segStart.lon + (segEnd.lon - segStart.lon) * blend

  // heading: from current segment in the travel direction
  const headA = direction === 'backward' ? segEnd : segStart
  const headB = direction === 'backward' ? segStart : segEnd
  const heading = bearing(headA, headB)

  return { lat, lon, heading: Math.round(heading * 10) / 10 }
}
