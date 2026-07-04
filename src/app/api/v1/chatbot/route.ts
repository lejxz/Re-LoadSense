import { NextResponse } from 'next/server'
import { ChatQuerySchema } from '@/lib/validators'
import { apiError } from '@/lib/api-error'
import { answerQuery } from '@/lib/services/chatbot-service'

/**
 * POST /api/v1/chatbot — grounded boarding assistant.
 * Body: { query, sessionId, history? }
 *
 * See concept/04-features.md C-03.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  if (!body) return apiError('validation_error', 'Invalid JSON body.')

  const parsed = ChatQuerySchema.safeParse(body)
  if (!parsed.success) {
    return apiError('validation_error', 'Invalid request.', { details: parsed.error.flatten() })
  }

  const result = await answerQuery(parsed.data.query, parsed.data.sessionId)

  return NextResponse.json({
    answer: result.answer,
    intent: result.intent,
    entities: result.entities,
    context: result.context,
    source: result.source,
  })
}
