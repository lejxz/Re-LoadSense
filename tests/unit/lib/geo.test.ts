import { describe, it, expect } from 'vitest'
import { haversineDistance, polylineLength } from '@/lib/geo/haversine'
import { bearing } from '@/lib/geo/bearing'
import { distanceToPolyline, isWithinDistance } from '@/lib/geo/bbox'

describe('haversineDistance', () => {
  it('returns 0 for the same point', () => {
    expect(haversineDistance({ lat: 10, lon: 123 }, { lat: 10, lon: 123 })).toBe(0)
  })

  it('computes distance between two Cebu points (~1km)', () => {
    // Colon St. to nearby point ~1km away
    const d = haversineDistance({ lat: 10.2932, lon: 123.8988 }, { lat: 10.3020, lon: 123.8988 })
    expect(d).toBeGreaterThan(900)
    expect(d).toBeLessThan(1100)
  })
})

describe('bearing', () => {
  it('returns 90 for due east', () => {
    const b = bearing({ lat: 10, lon: 123 }, { lat: 10, lon: 123.001 })
    expect(Math.round(b)).toBe(90)
  })

  it('returns 0 for due north', () => {
    const b = bearing({ lat: 10, lon: 123 }, { lat: 10.001, lon: 123 })
    expect(Math.round(b)).toBe(0)
  })
})

describe('distanceToPolyline', () => {
  it('returns 0 when the point is on the polyline', () => {
    const polyline = [
      { lat: 10, lon: 123 },
      { lat: 10.001, lon: 123 },
    ]
    expect(distanceToPolyline({ lat: 10.0005, lon: 123 }, polyline)).toBeLessThan(5)
  })

  it('returns the distance to the nearest segment', () => {
    const polyline = [
      { lat: 10, lon: 123 },
      { lat: 10.001, lon: 123 },
    ]
    // point 200m east
    const d = distanceToPolyline({ lat: 10, lon: 123.002 }, polyline)
    expect(d).toBeGreaterThan(180)
    expect(d).toBeLessThan(220)
  })
})

describe('isWithinDistance', () => {
  it('returns true when within threshold', () => {
    const polyline = [{ lat: 10, lon: 123 }, { lat: 10.001, lon: 123 }]
    expect(isWithinDistance({ lat: 10.0001, lon: 123 }, polyline, 200)).toBe(true)
  })
})
