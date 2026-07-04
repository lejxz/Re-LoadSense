/**
 * Seeded synthetic fleet simulator — the heart of the demo.
 *
 * Pure function `tick(state, dtSeconds) => newState`. Seeded RNG (mulberry32)
 * for reproducibility. Handles `linear` routes (turn-around at endpoints, no
 * teleport) and `loop` routes (wrap-around). Computes heading from bearing.
 *
 * See concept/04-features.md S-01 + concept/03-data-model.md §4.2 +
 * concept/02-architecture.md §4.
 */

import { pointAtRatio } from '@/lib/geo/bearing'
import {
  classifyTier,
  initialTierState,
  type TierState,
} from '@/lib/ml/occupancy'
import type { LatLng } from '@/lib/geo/haversine'
import type { Tier, VehicleType } from '@/lib/validators'

// ── Seeded RNG (mulberry32) ──

function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ── Types ──

export interface SimRoute {
  routeId: string
  routeType: 'linear' | 'loop'
  polyline: LatLng[]
}

export interface SimVehicle {
  vehicleId: string
  vehicleCode: string
  routeId: string
  vehicleType: VehicleType
  capacity: number
  /** index into the polyline (0..N). Fractional = interpolated between points */
  positionIndex: number
  direction: 'forward' | 'backward'
  occupancy: number
  tierState: TierState
  speedKph: number
  /** accumulated boarded count (for telemetry) */
  boarded: number
  /** accumulated alighted count (for telemetry) */
  alighted: number
  /** last heading (degrees) — updated each tick */
  heading: number
  /** per-vehicle RNG seed offset (so each vehicle has independent randomness) */
  seedOffset: number
}

export interface SimState {
  vehicles: SimVehicle[]
  routes: Map<string, SimRoute>
  /** current sim time (epoch ms) */
  now: number
  /** tick counter */
  tick: number
  /** base seed for the RNG */
  seed: number
}

export interface TelemetryOutput {
  vehicleId: string
  vehicleCode: string
  routeId: string
  lat: number
  lon: number
  speedKph: number
  heading: number
  direction: 'forward' | 'backward'
  positionIndex: number
  occupancy: number
  tier: Tier
  boarded: number
  alighted: number
  timestamp: number
  source: 'simulator'
}

// ── Time-of-day occupancy target ──

/**
 * Target occupancy ratio (0..1+) for a given hour.
 *
 * Two Gaussian peaks (morning 8am, evening 6pm) reaching ~1.1 (overloaded)
 * during rush, dipping to ~0.2 at night. This ensures all 4 tiers are
 * demonstrated (the original's sine wave only reached 10-70%).
 */
function targetOccupancyRatio(hour: number, rand: () => number): number {
  const morningPeak = 1.1 * Math.exp(-((hour - 8) ** 2) / (2 * 2 ** 2))
  const eveningPeak = 1.15 * Math.exp(-((hour - 18) ** 2) / (2 * 2.5 ** 2))
  const baseline = 0.25
  // small per-tick noise (±0.08) so occupancy isn't perfectly smooth
  const noise = (rand() - 0.5) * 0.16
  return Math.max(0, baseline + morningPeak + eveningPeak + noise)
}

// ── Public API ──

/**
 * Initialize the simulator state from DB-loaded routes + vehicles.
 */
export function initSimState(
  routes: SimRoute[],
  vehicles: Array<{
    vehicleId: string
    vehicleCode: string
    routeId: string
    vehicleType: VehicleType
    capacity: number
  }>,
  seed: number,
  now: number,
): SimState {
  const routeMap = new Map(routes.map((r) => [r.routeId, r]))

  const simVehicles: SimVehicle[] = vehicles.map((v, i) => {
    const route = routeMap.get(v.routeId)
    const polylineLen = route?.polyline.length ?? 1
    // spread vehicles along their route (staggered start positions)
    const startIndex = (i % 3) * (polylineLen / 3)

    return {
      ...v,
      positionIndex: startIndex,
      direction: i % 2 === 0 ? 'forward' : 'backward',
      occupancy: 0,
      tierState: initialTierState(0, v.capacity, now),
      speedKph: 25,
      boarded: 0,
      alighted: 0,
      heading: 0,
      seedOffset: i * 1000,
    }
  })

  return {
    vehicles: simVehicles,
    routes: routeMap,
    now,
    tick: 0,
    seed,
  }
}

/**
 * Advance the simulation by `dtSeconds`.
 *
 * For each vehicle:
 * 1. Advance positionIndex along the polyline by (speed × dt).
 * 2. Handle route type: linear turns around at endpoints; loop wraps.
 * 3. Update occupancy toward the time-of-day target (with noise).
 * 4. Recompute tier (with hysteresis).
 * 5. Compute heading from bearing of current segment.
 *
 * Pure: same state + dt → same output (given the same seed, which is fixed
 * at initSimState time per vehicle via seedOffset).
 */
export function tick(state: SimState, dtSeconds: number): {
  state: SimState
  telemetry: TelemetryOutput[]
} {
  const newNow = state.now + dtSeconds * 1000
  const newTick = state.tick + 1
  const hour = new Date(newNow).getHours()

  const newVehicles: SimVehicle[] = []
  const telemetry: TelemetryOutput[] = []

  for (const v of state.vehicles) {
    const route = state.routes.get(v.routeId)
    if (!route || route.polyline.length < 2) {
      newVehicles.push(v)
      continue
    }

    // per-vehicle RNG (seeded by base seed + offset + tick)
    const rand = mulberry32(state.seed + v.seedOffset + newTick * 7)

    // ── 1. Advance position ──
    const speedKph = 20 + rand() * 25 // 20..45 kph
    const speedMps = speedKph / 3.6
    const segmentLenM = approxSegmentLength(route.polyline)
    const segmentsPerSecond = speedMps / Math.max(segmentLenM, 1)
    const advance = segmentsPerSecond * dtSeconds

    let newIndex = v.positionIndex
    let newDirection = v.direction

    if (route.routeType === 'loop') {
      // wrap around
      newIndex = (newIndex + advance) % (route.polyline.length - 1)
    } else {
      // linear — turn around at endpoints
      if (newDirection === 'forward') {
        newIndex += advance
        if (newIndex >= route.polyline.length - 1) {
          newIndex = route.polyline.length - 1
          newDirection = 'backward'
        }
      } else {
        newIndex -= advance
        if (newIndex <= 0) {
          newIndex = 0
          newDirection = 'forward'
        }
      }
    }

    // ── 2. Compute lat/lon/heading at the new position ──
    const ratio = newIndex / Math.max(route.polyline.length - 1, 1)
    const pos = pointAtRatio(route.polyline, ratio, newDirection)

    // ── 3. Update occupancy toward target ──
    const targetRatio = targetOccupancyRatio(hour, rand)
    const targetOccupancy = Math.round(targetRatio * v.capacity)
    // move occupancy 30% toward target each tick (smooth approach)
    const occupancyDelta = Math.round((targetOccupancy - v.occupancy) * 0.3)
    let newOccupancy = v.occupancy + occupancyDelta
    newOccupancy = Math.max(0, Math.min(v.capacity + 5, newOccupancy)) // allow slight overload

    // track boarded/alighted (synthetic)
    let boarded = v.boarded
    let alighted = v.alighted
    if (occupancyDelta > 0) boarded += occupancyDelta
    else if (occupancyDelta < 0) alighted += -occupancyDelta

    // ── 4. Recompute tier (hysteresis) ──
    const newTierState = classifyTier(
      newOccupancy,
      v.capacity,
      v.tierState,
      newNow,
    )

    const newVehicle: SimVehicle = {
      ...v,
      positionIndex: newIndex,
      direction: newDirection,
      occupancy: newOccupancy,
      tierState: newTierState,
      speedKph: Math.round(speedKph * 10) / 10,
      heading: pos.heading,
      boarded,
      alighted,
    }
    newVehicles.push(newVehicle)

    telemetry.push({
      vehicleId: v.vehicleId,
      vehicleCode: v.vehicleCode,
      routeId: v.routeId,
      lat: pos.lat,
      lon: pos.lon,
      speedKph: newVehicle.speedKph,
      heading: pos.heading,
      direction: newDirection,
      positionIndex: Math.round(newIndex),
      occupancy: newOccupancy,
      tier: newTierState.tier,
      boarded,
      alighted,
      timestamp: newNow,
      source: 'simulator',
    })
  }

  return {
    state: { ...state, vehicles: newVehicles, now: newNow, tick: newTick },
    telemetry,
  }
}

/**
 * Approximate length of a polyline segment in meters (cheap, for sim speed).
 */
function approxSegmentLength(polyline: LatLng[]): number {
  if (polyline.length < 2) return 100
  const a = polyline[0]!
  const b = polyline[1]!
  const dLat = (b.lat - a.lat) * 111_320
  const dLon = (b.lon - a.lon) * 111_320 * Math.cos((a.lat * Math.PI) / 180)
  return Math.hypot(dLat, dLon) || 100
}
