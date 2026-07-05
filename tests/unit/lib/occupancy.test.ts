import { describe, it, expect } from 'vitest'
import { tierForRatio, classifyTier, initialTierState } from '@/lib/ml/occupancy'
describe('tierForRatio', () => {
  it('0% = available', () => expect(tierForRatio(0)).toBe('available'))
  it('60% = filling', () => expect(tierForRatio(0.6)).toBe('filling'))
  it('90% = at_capacity', () => expect(tierForRatio(0.9)).toBe('at_capacity'))
  it('100% = overloaded', () => expect(tierForRatio(1.0)).toBe('overloaded'))
})
describe('hysteresis', () => {
  it('no flicker', () => {
    let s = initialTierState(10, 20, 0)
    s = classifyTier(13, 20, s, 0); expect(s.tier).toBe('available')
    s = classifyTier(13, 20, s, 9000); expect(s.tier).toBe('available')
    s = classifyTier(13, 20, s, 11000); expect(s.tier).toBe('filling')
  })
})
