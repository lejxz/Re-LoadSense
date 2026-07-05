import { pointAtRatio } from '@/lib/geo/bearing'
import { classifyTier, initialTierState, type TierState } from '@/lib/ml/occupancy'
import type { LatLng } from '@/lib/geo/haversine'
import type { Tier, VehicleType } from '@/lib/validators'

function mulberry32(seed: number) { let a = seed; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }

export interface SimRoute { routeId: string; routeType: 'linear' | 'loop'; polyline: LatLng[] }
export interface SimVehicle {
  vehicleId: string; vehicleCode: string; routeId: string; vehicleType: VehicleType; capacity: number
  positionIndex: number; direction: 'forward' | 'backward'; occupancy: number; tierState: TierState
  speedKph: number; boarded: number; alighted: number; heading: number; seedOffset: number
}
export interface SimState { vehicles: SimVehicle[]; routes: Map<string, SimRoute>; now: number; tick: number; seed: number }
export interface TelemetryOutput {
  vehicleId: string; vehicleCode: string; routeId: string; lat: number; lon: number; speedKph: number
  heading: number; direction: 'forward' | 'backward'; positionIndex: number; occupancy: number
  tier: Tier; boarded: number; alighted: number; timestamp: number; source: 'simulator'
}

function targetOccupancyRatio(hour: number, rand: () => number): number {
  const morningPeak = 1.1 * Math.exp(-((hour - 8) ** 2) / (2 * 2 ** 2))
  const eveningPeak = 1.15 * Math.exp(-((hour - 18) ** 2) / (2 * 2.5 ** 2))
  return Math.max(0, 0.25 + morningPeak + eveningPeak + (rand() - 0.5) * 0.16)
}

export function initSimState(routes: SimRoute[], vehicles: Array<{ vehicleId: string; vehicleCode: string; routeId: string; vehicleType: VehicleType; capacity: number }>, seed: number, now: number): SimState {
  const routeMap = new Map(routes.map(r => [r.routeId, r]))
  return { vehicles: vehicles.map((v, i) => ({ ...v, positionIndex: (i % 3) * ((routeMap.get(v.routeId)?.polyline.length ?? 1) / 3), direction: i % 2 === 0 ? 'forward' : 'backward', occupancy: 0, tierState: initialTierState(0, v.capacity, now), speedKph: 25, boarded: 0, alighted: 0, heading: 0, seedOffset: i * 1000 })), routes: routeMap, now, tick: 0, seed }
}

export function tick(state: SimState, dtSeconds: number): { state: SimState; telemetry: TelemetryOutput[] } {
  const newNow = state.now + dtSeconds * 1000, newTick = state.tick + 1, hour = new Date(newNow).getHours()
  const newVehicles: SimVehicle[] = []; const telemetry: TelemetryOutput[] = []
  for (const v of state.vehicles) {
    const route = state.routes.get(v.routeId)
    if (!route || route.polyline.length < 2) { newVehicles.push(v); continue }
    const rand = mulberry32(state.seed + v.seedOffset + newTick * 7)
    const speedKph = 20 + rand() * 25, speedMps = speedKph / 3.6
    const segLen = Math.hypot(route.polyline[1]!.lat - route.polyline[0]!.lat, route.polyline[1]!.lon - route.polyline[0]!.lon) * 111320 || 100
    const advance = (speedMps / segLen) * dtSeconds
    let newIndex = v.positionIndex, newDir = v.direction
    if (route.routeType === 'loop') { newIndex = (newIndex + advance) % (route.polyline.length - 1) }
    else {
      if (newDir === 'forward') { newIndex += advance; if (newIndex >= route.polyline.length - 1) { newIndex = route.polyline.length - 1; newDir = 'backward' } }
      else { newIndex -= advance; if (newIndex <= 0) { newIndex = 0; newDir = 'forward' } }
    }
    const ratio = newIndex / Math.max(route.polyline.length - 1, 1)
    const pos = pointAtRatio(route.polyline, ratio, newDir)
    const targetRatio = targetOccupancyRatio(hour, rand), targetOcc = Math.round(targetRatio * v.capacity)
    const delta = Math.round((targetOcc - v.occupancy) * 0.3)
    let newOcc = Math.max(0, Math.min(v.capacity + 5, v.occupancy + delta))
    let boarded = v.boarded, alighted = v.alighted
    if (delta > 0) boarded += delta; else if (delta < 0) alighted += -delta
    const newTier = classifyTier(newOcc, v.capacity, v.tierState, newNow)
    const nv: SimVehicle = { ...v, positionIndex: newIndex, direction: newDir, occupancy: newOcc, tierState: newTier, speedKph: Math.round(speedKph * 10) / 10, heading: pos.heading, boarded, alighted }
    newVehicles.push(nv)
    telemetry.push({ vehicleId: v.vehicleId, vehicleCode: v.vehicleCode, routeId: v.routeId, lat: pos.lat, lon: pos.lon, speedKph: nv.speedKph, heading: pos.heading, direction: newDir, positionIndex: Math.round(newIndex), occupancy: newOcc, tier: newTier.tier, boarded, alighted, timestamp: newNow, source: 'simulator' })
  }
  return { state: { ...state, vehicles: newVehicles, now: newNow, tick: newTick }, telemetry }
}
