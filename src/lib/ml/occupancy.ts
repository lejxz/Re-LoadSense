/**
 * Four-tier occupancy classification with hysteresis.
 *
 * Tiers: available (🟢) / filling (🟡) / at_capacity (🔴) / overloaded (🔴-blink)
 *
 * Hysteresis: a tier change must hold for `HYSTERESIS_SECONDS` (10s) before it
 * takes effect. This prevents flicker when a vehicle oscillates around a
 * threshold (e.g., 89-91% occupancy).
 *
 * See concept/04-features.md S-02 + concept/03-data-model.md.
 */

import type { Tier } from '@/lib/validators'

export const HYSTERESIS_SECONDS = 10

/** Tier boundaries as percentage of capacity (0..1+). */
export const TIER_THRESHOLDS = {
  available: 0.0, // 0% – 60%
  filling: 0.6, // 60% – 90%
  at_capacity: 0.9, // 90% – 100%
  overloaded: 1.0, // > 100%
} as const

/**
 * Determine which tier a given occupancy ratio *should* be in, ignoring hysteresis.
 */
export function tierForRatio(ratio: number): Tier {
  if (ratio >= TIER_THRESHOLDS.overloaded) return 'overloaded'
  if (ratio >= TIER_THRESHOLDS.at_capacity) return 'at_capacity'
  if (ratio >= TIER_THRESHOLDS.filling) return 'filling'
  return 'available'
}

export interface TierState {
  tier: Tier
  /** epoch ms when the vehicle first entered the *candidate* tier (before hysteresis) */
  candidateSince: number
}

/**
 * Classify the tier with hysteresis.
 *
 * @param occupancy  current passenger count
 * @param capacity   vehicle capacity
 * @param prev       previous TierState (tier + candidateSince)
 * @param now        current epoch ms
 * @returns          new TierState
 */
export function classifyTier(
  occupancy: number,
  capacity: number,
  prev: TierState,
  now: number,
): TierState {
  const ratio = capacity > 0 ? occupancy / capacity : 0
  const desired = tierForRatio(ratio)

  if (desired === prev.tier) {
    // same tier — reset candidate
    return { tier: prev.tier, candidateSince: now }
  }

  // tier wants to change — has it held long enough?
  const heldSeconds = (now - prev.candidateSince) / 1000
  if (heldSeconds >= HYSTERESIS_SECONDS) {
    // commit the change
    return { tier: desired, candidateSince: now }
  }

  // still in candidate window — keep the candidate timestamp, show old tier
  return { tier: prev.tier, candidateSince: prev.candidateSince }
}

/**
 * Create an initial TierState (for a new vehicle or cold start).
 */
export function initialTierState(occupancy: number, capacity: number, now: number): TierState {
  return { tier: tierForRatio(capacity > 0 ? occupancy / capacity : 0), candidateSince: now }
}
