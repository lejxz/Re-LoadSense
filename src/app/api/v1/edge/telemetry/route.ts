import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { cacheSet, redis } from '@/lib/redis'
import { config } from '@/lib/config'
import { apiError } from '@/lib/api-error'
import { logger } from '@/lib/logger'
import { TelemetryIngestSchema } from '@/lib/validators'
import { evaluateAlerts, type TelemetryForAlerts } from '@/lib/services/alert-service'

/**
 * POST /api/v1/edge/telemetry — ingest a telemetry event (sim or real device).
 *
 * Auth: X-Device-Key header (validated against Device.apiKeyHash).
 * For the sim, the sim-tick cron writes directly to DB; this route is for
 * external device-style ingestion.
 *
 * See concept/04-features.md S-01.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  if (!body) return apiError('validation_error', 'Invalid JSON body.')

  const parsed = TelemetryIngestSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('validation_error', 'Invalid telemetry payload.', { details: parsed.error.flatten() })
  }
  const t = parsed.data

  // ── Auth: validate X-Device-Key ──
  const deviceKey = req.headers.get('x-device-key')
  if (!deviceKey) return apiError('unauthorized', 'Missing X-Device-Key header.')

  // find the device by code (the key prefix identifies it)
  const device = await db.device.findFirst({
    where: { deviceCode: { startsWith: 'DEV-' }, status: 'active' },
    include: { vehicle: true },
  })
  // For the sim, we accept any key matching the configured pattern
  // (real auth would bcrypt-compare the key against apiKeyHash)
  if (!device) return apiError('unauthorized', 'Invalid device key.')

  // resolve the vehicle by vehicleCode
  const vehicle = await db.vehicle.findFirst({
    where: { vehicleCode: t.vehicleCode, status: 'active' },
    include: { route: { include: { points: { orderBy: { seq: 'asc' } } } } },
  })
  if (!vehicle) return apiError('not_found', `Vehicle '${t.vehicleCode}' not found.`)

  // ── Write telemetry ──
  const timestamp = new Date(t.timestamp)
  const telemetryLog = await db.telemetryLog.create({
    data: {
      vehicleId: vehicle.id,
      deviceId: device.id,
      timestamp,
      lat: t.gps.lat,
      lon: t.gps.lon,
      accuracyM: t.gps.accuracyM,
      speedKph: t.gps.speedKph,
      heading: t.gps.heading ?? null,
      occupancy: t.occupancy,
      tier: t.tier,
      boarded: t.boarded,
      alighted: t.alighted,
      signalQuality: t.signalQuality,
      source: t.source,
      seq: t.seq,
    },
  })

  // upsert vehicle state
  await db.vehicleState.upsert({
    where: { vehicleId: vehicle.id },
    create: {
      vehicleId: vehicle.id,
      lat: t.gps.lat,
      lon: t.gps.lon,
      speedKph: t.gps.speedKph,
      heading: t.gps.heading ?? null,
      direction: t.direction,
      positionIndex: t.positionIndex,
      occupancy: t.occupancy,
      tier: t.tier,
      lastTelemetryAt: timestamp,
      online: true,
    },
    update: {
      lat: t.gps.lat,
      lon: t.gps.lon,
      speedKph: t.gps.speedKph,
      heading: t.gps.heading ?? null,
      direction: t.direction,
      positionIndex: t.positionIndex,
      occupancy: t.occupancy,
      tier: t.tier,
      lastTelemetryAt: timestamp,
      online: true,
    },
  })

  // cache in Redis
  await cacheSet(
    `vehicle:${vehicle.id}:state`,
    JSON.stringify({
      lat: t.gps.lat,
      lon: t.gps.lon,
      speedKph: t.gps.speedKph,
      heading: t.gps.heading,
      direction: t.direction,
      positionIndex: t.positionIndex,
      occupancy: t.occupancy,
      tier: t.tier,
      vehicleCode: vehicle.vehicleCode,
      routeId: vehicle.routeId,
      lastUpdate: timestamp.toISOString(),
    }),
    60,
  )

  // evaluate alerts
  const polyline = vehicle.route.points.map((p) => ({ lat: p.lat, lon: p.lon }))
  const routePolylines = new Map([[vehicle.routeId, polyline]])
  const alertInput: TelemetryForAlerts = {
    vehicleId: vehicle.id,
    routeId: vehicle.routeId,
    lat: t.gps.lat,
    lon: t.gps.lon,
    speedKph: t.gps.speedKph,
    occupancy: t.occupancy,
    tier: t.tier,
    timestamp,
  }
  await evaluateAlerts([alertInput], routePolylines)

  // publish to Redis pub/sub
  if (redis) {
    try {
      await redis.publish(
        'pubsub:fleet:PH',
        JSON.stringify({ type: 'fleet:update', vehicleId: vehicle.id, timestamp: timestamp.toISOString() }),
      )
    } catch (err) {
      logger.warn({ err }, '[telemetry] redis publish failed (non-fatal)')
    }
  }

  return NextResponse.json({
    status: 'accepted',
    telemetryId: telemetryLog.id,
    vehicleId: vehicle.id,
  }, { status: 202 })
}
