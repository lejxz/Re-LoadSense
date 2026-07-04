/**
 * Demand forecast — deterministic, seeded historical mean per route × hour.
 *
 * The original used unseeded `random.uniform` (different numbers every call).
 * This project uses a seeded deterministic pattern so the same route+hour always
 * returns the same forecast. Honest `source: "historical_mean"` label.
 *
 * See concept/04-features.md Calc-02.
 */

/**
 * A simple seeded PRNG (mulberry32) — deterministic across runs.
 */
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

/** Hash a route ID to a stable seed. */
function routeSeed(routeId: string): number {
  let h = 0
  for (let i = 0; i < routeId.length; i++) {
    h = (h * 31 + routeId.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

export interface DemandForecastPoint {
  hour: number
  /** predicted ridership (passengers boarding at this hour) */
  demand: number
  /** 0..1 — how loaded the vehicles on this route typically are at this hour */
  loadFactor: number
}

export interface DemandForecast {
  routeId: string
  source: 'historical_mean'
  points: DemandForecastPoint[]
  generatedAt: string
}

/**
 * Forecast demand for a route over 24 hours.
 *
 * Pattern: two Gaussian peaks (morning rush ~8am, evening rush ~6pm) + baseline,
 * scaled by a route-specific factor. Seeded → deterministic.
 */
export function forecastDemand(routeId: string, _day = 0): DemandForecast {
  const seed = routeSeed(routeId)
  const rand = mulberry32(seed)

  // route-specific scaling (some routes are busier than others)
  const baseLoad = 3 + rand() * 5 // 3..8 baseline passengers per stop per hour
  const peakHeight = 12 + rand() * 8 // 12..20 peak additional passengers

  const points: DemandForecastPoint[] = []
  for (let hour = 0; hour < 24; hour++) {
    // morning peak at 8am (sigma 2)
    const morningPeak = peakHeight * Math.exp(-((hour - 8) ** 2) / (2 * 2 ** 2))
    // evening peak at 18 (sigma 2.5)
    const eveningPeak = peakHeight * Math.exp(-((hour - 18) ** 2) / (2 * 2.5 ** 2))
    // small midday bump at 12
    const middayBump = peakHeight * 0.3 * Math.exp(-((hour - 12) ** 2) / (2 * 1.5 ** 2))

    const demand = Math.max(
      0,
      Math.round(baseLoad + morningPeak + eveningPeak + middayBump),
    )
    // load factor 0..1 — how full vehicles are (peaks near 1 during rush)
    const loadFactor = Math.min(
      1,
      0.3 + (morningPeak + eveningPeak) / (peakHeight * 2) * 0.6,
    )

    points.push({ hour, demand, loadFactor: Math.round(loadFactor * 100) / 100 })
  }

  return {
    routeId,
    source: 'historical_mean',
    points,
    generatedAt: new Date().toISOString(),
  }
}

/**
 * Forecast for a single hour (cached lookups use this).
 */
export function forecastDemandForHour(routeId: string, hour: number): DemandForecastPoint {
  const forecast = forecastDemand(routeId)
  return forecast.points[hour % 24]!
}
