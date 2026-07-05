function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback
  if (value === undefined) throw new Error(`Missing env var: ${name}`)
  return value
}
function optional(name: string): string | undefined { return process.env[name] || undefined }

export const config = {
  databaseUrl: required('DATABASE_URL', 'file:./db/custom.db'),
  kvRestApiUrl: optional('KV_REST_API_URL'),
  kvRestApiToken: optional('KV_REST_API_TOKEN'),
  cronSecret: required('CRON_SECRET', 'dev-cron-secret'),
  sentryDsn: optional('SENTRY_DSN'),
  corsAllowedOrigins: (optional('LOADSENSE_CORS_ALLOWED_ORIGINS') ?? 'http://localhost:3000').split(',').map(s => s.trim()).filter(Boolean),
  nodeEnv: optional('NODE_ENV') ?? 'development',
  isProduction: process.env.NODE_ENV === 'production',
  isDev: process.env.NODE_ENV !== 'production',
} as const
