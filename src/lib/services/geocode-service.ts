/**
 * Geocoding service — Photon proxy with two-layer cache (Redis hot + DB warm).
 *
 * See concept/04-features.md C-06 + concept/03-data-model.md §3.13 (Place table).
 */

import { db } from '@/lib/db'
import { cacheGet, cacheSet } from '@/lib/redis'
import { logger } from '@/lib/logger'

export interface PlaceResult {
  name: string
  lat: number
  lon: number
  placeType: string | null
  countryCode: string
}

const CACHE_TTL = 300 // 5 min Redis TTL

/**
 * Search for places. Checks: Redis → DB Place table → Photon API (caches in both).
 */
export async function searchPlaces(
  query: string,
  countryCode = 'PH',
  limit = 8,
): Promise<PlaceResult[]> {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return []

  // ── 1. Try Redis hot cache ──
  const cacheKey = `places:${countryCode}:${normalizedQuery}`
  const cached = await cacheGet<string>(cacheKey)
  if (cached) {
    try {
      return JSON.parse(cached)
    } catch {
      // fall through
    }
  }

  // ── 2. Try DB Place table (warm cache) ──
  const dbPlaces = await db.place.findMany({
    where: { query: normalizedQuery, countryCode },
    take: limit,
  })
  if (dbPlaces.length > 0) {
    const results: PlaceResult[] = dbPlaces.map((p) => ({
      name: p.name,
      lat: p.lat,
      lon: p.lon,
      placeType: p.placeType,
      countryCode: p.countryCode,
    }))
    // warm Redis
    await cacheSet(cacheKey, JSON.stringify(results), CACHE_TTL)
    return results
  }

  // ── 3. Call Photon API ──
  try {
    const photonResults = await callPhoton(normalizedQuery, limit)
    if (photonResults.length === 0) return []

    // cache in DB (warm) + Redis (hot)
    for (const p of photonResults) {
      await db.place.upsert({
        where: { query_countryCode: { query: normalizedQuery, countryCode } },
        update: { name: p.name, lat: p.lat, lon: p.lon, placeType: p.placeType },
        create: {
          query: normalizedQuery,
          name: p.name,
          lat: p.lat,
          lon: p.lon,
          placeType: p.placeType,
          countryCode,
        },
      })
    }
    await cacheSet(cacheKey, JSON.stringify(photonResults), CACHE_TTL)
    return photonResults
  } catch (err) {
    logger.warn({ err, query: normalizedQuery }, '[geocode] Photon failed')
    return []
  }
}

/**
 * Call the Photon geocoder API.
 */
async function callPhoton(query: string, limit: number): Promise<PlaceResult[]> {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=${limit}`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Re-LoadSense/1.0 (transit demo)' },
    signal: AbortSignal.timeout(3000),
  })
  if (!res.ok) throw new Error(`Photon ${res.status}`)
  const data = await res.json()
  const features: Array<{
    properties?: { name?: string; osm_value?: string; osm_key?: string }
    geometry?: { coordinates?: [number, number] }
  }> = data?.features ?? []

  return features
    .filter((f) => f.geometry?.coordinates && f.properties?.name)
    .map((f) => ({
      name: f.properties!.name!,
      lat: f.geometry!.coordinates![1]!,
      lon: f.geometry!.coordinates![0]!,
      placeType: f.properties?.osm_value ?? f.properties?.osm_key ?? null,
      countryCode: 'PH',
    }))
}
