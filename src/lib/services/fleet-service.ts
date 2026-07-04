/**
 * Fleet service — reads live vehicle state (Redis hot + DB warm).
 *
 * No N+1: one Redis MGET for live state + one Prisma query for static data.
 * See concept/03-data-model.md §6.1 + concept/04-features.md C-01/O-01.
 */

import { db } from '@/lib/db'
import { cacheGet, cacheSet, redis } from '@/lib/redis'
import { polylineLength, type LatLng } from '@/lib/geo/haversine'

export interface FleetVehicle {
  vehicleId: string
  vehicleCode: string
  vehicleType: string
  plateNo: string
  capacity: number
  brand: string | null
  model: string | null
  driver: string | null
  routeId: string
  routeCode: string
  routeName: string
  originName: string | null
  destinationName: string | null
  // live state
  lat: number
  lon: number
  speedKph: number
  heading: number | null
  direction: 'forward' | 'backward'
  positionIndex: number
  occupancy: number
  tier: string
  online: boolean
  lastTelemetryAt: string | null
}

export interface FleetListResult {
  vehicles: FleetVehicle[]
  total: number
  hasMore: boolean
  cursor: string | null
}

/**
 * Get the live fleet, joined with static vehicle + route data.
 *
 * @param opts.filter  optional filters (routeId, tier, online, vehicleType, countryCode)
 * @param opts.cursor  pagination cursor (vehicleId)
 * @param opts.limit   page size (default 50, max 100)
 */
export async function getFleet(opts?: {
  filter?: {
    routeId?: string
    tier?: string
    online?: boolean
    vehicleType?: string
    countryCode?: string
    operatorId?: string
  }
  cursor?: string
  limit?: number
}): Promise<FleetListResult> {
  const limit = Math.min(opts?.limit ?? 50, 100)
  const where = {
    status: 'active',
    ...(opts?.filter?.routeId && { routeId: opts.filter.routeId }),
    ...(opts?.filter?.operatorId && { operatorId: opts.filter.operatorId }),
    ...(opts?.filter?.countryCode && { countryCode: opts.filter.countryCode }),
    ...(opts?.filter?.vehicleType && { vehicleType: opts.filter.vehicleType }),
  }

  // ── 1. Query DB for static data + latest state (single query with include) ──
  const vehicles = await db.vehicle.findMany({
    where,
    include: {
      route: { select: { code: true, name: true, originName: true, destinationName: true } },
      state: true,
    },
    take: limit + 1,
    ...(opts?.cursor && { skip: 1, cursor: { id: opts.cursor } }),
    orderBy: { id: 'asc' },
  })

  const hasMore = vehicles.length > limit
  const sliced = hasMore ? vehicles.slice(0, limit) : vehicles

  // ── 2. Try Redis for hot state (cache hit = fast) ──
  const redisKeys = sliced.map((v) => `vehicle:${v.id}:state`)
  let redisStates: (string | null)[] = []
  if (redis && redisKeys.length > 0) {
    try {
      redisStates = await redis.mget(...redisKeys)
    } catch {
      redisStates = redisKeys.map(() => null)
    }
  }

  // ── 3. Merge ──
  const result: FleetVehicle[] = sliced.map((v, i) => {
    const cached = redisStates[i]
    const cachedState = cached ? JSON.parse(cached) : null
    const dbState = v.state
    const state = cachedState ?? dbState

    // apply online/tier filters post-query if set (since they're on state, not vehicle)
    if (opts?.filter?.online && state && !state.online) return null
    if (opts?.filter?.tier && state && state.tier !== opts.filter.tier) return null

    return {
      vehicleId: v.id,
      vehicleCode: v.vehicleCode,
      vehicleType: v.vehicleType,
      plateNo: v.plateNo,
      capacity: v.capacity,
      brand: v.brand,
      model: v.model,
      driver: v.driver,
      routeId: v.routeId,
      routeCode: v.route.code,
      routeName: v.route.name,
      originName: v.route.originName,
      destinationName: v.route.destinationName,
      lat: state?.lat ?? 0,
      lon: state?.lon ?? 0,
      speedKph: state?.speedKph ?? 0,
      heading: state?.heading ?? null,
      direction: (state?.direction as 'forward' | 'backward') ?? 'forward',
      positionIndex: state?.positionIndex ?? 0,
      occupancy: state?.occupancy ?? 0,
      tier: state?.tier ?? 'available',
      online: state?.online ?? false,
      lastTelemetryAt: state?.lastTelemetryAt?.toISOString() ?? null,
    }
  }).filter((v): v is FleetVehicle => v !== null)

  return {
    vehicles: result,
    total: result.length,
    hasMore,
    cursor: hasMore ? sliced[sliced.length - 1]?.id ?? null : null,
  }
}

/**
 * Get a single vehicle by ID (or vehicleCode).
 */
export async function getVehicle(idOrCode: string): Promise<FleetVehicle | null> {
  const vehicle = await db.vehicle.findFirst({
    where: {
      OR: [{ id: idOrCode }, { vehicleCode: idOrCode }],
    },
    include: {
      route: { select: { code: true, name: true, originName: true, destinationName: true } },
      state: true,
    },
  })
  if (!vehicle) return null

  // try Redis for hot state
  const cached = await cacheGet<string>(`vehicle:${vehicle.id}:state`)
  const cachedState = cached ? JSON.parse(cached) : null
  const state = cachedState ?? vehicle.state

  return {
    vehicleId: vehicle.id,
    vehicleCode: vehicle.vehicleCode,
    vehicleType: vehicle.vehicleType,
    plateNo: vehicle.plateNo,
    capacity: vehicle.capacity,
    brand: vehicle.brand,
    model: vehicle.model,
    driver: vehicle.driver,
    routeId: vehicle.routeId,
    routeCode: vehicle.route.code,
    routeName: vehicle.route.name,
    originName: vehicle.route.originName,
    destinationName: vehicle.route.destinationName,
    lat: state?.lat ?? 0,
    lon: state?.lon ?? 0,
    speedKph: state?.speedKph ?? 0,
    heading: state?.heading ?? null,
    direction: (state?.direction as 'forward' | 'backward') ?? 'forward',
    positionIndex: state?.positionIndex ?? 0,
    occupancy: state?.occupancy ?? 0,
    tier: state?.tier ?? 'available',
    online: state?.online ?? false,
    lastTelemetryAt: state?.lastTelemetryAt?.toISOString() ?? null,
  }
}

/**
 * Cache a vehicle's state in Redis (called by the sim-tick + telemetry ingest).
 */
export async function cacheVehicleState(
  vehicleId: string,
  state: Record<string, unknown>,
  ttlSeconds = 60,
): Promise<void> {
  await cacheSet(`vehicle:${vehicleId}:state`, JSON.stringify(state), ttlSeconds)
}
