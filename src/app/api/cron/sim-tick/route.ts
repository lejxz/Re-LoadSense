import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { cacheSet, redis } from '@/lib/redis'
import { config } from '@/lib/config'
import { logger } from '@/lib/logger'
import {
  initSimState,
  tick,
  type SimRoute,
} from '@/lib/simulator'
import type { LatLng } from '@/lib/geo/haversine'
import { evaluateAlerts, type TelemetryForAlerts } from '@/lib/services/alert-service'

/**
 * sim-tick — advances the simulated fleet by 1 minute (12 ticks × 5s) per
 * invocation. Runs via Vercel Cron (every minute) or manually.
 *
 * Verifies the X-Cron-Secret header to prevent public abuse.
 *
 * See concept/04-features.md S-01 + concept/08-implementation-checklist.md Step 1.7.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TICKS_PER_INVOCATION = 12
const TICK_SECONDS = 5

export async function POST(req: Request) {
  // ── Auth ──
  const secret = req.headers.get('x-cron-secret')
  if (secret !== config.cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startTime = Date.now()
  logger.info({ ticks: TICKS_PER_INVOCATION }, '[sim-tick] starting')

  try {
    // ── 1. Load routes + vehicles from DB ──
    const routes = await db.route.findMany({
      where: { status: 'active' },
      include: { points: { orderBy: { seq: 'asc' } } },
    })
    const vehicles = await db.vehicle.findMany({
      where: { status: 'active' },
      include: { state: true },
    })

    if (routes.length === 0 || vehicles.length === 0) {
      return NextResponse.json(
        { error: 'No routes or vehicles to simulate. Run bun run db:seed first.' },
        { status: 400 },
      )
    }

    // ── 1b. Load device IDs per vehicle (FK requires real Device.id) ──
    const devices = await db.device.findMany({
      where: { vehicleId: { in: vehicles.map((v) => v.id) }, status: 'active' },
      select: { id: true, vehicleId: true },
    })
    const deviceIdByVehicle = new Map(devices.map((d) => [d.vehicleId, d.id]))

    // ── 2. Build sim routes (polyline as LatLng[]) ──
    const simRoutes: SimRoute[] = routes.map((r) => ({
      routeId: r.id,
      routeType: (r.routeType as 'linear' | 'loop') ?? 'linear',
      polyline: r.points.map((p) => ({ lat: p.lat, lon: p.lon })),
    }))

    // ── 3. Build sim state (resume from VehicleState if it exists, else init) ──
    const now = Date.now()
    const simVehicles = vehicles.map((v, i) => ({
      vehicleId: v.id,
      vehicleCode: v.vehicleCode,
      routeId: v.routeId,
      vehicleType: v.vehicleType as 'jeepney' | 'minibus' | 'bus' | 'uv_express',
      capacity: v.capacity,
    }))

    let state = initSimState(simRoutes, simVehicles, 2026, now)

    // resume existing state where available
    state.vehicles = state.vehicles.map((sv) => {
      const vs = vehicles.find((v) => v.id === sv.vehicleId)?.state
      if (!vs) return sv
      return {
        ...sv,
        positionIndex: vs.positionIndex,
        direction: vs.direction as 'forward' | 'backward',
        occupancy: vs.occupancy,
        speedKph: vs.speedKph,
        heading: vs.heading ?? 0,
        boarded: 0,
        alighted: 0,
      }
    })

    // ── 4. Run 12 ticks ──
    const routePolylines = new Map<string, LatLng[]>(
      simRoutes.map((r) => [r.routeId, r.polyline]),
    )

    let totalTelemetry = 0
    let totalAlertsRaised = 0

    for (let i = 0; i < TICKS_PER_INVOCATION; i++) {
      const result = tick(state, TICK_SECONDS)
      state = result.state

      // ── 5. Write telemetry to DB (batch) + Redis ──
      const telemetryRows = result.telemetry.map((t) => ({
        vehicleId: t.vehicleId,
        deviceId: deviceIdByVehicle.get(t.vehicleId) ?? devices[0]?.id ?? '',
        timestamp: new Date(t.timestamp),
        lat: t.lat,
        lon: t.lon,
        accuracyM: 10,
        speedKph: t.speedKph,
        heading: t.heading,
        occupancy: t.occupancy,
        tier: t.tier,
        boarded: t.boarded,
        alighted: t.alighted,
        signalQuality: 'good',
        source: 'simulator',
        seq: state.tick,
      })).filter((r) => r.deviceId)

      // batch insert telemetry logs
      if (telemetryRows.length > 0) {
        await db.telemetryLog.createMany({ data: telemetryRows })
        totalTelemetry += telemetryRows.length
      }

      // upsert vehicle states + cache in Redis
      for (const t of result.telemetry) {
        await db.vehicleState.upsert({
          where: { vehicleId: t.vehicleId },
          create: {
            vehicleId: t.vehicleId,
            lat: t.lat,
            lon: t.lon,
            speedKph: t.speedKph,
            heading: t.heading,
            direction: t.direction,
            positionIndex: t.positionIndex,
            occupancy: t.occupancy,
            tier: t.tier,
            lastTelemetryAt: new Date(t.timestamp),
            online: true,
          },
          update: {
            lat: t.lat,
            lon: t.lon,
            speedKph: t.speedKph,
            heading: t.heading,
            direction: t.direction,
            positionIndex: t.positionIndex,
            occupancy: t.occupancy,
            tier: t.tier,
            lastTelemetryAt: new Date(t.timestamp),
            online: true,
          },
        })

        // cache in Redis (60s TTL)
        await cacheSet(
          `vehicle:${t.vehicleId}:state`,
          JSON.stringify({
            lat: t.lat,
            lon: t.lon,
            speedKph: t.speedKph,
            heading: t.heading,
            direction: t.direction,
            positionIndex: t.positionIndex,
            occupancy: t.occupancy,
            tier: t.tier,
            vehicleCode: t.vehicleCode,
            routeId: t.routeId,
            lastUpdate: t.timestamp,
          }),
          60,
        )
      }

      // ── 6. Evaluate alerts ──
      const alertsInput: TelemetryForAlerts[] = result.telemetry.map((t) => {
        const sv = state.vehicles.find((v) => v.vehicleId === t.vehicleId)
        return {
          vehicleId: t.vehicleId,
          routeId: t.routeId,
          lat: t.lat,
          lon: t.lon,
          speedKph: t.speedKph,
          occupancy: t.occupancy,
          tier: t.tier,
          timestamp: new Date(t.timestamp),
          tierHeldSince: sv
            ? new Date(sv.tierState.candidateSince)
            : undefined,
        }
      })
      const alertResult = await evaluateAlerts(alertsInput, routePolylines)
      totalAlertsRaised += alertResult.raised
    }

    // ── 7. Publish to Redis pub/sub for socket.io ──
    if (redis) {
      try {
        await redis.publish(
          'pubsub:fleet:PH',
          JSON.stringify({
            type: 'fleet:update',
            tick: state.tick,
            timestamp: now,
            count: vehicles.length,
          }),
        )
      } catch (err) {
        logger.warn({ err }, '[sim-tick] redis publish failed (non-fatal)')
      }
    }

    const elapsed = Date.now() - startTime
    logger.info(
      { elapsed, totalTelemetry, totalAlertsRaised },
      '[sim-tick] complete',
    )

    return NextResponse.json({
      status: 'ok',
      ticks: TICKS_PER_INVOCATION,
      vehicles: vehicles.length,
      telemetryWritten: totalTelemetry,
      alertsRaised: totalAlertsRaised,
      elapsedMs: elapsed,
    })
  } catch (err) {
    logger.error({ err }, '[sim-tick] failed')
    return NextResponse.json(
      { error: 'Sim-tick failed', message: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    )
  }
}
