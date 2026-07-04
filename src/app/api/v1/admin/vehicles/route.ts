import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { apiError } from '@/lib/api-error'
import { VehicleCreateSchema, parseAllowedVehicleTypes, isVehicleTypeAllowed } from '@/lib/validators'

/**
 * GET  /api/v1/admin/vehicles — list all vehicles (admin/operator)
 * POST /api/v1/admin/vehicles — create a vehicle (validates route-vehicle type constraint)
 *
 * See concept/04-features.md O-03 + concept/03-data-model.md §4.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const params = url.searchParams
  const limit = Math.min(Number(params.get('limit') ?? 50), 100)

  const vehicles = await db.vehicle.findMany({
    where: {
      ...(params.get('routeId') ? { routeId: params.get('routeId')! } : {}),
      ...(params.get('operatorId') ? { operatorId: params.get('operatorId')! } : {}),
      ...(params.get('status') ? { status: params.get('status')! } : {}),
    },
    include: {
      route: { select: { code: true, name: true } },
      operator: { select: { name: true } },
      device: { select: { deviceCode: true, status: true } },
    },
    take: limit,
    orderBy: { vehicleCode: 'asc' },
  })

  return NextResponse.json({ vehicles, total: vehicles.length })
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  if (!body) return apiError('validation_error', 'Invalid JSON body.')

  const parsed = VehicleCreateSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('validation_error', 'Invalid vehicle data.', { details: parsed.error.flatten() })
  }
  const data = parsed.data

  // ── Validate the route-vehicle type constraint ──
  const route = await db.route.findUnique({ where: { id: data.routeId } })
  if (!route) return apiError('not_found', `Route '${data.routeId}' not found.`)

  const allowedTypes = parseAllowedVehicleTypes(route.allowedVehicleTypes)
  if (!isVehicleTypeAllowed(data.vehicleType, allowedTypes)) {
    return apiError(
      'validation_error',
      `Vehicle type '${data.vehicleType}' is not allowed on route ${route.code}. Allowed types: ${allowedTypes.join(', ')}.`,
      { details: { allowedTypes, selectedType: data.vehicleType } },
    )
  }

  // check vehicleCode uniqueness
  const existing = await db.vehicle.findUnique({ where: { vehicleCode: data.vehicleCode } })
  if (existing) return apiError('conflict', `Vehicle code '${data.vehicleCode}' already exists.`)

  // TODO: real auth — for now use a demo operator
  const operatorId = 'operator-cebu-transport'

  const vehicle = await db.vehicle.create({
    data: {
      vehicleCode: data.vehicleCode,
      plateNo: data.plateNo,
      vehicleType: data.vehicleType,
      brand: data.brand,
      model: data.model,
      year: data.year,
      driver: data.driver,
      registrationNo: data.registrationNo,
      operatorId,
      routeId: data.routeId,
      countryCode: route.countryCode,
      capacity: data.capacity,
      status: 'active',
    },
  })

  return NextResponse.json({ vehicle }, { status: 201 })
}
