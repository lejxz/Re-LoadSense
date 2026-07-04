import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { apiError } from '@/lib/api-error'
import { parseAllowedVehicleTypes } from '@/lib/validators'
import { z } from 'zod'

/**
 * GET  /api/v1/admin/routes — list all routes (admin)
 * POST /api/v1/admin/routes — create a route
 *
 * See concept/04-features.md O-04 + concept/03-data-model.md.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const RouteCreateSchema = z.object({
  code: z.string().min(1).max(20).regex(/^[0-9A-Z]+$/),
  name: z.string().min(1).max(200),
  tag: z.string().max(20).optional(),
  region: z.string().max(100).optional(),
  originName: z.string().max(100).optional(),
  destinationName: z.string().max(100).optional(),
  capacity: z.number().int().min(1).max(100).default(20),
  allowedVehicleTypes: z.array(z.string()).min(1).default(['jeepney']),
  routeType: z.enum(['linear', 'loop']).default('linear'),
  minFare: z.number().min(0).default(13.0),
  farePerKm: z.number().min(0).default(2.25),
  // optional polyline (array of {lat, lon}) — if provided, creates RoutePoints
  polyline: z.array(z.object({ lat: z.number(), lon: z.number() })).optional(),
})

export async function GET(req: Request) {
  const url = new URL(req.url)
  const params = url.searchParams
  const limit = Math.min(Number(params.get('limit') ?? 50), 100)

  const routes = await db.route.findMany({
    where: {
      ...(params.get('countryCode') ? { countryCode: params.get('countryCode')! } : {}),
    },
    include: {
      _count: { select: { vehicles: { where: { status: 'active' } } } },
    },
    take: limit,
    orderBy: { code: 'asc' },
  })

  return NextResponse.json({
    routes: routes.map((r) => ({
      ...r,
      allowedVehicleTypes: parseAllowedVehicleTypes(r.allowedVehicleTypes),
    })),
    total: routes.length,
  })
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  if (!body) return apiError('validation_error', 'Invalid JSON body.')

  const parsed = RouteCreateSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('validation_error', 'Invalid route data.', { details: parsed.error.flatten() })
  }
  const data = parsed.data

  // check uniqueness
  const existing = await db.route.findUnique({
    where: { code_countryCode: { code: data.code, countryCode: 'PH' } },
  })
  if (existing) return apiError('conflict', `Route code '${data.code}' already exists.`)

  const route = await db.route.create({
    data: {
      code: data.code,
      name: data.name,
      tag: data.tag,
      countryCode: 'PH',
      region: data.region,
      originName: data.originName,
      destinationName: data.destinationName,
      capacity: data.capacity,
      allowedVehicleTypes: JSON.stringify(data.allowedVehicleTypes),
      routeType: data.routeType,
      minFare: data.minFare,
      farePerKm: data.farePerKm,
      status: 'active',
    },
  })

  // if polyline provided, create route points
  if (data.polyline && data.polyline.length >= 2) {
    await db.routePoint.createMany({
      data: data.polyline.map((p, i) => ({
        routeId: route.id,
        seq: i,
        lat: p.lat,
        lon: p.lon,
        isStop: i === 0 || i === data.polyline!.length - 1,
        stopName: i === 0 ? data.originName : i === data.polyline!.length - 1 ? data.destinationName : null,
      })),
    })
  }

  return NextResponse.json({ route }, { status: 201 })
}
