import { NextResponse } from 'next/server'
import { falseAlarmAlert } from '@/lib/services/alert-service'
import { apiError } from '@/lib/api-error'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  try { const alert = await falseAlarmAlert(id, 'demo-operator', body.note); return NextResponse.json({ alert }) }
  catch { return apiError('not_found', `Alert '${id}' not found.`) }
}
