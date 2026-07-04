import pino from 'pino'

/**
 * Structured logger (pino → JSON).
 * Use `logger.child({ requestId, actor })` for request-scoped logging.
 *
 * Vercel + Next.js capture pino output automatically; no separate shipper
 * needed for the sim. We avoid pino transports (pino-pretty) because they
 * don't play well with Next.js's module bundling in serverless. JSON output
 * is fine — Vercel's log viewer formats it.
 */

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  base: { app: 're-loadsense' },
})

/**
 * Create a request-scoped child logger.
 */
export function requestLogger(context: {
  requestId?: string
  actor?: string
  action?: string
  [key: string]: unknown
}) {
  return logger.child(context)
}
