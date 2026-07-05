import { describe, it, expect } from 'vitest'
import { calculateEta, trafficFactorForHour, formatEta } from '@/lib/ml/eta'
describe('trafficFactor', () => {
  it('8am rush = 1.3', () => expect(trafficFactorForHour(8)).toBe(1.3))
  it('6pm rush = 1.3', () => expect(trafficFactorForHour(18)).toBe(1.3))
  it('3am = 0.85', () => expect(trafficFactorForHour(3)).toBe(0.85))
})
describe('calculateEta', () => {
  it('~120s for 1km at 30kph', () => {
    const r = calculateEta({ lat: 10.2932, lon: 123.8988, speedKph: 30, direction: 'forward', positionIndex: 0 }, [{ lat: 10.302, lon: 123.8988, seq: 5 }], 12)
    expect(r[0]!.etaSeconds).toBeGreaterThan(100); expect(r[0]!.etaSeconds).toBeLessThan(160)
  })
})
describe('formatEta', () => {
  it('45s', () => expect(formatEta(45)).toBe('45 sec'))
  it('2min', () => expect(formatEta(120)).toBe('2 min'))
  it('infinity', () => expect(formatEta(Infinity)).toBe('—'))
})
