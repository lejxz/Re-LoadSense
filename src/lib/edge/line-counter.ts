/**
 * Bidirectional line-crossing counter — the real counting algorithm.
 *
 * This is the "honest CV" approach: the counting LOGIC is real and testable,
 * fed SYNTHETIC person positions in the demo. If a real YOLOv8 detector were
 * pointed at it, this code would work unchanged.
 *
 * The original LoadSense's sin was a `webcam` mode that opened a camera and
 * ignored every pixel (`frame.mean() % 17`). This module replaces that with a
 * correct centroid-velocity-vs-virtual-line algorithm.
 *
 * See concept/04-features.md S-01 (the CV/sim approach) +
 * concept/legacy-analysis/lessons-learned.md §4.1.
 */

export interface PersonPosition {
  /** stable track ID (from ByteTrack or equivalent) */
  trackId: number
  /** centroid x in image coords (0..width) */
  x: number
  /** centroid y in image coords (0..height) */
  y: number
}

export interface CrossingEvent {
  trackId: number
  direction: 'boarded' | 'alighted'
  timestamp: number
}

/**
 * A virtual line at y = lineY. A person crossing downward (y increasing past
 * lineY) boards; crossing upward alights.
 *
 * @param prevPositions  positions in the previous frame
 * @param currPositions  positions in the current frame
 * @param lineY          y-coordinate of the virtual door line
 * @param timestamp      event time (epoch ms)
 * @returns              crossing events detected this frame
 */
export function detectCrossings(
  prevPositions: PersonPosition[],
  currPositions: PersonPosition[],
  lineY: number,
  timestamp: number,
): CrossingEvent[] {
  const events: CrossingEvent[] = []
  const prevById = new Map(prevPositions.map((p) => [p.trackId, p]))

  for (const curr of currPositions) {
    const prev = prevById.get(curr.trackId)
    if (!prev) continue // new track, no crossing yet

    // crossing downward (boarding) — prev above the line, curr at/below
    if (prev.y < lineY && curr.y >= lineY) {
      events.push({ trackId: curr.trackId, direction: 'boarded', timestamp })
    }
    // crossing upward (alighting) — prev below, curr above
    else if (prev.y >= lineY && curr.y < lineY) {
      events.push({ trackId: curr.trackId, direction: 'alighted', timestamp })
    }
  }

  return events
}

/**
 * Reconcile cumulative occupancy from a sequence of crossing events.
 *
 * @param initialOccupancy  starting count
 * @param events            ordered crossing events
 * @returns                 final occupancy (never negative)
 */
export function reconcileOccupancy(
  initialOccupancy: number,
  events: CrossingEvent[],
): number {
  let occupancy = initialOccupancy
  for (const e of events) {
    if (e.direction === 'boarded') occupancy += 1
    else occupancy -= 1
    if (occupancy < 0) occupancy = 0 // safety
  }
  return occupancy
}
