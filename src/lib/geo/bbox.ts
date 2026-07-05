import { haversineDistance, type LatLng } from './haversine'
export function distanceToPolyline(point: LatLng, polyline: LatLng[]): number {
  if (polyline.length === 0) return Infinity
  if (polyline.length === 1) return haversineDistance(point, polyline[0]!)
  let minDist = Infinity
  for (let i = 1; i < polyline.length; i++) { const d = distanceToSegment(point, polyline[i - 1]!, polyline[i]!); if (d < minDist) minDist = d }
  return minDist
}
function distanceToSegment(point: LatLng, a: LatLng, b: LatLng): number {
  const toM = (p: LatLng, o: LatLng) => ({ x: (p.lon - o.lon) * 111320 * Math.cos((o.lat * Math.PI) / 180), y: (p.lat - o.lat) * 111320 })
  const o = a, p = toM(point, o), aM = toM(a, o), bM = toM(b, o)
  const dx = bM.x - aM.x, dy = bM.y - aM.y, segLenSq = dx * dx + dy * dy
  if (segLenSq === 0) return haversineDistance(point, a)
  const t = Math.max(0, Math.min(1, ((p.x - aM.x) * dx + (p.y - aM.y) * dy) / segLenSq))
  return Math.hypot(p.x - (aM.x + t * dx), p.y - (aM.y + t * dy))
}
export function isWithinDistance(point: LatLng, polyline: LatLng[], thresholdM: number): boolean { return distanceToPolyline(point, polyline) <= thresholdM }
