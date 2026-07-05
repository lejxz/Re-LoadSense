import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const db = new PrismaClient()

interface SeedRoute {
  code: string; name: string; type: 'PUJ' | 'BUS'
  origin: [number, number]; dest: [number, number]; tag: string
  allowedTypes: string[]; routeType: 'linear' | 'loop'; capacity: number
}

const ROUTES: SeedRoute[] = [
  { code: '04L', name: '04L Lahug - SM City', type: 'PUJ', origin: [10.3283, 123.8984], dest: [10.3115, 123.9182], tag: '04L', allowedTypes: ['jeepney'], routeType: 'linear', capacity: 20 },
  { code: '03B', name: '03B Mabolo - Colon', type: 'PUJ', origin: [10.3151, 123.9131], dest: [10.2974, 123.8997], tag: '03B', allowedTypes: ['jeepney'], routeType: 'linear', capacity: 20 },
  { code: '01A', name: '01A Urgello - Pier Area', type: 'PUJ', origin: [10.3015, 123.8951], dest: [10.2941, 123.9041], tag: '01A', allowedTypes: ['jeepney'], routeType: 'linear', capacity: 20 },
  { code: '17C', name: '17C Colon - Lahug', type: 'PUJ', origin: [10.2932, 123.8988], dest: [10.3283, 123.8984], tag: '17C', allowedTypes: ['jeepney'], routeType: 'linear', capacity: 20 },
  { code: '21A', name: '21A Mandaue - Manalili', type: 'PUJ', origin: [10.3341, 123.9431], dest: [10.2951, 123.9021], tag: '21A', allowedTypes: ['jeepney'], routeType: 'linear', capacity: 20 },
  { code: 'CIBUS', name: 'CIBUS IT Park - SM Seaside', type: 'BUS', origin: [10.3285, 123.9061], dest: [10.2811, 123.8811], tag: 'CIBUS', allowedTypes: ['bus', 'minibus'], routeType: 'linear', capacity: 50 },
  { code: 'MYBUS', name: 'MyBus SM City - Airport', type: 'BUS', origin: [10.3115, 123.9182], dest: [10.3251, 123.9781], tag: 'MYBUS', allowedTypes: ['bus'], routeType: 'linear', capacity: 50 },
  { code: 'CERES-S', name: 'Ceres Cebu - Carcar', type: 'BUS', origin: [10.2981, 123.8941], dest: [10.1065, 123.6391], tag: 'CERES-S', allowedTypes: ['bus', 'minibus'], routeType: 'linear', capacity: 55 },
]

function mulberry32(seed: number) {
  let a = seed
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

async function fetchPolyline(origin: { lat: number; lon: number }, dest: { lat: number; lon: number }): Promise<{ lat: number; lon: number }[]> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${origin.lon},${origin.lat};${dest.lon},${dest.lat}?overview=full&geometries=geojson`
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) throw new Error(`OSRM ${res.status}`)
    const data = await res.json()
    const coords: [number, number][] = data?.routes?.[0]?.geometry?.coordinates ?? []
    if (coords.length < 2) throw new Error('empty')
    return coords.map(([lon, lat]) => ({ lat, lon }))
  } catch {
    const points: { lat: number; lon: number }[] = []
    for (let i = 0; i <= 20; i++) { const t = i / 20; points.push({ lat: origin.lat + (dest.lat - origin.lat) * t, lon: origin.lon + (dest.lon - origin.lon) * t }) }
    return points
  }
}

async function main() {
  console.log('🌱 Seeding Re-LoadSense...')
  const rand = mulberry32(2026)

  const ph = await db.country.upsert({ where: { code: 'PH' }, update: {}, create: { code: 'PH', name: 'Philippines', currency: 'PHP', defaultLanguage: 'en' } })
  console.log(`  ✓ Country: ${ph.code}`)

  const operator = await db.operator.upsert({ where: { id: 'operator-cebu-transport' }, update: {}, create: { id: 'operator-cebu-transport', name: 'Cebu Transport Co.', countryCode: 'PH', licenseNo: 'LTFRB-CEB-2024-001' } })
  console.log(`  ✓ Operator: ${operator.name}`)

  const passwordHash = await bcrypt.hash('demo123', 10)
  await db.user.upsert({ where: { email: 'commuter@demo.com' }, update: {}, create: { email: 'commuter@demo.com', name: 'Demo Commuter', passwordHash, role: 'commuter', countryCode: 'PH' } })
  await db.user.upsert({ where: { email: 'operator@demo.com' }, update: {}, create: { email: 'operator@demo.com', name: 'Demo Operator', passwordHash, role: 'operator', operatorId: operator.id, countryCode: 'PH' } })
  console.log(`  ✓ Users: commuter@demo.com, operator@demo.com (demo123)`)

  console.log(`  → Seeding ${ROUTES.length} routes...`)
  for (const r of ROUTES) {
    const polyline = await fetchPolyline({ lat: r.origin[0]!, lon: r.origin[1]! }, { lat: r.dest[0]!, lon: r.dest[1]! })
    const nameParts = r.name.replace(/^[0-9A-Z]+\s*/, '').split(' - ')
    const route = await db.route.upsert({
      where: { code_countryCode: { code: r.code, countryCode: 'PH' } },
      update: { name: r.name, tag: r.tag, region: 'Cebu', originName: nameParts[0] ?? 'Origin', destinationName: nameParts[1] ?? 'Destination', capacity: r.capacity, allowedVehicleTypes: JSON.stringify(r.allowedTypes), routeType: r.routeType },
      create: { code: r.code, name: r.name, tag: r.tag, countryCode: 'PH', region: 'Cebu', originName: nameParts[0] ?? 'Origin', destinationName: nameParts[1] ?? 'Destination', capacity: r.capacity, allowedVehicleTypes: JSON.stringify(r.allowedTypes), routeType: r.routeType, minFare: 13.0, farePerKm: 2.25 },
    })
    await db.routePoint.deleteMany({ where: { routeId: route.id } })
    const stopInterval = Math.max(1, Math.floor(polyline.length / 12))
    const stopNames = [nameParts[0] ?? 'Origin', 'Checkpoint 1', 'Checkpoint 2', 'Checkpoint 3', 'Checkpoint 4', 'Checkpoint 5', 'Checkpoint 6', 'Checkpoint 7', 'Checkpoint 8', 'Checkpoint 9', 'Checkpoint 10', nameParts[1] ?? 'Destination']
    let stopIdx = 0
    await db.routePoint.createMany({
      data: polyline.map((p, i) => ({
        routeId: route.id, seq: i, lat: p.lat, lon: p.lon,
        isStop: i % stopInterval === 0 || i === polyline.length - 1,
        stopName: (i % stopInterval === 0 || i === polyline.length - 1) ? stopNames[Math.min(stopIdx++, stopNames.length - 1)] : null,
      })),
    })
    console.log(`    ✓ ${r.code} — ${polyline.length} points`)
  }

  const routes = await db.route.findMany({ where: { countryCode: 'PH' }, include: { points: { orderBy: { seq: 'asc' }, take: 1 } } })
  let vc = 0, dc = 0
  for (const route of routes) {
    const allowed = JSON.parse(route.allowedVehicleTypes) as string[]
    for (let i = 0; i < 2; i++) {
      const vehicleType = allowed[i % allowed.length]!
      const vehicleCode = `PH-${route.code}-${i + 1}`.replace(/[^A-Z0-9-]/g, '')
      const isBus = vehicleType === 'bus' || vehicleType === 'minibus'
      const vehicle = await db.vehicle.upsert({
        where: { vehicleCode },
        update: { vehicleType, routeId: route.id, operatorId: operator.id, countryCode: 'PH', capacity: isBus ? 50 : 20 },
        create: { vehicleCode, plateNo: `${String.fromCharCode(65 + Math.floor(rand() * 26))}${String.fromCharCode(65 + Math.floor(rand() * 26))}${String.fromCharCode(65 + Math.floor(rand() * 26))}-${Math.floor(100 + rand() * 900)}`, vehicleType, brand: isBus ? 'Volvo' : 'Isuzu', model: isBus ? 'Bus' : 'Jeepney', year: 2010 + Math.floor(rand() * 15), driver: `Driver ${Math.floor(1000 + rand() * 9000)}`, registrationNo: `REG-${Math.floor(100000 + rand() * 900000)}`, operatorId: operator.id, routeId: route.id, countryCode: 'PH', capacity: isBus ? 50 : 20 },
      })
      const apiKey = `dev-key-${vehicle.vehicleCode}-${Math.floor(rand() * 1e9).toString(36)}`
      await db.device.upsert({ where: { deviceCode: `DEV-${vehicle.vehicleCode}` }, update: { vehicleId: vehicle.id }, create: { deviceCode: `DEV-${vehicle.vehicleCode}`, vehicleId: vehicle.id, apiKeyHash: await bcrypt.hash(apiKey, 10) } })
      await db.vehicleState.upsert({ where: { vehicleId: vehicle.id }, update: {}, create: { vehicleId: vehicle.id, lat: route.points[0]?.lat ?? 0, lon: route.points[0]?.lon ?? 0, speedKph: 0, heading: 0, direction: 'forward', positionIndex: 0, occupancy: 0, tier: 'available', lastTelemetryAt: new Date(), online: true } })
      vc++; dc++
    }
  }
  console.log(`  ✓ Vehicles: ${vc}, Devices: ${dc}`)
  console.log('\n✅ Seed complete!')
}

main().catch(e => { console.error('❌', e); process.exit(1) }).finally(() => db.$disconnect())
