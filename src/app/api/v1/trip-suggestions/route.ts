import { NextResponse } from 'next/server'
import { TripSuggestionSchema } from '@/lib/validators'
import { apiError } from '@/lib/api-error'
import { planTrip } from '@/lib/services/trip-service'

/**
 * POST /api/v1/trip-suggestions — multi-leg trip planning.
 * Body: { origin: {lat, lon}, destination: {lat, lon}, originName?, destinationName? }
 *
 * See concept/04-features.md C-04.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  if (!body) return apiError('validation_error', 'Invalid JSON body.')

  const parsed = TripSuggestionSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('validation_error', 'Invalid request.', { details: parsed.error.flatten() })
  }

  const { origin, destination, originName, destinationName } = parsed.data
  const suggestions = await planTrip(origin, destination, originName, destinationName)

  if (suggestions.length === 0) {
    return NextResponse.json({
      suggestions: [],
      message: 'No routes found near your origin or destination. Try different points.',
    })
  }

  return NextResponse.json({ suggestions, count: suggestions.length })
}
