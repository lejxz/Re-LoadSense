import { z } from 'zod'

export const VEHICLE_TYPES = ['jeepney', 'minibus', 'bus', 'uv_express'] as const
export const VehicleTypeSchema = z.enum(VEHICLE_TYPES)
export type VehicleType = z.infer<typeof VehicleTypeSchema>

export const ROUTE_TYPES = ['linear', 'loop'] as const
export const RouteTypeSchema = z.enum(ROUTE_TYPES)

export const OCCUPANCY_TIERS = ['available', 'filling', 'at_capacity', 'overloaded'] as const
export const TierSchema = z.enum(OCCUPANCY_TIERS)
export type Tier = z.infer<typeof TierSchema>

export const TelemetryIngestSchema = z.object({
  schemaVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  deviceId: z.string().min(1).max(100),
  vehicleCode: z.string().min(1).max(32).regex(/^[A-Z0-9-]+$/),
  timestamp: z.string().datetime(),
  gps: z.object({
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    accuracyM: z.number().min(0).max(1000).default(10),
    speedKph: z.number().min(0).max(200),
    heading: z.number().min(0).max(360).optional(),
  }),
  occupancy: z.number().int().min(0).max(200),
  tier: TierSchema,
  boarded: z.number().int().min(0).max(50).default(0),
  alighted: z.number().int().min(0).max(50).default(0),
  signalQuality: z.enum(['excellent', 'good', 'fair', 'poor', 'lost']).default('good'),
  direction: z.enum(['forward', 'backward']).default('forward'),
  positionIndex: z.number().int().min(0).default(0),
  source: z.enum(['simulator', 'device']).default('simulator'),
  seq: z.number().int().min(0),
})
export type TelemetryIngest = z.infer<typeof TelemetryIngestSchema>

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

export const ChatQuerySchema = z.object({
  query: z.string().min(1).max(500),
  sessionId: z.string().min(1).max(100),
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() })).max(20).optional(),
})

export const PlaceQuerySchema = z.object({
  q: z.string().min(1).max(200),
  limit: z.number().int().min(1).max(20).default(8),
})

export const TripSuggestionSchema = z.object({
  origin: z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }),
  destination: z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }),
  originName: z.string().max(200).optional(),
  destinationName: z.string().max(200).optional(),
})

export function parseAllowedVehicleTypes(raw: string | string[]): string[] {
  if (Array.isArray(raw)) return raw
  try { const p = JSON.parse(raw); return Array.isArray(p) ? p : [String(p)] } catch { return [String(raw)] }
}

export function isVehicleTypeAllowed(vehicleType: string, allowed: string[]): boolean {
  return allowed.includes(vehicleType)
}
