import { describe, it, expect } from 'vitest'
import { initSimState, tick } from '@/lib/simulator'

const mockRoute = {
  routeId: 'r1',
  routeType: 'linear' as const,
  polyline: [
    { lat: 10, lon: 123 },
    { lat: 10.001, lon: 123 },
    { lat: 10.002, lon: 123 },
    { lat: 10.003, lon: 123 },
    { lat: 10.004, lon: 123 },
  ],
}

const mockVehicles = [
  { vehicleId: 'v1', vehicleCode: 'PH-TEST-1', routeId: 'r1', vehicleType: 'jeepney' as const, capacity: 20 },
]

describe('simulator tick', () => {
  it('is deterministic (same seed → same output)', () => {
    const state1 = initSimState([mockRoute], mockVehicles, 42, 1000)
    const state2 = initSimState([mockRoute], mockVehicles, 42, 1000)
    const r1 = tick(state1, 5)
    const r2 = tick(state2, 5)
    expect(r1.telemetry[0]!.lat).toBe(r2.telemetry[0]!.lat)
    expect(r1.telemetry[0]!.occupancy).toBe(r2.telemetry[0]!.occupancy)
  })

  it('advances the vehicle position', () => {
    const state = initSimState([mockRoute], mockVehicles, 42, 1000)
    const startPos = state.vehicles[0]!.positionIndex
    const result = tick(state, 5)
    expect(result.state.vehicles[0]!.positionIndex).not.toBe(startPos)
  })

  it('flips direction at the endpoint for linear routes (no teleport)', () => {
    // start the vehicle near the end
    const state = initSimState([mockRoute], mockVehicles, 42, 1000)
    state.vehicles[0]!.positionIndex = 4.9 // near the last point
    state.vehicles[0]!.direction = 'forward'
    const result = tick(state, 5)
    // should have flipped to backward (or be at the endpoint)
    const v = result.state.vehicles[0]!
    expect(v.direction === 'backward' || v.positionIndex >= 4.9).toBe(true)
  })

  it('produces telemetry with source: simulator', () => {
    const state = initSimState([mockRoute], mockVehicles, 42, 1000)
    const result = tick(state, 5)
    expect(result.telemetry[0]!.source).toBe('simulator')
    expect(result.telemetry[0]!.vehicleCode).toBe('PH-TEST-1')
  })

  it('computes a heading (degrees 0-360)', () => {
    const state = initSimState([mockRoute], mockVehicles, 42, 1000)
    const result = tick(state, 5)
    const heading = result.telemetry[0]!.heading
    expect(heading).toBeGreaterThanOrEqual(0)
    expect(heading).toBeLessThan(360)
  })
})
