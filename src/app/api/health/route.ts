import { NextResponse } from 'next/server'

/**
 * Liveness probe — process is alive + event loop responsive.
 * Fast (no dependency checks). Used by load balancers / uptime monitors.
 * See concept/04-features.md X-03.
 */
export const runtime = 'nodejs'

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
  })
}
