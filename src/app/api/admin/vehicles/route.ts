import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { apiError } from '@/lib/api-error'
import { VehicleCreateSchema, parseAllowedVehicleTypes, isVehicleTypeAllowed } from '@/lib/validators'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET(req: Request) {
  const url = new URL(req.url)
  const vehicles = await db.vehicle.findMany({ where: { status: 'active' }, include: { route: { select: { code: true, name: true } }, operator: { select: { name: true } }, device: { select: { deviceCode: true, status: true } } }, orderBy: { vehicleCode: 'asc' } })
  return NextResponse.json({ vehicles: vehicles.map(v => ({ ...v, vehicle_id: v.vehicleCode, route: v.route.code, vehicle_type: v.vehicleType.toUpperCase(), plate_number: v.plateNo, max_occupancy: v.capacity, registration_number: v.registrationNo })) })
}
export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  if (!body) return apiError('validation_error', 'Invalid JSON.')
  const parsed = VehicleCreateSchema.safeParse(body)
  if (!parsed.success) return apiError('validation_error', 'Invalid vehicle.', { details: parsed.error.flatten() })
  const data = parsed.data
  const route = await db.route.findUnique({ where: { id: data.routeId } })
  if (!route) return apiError('not_found', `Route not found.`)
  const allowed = parseAllowedVehicleTypes(route.allowedVehicleTypes)
  if (!isVehicleTypeAllowed(data.vehicleType, allowed)) return apiError('validation_error', `Type '${data.vehicleType}' not allowed on route ${route.code}. Allowed: ${allowed.join(', ')}.`, { details: { allowedTypes: allowed, selectedType: data.vehicleType } })
  const existing = await db.vehicle.findUnique({ where: { vehicleCode: data.vehicleCode } })
  if (existing) return apiError('conflict', `Vehicle code '${data.vehicleCode}' exists.`)
  const vehicle = await db.vehicle.create({ data: { vehicleCode: data.vehicleCode, plateNo: data.plateNo, vehicleType: data.vehicleType, brand: data.brand, model: data.model, year: data.year, driver: data.driver, registrationNo: data.registrationNo, operatorId: 'operator-cebu-transport', routeId: data.routeId, countryCode: route.countryCode, capacity: data.capacity } })
  return NextResponse.json({ vehicle }, { status: 201 })
}
