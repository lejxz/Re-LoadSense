const EARTH_RADIUS_M = 6_371_000
export interface LatLng { lat: number; lon: number }
export function haversineDistance(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const lat1 = toRad(a.lat), lat2 = toRad(b.lat), dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h))
}
export function polylineLength(points: LatLng[]): number {
  let total = 0; for (let i = 1; i < points.length; i++) total += haversineDistance(points[i - 1]!, points[i]!); return total
}
