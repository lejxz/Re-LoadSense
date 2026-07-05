import { NextResponse } from 'next/server'
import { getVehicle } from '@/lib/services/fleet-service'
import { apiError } from '@/lib/api-error'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET(_req: Request, { params }: { params: Promise<{ vehicleId: string }> }) {
  const { vehicleId } = await params
  const v = await getVehicle(vehicleId)
  if (!v) return apiError('not_found', `Vehicle '${vehicleId}' not found.`)
  return NextResponse.json(v)
}
