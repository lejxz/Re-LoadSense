import { NextResponse } from 'next/server'
import { getFleet } from '@/lib/services/fleet-service'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET(req: Request) {
  const url = new URL(req.url)
  const country = url.searchParams.get('country') || 'PH'
  const fleet = await getFleet(country)
  return NextResponse.json(fleet)
}
