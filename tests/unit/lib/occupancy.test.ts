import { describe, it, expect } from 'vitest'
import { classifyTier, initialTierState, tierForRatio, HYSTERESIS_SECONDS } from '@/lib/ml/occupancy'

describe('tierForRatio', () => {
  it('returns available for 0%', () => {
    expect(tierForRatio(0)).toBe('available')
  })
  it('returns available for 59%', () => {
    expect(tierForRatio(0.59)).toBe('available')
  })
  it('returns filling for 60%', () => {
    expect(tierForRatio(0.6)).toBe('filling')
  })
  it('returns at_capacity for 90%', () => {
    expect(tierForRatio(0.9)).toBe('at_capacity')
  })
  it('returns overloaded for 100%', () => {
    expect(tierForRatio(1.0)).toBe('overloaded')
  })
  it('returns overloaded for 110%', () => {
    expect(tierForRatio(1.1)).toBe('overloaded')
  })
})

describe('classifyTier (hysteresis)', () => {
  it('does not flicker when oscillating around a threshold', () => {
    const capacity = 20
    let state = initialTierState(10, capacity, 0) // available
    const now = 0

    // jump to filling (60%) — candidate
    state = classifyTier(13, capacity, state, now)
    expect(state.tier).toBe('available') // still available (hysteresis)

    // hold filling for 9s — not yet
    state = classifyTier(13, capacity, state, now + 9000)
    expect(state.tier).toBe('available')

    // hold filling for 11s — commits
    state = classifyTier(13, capacity, state, now + 11000)
    expect(state.tier).toBe('filling')
  })

  it('commits immediately when staying in the same tier', () => {
    const capacity = 20
    let state = initialTierState(10, capacity, 0) // available
    state = classifyTier(10, capacity, state, 1000) // still available
    expect(state.tier).toBe('available')
  })
})
