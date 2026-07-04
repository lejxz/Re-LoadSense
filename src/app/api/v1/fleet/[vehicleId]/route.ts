import { NextResponse } from 'next/server'
import { getVehicle } from '@/lib/services/fleet-service'
import { apiError } from '@/lib/api-error'

/**
 * GET /api/v1/fleet/:vehicleId — single vehicle detail (live state + static data).
 * Accepts either the internal id or the human-friendly vehicleCode.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ vehicleId: string }> },
) {
  const { vehicleId } = await params
  const vehicle = await getVehicle(vehicleId)
  if (!vehicle) {
    return apiError('not_found', `Vehicle '${vehicleId}' not found.`)
  }
  return NextResponse.json(vehicle)
}
