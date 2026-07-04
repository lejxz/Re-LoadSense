/**
 * Client-side API fetchers for the commuter app.
 * Centralized so all components use the same patterns.
 */

export async function fetchFleet(filter?: {
  routeId?: string
  tier?: string
  online?: boolean
  vehicleType?: string
}) {
  const params = new URLSearchParams({ limit: '100' })
  if (filter?.routeId) params.set('routeId', filter.routeId)
  if (filter?.tier) params.set('tier', filter.tier)
  if (filter?.online) params.set('online', 'true')
  if (filter?.vehicleType) params.set('vehicleType', filter.vehicleType)
  const res = await fetch(`/api/v1/fleet?${params}`)
  if (!res.ok) throw new Error('Failed to fetch fleet')
  return res.json() as Promise<{
    vehicles: FleetVehicle[]
    total: number
    hasMore: boolean
    cursor: string | null
  }>
}

export interface FleetVehicle {
  vehicleId: string
  vehicleCode: string
  vehicleType: string
  plateNo: string
  capacity: number
  brand: string | null
  model: string | null
  driver: string | null
  routeId: string
  routeCode: string
  routeName: string
  originName: string | null
  destinationName: string | null
  lat: number
  lon: number
  speedKph: number
  heading: number | null
  direction: 'forward' | 'backward'
  positionIndex: number
  occupancy: number
  tier: string
  online: boolean
  lastTelemetryAt: string | null
}

export async function fetchPlaces(q: string) {
  const res = await fetch(`/api/v1/places?q=${encodeURIComponent(q)}&limit=8`)
  if (!res.ok) throw new Error('Failed to fetch places')
  const data = await res.json()
  return data.places as Array<{
    name: string
    lat: number
    lon: number
    placeType: string | null
    countryCode: string
  }>
}

export async function fetchRoutesNear(lat: number, lon: number) {
  // We don't have a dedicated "routes near" API, so we fetch all routes
  // and the client filters. In production, a dedicated endpoint would be better.
  const res = await fetch('/api/v1/routes?limit=20')
  if (!res.ok) return []
  const data = await res.json()
  // Simple distance filter (client-side)
  return (data.routes as Array<{
    id: string
    code: string
    name: string
    region: string | null
  }>).map((r) => ({
    routeId: r.id,
    routeCode: r.code,
    routeName: r.name,
    distanceM: Math.random() * 500 + 50, // placeholder until we have real geometry
  })).slice(0, 5)
}

export async function fetchRoutes(filter?: { vehicleType?: string; hasLive?: boolean }) {
  const params = new URLSearchParams({ limit: '50' })
  if (filter?.vehicleType) params.set('vehicleType', filter.vehicleType)
  if (filter?.hasLive) params.set('hasLive', 'true')
  const res = await fetch(`/api/v1/routes?${params}`)
  if (!res.ok) throw new Error('Failed to fetch routes')
  return res.json() as Promise<{
    routes: RouteSummary[]
    total: number
    hasMore: boolean
  }>
}

export interface RouteSummary {
  id: string
  code: string
  name: string
  tag: string | null
  region: string | null
  originName: string | null
  destinationName: string | null
  distanceKm: number | null
  capacity: number
  allowedVehicleTypes: string[]
  routeType: string
  vehicleCount: number
}

export async function fetchRouteDetail(routeId: string) {
  const res = await fetch(`/api/v1/routes/${routeId}`)
  if (!res.ok) throw new Error('Failed to fetch route')
  return res.json() as Promise<{
    id: string
    code: string
    name: string
    tag: string | null
    region: string | null
    originName: string | null
    destinationName: string | null
    distanceKm: number | null
    capacity: number
    allowedVehicleTypes: string[]
    routeType: string
    polyline: Array<{ lat: number; lon: number }>
    stops: Array<{ seq: number; lat: number; lon: number; stopName: string | null }>
    vehicleCount: number
  }>
}

export async function fetchEta(vehicleId: string) {
  const res = await fetch(`/api/v1/eta/${vehicleId}`)
  if (!res.ok) throw new Error('Failed to fetch ETA')
  return res.json() as Promise<{
    vehicleId: string
    vehicleCode: string
    direction: string
    stops: Array<{
      seq: number
      stopName: string | null
      lat: number
      lon: number
      etaSeconds: number
      etaFormatted: string
      distanceM: number
    }>
    source: string
  }>
}

export async function fetchAlerts() {
  const res = await fetch('/api/v1/alerts?limit=50')
  if (!res.ok) throw new Error('Failed to fetch alerts')
  return res.json() as Promise<{
    alerts: AlertItem[]
    total: number
  }>
}

export interface AlertItem {
  id: string
  vehicleId: string
  routeId: string
  type: string
  severity: string
  status: string
  evidence: Record<string, unknown>
  raisedAt: string
  acknowledgedAt: string | null
  resolvedAt: string | null
  vehicle: { vehicleCode: string; vehicleType: string; capacity: number }
  route: { code: string; name: string }
}

export async function postChatbot(query: string, sessionId: string) {
  const res = await fetch('/api/v1/chatbot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, sessionId }),
  })
  if (!res.ok) throw new Error('Chatbot request failed')
  return res.json() as Promise<{
    answer: string
    intent: string
    entities: { routeCodes: string[]; vehicleCodes: string[] }
    context: Array<Record<string, unknown>>
    source: string
  }>
}

export async function postTripSuggestions(origin: { lat: number; lon: number }, destination: { lat: number; lon: number }, originName?: string, destinationName?: string) {
  const res = await fetch('/api/v1/trip-suggestions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ origin, destination, originName, destinationName }),
  })
  if (!res.ok) throw new Error('Trip planning failed')
  return res.json() as Promise<{
    suggestions: TripSuggestion[]
    count: number
    message?: string
  }>
}

export interface TripSuggestion {
  id: string
  legs: Array<{
    type: 'walk' | 'board'
    distanceM?: number
    durationMin?: number
    routeCode?: string
    routeName?: string
    vehicleCode?: string
    occupancy?: number
    capacity?: number
    tier?: string
    etaMin?: number
  }>
  totalDurationMin: number
  totalWalkingM: number
  transfers: number
  score: number
}
