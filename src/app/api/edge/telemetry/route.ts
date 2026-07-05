import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { cacheSet, redis } from '@/lib/redis'
import { apiError } from '@/lib/api-error'
import { logger } from '@/lib/logger'
import { TelemetryIngestSchema } from '@/lib/validators'
import { evaluateAlerts, type TelemetryForAlerts } from '@/lib/services/alert-service'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  if (!body) return apiError('validation_error', 'Invalid JSON.')
  const parsed = TelemetryIngestSchema.safeParse(body)
  if (!parsed.success) return apiError('validation_error', 'Invalid telemetry.', { details: parsed.error.flatten() })
  const t = parsed.data
  const deviceKey = req.headers.get('x-device-key')
  if (!deviceKey) return apiError('unauthorized', 'Missing X-Device-Key.')
  const vehicle = await db.vehicle.findFirst({ where: { vehicleCode: t.vehicleCode, status: 'active' }, include: { route: { include: { points: { orderBy: { seq: 'asc' } } } } } })
  if (!vehicle) return apiError('not_found', `Vehicle '${t.vehicleCode}' not found.`)
  const existing = await db.telemetryLog.findFirst({ where: { vehicleId: vehicle.id, seq: t.seq }, select: { id: true } })
  if (existing) return apiError('conflict', `Duplicate telemetry (seq=${t.seq}).`)
  const device = await db.device.findFirst({ where: { vehicleId: vehicle.id, status: 'active' }, select: { id: true } })
  if (!device) return apiError('not_found', 'No device for vehicle.')
  const ts = new Date(t.timestamp)
  await db.telemetryLog.create({ data: { vehicleId: vehicle.id, deviceId: device.id, timestamp: ts, lat: t.gps.lat, lon: t.gps.lon, accuracyM: t.gps.accuracyM, speedKph: t.gps.speedKph, heading: t.gps.heading ?? null, occupancy: t.occupancy, tier: t.tier, boarded: t.boarded, alighted: t.alighted, signalQuality: t.signalQuality, source: t.source, seq: t.seq } })
  await db.vehicleState.upsert({ where: { vehicleId: vehicle.id }, create: { vehicleId: vehicle.id, lat: t.gps.lat, lon: t.gps.lon, speedKph: t.gps.speedKph, heading: t.gps.heading ?? null, direction: t.direction, positionIndex: t.positionIndex, occupancy: t.occupancy, tier: t.tier, lastTelemetryAt: ts, online: true }, update: { lat: t.gps.lat, lon: t.gps.lon, speedKph: t.gps.speedKph, heading: t.gps.heading ?? null, direction: t.direction, positionIndex: t.positionIndex, occupancy: t.occupancy, tier: t.tier, lastTelemetryAt: ts, online: true } })
  await cacheSet(`vehicle:${vehicle.id}:state`, JSON.stringify({ lat: t.gps.lat, lon: t.gps.lon, speedKph: t.gps.speedKph, heading: t.gps.heading, direction: t.direction, positionIndex: t.positionIndex, occupancy: t.occupancy, tier: t.tier, vehicleCode: vehicle.vehicleCode, routeId: vehicle.routeId, lastUpdate: ts.toISOString() }), 60)
  const poly = vehicle.route.points.map(p => ({ lat: p.lat, lon: p.lon }))
  await evaluateAlerts([{ vehicleId: vehicle.id, routeId: vehicle.routeId, lat: t.gps.lat, lon: t.gps.lon, speedKph: t.gps.speedKph, occupancy: t.occupancy, tier: t.tier, timestamp: ts }], new Map([[vehicle.routeId, poly]]))
  if (redis) { try { await redis.publish('pubsub:fleet:PH', JSON.stringify({ type: 'fleet:update', vehicleId: vehicle.id })) } catch {} }
  return NextResponse.json({ status: 'accepted', vehicleId: vehicle.id }, { status: 202 })
}
