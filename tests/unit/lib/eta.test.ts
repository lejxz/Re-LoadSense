import { describe, it, expect } from 'vitest'
import { calculateEta, trafficFactorForHour, remainingStops, formatEta } from '@/lib/ml/eta'

describe('trafficFactorForHour', () => {
  it('returns 1.3 during morning rush (8am)', () => {
    expect(trafficFactorForHour(8)).toBe(1.3)
  })
  it('returns 1.3 during evening rush (6pm)', () => {
    expect(trafficFactorForHour(18)).toBe(1.3)
  })
  it('returns 0.85 late night', () => {
    expect(trafficFactorForHour(23)).toBe(0.85)
  })
  it('returns 1.0 default', () => {
    expect(trafficFactorForHour(6)).toBe(1.0)
  })
})

describe('calculateEta', () => {
  it('returns ~120s for a vehicle 1km away at 30kph', () => {
    const vehicle = {
      lat: 10.2932, lon: 123.8988,
      speedKph: 30, direction: 'forward' as const, positionIndex: 0,
    }
    const stops = [
      { lat: 10.3020, lon: 123.8988, seq: 5, stopName: 'Next stop' }, // ~1km north
    ]
    const result = calculateEta(vehicle, stops, 12) // midday, traffic 0.9
    expect(result).toHaveLength(1)
    // 1000m / (30/3.6 = 8.33 m/s × 0.9) = 1000 / 7.5 = ~133s
    expect(result[0]!.etaSeconds).toBeGreaterThan(100)
    expect(result[0]!.etaSeconds).toBeLessThan(160)
  })

  it('returns Infinity ETA when vehicle is stopped', () => {
    const vehicle = {
      lat: 10.2932, lon: 123.8988,
      speedKph: 0, direction: 'forward' as const, positionIndex: 0,
    }
    const stops = [{ lat: 10.3020, lon: 123.8988, seq: 5, stopName: 'Stop' }]
    const result = calculateEta(vehicle, stops, 12)
    expect(result[0]!.etaSeconds).toBe(Infinity)
  })
})

describe('formatEta', () => {
  it('formats seconds', () => {
    expect(formatEta(45)).toBe('45 sec')
  })
  it('formats minutes', () => {
    expect(formatEta(120)).toBe('2 min')
  })
  it('formats infinity as dash', () => {
    expect(formatEta(Infinity)).toBe('—')
  })
})
