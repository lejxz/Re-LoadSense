/**
 * Chatbot service — grounded heuristic boarding assistant.
 *
 * NEVER invents route codes or vehicle IDs. Only references entities that
 * exist in the DB. PII-redacts queries before logging.
 *
 * See concept/04-features.md C-03 + concept/03-data-model.md §6.5.
 */

import { db } from '@/lib/db'
import { logger } from '@/lib/logger'

// ── Intent detection ──

type Intent =
  | 'least_crowded'
  | 'most_crowded'
  | 'avoid'
  | 'eta'
  | 'how_full'
  | 'where_is'
  | 'route_info'
  | 'greeting'
  | 'help'
  | 'unknown'

function detectIntent(query: string): Intent {
  const text = query.toLowerCase().trim()
  if (/^(hi|hello|hey|good (morning|afternoon|evening)|thanks|thank you)/.test(text)) return 'greeting'
  if (/avoid|overloaded|don't ride|do not ride|which.*avoid/.test(text)) return 'avoid'
  if (/least crowded|less crowded|most seats|available seats|emptiest|which.*least/.test(text)) return 'least_crowded'
  if (/most crowded|fullest|which.*full/.test(text)) return 'most_crowded'
  if (/when|eta|arrive|arrival|next.*come|how long/.test(text)) return 'eta'
  if (/how full|occupancy|load|status of/.test(text)) return 'how_full'
  if (/where.*vehicle|where.*puv|location of|find.*vehicle/.test(text)) return 'where_is'
  if (/explain|what.*route|route.*details|tell me about/.test(text)) return 'route_info'
  if (/help|what can you|how do you/.test(text)) return 'help'
  return 'unknown'
}

// ── Entity extraction ──

function extractRouteCodes(query: string, knownCodes: string[]): string[] {
  const text = query.toLowerCase()
  const found: string[] = []
  for (const code of knownCodes) {
    const c = code.toLowerCase()
    // word-boundary match so "04L" doesn't match "04LXYZ"
    const re = new RegExp(`(?<![a-z0-9])${c.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}(?![a-z0-9])`, 'i')
    if (re.test(text)) found.push(code)
  }
  return [...new Set(found)]
}

function extractVehicleCodes(query: string, knownCodes: string[]): string[] {
  const text = query.toLowerCase()
  const found: string[] = []
  for (const code of knownCodes) {
    if (text.includes(code.toLowerCase())) found.push(code)
  }
  return [...new Set(found)]
}

// ── PII redaction ──

function redactPii(text: string): string {
  return text
    .replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, '[email]')
    .replace(/\b09\d{9}\b/g, '[phone]')
    .replace(/\+63\d{10}\b/g, '[phone]')
}

// ── Tier helpers ──

const TIER_RANK: Record<string, number> = {
  available: 0,
  filling: 1,
  at_capacity: 2,
  overloaded: 3,
}

// ── Main entry ──

export interface ChatbotResult {
  answer: string
  intent: string
  entities: { routeCodes: string[]; vehicleCodes: string[] }
  context: Array<Record<string, unknown>>
  source: 'heuristic'
}

export async function answerQuery(
  query: string,
  sessionId: string,
  userId?: string,
): Promise<ChatbotResult> {
  const intent = detectIntent(query)

  // load known route + vehicle codes for entity validation
  const routes = await db.route.findMany({
    where: { status: 'active' },
    select: { id: true, code: true, tag: true, name: true, originName: true, destinationName: true },
  })
  const routeCodes = routes.map((r) => r.code)
  const routeTags = routes.map((r) => r.tag).filter(Boolean) as string[]
  const allRouteIdentifiers = [...routeCodes, ...routeTags]

  const vehicles = await db.vehicle.findMany({
    where: { status: 'active' },
    select: { vehicleCode: true },
  })
  const vehicleCodes = vehicles.map((v) => v.vehicleCode)

  const mentionedRoutes = extractRouteCodes(query, allRouteIdentifiers)
  const mentionedVehicles = extractVehicleCodes(query, vehicleCodes)

  // ── Validate entities ──
  // if user mentions a route that doesn't exist, say so
  for (const code of mentionedRoutes) {
    const exists = routes.some(
      (r) => r.code.toLowerCase() === code.toLowerCase() || r.tag?.toLowerCase() === code.toLowerCase(),
    )
    if (!exists) {
      return {
        answer: `I don't have data for route '${code}'. It may not exist in our system.`,
        intent,
        entities: { routeCodes: mentionedRoutes, vehicleCodes: mentionedVehicles },
        context: [],
        source: 'heuristic',
      }
    }
  }

  // ── Handle each intent ──
  let answer = ''
  let context: Array<Record<string, unknown>> = []

  switch (intent) {
    case 'greeting':
      answer = "Hello! I'm the Re-LoadSense boarding assistant. Ask me things like 'which jeepney is least crowded now?' or 'how full is route 04L?'."
      break

    case 'help':
      answer = "I can help you with:\n• 'Which jeepney is least crowded now?'\n• 'How full is route 04L?'\n• 'When is the next 04L?'\n• 'Which should I avoid?'\n• 'Where is vehicle PH-04L-1?'"
      break

    case 'least_crowded':
    case 'most_crowded':
    case 'avoid': {
      // load live vehicle states
      const states = await db.vehicleState.findMany({
        where: { online: true, vehicle: { status: 'active' } },
        include: {
          vehicle: {
            select: { vehicleCode: true, vehicleType: true, capacity: true, routeId: true, route: { select: { code: true, name: true } } },
          },
        },
      })

      // filter by mentioned route if any
      let filtered = states
      if (mentionedRoutes.length > 0) {
        filtered = states.filter((s) =>
          mentionedRoutes.some(
            (code) => s.vehicle.route.code.toLowerCase() === code.toLowerCase(),
          ),
        )
      }

      if (filtered.length === 0) {
        answer = mentionedRoutes.length > 0
          ? `No live vehicles are reporting for route ${mentionedRoutes.join(', ')} right now.`
          : 'No vehicles are currently online. Try again later.'
        break
      }

      if (intent === 'least_crowded') {
        // sort by tier rank (ascending = least crowded first), then occupancy
        filtered.sort((a, b) => {
          const tr = (TIER_RANK[a.tier] ?? 9) - (TIER_RANK[b.tier] ?? 9)
          if (tr !== 0) return tr
          return a.occupancy - b.occupancy
        })
        const best = filtered[0]!
        const seatsLeft = best.vehicle.capacity - best.occupancy
        answer = `Least crowded option for ${mentionedRoutes.length > 0 ? `route ${best.vehicle.route.code}` : 'the live fleet'}: ${best.vehicle.vehicleCode} on route ${best.vehicle.route.code} (${best.vehicle.route.name}). It has ${best.occupancy}/${best.vehicle.capacity} riders (${seatsLeft} seats available), tier: ${best.tier}.`
        context = filtered.slice(0, 5).map((s) => ({
          vehicleCode: s.vehicle.vehicleCode,
          route: s.vehicle.route.code,
          occupancy: s.occupancy,
          capacity: s.vehicle.capacity,
          tier: s.tier,
        }))
      } else if (intent === 'most_crowded' || intent === 'avoid') {
        // sort by tier rank (descending = most crowded first)
        filtered.sort((a, b) => (TIER_RANK[b.tier] ?? 0) - (TIER_RANK[a.tier] ?? 0))
        const worst = filtered[0]!
        const reason = worst.tier === 'overloaded'
          ? 'it is currently overloaded'
          : worst.tier === 'at_capacity'
            ? 'it is at capacity'
            : 'it has the most riders'
        answer = `Most crowded option: ${worst.vehicle.vehicleCode} on route ${worst.vehicle.route.code} — ${reason} (${worst.occupancy}/${worst.vehicle.capacity} riders, tier: ${worst.tier}).`
        context = filtered.slice(0, 5).map((s) => ({
          vehicleCode: s.vehicle.vehicleCode,
          route: s.vehicle.route.code,
          occupancy: s.occupancy,
          capacity: s.vehicle.capacity,
          tier: s.tier,
        }))
      }
      break
    }

    case 'eta': {
      if (mentionedRoutes.length === 0 && mentionedVehicles.length === 0) {
        answer = "Which route or vehicle do you want ETA for? For example: 'when is the next 04L?' or 'ETA for PH-04L-1'."
        break
      }
      // load vehicle states for the mentioned route/vehicle
      const states = await db.vehicleState.findMany({
        where: {
          online: true,
          vehicle: {
            status: 'active',
            ...(mentionedVehicles.length > 0 && { vehicleCode: { in: mentionedVehicles } }),
            ...(mentionedRoutes.length > 0 && { route: { code: { in: mentionedRoutes } } }),
          },
        },
        include: { vehicle: { select: { vehicleCode: true, capacity: true, route: { select: { code: true, name: true } } } } },
        take: 5,
      })
      if (states.length === 0) {
        answer = `No live vehicles found for ${mentionedRoutes.length > 0 ? `route ${mentionedRoutes.join(', ')}` : `vehicle ${mentionedVehicles.join(', ')}`}.`
        break
      }
      const lines = states.map((s) => `${s.vehicle.vehicleCode} (route ${s.vehicle.route.code}) — ${s.occupancy}/${s.vehicle.capacity ?? 20} riders, tier: ${s.tier}, speed: ${s.speedKph}kph`)
      answer = `Live vehicles for ${mentionedRoutes.length > 0 ? `route ${mentionedRoutes.join(', ')}` : 'your query'}:\n${lines.join('\n')}`
      context = states.map((s) => ({ vehicleCode: s.vehicle.vehicleCode, route: s.vehicle.route.code, tier: s.tier, occupancy: s.occupancy }))
      break
    }

    case 'how_full': {
      if (mentionedRoutes.length === 0 && mentionedVehicles.length === 0) {
        answer = "Which route or vehicle? For example: 'how full is route 04L?' or 'status of PH-04L-1?'."
        break
      }
      const states = await db.vehicleState.findMany({
        where: {
          online: true,
          vehicle: {
            status: 'active',
            ...(mentionedVehicles.length > 0 && { vehicleCode: { in: mentionedVehicles } }),
            ...(mentionedRoutes.length > 0 && { route: { code: { in: mentionedRoutes } } }),
          },
        },
        include: { vehicle: { select: { vehicleCode: true, capacity: true, route: { select: { code: true } } } } },
      })
      if (states.length === 0) {
        answer = `No live vehicles for ${mentionedRoutes.length > 0 ? `route ${mentionedRoutes.join(', ')}` : `vehicle ${mentionedVehicles.join(', ')}`}.`
        break
      }
      const lines = states.map((s) => `${s.vehicle.vehicleCode} (route ${s.vehicle.route.code}): ${s.occupancy}/${s.vehicle.capacity} riders — ${s.tier}`)
      answer = `Occupancy for ${mentionedRoutes.length > 0 ? `route ${mentionedRoutes.join(', ')}` : `vehicle ${mentionedVehicles.join(', ')}`}:\n${lines.join('\n')}`
      context = states.map((s) => ({ vehicleCode: s.vehicle.vehicleCode, occupancy: s.occupancy, capacity: s.vehicle.capacity, tier: s.tier }))
      break
    }

    case 'where_is': {
      if (mentionedVehicles.length === 0) {
        answer = "Which vehicle? For example: 'where is PH-04L-1?'."
        break
      }
      const states = await db.vehicleState.findMany({
        where: { vehicle: { vehicleCode: { in: mentionedVehicles }, status: 'active' } },
        include: { vehicle: { select: { vehicleCode: true, capacity: true, route: { select: { code: true, name: true } } } } },
      })
      if (states.length === 0) {
        answer = `Vehicle ${mentionedVehicles.join(', ')} not found or offline.`
        break
      }
      const lines = states.map((s) => `${s.vehicle.vehicleCode} (route ${s.vehicle.route.code}): lat ${s.lat.toFixed(5)}, lon ${s.lon.toFixed(5)}, ${s.online ? 'online' : 'offline'}, speed ${s.speedKph}kph`)
      answer = lines.join('\n')
      context = states.map((s) => ({ vehicleCode: s.vehicle.vehicleCode, lat: s.lat, lon: s.lon, online: s.online }))
      break
    }

    case 'route_info': {
      if (mentionedRoutes.length === 0) {
        answer = "Which route? For example: 'explain route 04L'."
        break
      }
      const route = routes.find((r) => mentionedRoutes.some((c) => r.code.toLowerCase() === c.toLowerCase() || r.tag?.toLowerCase() === c.toLowerCase()))
      if (!route) {
        answer = `I don't have data for route ${mentionedRoutes.join(', ')}.`
        break
      }
      answer = `Route ${route.code} (${route.name}): ${route.originName ?? 'Origin'} → ${route.destinationName ?? 'Destination'}.`
      break
    }

    default:
      answer = "I'm not sure how to help with that. Try asking 'which jeepney is least crowded now?', 'how full is route 04L?', or 'when is the next 04L?'."
  }

  // ── Log the query (PII-redacted) ──
  const redactedQuery = redactPii(query)
  try {
    await db.chatbotQuery.create({
      data: {
        userId,
        sessionId,
        query: redactedQuery,
        response: answer,
        intent,
        entities: JSON.stringify({ routeCodes: mentionedRoutes, vehicleCodes: mentionedVehicles }),
        language: 'en',
      },
    })
  } catch (err) {
    logger.warn({ err }, '[chatbot] failed to log query (non-fatal)')
  }

  return {
    answer,
    intent,
    entities: { routeCodes: mentionedRoutes, vehicleCodes: mentionedVehicles },
    context,
    source: 'heuristic',
  }
}
