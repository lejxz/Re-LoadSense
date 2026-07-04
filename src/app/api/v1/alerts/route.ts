import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * GET /api/v1/alerts — list alerts, filterable.
 * Query params: status, type, vehicleId, routeId, limit, cursor
 * See concept/04-features.md O-02.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const params = url.searchParams
  const limit = Math.min(Number(params.get('limit') ?? 50), 100)
  const cursor = params.get('cursor') || undefined

  const where = {
    ...(params.get('status') ? { status: params.get('status')! } : {}),
    ...(params.get('type') ? { type: params.get('type')! } : {}),
    ...(params.get('vehicleId') ? { vehicleId: params.get('vehicleId')! } : {}),
    ...(params.get('routeId') ? { routeId: params.get('routeId')! } : {}),
  }

  const alerts = await db.operatorAlert.findMany({
    where,
    include: {
      vehicle: { select: { vehicleCode: true, vehicleType: true, capacity: true } },
      route: { select: { code: true, name: true } },
    },
    take: limit + 1,
    ...(cursor && { skip: 1, cursor: { id: cursor } }),
    orderBy: { raisedAt: 'desc' },
  })

  const hasMore = alerts.length > limit
  const sliced = hasMore ? alerts.slice(0, limit) : alerts

  return NextResponse.json({
    alerts: sliced.map((a) => ({
      ...a,
      evidence: typeof a.evidence === 'string' ? JSON.parse(a.evidence) : a.evidence,
    })),
    total: sliced.length,
    hasMore,
    cursor: hasMore ? sliced[sliced.length - 1]?.id ?? null : null,
  })
}
