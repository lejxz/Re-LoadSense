/**
 * Typed environment configuration.
 * Centralizes all env var access so the rest of the app imports from here.
 */

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback
  if (value === undefined) {
    throw new Error(`Missing required env var: ${name}`)
  }
  return value
}

function optional(name: string): string | undefined {
  return process.env[name] || undefined
}

export const config = {
  // Database
  databaseUrl: required('DATABASE_URL', 'file:./db/custom.db'),

  // Redis
  kvRestApiUrl: optional('KV_REST_API_URL'),
  kvRestApiToken: optional('KV_REST_API_TOKEN'),

  // Auth
  nextauthSecret: required('NEXTAUTH_SECRET', 'dev-secret-change-me'),
  nextauthUrl: required('NEXTAUTH_URL', 'http://localhost:3000'),

  // Cron
  cronSecret: required('CRON_SECRET', 'dev-cron-secret-change-me'),

  // Sentry
  sentryDsn: optional('SENTRY_DSN'),

  // CORS
  corsAllowedOrigins: (optional('LOADSENSE_CORS_ALLOWED_ORIGINS') ?? 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  // Socket.io mini-service public URL (production)
  socketUrl: optional('NEXT_PUBLIC_SOCKET_URL'),

  // Simulator
  simulatorVehicleCount: Number(optional('SIMULATOR_VEHICLE_COUNT') ?? '0') || undefined,
  simulatorTickSeconds: Number(optional('SIMULATOR_TICK_SECONDS') ?? '5'),

  // Environment
  nodeEnv: optional('NODE_ENV') ?? 'development',
  isProduction: process.env.NODE_ENV === 'production',
  isDev: process.env.NODE_ENV !== 'production',
} as const

export type Config = typeof config
