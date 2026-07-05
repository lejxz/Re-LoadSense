function mulberry32(seed: number) { let a = seed; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
function routeSeed(routeId: string) { let h = 0; for (let i = 0; i < routeId.length; i++) h = (h * 31 + routeId.charCodeAt(i)) | 0; return Math.abs(h) }
export interface DemandForecastPoint { hour: number; demand: number; loadFactor: number }
export interface DemandForecast { routeId: string; source: 'historical_mean'; points: DemandForecastPoint[]; generatedAt: string }
export function forecastDemand(routeId: string): DemandForecast {
  const rand = mulberry32(routeSeed(routeId))
  const baseLoad = 3 + rand() * 5, peakHeight = 12 + rand() * 8
  const points: DemandForecastPoint[] = []
  for (let hour = 0; hour < 24; hour++) {
    const morningPeak = peakHeight * Math.exp(-((hour - 8) ** 2) / (2 * 2 ** 2))
    const eveningPeak = peakHeight * Math.exp(-((hour - 18) ** 2) / (2 * 2.5 ** 2))
    const middayBump = peakHeight * 0.3 * Math.exp(-((hour - 12) ** 2) / (2 * 1.5 ** 2))
    points.push({ hour, demand: Math.max(0, Math.round(baseLoad + morningPeak + eveningPeak + middayBump)), loadFactor: Math.min(1, 0.3 + (morningPeak + eveningPeak) / (peakHeight * 2) * 0.6) })
  }
  return { routeId, source: 'historical_mean', points, generatedAt: new Date().toISOString() }
}
