import { db } from '@/lib/db'
import { distanceToPolyline } from '@/lib/geo/bbox'
import type { LatLng } from '@/lib/geo/haversine'
import { logger } from '@/lib/logger'

const OVERLOAD_HOLD_SECONDS = 10, SPEED_ANOMALY_KPH = 80, ROUTE_DEVIATION_THRESHOLD_M = 200
type AlertType = 'overload' | 'route_deviation' | 'speed_anomaly' | 'signal_loss'

export interface TelemetryForAlerts { vehicleId: string; routeId: string; lat: number; lon: number; speedKph: number; occupancy: number; tier: string; timestamp: Date; tierHeldSince?: Date }
export interface AlertCheckResult { raised: number; skipped: number }

export async function evaluateAlerts(telemetry: TelemetryForAlerts[], routePolylines: Map<string, LatLng[]>): Promise<AlertCheckResult> {
  let raised = 0, skipped = 0
  for (const t of telemetry) {
    if (t.tier === 'overloaded' && t.tierHeldSince) {
      if ((t.timestamp.getTime() - t.tierHeldSince.getTime()) / 1000 >= OVERLOAD_HOLD_SECONDS) { (await maybeCreateAlert(t, 'overload', 'high', { tier: t.tier, occupancy: t.occupancy })) ? raised++ : skipped++ }
    }
    if (t.speedKph > SPEED_ANOMALY_KPH) { (await maybeCreateAlert(t, 'speed_anomaly', 'medium', { speedKph: t.speedKph, threshold: SPEED_ANOMALY_KPH })) ? raised++ : skipped++ }
    const poly = routePolylines.get(t.routeId)
    if (poly && poly.length >= 2) {
      const devM = distanceToPolyline({ lat: t.lat, lon: t.lon }, poly)
      if (devM > ROUTE_DEVIATION_THRESHOLD_M) { (await maybeCreateAlert(t, 'route_deviation', 'medium', { deviationM: Math.round(devM), thresholdM: ROUTE_DEVIATION_THRESHOLD_M })) ? raised++ : skipped++ }
    }
  }
  if (raised > 0) logger.info({ raised, skipped }, '[alerts] raised')
  return { raised, skipped }
}

async function maybeCreateAlert(t: TelemetryForAlerts, type: AlertType, severity: 'low' | 'medium' | 'high', evidence: Record<string, unknown>): Promise<boolean> {
  const existing = await db.operatorAlert.findFirst({ where: { vehicleId: t.vehicleId, type, status: { in: ['open', 'acknowledged'] } }, select: { id: true } })
  if (existing) return false
  await db.operatorAlert.create({ data: { vehicleId: t.vehicleId, routeId: t.routeId, type, severity, status: 'open', evidence: JSON.stringify({ ...evidence, lat: t.lat, lon: t.lon, speedKph: t.speedKph, occupancy: t.occupancy, tier: t.tier, timestamp: t.timestamp.toISOString() }), raisedAt: t.timestamp } })
  return true
}

export async function acknowledgeAlert(alertId: string, userId: string, note?: string) {
  const alert = await db.operatorAlert.update({ where: { id: alertId }, data: { status: 'acknowledged', acknowledgedAt: new Date(), acknowledgedBy: userId } })
  await db.operatorFeedback.create({ data: { alertId, userId, action: 'acknowledge', note } })
  return alert
}
export async function verifyAlert(alertId: string, userId: string, note?: string) {
  const alert = await db.operatorAlert.update({ where: { id: alertId }, data: { status: 'verified', resolvedAt: new Date(), resolvedBy: userId, resolutionNote: note } })
  await db.operatorFeedback.create({ data: { alertId, userId, action: 'verify', note } })
  return alert
}
export async function falseAlarmAlert(alertId: string, userId: string, note?: string) {
  const alert = await db.operatorAlert.update({ where: { id: alertId }, data: { status: 'false_alarm', resolvedAt: new Date(), resolvedBy: userId, resolutionNote: note } })
  await db.operatorFeedback.create({ data: { alertId, userId, action: 'false_alarm', note } })
  return alert
}
