import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { apiError } from '@/lib/api-error'
import { VehicleUpdateSchema, parseAllowedVehicleTypes, isVehicleTypeAllowed } from '@/lib/validators'

/**
 * GET    /api/v1/admin/vehicles/:vehicleId — single vehicle detail
 * PUT    /api/v1/admin/vehicles/:vehicleId — update (validates type constraint on route change)
 * DELETE /api/v1/admin/vehicles/:vehicleId — soft delete (status = 'inactive')
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ vehicleId: string }> },
) {
  const { vehicleId } = await params
  const vehicle = await db.vehicle.findFirst({
    where: { OR: [{ id: vehicleId }, { vehicleCode: vehicleId }] },
    include: {
      route: { select: { code: true, name: true, allowedVehicleTypes: true } },
      operator: { select: { name: true } },
      device: { select: { deviceCode: true, status: true, lastHeartbeatAt: true } },
      state: true,
    },
  })
  if (!vehicle) return apiError('not_found', `Vehicle '${vehicleId}' not found.`)
  return NextResponse.json({ vehicle })
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ vehicleId: string }> },
) {
  const { vehicleId } = await params
  const body = await req.json().catch(() => null)
  if (!body) return apiError('validation_error', 'Invalid JSON body.')

  const parsed = VehicleUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('validation_error', 'Invalid update data.', { details: parsed.error.flatten() })
  }
  const data = parsed.data

  const vehicle = await db.vehicle.findFirst({
    where: { OR: [{ id: vehicleId }, { vehicleCode: vehicleId }] },
  })
  if (!vehicle) return apiError('not_found', `Vehicle '${vehicleId}' not found.`)

  // if routeId is changing, validate the type constraint
  const newRouteId = data.routeId ?? vehicle.routeId
  const newVehicleType = data.vehicleType ?? vehicle.vehicleType
  if (data.routeId || data.vehicleType) {
    const route = await db.route.findUnique({ where: { id: newRouteId } })
    if (!route) return apiError('not_found', `Route '${newRouteId}' not found.`)
    const allowedTypes = parseAllowedVehicleTypes(route.allowedVehicleTypes)
    if (!isVehicleTypeAllowed(newVehicleType as any, allowedTypes)) {
      return apiError(
        'validation_error',
        `Vehicle type '${newVehicleType}' is not allowed on route ${route.code}. Allowed: ${allowedTypes.join(', ')}.`,
        { details: { allowedTypes, selectedType: newVehicleType } },
      )
    }
  }

  const updated = await db.vehicle.update({
    where: { id: vehicle.id },
    data: {
      ...(data.plateNo && { plateNo: data.plateNo }),
      ...(data.vehicleType && { vehicleType: data.vehicleType }),
      ...(data.routeId && { routeId: data.routeId }),
      ...(data.capacity && { capacity: data.capacity }),
      ...(data.brand !== undefined && { brand: data.brand }),
      ...(data.model !== undefined && { model: data.model }),
      ...(data.year !== undefined && { year: data.year }),
      ...(data.driver !== undefined && { driver: data.driver }),
      ...(data.registrationNo !== undefined && { registrationNo: data.registrationNo }),
    },
  })

  return NextResponse.json({ vehicle: updated })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ vehicleId: string }> },
) {
  const { vehicleId } = await params
  const vehicle = await db.vehicle.findFirst({
    where: { OR: [{ id: vehicleId }, { vehicleCode: vehicleId }] },
  })
  if (!vehicle) return apiError('not_found', `Vehicle '${vehicleId}' not found.`)

  // soft delete
  const updated = await db.vehicle.update({
    where: { id: vehicle.id },
    data: { status: 'inactive' },
  })

  return NextResponse.json({ vehicle: updated, status: 'deactivated' })
}
