import type { LatLng } from './haversine'
export function bearing(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180, toDeg = (r: number) => (r * 180) / Math.PI
  const lat1 = toRad(a.lat), lat2 = toRad(b.lat), dLon = toRad(b.lon - a.lon)
  const y = Math.sin(dLon) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}
export function pointAtRatio(points: LatLng[], ratio: number, direction: 'forward' | 'backward' = 'forward'): { lat: number; lon: number; heading: number } {
  if (points.length === 0) return { lat: 0, lon: 0, heading: 0 }
  if (points.length === 1) return { lat: points[0]!.lat, lon: points[0]!.lon, heading: 0 }
  const r = direction === 'backward' ? 1 - ratio : ratio
  const dists: number[] = [0]
  for (let i = 1; i < points.length; i++) { const p = points[i - 1]!, c = points[i]!; dists.push(dists[dists.length - 1]! + Math.hypot(c.lat - p.lat, c.lon - p.lon)) }
  const total = dists[dists.length - 1]!
  if (total === 0) return { lat: points[0]!.lat, lon: points[0]!.lon, heading: 0 }
  const target = r * total; let i = 1
  while (i < dists.length && dists[i]! < target) i++
  i = Math.min(i, points.length - 1)
  const segStart = points[i - 1]!, segEnd = points[i]!, segLen = dists[i]! - dists[i - 1]!
  const blend = segLen === 0 ? 0 : (target - dists[i - 1]!) / segLen
  const lat = segStart.lat + (segEnd.lat - segStart.lat) * blend
  const lon = segStart.lon + (segEnd.lon - segStart.lon) * blend
  const headA = direction === 'backward' ? segEnd : segStart, headB = direction === 'backward' ? segStart : segEnd
  return { lat, lon, heading: Math.round(bearing(headA, headB) * 10) / 10 }
}
