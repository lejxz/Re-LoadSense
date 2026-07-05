import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { parseAllowedVehicleTypes } from '@/lib/validators'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET(req: Request) {
  const url = new URL(req.url)
  const country = url.searchParams.get('country') || 'PH'
  const routes = await db.route.findMany({
    where: { status: 'active', countryCode: country },
    include: { _count: { select: { vehicles: { where: { status: 'active' } } } } },
    orderBy: { code: 'asc' },
  })
  return NextResponse.json({
    routes: routes.map(r => ({
      route: r.code, name: r.name, country: r.countryCode, region: r.region,
      tag: r.tag, route_type: r.routeType === 'linear' ? 'PUJ' : 'BUS',
      origin_name: r.originName, destination_name: r.destinationName,
      distance_km: r.distanceKm, description: '',
      minimum_fare: r.minFare, fare_per_km: r.farePerKm,
      vehicleCount: r._count.vehicles,
      allowedVehicleTypes: parseAllowedVehicleTypes(r.allowedVehicleTypes),
      routeType: r.routeType,
    })),
    count: routes.length,
  })
}
