import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET() {
  const countries = await db.country.findMany({ select: { code: true, name: true } })
  return NextResponse.json({ locations: countries.map(c => ({ code: c.code, name: c.name })) })
}
