import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { apiError } from '@/lib/api-error'
import { parseAllowedVehicleTypes, isVehicleTypeAllowed } from '@/lib/validators'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function PUT(req: Request, { params }: { params: Promise<{ vehicleId: string }> }) {
  const { vehicleId } = await params
  const body = await req.json().catch(() => null)
  if (!body) return apiError('validation_error', 'Invalid JSON.')
  const vehicle = await db.vehicle.findFirst({ where: { OR: [{ id: vehicleId }, { vehicleCode: vehicleId }] } })
  if (!vehicle) return apiError('not_found', `Vehicle not found.`)
  if (body.routeId || body.vehicleType) {
    const routeId = body.routeId ?? vehicle.routeId
    const vt = body.vehicleType ?? vehicle.vehicleType
    const route = await db.route.findUnique({ where: { id: routeId } })
    if (route) { const allowed = parseAllowedVehicleTypes(route.allowedVehicleTypes); if (!isVehicleTypeAllowed(vt, allowed)) return apiError('validation_error', `Type '${vt}' not allowed on route ${route.code}.`) }
  }
  const updated = await db.vehicle.update({ where: { id: vehicle.id }, data: { ...(body.plateNo && { plateNo: body.plateNo }), ...(body.vehicleType && { vehicleType: body.vehicleType }), ...(body.routeId && { routeId: body.routeId }), ...(body.capacity && { capacity: body.capacity }) } })
  return NextResponse.json({ vehicle: updated })
}
export async function DELETE(_req: Request, { params }: { params: Promise<{ vehicleId: string }> }) {
  const { vehicleId } = await params
  const vehicle = await db.vehicle.findFirst({ where: { OR: [{ id: vehicleId }, { vehicleCode: vehicleId }] } })
  if (!vehicle) return apiError('not_found', `Vehicle not found.`)
  await db.vehicle.update({ where: { id: vehicle.id }, data: { status: 'inactive' } })
  return NextResponse.json({ status: 'deactivated' })
}
