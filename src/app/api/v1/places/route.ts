import { NextResponse } from 'next/server'
import { PlaceQuerySchema } from '@/lib/validators'
import { apiError } from '@/lib/api-error'
import { searchPlaces } from '@/lib/services/geocode-service'

/**
 * GET /api/v1/places?q=Colon — place search (Photon proxy, two-layer cached).
 * See concept/04-features.md C-06.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const params = { q: url.searchParams.get('q') ?? '', limit: Number(url.searchParams.get('limit') ?? 8) }
  const parsed = PlaceQuerySchema.safeParse(params)
  if (!parsed.success) {
    return apiError('validation_error', 'Invalid query.', { details: parsed.error.flatten() })
  }

  const results = await searchPlaces(parsed.data.q, 'PH', parsed.data.limit)
  return NextResponse.json({ places: results, count: results.length })
}
