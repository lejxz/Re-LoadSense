export interface PersonPosition { trackId: number; x: number; y: number }
export interface CrossingEvent { trackId: number; direction: 'boarded' | 'alighted'; timestamp: number }
export function detectCrossings(prev: PersonPosition[], curr: PersonPosition[], lineY: number, timestamp: number): CrossingEvent[] {
  const events: CrossingEvent[] = []
  const prevById = new Map(prev.map(p => [p.trackId, p]))
  for (const c of curr) {
    const p = prevById.get(c.trackId)
    if (!p) continue
    if (p.y < lineY && c.y >= lineY) events.push({ trackId: c.trackId, direction: 'boarded', timestamp })
    else if (p.y >= lineY && c.y < lineY) events.push({ trackId: c.trackId, direction: 'alighted', timestamp })
  }
  return events
}
export function reconcileOccupancy(initial: number, events: CrossingEvent[]): number {
  let occ = initial
  for (const e of events) { occ += e.direction === 'boarded' ? 1 : -1; if (occ < 0) occ = 0 }
  return occ
}
