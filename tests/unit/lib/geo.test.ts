import { describe, it, expect } from 'vitest'
import { haversineDistance } from '@/lib/geo/haversine'
import { bearing } from '@/lib/geo/bearing'
import { distanceToPolyline } from '@/lib/geo/bbox'

describe('haversine', () => {
  it('same point = 0', () => { expect(haversineDistance({ lat: 10, lon: 123 }, { lat: 10, lon: 123 })).toBe(0) })
  it('~1km', () => { const d = haversineDistance({ lat: 10.2932, lon: 123.8988 }, { lat: 10.302, lon: 123.8988 }); expect(d).toBeGreaterThan(900); expect(d).toBeLessThan(1100) })
})
describe('bearing', () => {
  it('east = 90', () => { expect(Math.round(bearing({ lat: 10, lon: 123 }, { lat: 10, lon: 123.001 }))).toBe(90) })
  it('north = 0', () => { expect(Math.round(bearing({ lat: 10, lon: 123 }, { lat: 10.001, lon: 123 }))).toBe(0) })
})
describe('distanceToPolyline', () => {
  it('on line ~0', () => { expect(distanceToPolyline({ lat: 10.0005, lon: 123 }, [{ lat: 10, lon: 123 }, { lat: 10.001, lon: 123 }])).toBeLessThan(5) })
})
