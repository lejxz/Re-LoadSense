import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { cacheSet, redis } from '@/lib/redis'
import { config } from '@/lib/config'
import { logger } from '@/lib/logger'
import { initSimState, tick, type SimRoute } from '@/lib/simulator'
import { evaluateAlerts, type TelemetryForAlerts } from '@/lib/services/alert-service'
import type { LatLng } from '@/lib/geo/haversine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TICKS_PER_INVOCATION = 12, TICK_SECONDS = 5

export async function POST(req: Request) {
  if (req.headers.get('x-cron-secret') !== config.cronSecret) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const startTime = Date.now()
  logger.info({ ticks: TICKS_PER_INVOCATION }, '[sim-tick] starting')
  try {
    const routes = await db.route.findMany({ where: { status: 'active' }, include: { points: { orderBy: { seq: 'asc' } } } })
    const vehicles = await db.vehicle.findMany({ where: { status: 'active' }, include: { state: true } })
    if (!routes.length || !vehicles.length) return NextResponse.json({ error: 'No routes or vehicles. Run db:seed.' }, { status: 400 })

    const devices = await db.device.findMany({ where: { vehicleId: { in: vehicles.map(v => v.id) }, status: 'active' }, select: { id: true, vehicleId: true } })
    const deviceIdByVehicle = new Map(devices.map(d => [d.vehicleId, d.id]))

    const simRoutes: SimRoute[] = routes.map(r => ({ routeId: r.id, routeType: (r.routeType as 'linear' | 'loop') ?? 'linear', polyline: r.points.map(p => ({ lat: p.lat, lon: p.lon })) }))
    const simVehicles = vehicles.map(v => ({ vehicleId: v.id, vehicleCode: v.vehicleCode, routeId: v.routeId, vehicleType: v.vehicleType as 'jeepney', capacity: v.capacity }))
    let state = initSimState(simRoutes, simVehicles, 2026, Date.now())
    state.vehicles = state.vehicles.map(sv => { const vs = vehicles.find(v => v.id === sv.vehicleId)?.state; return vs ? { ...sv, positionIndex: vs.positionIndex, direction: vs.direction as 'forward' | 'backward', occupancy: vs.occupancy, speedKph: vs.speedKph, heading: vs.heading ?? 0 } : sv })

    const routePolylines = new Map<string, LatLng[]>(simRoutes.map(r => [r.routeId, r.polyline]))
    let totalTelemetry = 0, totalAlerts = 0

    for (let i = 0; i < TICKS_PER_INVOCATION; i++) {
      const result = tick(state, TICK_SECONDS)
      state = result.state
      const rows = result.telemetry.map(t => ({ vehicleId: t.vehicleId, deviceId: deviceIdByVehicle.get(t.vehicleId) ?? '', timestamp: new Date(t.timestamp), lat: t.lat, lon: t.lon, accuracyM: 10, speedKph: t.speedKph, heading: t.heading, occupancy: t.occupancy, tier: t.tier, boarded: t.boarded, alighted: t.alighted, signalQuality: 'good', source: 'simulator', seq: state.tick })).filter(r => r.deviceId)
      if (rows.length) { await db.telemetryLog.createMany({ data: rows }); totalTelemetry += rows.length }
      for (const t of result.telemetry) {
        await db.vehicleState.upsert({
          where: { vehicleId: t.vehicleId },
          create: { vehicleId: t.vehicleId, lat: t.lat, lon: t.lon, speedKph: t.speedKph, heading: t.heading, direction: t.direction, positionIndex: t.positionIndex, occupancy: t.occupancy, tier: t.tier, lastTelemetryAt: new Date(t.timestamp), online: true },
          update: { lat: t.lat, lon: t.lon, speedKph: t.speedKph, heading: t.heading, direction: t.direction, positionIndex: t.positionIndex, occupancy: t.occupancy, tier: t.tier, lastTelemetryAt: new Date(t.timestamp), online: true },
        })
        await cacheSet(`vehicle:${t.vehicleId}:state`, JSON.stringify({ lat: t.lat, lon: t.lon, speedKph: t.speedKph, heading: t.heading, direction: t.direction, positionIndex: t.positionIndex, occupancy: t.occupancy, tier: t.tier, vehicleCode: t.vehicleCode, routeId: t.routeId, lastUpdate: t.timestamp }), 60)
      }
      const alertInput: TelemetryForAlerts[] = result.telemetry.map(t => { const sv = state.vehicles.find(v => v.vehicleId === t.vehicleId); return { vehicleId: t.vehicleId, routeId: t.routeId, lat: t.lat, lon: t.lon, speedKph: t.speedKph, occupancy: t.occupancy, tier: t.tier, timestamp: new Date(t.timestamp), tierHeldSince: sv ? new Date(sv.tierState.candidateSince) : undefined } })
      totalAlerts += (await evaluateAlerts(alertInput, routePolylines)).raised
    }

    if (redis) { try { await redis.publish('pubsub:fleet:PH', JSON.stringify({ type: 'fleet:update', tick: state.tick, timestamp: Date.now(), count: vehicles.length })) } catch {} }
    logger.info({ elapsed: Date.now() - startTime, totalTelemetry, totalAlerts }, '[sim-tick] complete')
    return NextResponse.json({ status: 'ok', ticks: TICKS_PER_INVOCATION, vehicles: vehicles.length, telemetryWritten: totalTelemetry, alertsRaised: totalAlerts, elapsedMs: Date.now() - startTime })
  } catch (err) {
    logger.error({ err }, '[sim-tick] failed')
    return NextResponse.json({ error: 'Sim-tick failed', message: err instanceof Error ? err.message : 'unknown' }, { status: 500 })
  }
}
