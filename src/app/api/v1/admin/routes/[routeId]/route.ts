import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { apiError } from '@/lib/api-error'
import { parseAllowedVehicleTypes } from '@/lib/validators'
import { z } from 'zod'

/**
 * GET    /api/v1/admin/routes/:routeId — route detail
 * PUT    /api/v1/admin/routes/:routeId — update (409 if removing a used vehicle type)
 * DELETE /api/v1/admin/routes/:routeId — soft delete (status = 'inactive')
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const RouteUpdateSchema = z.object({
  name: z.string().max(200).optional(),
  tag: z.string().max(20).optional(),
  region: z.string().max(100).optional(),
  originName: z.string().max(100).optional(),
  destinationName: z.string().max(100).optional(),
  capacity: z.number().int().min(1).max(100).optional(),
  allowedVehicleTypes: z.array(z.string()).min(1).optional(),
  routeType: z.enum(['linear', 'loop']).optional(),
  minFare: z.number().min(0).optional(),
  farePerKm: z.number().min(0).optional(),
})

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ routeId: string }> },
) {
  const { routeId } = await params
  const route = await db.route.findFirst({
    where: { OR: [{ id: routeId }, { code: routeId }] },
    include: {
      points: { orderBy: { seq: 'asc' } },
      _count: { select: { vehicles: { where: { status: 'active' } } } },
    },
  })
  if (!route) return apiError('not_found', `Route '${routeId}' not found.`)

  return NextResponse.json({
    ...route,
    allowedVehicleTypes: parseAllowedVehicleTypes(route.allowedVehicleTypes),
  })
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ routeId: string }> },
) {
  const { routeId } = await params
  const body = await req.json().catch(() => null)
  if (!body) return apiError('validation_error', 'Invalid JSON body.')

  const parsed = RouteUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('validation_error', 'Invalid update data.', { details: parsed.error.flatten() })
  }
  const data = parsed.data

  const route = await db.route.findFirst({
    where: { OR: [{ id: routeId }, { code: routeId }] },
  })
  if (!route) return apiError('not_found', `Route '${routeId}' not found.`)

  // if updating allowedVehicleTypes, check no vehicles use a removed type
  if (data.allowedVehicleTypes) {
    const currentTypes = parseAllowedVehicleTypes(route.allowedVehicleTypes)
    const removedTypes = currentTypes.filter((t) => !data.allowedVehicleTypes!.includes(t))

    if (removedTypes.length > 0) {
      // check if any vehicles use the removed types
      const vehiclesUsingRemoved = await db.vehicle.count({
        where: {
          routeId: route.id,
          status: 'active',
          vehicleType: { in: removedTypes },
        },
      })
      if (vehiclesUsingRemoved > 0) {
        return apiError(
          'conflict',
          `Cannot remove type(s) ${removedTypes.join(', ')} — ${vehiclesUsingRemoved} vehicle(s) on this route use ${removedTypes.length > 1 ? 'them' : 'it'}. Reassign those vehicles first.`,
          { details: { removedTypes, vehiclesUsingRemoved } },
        )
      }
    }
  }

  const updated = await db.route.update({
    where: { id: route.id },
    data: {
      ...(data.name && { name: data.name }),
      ...(data.tag !== undefined && { tag: data.tag }),
      ...(data.region !== undefined && { region: data.region }),
      ...(data.originName !== undefined && { originName: data.originName }),
      ...(data.destinationName !== undefined && { destinationName: data.destinationName }),
      ...(data.capacity && { capacity: data.capacity }),
      ...(data.allowedVehicleTypes && { allowedVehicleTypes: JSON.stringify(data.allowedVehicleTypes) }),
      ...(data.routeType && { routeType: data.routeType }),
      ...(data.minFare !== undefined && { minFare: data.minFare }),
      ...(data.farePerKm !== undefined && { farePerKm: data.farePerKm }),
    },
  })

  return NextResponse.json({
    ...updated,
    allowedVehicleTypes: parseAllowedVehicleTypes(updated.allowedVehicleTypes),
  })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ routeId: string }> },
) {
  const { routeId } = await params
  const route = await db.route.findFirst({
    where: { OR: [{ id: routeId }, { code: routeId }] },
  })
  if (!route) return apiError('not_found', `Route '${routeId}' not found.`)

  // soft delete
  const updated = await db.route.update({
    where: { id: route.id },
    data: { status: 'inactive' },
  })

  return NextResponse.json({ route: updated, status: 'deactivated' })
}
