/**
 * Alert evaluation service — runs on each telemetry upsert.
 *
 * Checks: overload (tier=overloaded >10s), route deviation (>200m via bbox),
 * speed anomaly (>80kph). Dedup: no duplicate open alerts for same
 * (vehicleId, type). Creates OperatorAlert rows with evidence JSON.
 *
 * See concept/04-features.md S-03 + concept/03-data-model.md §3.9.
 */

import { db } from '@/lib/db'
import { distanceToPolyline } from '@/lib/geo/bbox'
import type { LatLng } from '@/lib/geo/haversine'
import { logger } from '@/lib/logger'

const OVERLOAD_HOLD_SECONDS = 10
const SPEED_ANOMALY_KPH = 80
const ROUTE_DEVIATION_THRESHOLD_M = 200

type AlertType = 'overload' | 'route_deviation' | 'speed_anomaly' | 'signal_loss'

export interface TelemetryForAlerts {
  vehicleId: string
  routeId: string
  lat: number
  lon: number
  speedKph: number
  occupancy: number
  tier: string
  timestamp: Date
  /** when the current tier first started (for overload hold check) */
  tierHeldSince?: Date
}

export interface AlertCheckResult {
  raised: number
  skipped: number
}

/**
 * Evaluate alerts for a batch of telemetry events.
 *
 * @param telemetry   the telemetry events to check
 * @param routePolyline  optional cached polylines by routeId (avoids DB lookups)
 * @returns           count of alerts raised + skipped (dedup)
 */
export async function evaluateAlerts(
  telemetry: TelemetryForAlerts[],
  routePolylines: Map<string, LatLng[]>,
): Promise<AlertCheckResult> {
  let raised = 0
  let skipped = 0

  for (const t of telemetry) {
    // ── Overload check ──
    if (t.tier === 'overloaded' && t.tierHeldSince) {
      const heldSeconds = (t.timestamp.getTime() - t.tierHeldSince.getTime()) / 1000
      if (heldSeconds >= OVERLOAD_HOLD_SECONDS) {
        const created = await maybeCreateAlert(t, 'overload', 'high', {
          tier: t.tier,
          occupancy: t.occupancy,
          heldSeconds,
        })
        created ? raised++ : skipped++
      }
    }

    // ── Speed anomaly check ──
    if (t.speedKph > SPEED_ANOMALY_KPH) {
      const created = await maybeCreateAlert(t, 'speed_anomaly', 'medium', {
        speedKph: t.speedKph,
        threshold: SPEED_ANOMALY_KPH,
      })
      created ? raised++ : skipped++
    }

    // ── Route deviation check ──
    const polyline = routePolylines.get(t.routeId)
    if (polyline && polyline.length >= 2) {
      const deviationM = distanceToPolyline({ lat: t.lat, lon: t.lon }, polyline)
      if (deviationM > ROUTE_DEVIATION_THRESHOLD_M) {
        const created = await maybeCreateAlert(t, 'route_deviation', 'medium', {
          deviationM: Math.round(deviationM),
          thresholdM: ROUTE_DEVIATION_THRESHOLD_M,
        })
        created ? raised++ : skipped++
      }
    }
  }

  if (raised > 0) {
    logger.info({ raised, skipped, count: telemetry.length }, '[alerts] raised')
  }

  return { raised, skipped }
}

/**
 * Create an alert only if there's no existing open/acknowledged alert for the
 * same (vehicleId, type). Dedup.
 */
async function maybeCreateAlert(
  t: TelemetryForAlerts,
  type: AlertType,
  severity: 'low' | 'medium' | 'high',
  evidence: Record<string, unknown>,
): Promise<boolean> {
  // check for existing open alert (dedup)
  const existing = await db.operatorAlert.findFirst({
    where: {
      vehicleId: t.vehicleId,
      type,
      status: { in: ['open', 'acknowledged'] },
    },
    select: { id: true },
  })
  if (existing) return false

  await db.operatorAlert.create({
    data: {
      vehicleId: t.vehicleId,
      routeId: t.routeId,
      type,
      severity,
      status: 'open',
      evidence: JSON.stringify({
        ...evidence,
        lat: t.lat,
        lon: t.lon,
        speedKph: t.speedKph,
        occupancy: t.occupancy,
        tier: t.tier,
        timestamp: t.timestamp.toISOString(),
      }),
      raisedAt: t.timestamp,
    },
  })
  return true
}

/**
 * Verification workflow actions.
 */
export async function acknowledgeAlert(
  alertId: string,
  userId: string,
  note?: string,
) {
  const alert = await db.operatorAlert.update({
    where: { id: alertId },
    data: {
      status: 'acknowledged',
      acknowledgedAt: new Date(),
      acknowledgedBy: userId,
    },
  })
  await db.operatorFeedback.create({
    data: { alertId, userId, action: 'acknowledge', note },
  })
  return alert
}

export async function verifyAlert(alertId: string, userId: string, note?: string) {
  const alert = await db.operatorAlert.update({
    where: { id: alertId },
    data: {
      status: 'verified',
      resolvedAt: new Date(),
      resolvedBy: userId,
      resolutionNote: note,
    },
  })
  await db.operatorFeedback.create({
    data: { alertId, userId, action: 'verify', note },
  })
  return alert
}

export async function falseAlarmAlert(alertId: string, userId: string, note?: string) {
  const alert = await db.operatorAlert.update({
    where: { id: alertId },
    data: {
      status: 'false_alarm',
      resolvedAt: new Date(),
      resolvedBy: userId,
      resolutionNote: note,
    },
  })
  await db.operatorFeedback.create({
    data: { alertId, userId, action: 'false_alarm', note },
  })
  return alert
}
