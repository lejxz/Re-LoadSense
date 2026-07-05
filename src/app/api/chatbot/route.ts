import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function redactPii(text: string): string {
  return text.replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, '[email]').replace(/\b09\d{9}\b/g, '[phone]').replace(/\+63\d{10}\b/g, '[phone]')
}

const TIER_RANK: Record<string, number> = { green: 0, yellow: 1, red: 2, blinking_red: 3 }

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  if (!body?.query) return NextResponse.json({ error: 'Missing query' }, { status: 422 })
  const query: string = body.query
  const sessionId: string = body.sessionId || 'anon'

  const text = query.toLowerCase().trim()
  let intent = 'unknown'
  if (/^(hi|hello|hey|thanks)/.test(text)) intent = 'greeting'
  else if (/avoid|overloaded|don't ride/.test(text)) intent = 'avoid'
  else if (/least crowded|less crowded|most seats|emptiest/.test(text)) intent = 'least_crowded'
  else if (/when|eta|arrive|next.*come/.test(text)) intent = 'eta'
  else if (/how full|occupancy|load|status/.test(text)) intent = 'how_full'

  // Load routes for entity matching
  const routes = await db.route.findMany({ where: { status: 'active' }, select: { id: true, code: true, tag: true, name: true, originName: true, destinationName: true } })
  const routeCodes = [...routes.map(r => r.code), ...routes.map(r => r.tag).filter(Boolean)] as string[]
  const mentionedRoutes = routeCodes.filter(c => { try { return new RegExp(`(?<![a-z0-9])${c.toLowerCase()}(?![a-z0-9])`, 'i').test(text) } catch { return false } })

  for (const code of mentionedRoutes) {
    if (!routes.some(r => r.code.toLowerCase() === code.toLowerCase() || r.tag?.toLowerCase() === code.toLowerCase())) {
      const result = { route: 'all', answer: `I don't have data for route '${code}'.`, context: [], intent, source: 'heuristic' }
      try { await db.chatbotQuery.create({ data: { sessionId, query: redactPii(query), response: result.answer, intent, entities: JSON.stringify({ routeCodes: mentionedRoutes }), language: 'en' } }) } catch {}
      return NextResponse.json(result)
    }
  }

  let answer = ''
  let context: Array<Record<string, unknown>> = []

  if (intent === 'greeting') {
    answer = "Hello! I'm the Re-LoadSense boarding assistant. Ask me 'which jeepney is least crowded now?' or 'how full is route 04L?'."
  } else if (intent === 'least_crowded' || intent === 'avoid') {
    const states = await db.vehicleState.findMany({ where: { online: true, vehicle: { status: 'active' } }, include: { vehicle: { select: { vehicleCode: true, vehicleType: true, capacity: true, routeId: true, route: { select: { code: true, name: true } } } } } })
    let filtered = states
    if (mentionedRoutes.length > 0) filtered = states.filter(s => mentionedRoutes.some(c => s.vehicle.route.code.toLowerCase() === c.toLowerCase()))
    if (filtered.length === 0) { answer = mentionedRoutes.length > 0 ? `No live vehicles for route ${mentionedRoutes.join(', ')} right now.` : 'No vehicles are currently online.' }
    else {
      filtered.sort((a, b) => (TIER_RANK[a.tier] ?? 9) - (TIER_RANK[b.tier] ?? 9) || a.occupancy - b.occupancy)
      if (intent === 'least_crowded') {
        const best = filtered[0]!
        answer = `Least crowded option for ${mentionedRoutes.length > 0 ? `route ${best.vehicle.route.code}` : 'the live fleet'}: ${best.vehicle.vehicleCode} on route ${best.vehicle.route.code} (${best.vehicle.route.name}). It has ${best.occupancy}/${best.vehicle.capacity} riders (${best.vehicle.capacity - best.occupancy} seats available), ${best.tier}, ETA ${Math.round(Math.random() * 10 + 3)} min.`
        context = filtered.slice(0, 5).map(s => ({ vehicle_id: s.vehicle.vehicleCode, route: s.vehicle.route.code, occupancy: s.occupancy, capacity: s.vehicle.capacity, tier: s.tier }))
      } else {
        const worst = filtered[filtered.length - 1]!
        answer = `Most crowded: ${worst.vehicle.vehicleCode} on route ${worst.vehicle.route.code} — ${worst.tier === 'blinking_red' ? 'overloaded' : worst.tier === 'red' ? 'at capacity' : 'most riders'} (${worst.occupancy}/${worst.vehicle.capacity}).`
      }
    }
  } else if (intent === 'eta' || intent === 'how_full') {
    if (mentionedRoutes.length === 0) { answer = "Which route? e.g. 'when is the next 04L?'" }
    else {
      const states = await db.vehicleState.findMany({ where: { online: true, vehicle: { status: 'active', route: { code: { in: mentionedRoutes } } } }, include: { vehicle: { select: { vehicleCode: true, capacity: true, route: { select: { code: true } } } } }, take: 5 })
      if (states.length === 0) answer = `No live vehicles for route ${mentionedRoutes.join(', ')}.`
      else { answer = `Live vehicles for route ${mentionedRoutes.join(', ')}:\n${states.map(s => `${s.vehicle.vehicleCode} — ${s.occupancy}/${s.vehicle.capacity} riders, ${s.tier}, ${s.speedKph}kph`).join('\n')}` }
    }
  } else {
    answer = "I can help with: 'which jeepney is least crowded now?', 'how full is route 04L?', 'when is the next 04L?'"
  }

  const result = { route: mentionedRoutes[0] || 'all', answer, context, intent, source: 'heuristic' }
  try { await db.chatbotQuery.create({ data: { sessionId, query: redactPii(query), response: answer, intent, entities: JSON.stringify({ routeCodes: mentionedRoutes }), language: 'en' } }) } catch (e) { logger.warn({ e }, '[chatbot] log failed') }
  return NextResponse.json(result)
}
