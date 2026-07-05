/**
 * Fleet service — reads live vehicle state (Redis hot + DB warm).
 * Returns data in snake_case with old tier values (green/yellow/red/blinking_red)
 * so the old JS frontend works without modification.
 */

import { db } from '@/lib/db'
import { cacheGet, cacheSet, redis } from '@/lib/redis'

// Map new tier names to old tier values the JS expects
const TIER_MAP: Record<string, string> = {
  available: 'green',
  filling: 'yellow',
  at_capacity: 'red',
  overloaded: 'blinking_red',
}

export interface FleetVehicleLegacy {
  vehicle_id: string
  route: string
  latitude: number
  longitude: number
  occupancy: number
  capacity: number
  tier: string // green/yellow/red/blinking_red
  timestamp: string
  eta_minutes: number
  eta_source: string
  next_stop_id: number
  route_deviation: { route: string; deviation_meters: number; threshold_meters: number; anomaly: boolean }
  signal_quality: string
  speed_kph: number
  heading: number
  direction: string
  status: string
  driver: string | null
  max_occupancy: number
  brand: string | null
  model: string | null
  plate_number: string
  vehicle_type: string
  year: number | null
  registration_number: string | null
  country: string
}

export async function getFleet(countryCode = 'PH'): Promise<{ vehicles: FleetVehicleLegacy[]; summary: Record<string, unknown> }> {
  const vehicles = await db.vehicle.findMany({
    where: { status: 'active', countryCode },
    include: {
      route: { select: { code: true, name: true } },
      state: true,
    },
    orderBy: { vehicleCode: 'asc' },
  })

  // Try Redis for hot state
  const redisKeys = vehicles.map(v => `vehicle:${v.id}:state`)
  let redisStates: (string | null)[] = []
  if (redis && redisKeys.length > 0) {
    try { redisStates = await redis.mget(...redisKeys) } catch { redisStates = redisKeys.map(() => null) }
  }

  const result: FleetVehicleLegacy[] = vehicles.map((v, i) => {
    const cached = redisStates[i]
    const cachedState = cached ? JSON.parse(cached) : null
    const dbState = v.state
    const state = cachedState ?? dbState

    return {
      vehicle_id: v.vehicleCode,
      route: v.route.code,
      latitude: state?.lat ?? 0,
      longitude: state?.lon ?? 0,
      occupancy: state?.occupancy ?? 0,
      capacity: v.capacity,
      tier: TIER_MAP[state?.tier ?? 'available'] ?? 'green',
      timestamp: state?.lastTelemetryAt?.toISOString() ?? new Date().toISOString(),
      eta_minutes: 5.0,
      eta_source: 'fallback',
      next_stop_id: 0,
      route_deviation: { route: v.route.code, deviation_meters: 0, threshold_meters: 200, anomaly: false },
      signal_quality: 'ok',
      speed_kph: state?.speedKph ?? 0,
      heading: state?.heading ?? 0,
      direction: state?.direction ?? 'forward',
      status: v.status,
      driver: v.driver,
      max_occupancy: v.capacity,
      brand: v.brand,
      model: v.model,
      plate_number: v.plateNo,
      vehicle_type: v.vehicleType.toUpperCase(),
      year: v.year,
      registration_number: v.registrationNo,
      country: v.countryCode,
    }
  })

  // Build summary
  const tierCounts: Record<string, number> = {}
  for (const v of result) { tierCounts[v.tier] = (tierCounts[v.tier] ?? 0) + 1 }
  const summary = {
    total: result.length,
    online: result.filter(v => v.status === 'active').length,
    tiers: tierCounts,
  }

  return { vehicles: result, summary }
}

export async function getVehicle(idOrCode: string): Promise<FleetVehicleLegacy | null> {
  const vehicle = await db.vehicle.findFirst({
    where: { OR: [{ id: idOrCode }, { vehicleCode: idOrCode }], status: 'active' },
    include: { route: { select: { code: true, name: true } }, state: true },
  })
  if (!vehicle) return null

  const cached = await cacheGet<string>(`vehicle:${vehicle.id}:state`)
  const cachedState = cached ? JSON.parse(cached) : null
  const state = cachedState ?? vehicle.state

  return {
    vehicle_id: vehicle.vehicleCode,
    route: vehicle.route.code,
    latitude: state?.lat ?? 0,
    longitude: state?.lon ?? 0,
    occupancy: state?.occupancy ?? 0,
    capacity: vehicle.capacity,
    tier: TIER_MAP[state?.tier ?? 'available'] ?? 'green',
    timestamp: state?.lastTelemetryAt?.toISOString() ?? new Date().toISOString(),
    eta_minutes: 5.0,
    eta_source: 'fallback',
    next_stop_id: 0,
    route_deviation: { route: vehicle.route.code, deviation_meters: 0, threshold_meters: 200, anomaly: false },
    signal_quality: 'ok',
    speed_kph: state?.speedKph ?? 0,
    heading: state?.heading ?? 0,
    direction: state?.direction ?? 'forward',
    status: vehicle.status,
    driver: vehicle.driver,
    max_occupancy: vehicle.capacity,
    brand: vehicle.brand,
    model: vehicle.model,
    plate_number: vehicle.plateNo,
    vehicle_type: vehicle.vehicleType.toUpperCase(),
    year: vehicle.year,
    registration_number: vehicle.registrationNo,
    country: vehicle.countryCode,
  }
}
