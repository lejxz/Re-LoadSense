import { haversineDistance, type LatLng } from '@/lib/geo/haversine'
export interface VehiclePosition { lat: number; lon: number; speedKph: number; direction: 'forward' | 'backward'; positionIndex: number }
export interface RouteStop extends LatLng { seq: number; stopName?: string | null }
export interface StopEta { stop: RouteStop; etaSeconds: number; distanceM: number }
export function trafficFactorForHour(hour: number): number {
  if (hour >= 7 && hour < 9) return 1.3
  if (hour >= 17 && hour < 19) return 1.3
  if (hour >= 22 || hour < 5) return 0.85
  if (hour >= 10 && hour < 16) return 0.9
  return 1.0
}
export function remainingStops(vehicle: VehiclePosition, stops: RouteStop[]): RouteStop[] {
  if (vehicle.direction === 'forward') return stops.filter(s => s.seq > vehicle.positionIndex).sort((a, b) => a.seq - b.seq)
  return stops.filter(s => s.seq < vehicle.positionIndex).sort((a, b) => b.seq - a.seq)
}
export function calculateEta(vehicle: VehiclePosition, stops: RouteStop[], hour: number): StopEta[] {
  const upcoming = remainingStops(vehicle, stops)
  const tf = trafficFactorForHour(hour)
  const speedMps = vehicle.speedKph / 3.6
  if (speedMps <= 0) return upcoming.map(stop => ({ stop, etaSeconds: Infinity, distanceM: haversineDistance(vehicle, stop) }))
  return upcoming.map(stop => { const dM = haversineDistance(vehicle, stop); return { stop, etaSeconds: Math.round(dM / (speedMps * tf)), distanceM: Math.round(dM) } })
}
export function formatEta(seconds: number): string {
  if (!isFinite(seconds)) return '—'
  if (seconds < 60) return `${Math.round(seconds)} sec`
  return `${Math.round(seconds / 60)} min`
}
