import { NextResponse } from 'next/server'
import { getFleet } from '@/lib/services/fleet-service'

/**
 * GET /api/v1/fleet — live fleet, paginated, filterable.
 *
 * Query params:
 *   routeId, tier, online, vehicleType, countryCode, operatorId — filters
 *   cursor, limit — pagination
 *
 * See concept/04-features.md C-01 (commuter map) + O-01 (operator fleet).
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const params = url.searchParams

  const filter = {
    routeId: params.get('routeId') || undefined,
    tier: params.get('tier') || undefined,
    online: params.get('online') === 'true' ? true : undefined,
    vehicleType: params.get('vehicleType') || undefined,
    countryCode: params.get('countryCode') || 'PH',
    operatorId: params.get('operatorId') || undefined,
  }

  const result = await getFleet({
    filter,
    cursor: params.get('cursor') || undefined,
    limit: Number(params.get('limit') ?? 50),
  })

  return NextResponse.json(result)
}
