import { z } from 'zod'

/**
 * Shared Zod schemas — used by both API routes (server) and forms (client).
 * See concept/03-data-model.md for field-level constraints.
 */

// ── Vehicle types + route constraint ──

export const VEHICLE_TYPES = ['jeepney', 'minibus', 'bus', 'uv_express'] as const
export const VehicleTypeSchema = z.enum(VEHICLE_TYPES)
export type VehicleType = z.infer<typeof VehicleTypeSchema>

export const ROUTE_TYPES = ['linear', 'loop'] as const
export const RouteTypeSchema = z.enum(ROUTE_TYPES)
export type RouteType = z.infer<typeof RouteTypeSchema>

// ── Occupancy tiers ──

export const OCCUPANCY_TIERS = ['available', 'filling', 'at_capacity', 'overloaded'] as const
export const TierSchema = z.enum(OCCUPANCY_TIERS)
export type Tier = z.infer<typeof TierSchema>

export const ALERT_STATUSES = [
  'open',
  'acknowledged',
  'verified',
  'false_alarm',
] as const
export const AlertStatusSchema = z.enum(ALERT_STATUSES)

export const ALERT_TYPES = [
  'overload',
  'route_deviation',
  'speed_anomaly',
  'signal_loss',
] as const
export const AlertTypeSchema = z.enum(ALERT_TYPES)

export const ALERT_SEVERITIES = ['low', 'medium', 'high'] as const
export const AlertSeveritySchema = z.enum(ALERT_SEVERITIES)

export const ALERT_ACTIONS = ['acknowledge', 'verify', 'false_alarm'] as const
export const AlertActionSchema = z.enum(ALERT_ACTIONS)

// ── GPS ──

export const GpsSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  accuracyM: z.number().min(0).max(1000).default(10),
  speedKph: z.number().min(0).max(200),
  heading: z.number().min(0).max(360).optional(),
})

// ── Telemetry ingest (sim + real device contract) ──

export const TelemetryIngestSchema = z.object({
  schemaVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  deviceId: z.string().min(1).max(100),
  vehicleCode: z.string().min(1).max(32).regex(/^[A-Z0-9-]+$/),
  timestamp: z.string().datetime(),
  gps: GpsSchema,
  occupancy: z.number().int().min(0).max(200),
  tier: TierSchema,
  boarded: z.number().int().min(0).max(50).default(0),
  alighted: z.number().int().min(0).max(50).default(0),
  signalQuality: z
    .enum(['excellent', 'good', 'fair', 'poor', 'lost'])
    .default('good'),
  direction: z.enum(['forward', 'backward']).default('forward'),
  positionIndex: z.number().int().min(0).default(0),
  source: z.enum(['simulator', 'device']).default('simulator'),
  seq: z.number().int().min(0),
})
export type TelemetryIngest = z.infer<typeof TelemetryIngestSchema>

// ── Vehicle admin CRUD ──

export const VehicleCreateSchema = z.object({
  vehicleCode: z.string().min(1).max(20).regex(/^[A-Z0-9-]+$/),
  plateNo: z.string().min(1).max(20).regex(/^[A-Z0-9-]+$/),
  vehicleType: VehicleTypeSchema,
  routeId: z.string().min(1),
  capacity: z.number().int().min(1).max(100),
  brand: z.string().max(50).optional(),
  model: z.string().max(50).optional(),
  year: z.number().int().min(1990).max(new Date().getFullYear()).optional(),
  driver: z.string().max(100).optional(),
  registrationNo: z.string().max(50).optional(),
})
export type VehicleCreate = z.infer<typeof VehicleCreateSchema>

export const VehicleUpdateSchema = VehicleCreateSchema.partial().omit({ vehicleCode: true })

// ── Chatbot ──

export const ChatQuerySchema = z.object({
  query: z.string().min(1).max(500),
  sessionId: z.string().min(1).max(100),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() }))
    .max(20)
    .optional(),
})
export type ChatQuery = z.infer<typeof ChatQuerySchema>

// ── Place search ──

export const PlaceQuerySchema = z.object({
  q: z.string().min(1).max(200),
  limit: z.number().int().min(1).max(20).default(8),
})

// ── Trip suggestions ──

export const TripSuggestionSchema = z.object({
  origin: z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }),
  destination: z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }),
  originName: z.string().max(200).optional(),
  destinationName: z.string().max(200).optional(),
})

// ── Alert verification ──

export const AlertActionRequestSchema = z.object({
  note: z.string().max(500).optional(),
})

// ── Helpers ──

/**
 * Validate that a vehicle's type is in the route's allowedVehicleTypes.
 * (The constraint the original LoadSense lacked — see concept/03-data-model.md §4.)
 */
export function isVehicleTypeAllowed(
  vehicleType: VehicleType,
  allowedVehicleTypes: string[],
): boolean {
  return allowedVehicleTypes.includes(vehicleType)
}

/**
 * Parse the JSON-encoded allowedVehicleTypes (SQLite stores as string).
 */
export function parseAllowedVehicleTypes(raw: string | string[]): string[] {
  if (Array.isArray(raw)) return raw
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : [String(parsed)]
  } catch {
    return [String(raw)]
  }
}
