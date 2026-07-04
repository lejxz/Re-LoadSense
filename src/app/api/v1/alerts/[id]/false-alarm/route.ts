import { NextResponse } from 'next/server'
import { z } from 'zod'
import { falseAlarmAlert } from '@/lib/services/alert-service'
import { apiError } from '@/lib/api-error'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BodySchema = z.object({ note: z.string().max(500).optional() })

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) return apiError('validation_error', 'Invalid body.', { details: parsed.error.flatten() })

  const userId = 'demo-operator'
  try {
    const alert = await falseAlarmAlert(id, userId, parsed.data.note)
    return NextResponse.json({ alert })
  } catch {
    return apiError('not_found', `Alert '${id}' not found.`)
  }
}
