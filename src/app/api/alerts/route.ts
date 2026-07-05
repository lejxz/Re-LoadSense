import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET(req: Request) {
  const url = new URL(req.url)
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 100)
  const alerts = await db.operatorAlert.findMany({
    where: url.searchParams.get('status') ? { status: url.searchParams.get('status')! } : { status: { in: ['open', 'acknowledged'] } },
    include: { vehicle: { select: { vehicleCode: true, vehicleType: true, capacity: true } }, route: { select: { code: true, name: true } } },
    take: limit, orderBy: { raisedAt: 'desc' },
  })
  return NextResponse.json({ alerts: alerts.map(a => ({ ...a, evidence: typeof a.evidence === 'string' ? JSON.parse(a.evidence) : a.evidence })), count: alerts.length })
}
