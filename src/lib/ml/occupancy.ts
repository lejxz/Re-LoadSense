import type { Tier } from '@/lib/validators'
export const HYSTERESIS_SECONDS = 10
export const TIER_THRESHOLDS = { available: 0.0, filling: 0.6, at_capacity: 0.9, overloaded: 1.0 } as const
export function tierForRatio(ratio: number): Tier {
  if (ratio >= TIER_THRESHOLDS.overloaded) return 'overloaded'
  if (ratio >= TIER_THRESHOLDS.at_capacity) return 'at_capacity'
  if (ratio >= TIER_THRESHOLDS.filling) return 'filling'
  return 'available'
}
export interface TierState { tier: Tier; candidateSince: number }
export function classifyTier(occupancy: number, capacity: number, prev: TierState, now: number): TierState {
  const ratio = capacity > 0 ? occupancy / capacity : 0
  const desired = tierForRatio(ratio)
  if (desired === prev.tier) return { tier: prev.tier, candidateSince: now }
  if ((now - prev.candidateSince) / 1000 >= HYSTERESIS_SECONDS) return { tier: desired, candidateSince: now }
  return { tier: prev.tier, candidateSince: prev.candidateSince }
}
export function initialTierState(occupancy: number, capacity: number, now: number): TierState {
  return { tier: tierForRatio(capacity > 0 ? occupancy / capacity : 0), candidateSince: now }
}
