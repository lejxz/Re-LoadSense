/**
 * Bounding-box utilities — used for:
 * - Geofencing (route deviation check): is a point within Xm of a polyline?
 * - Map subscription filtering: which vehicles are in the visible bbox?
 * - Trip planning: which routes pass near an origin/destination?
 *
 * No PostGIS (Vercel Postgres free tier doesn't have it). Pure TS math.
 * See concept/03-data-model.md §1 + concept/04-features.md Calc-04.
 */

import { haversineDistance, type LatLng } from './haversine'

/**
 * Distance from a point to the nearest segment of a polyline (meters).
 * Uses the cross-track distance formula.
 */
export function distanceToPolyline(point: LatLng, polyline: LatLng[]): number {
  if (polyline.length === 0) return Infinity
  if (polyline.length === 1) return haversineDistance(point, polyline[0]!)

  let minDist = Infinity
  for (let i = 1; i < polyline.length; i++) {
    const segStart = polyline[i - 1]!
    const segEnd = polyline[i]!
    const d = distanceToSegment(point, segStart, segEnd)
    if (d < minDist) minDist = d
  }
  return minDist
}

/**
 * Distance from a point to a single line segment (meters).
 * Projects the point onto the segment; if outside, measures to the nearest endpoint.
 */
function distanceToSegment(point: LatLng, a: LatLng, b: LatLng): number {
  // Convert to a local equirectangular plane (good enough for short segments)
  const toMeters = (p: LatLng, origin: LatLng) => {
    const latM = (p.lat - origin.lat) * 111_320 // ~111.32km per degree lat
    const lonM =
      (p.lon - origin.lon) * 111_320 * Math.cos((origin.lat * Math.PI) / 180)
    return { x: lonM, y: latM }
  }

  const origin = a
  const p = toMeters(point, origin)
  const aM = toMeters(a, origin)
  const bM = toMeters(b, origin)

  const dx = bM.x - aM.x
  const dy = bM.y - aM.y
  const segLenSq = dx * dx + dy * dy

  if (segLenSq === 0) return haversineDistance(point, a)

  // project p onto the segment, clamp t to [0, 1]
  const t = Math.max(
    0,
    Math.min(1, ((p.x - aM.x) * dx + (p.y - aM.y) * dy) / segLenSq),
  )
  const projX = aM.x + t * dx
  const projY = aM.y + t * dy

  const distM = Math.hypot(p.x - projX, p.y - projY)
  return distM
}

/**
 * Is a point within `thresholdM` of any part of the polyline?
 * Used for route deviation detection (>200m = deviated).
 */
export function isWithinDistance(
  point: LatLng,
  polyline: LatLng[],
  thresholdM: number,
): boolean {
  return distanceToPolyline(point, polyline) <= thresholdM
}

/**
 * Bounding box of a polyline, with optional padding.
 */
export function bboxOf(
  points: LatLng[],
  padMeters = 0,
): { minLat: number; maxLat: number; minLon: number; maxLon: number } {
  if (points.length === 0) {
    return { minLat: 0, maxLat: 0, minLon: 0, maxLon: 0 }
  }
  let minLat = points[0]!.lat
  let maxLat = points[0]!.lat
  let minLon = points[0]!.lon
  let maxLon = points[0]!.lon
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat
    if (p.lat > maxLat) maxLat = p.lat
    if (p.lon < minLon) minLon = p.lon
    if (p.lon > maxLon) maxLon = p.lon
  }
  if (padMeters > 0) {
    const padLat = padMeters / 111_320
    const padLon = padMeters / (111_320 * Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180)))
    minLat -= padLat
    maxLat += padLat
    minLon -= padLon
    maxLon += padLon
  }
  return { minLat, maxLat, minLon, maxLon }
}

/**
 * Is a point inside a bounding box?
 */
export function isInsideBbox(
  point: LatLng,
  bbox: { minLat: number; maxLat: number; minLon: number; maxLon: number },
): boolean {
  return (
    point.lat >= bbox.minLat &&
    point.lat <= bbox.maxLat &&
    point.lon >= bbox.minLon &&
    point.lon <= bbox.maxLon
  )
}
