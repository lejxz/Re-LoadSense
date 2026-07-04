/**
 * Seed script — populates the DB with real Cebu routes + vehicles.
 *
 * Run with: `bun run db:seed`
 *
 * Data sources:
 * - Routes: real Cebu jeepney + bus codes/names/coordinates (from the original
 *   LoadSense project's populate_demo_data.py CEBU_ROUTES array).
 * - Polylines: fetched from the public OSRM router at seed time, with a
 *   straight-line fallback if OSRM is unavailable.
 *
 * See concept/03-data-model.md §8 (seed data) + concept/08-implementation-checklist.md Step 1.2.
 */

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const db = new PrismaClient()

// ── Real Cebu routes (subset of the original's 40+) ──
// Each: { code, name, type (PUJ/BUS), origin [lat,lon], dest [lat,lon], tag, allowedTypes, routeType }

interface SeedRoute {
  code: string
  name: string
  type: 'PUJ' | 'BUS'
  origin: [number, number]
  dest: [number, number]
  tag: string
  allowedTypes: string[]
  routeType: 'linear' | 'loop'
  capacity: number
}

const ROUTES: SeedRoute[] = [
  {
    code: '04L',
    name: '04L Lahug - SM City',
    type: 'PUJ',
    origin: [10.3283, 123.8984],
    dest: [10.3115, 123.9182],
    tag: '04L',
    allowedTypes: ['jeepney'],
    routeType: 'linear',
    capacity: 20,
  },
  {
    code: '03B',
    name: '03B Mabolo - Colon',
    type: 'PUJ',
    origin: [10.3151, 123.9131],
    dest: [10.2974, 123.8997],
    tag: '03B',
    allowedTypes: ['jeepney'],
    routeType: 'linear',
    capacity: 20,
  },
  {
    code: '01A',
    name: '01A Urgello - Pier Area',
    type: 'PUJ',
    origin: [10.3015, 123.8951],
    dest: [10.2941, 123.9041],
    tag: '01A',
    allowedTypes: ['jeepney'],
    routeType: 'linear',
    capacity: 20,
  },
  {
    code: '17C',
    name: '17C Colon - Lahug via Juana Osmeña',
    type: 'PUJ',
    origin: [10.2932, 123.8988],
    dest: [10.3283, 123.8984],
    tag: '17C',
    allowedTypes: ['jeepney'],
    routeType: 'linear',
    capacity: 20,
  },
  {
    code: '21A',
    name: '21A Mandaue - Manalili (via Mabolo)',
    type: 'PUJ',
    origin: [10.3341, 123.9431],
    dest: [10.2951, 123.9021],
    tag: '21A',
    allowedTypes: ['jeepney'],
    routeType: 'linear',
    capacity: 20,
  },
  {
    code: 'CIBUS',
    name: 'CIBUS IT Park - SM Seaside',
    type: 'BUS',
    origin: [10.3285, 123.9061],
    dest: [10.2811, 123.8811],
    tag: 'CIBUS',
    allowedTypes: ['bus', 'minibus'],
    routeType: 'linear',
    capacity: 50,
  },
  {
    code: 'MYBUS',
    name: 'MyBus SM City - Airport',
    type: 'BUS',
    origin: [10.3115, 123.9182],
    dest: [10.3251, 123.9781],
    tag: 'MYBUS',
    allowedTypes: ['bus'],
    routeType: 'linear',
    capacity: 50,
  },
  {
    code: 'CERES-S',
    name: 'Ceres Cebu - Carcar',
    type: 'BUS',
    origin: [10.2981, 123.8941],
    dest: [10.1065, 123.6391],
    tag: 'CERES-S',
    allowedTypes: ['bus', 'minibus'],
    routeType: 'linear',
    capacity: 55,
  },
]

// ── Seeded RNG (mulberry32) for reproducible seed data ──

function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ── OSRM polyline fetch (with straight-line fallback) ──

interface Point {
  lat: number
  lon: number
}

async function fetchPolyline(origin: Point, dest: Point): Promise<Point[]> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${origin.lon},${origin.lat};${dest.lon},${dest.lat}?overview=full&geometries=geojson`
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) throw new Error(`OSRM ${res.status}`)
    const data = await res.json()
    const coords: [number, number][] = data?.routes?.[0]?.geometry?.coordinates ?? []
    if (coords.length < 2) throw new Error('OSRM empty')
    return coords.map(([lon, lat]) => ({ lat, lon }))
  } catch {
    // straight-line fallback: interpolate 20 points between origin + dest
    console.warn(`[seed] OSRM failed, using straight-line interpolation`)
    const points: Point[] = []
    const N = 20
    for (let i = 0; i <= N; i++) {
      const t = i / N
      points.push({
        lat: origin.lat + (dest.lat - origin.lat) * t,
        lon: origin.lon + (dest.lon - origin.lon) * t,
      })
    }
    return points
  }
}

// ── Main seed ──

async function main() {
  console.log('🌱 Seeding Re-LoadSense database...')

  const rand = mulberry32(2026)

  // ── 1. Country ──
  const ph = await db.country.upsert({
    where: { code: 'PH' },
    update: {},
    create: {
      code: 'PH',
      name: 'Philippines',
      currency: 'PHP',
      defaultLanguage: 'en',
    },
  })
  console.log(`  ✓ Country: ${ph.code}`)

  // ── 2. Operator ──
  const operator = await db.operator.upsert({
    where: { id: 'operator-cebu-transport' },
    update: {},
    create: {
      id: 'operator-cebu-transport',
      name: 'Cebu Transport Co.',
      countryCode: 'PH',
      licenseNo: 'LTFRB-CEB-2024-001',
      status: 'active',
    },
  })
  console.log(`  ✓ Operator: ${operator.name}`)

  // ── 3. Users ──
  const passwordHash = await bcrypt.hash('demo123', 10)
  await db.user.upsert({
    where: { email: 'commuter@demo.com' },
    update: {},
    create: {
      email: 'commuter@demo.com',
      name: 'Demo Commuter',
      passwordHash,
      role: 'commuter',
      countryCode: 'PH',
      status: 'active',
    },
  })
  await db.user.upsert({
    where: { email: 'operator@demo.com' },
    update: {},
    create: {
      email: 'operator@demo.com',
      name: 'Demo Operator',
      passwordHash,
      role: 'operator',
      operatorId: operator.id,
      countryCode: 'PH',
      status: 'active',
    },
  })
  console.log(`  ✓ Users: commuter@demo.com, operator@demo.com (password: demo123)`)

  // ── 4. Routes + RoutePoints ──
  console.log(`  → Seeding ${ROUTES.length} routes (fetching polylines from OSRM)...`)
  for (const r of ROUTES) {
    const polyline = await fetchPolyline(
      { lat: r.origin[0]!, lon: r.origin[1]! },
      { lat: r.dest[0]!, lon: r.dest[1]! },
    )

    // derive origin/destination names from the route name (after the code)
    const nameParts = r.name.replace(/^[0-9A-Z]+\s*/, '').split(' - ')
    const originName = nameParts[0] ?? 'Origin'
    const destinationName = nameParts[1] ?? 'Destination'

    const route = await db.route.upsert({
      where: { code_countryCode: { code: r.code, countryCode: 'PH' } },
      update: {
        name: r.name,
        tag: r.tag,
        region: 'Cebu',
        originName,
        destinationName,
        capacity: r.capacity,
        allowedVehicleTypes: JSON.stringify(r.allowedTypes),
        routeType: r.routeType,
      },
      create: {
        code: r.code,
        name: r.name,
        tag: r.tag,
        countryCode: 'PH',
        region: 'Cebu',
        originName,
        destinationName,
        capacity: r.capacity,
        allowedVehicleTypes: JSON.stringify(r.allowedTypes),
        routeType: r.routeType,
        minFare: 13.0,
        farePerKm: 2.25,
        status: 'active',
      },
    })

    // delete existing points + recreate (simpler than upsert per point)
    await db.routePoint.deleteMany({ where: { routeId: route.id } })

    // mark ~12 evenly-spaced points as stops
    const stopInterval = Math.max(1, Math.floor(polyline.length / 12))
    const stopNames = [
      originName,
      'Checkpoint 1',
      'Checkpoint 2',
      'Checkpoint 3',
      'Checkpoint 4',
      'Checkpoint 5',
      'Checkpoint 6',
      'Checkpoint 7',
      'Checkpoint 8',
      'Checkpoint 9',
      'Checkpoint 10',
      destinationName,
    ]
    let stopIdx = 0

    await db.routePoint.createMany({
      data: polyline.map((p, i) => ({
        routeId: route.id,
        seq: i,
        lat: p.lat,
        lon: p.lon,
        isStop: i % stopInterval === 0 || i === polyline.length - 1,
        stopName:
          i % stopInterval === 0 || i === polyline.length - 1
            ? stopNames[Math.min(stopIdx++, stopNames.length - 1)]
            : null,
      })),
    })

    console.log(
      `    ✓ ${r.code} (${r.name}) — ${polyline.length} points, ~${Math.floor(polyline.length / stopInterval)} stops`,
    )
  }

  // ── 5. Vehicles + Devices ──
  const routes = await db.route.findMany({
    where: { countryCode: 'PH' },
    include: { points: { orderBy: { seq: 'asc' }, take: 1 } },
  })
  let vehicleCount = 0
  let deviceCount = 0

  for (const route of routes) {
    const seedRoute = ROUTES.find((r) => r.code === route.code)!
    const allowedTypes = JSON.parse(route.allowedVehicleTypes) as string[]
    // 2 vehicles per route ( jeepneys for PUJ, buses for BUS )
    const vehiclesPerRoute = 2

    for (let i = 0; i < vehiclesPerRoute; i++) {
      const vehicleType = allowedTypes[i % allowedTypes.length]!
      const vehicleCode = `PH-${route.code}-${i + 1}`.replace(/[^A-Z0-9-]/g, '')
      const isBus = vehicleType === 'bus' || vehicleType === 'minibus'
      const capacity = vehicleType === 'bus' ? 50 : vehicleType === 'minibus' ? 30 : 20

      const vehicle = await db.vehicle.upsert({
        where: { vehicleCode },
        update: {
          vehicleType,
          routeId: route.id,
          operatorId: operator.id,
          countryCode: 'PH',
          capacity,
        },
        create: {
          vehicleCode,
          plateNo: `${String.fromCharCode(65 + Math.floor(rand() * 26))}${String.fromCharCode(65 + Math.floor(rand() * 26))}${String.fromCharCode(65 + Math.floor(rand() * 26))}-${Math.floor(100 + rand() * 900)}`,
          vehicleType,
          brand: isBus ? 'Volvo' : 'Isuzu',
          model: isBus ? 'Bus' : 'Jeepney',
          year: 2010 + Math.floor(rand() * 15),
          driver: `Driver ${Math.floor(1000 + rand() * 9000)}`,
          registrationNo: `REG-${Math.floor(100000 + rand() * 900000)}`,
          operatorId: operator.id,
          routeId: route.id,
          countryCode: 'PH',
          capacity,
          status: 'active',
        },
      })

      // device (one per vehicle, auto-generated key)
      const apiKey = `dev-key-${vehicle.vehicleCode}-${Math.floor(rand() * 1e9).toString(36)}`
      const apiKeyHash = await bcrypt.hash(apiKey, 10)
      await db.device.upsert({
        where: { deviceCode: `DEV-${vehicle.vehicleCode}` },
        update: { vehicleId: vehicle.id, status: 'active' },
        create: {
          deviceCode: `DEV-${vehicle.vehicleCode}`,
          vehicleId: vehicle.id,
          apiKeyHash,
          firmwareVersion: 'sim-1.0.0',
          modelVersion: 'sim-1.0.0',
          status: 'active',
        },
      })

      // initial vehicle state (at first stop, empty, available)
      await db.vehicleState.upsert({
        where: { vehicleId: vehicle.id },
        update: {},
        create: {
          vehicleId: vehicle.id,
          lat: route.points[0]?.lat ?? 0,
          lon: route.points[0]?.lon ?? 0,
          speedKph: 0,
          heading: 0,
          direction: 'forward',
          positionIndex: 0,
          occupancy: 0,
          tier: 'available',
          lastTelemetryAt: new Date(),
          online: true,
        },
      })

      vehicleCount++
      deviceCount++
    }
  }
  console.log(`  ✓ Vehicles: ${vehicleCount} (2 per route)`)
  console.log(`  ✓ Devices: ${deviceCount} (one per vehicle)`)

  console.log('\n✅ Seed complete!')
  console.log(`   ${ROUTES.length} routes, ${vehicleCount} vehicles, 2 users`)
  console.log('   Login: commuter@demo.com / operator@demo.com (password: demo123)')
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
