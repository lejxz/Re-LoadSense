import pino from 'pino'

/**
 * Structured logger (pino → JSON in production, pretty in dev).
 * Use `logger.child({ requestId, actor })` for request-scoped logging.
 *
 * Vercel captures pino output automatically; no separate shipper needed for the sim.
 */

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  transport:
    process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
      : undefined,
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
