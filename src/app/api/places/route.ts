import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { cacheGet, cacheSet } from '@/lib/redis'
import { logger } from '@/lib/logger'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET(req: Request) {
  const url = new URL(req.url)
  const q = url.searchParams.get('q') || ''
  if (!q) return NextResponse.json({ places: [] })
  const normalized = q.trim().toLowerCase()
  const cacheKey = `places:${normalized}`
  const cached = await cacheGet<string>(cacheKey)
  if (cached) return NextResponse.json(JSON.parse(cached))
  const dbPlaces = await db.place.findMany({ where: { query: normalized }, take: 8 })
  if (dbPlaces.length > 0) { const r = { places: dbPlaces.map(p => ({ name: p.name, lat: p.lat, lon: p.lon, type: p.placeType })) }; await cacheSet(cacheKey, JSON.stringify(r), 300); return NextResponse.json(r) }
  try {
    const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8`, { headers: { 'User-Agent': 'Re-LoadSense/1.0' }, signal: AbortSignal.timeout(3000) })
    if (!res.ok) throw new Error(`Photon ${res.status}`)
    const data = await res.json()
    const places = (data.features || []).filter((f: any) => f.geometry?.coordinates && f.properties?.name).map((f: any) => ({ name: f.properties.name, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], type: f.properties.osm_value }))
    for (const p of places) await db.place.upsert({ where: { query_countryCode: { query: normalized, countryCode: 'PH' } }, update: { name: p.name, lat: p.lat, lon: p.lon, placeType: p.type }, create: { query: normalized, name: p.name, lat: p.lat, lon: p.lon, placeType: p.type, countryCode: 'PH' } })
    const result = { places }
    await cacheSet(cacheKey, JSON.stringify(result), 300)
    return NextResponse.json(result)
  } catch (e) { logger.warn({ e }, '[places] Photon failed'); return NextResponse.json({ places: [] }) }
}
