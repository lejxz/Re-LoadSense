import { describe, it, expect } from 'vitest'
import { initSimState, tick } from '@/lib/simulator'
const mockRoute = { routeId: 'r1', routeType: 'linear' as const, polyline: [{ lat: 10, lon: 123 }, { lat: 10.001, lon: 123 }, { lat: 10.002, lon: 123 }, { lat: 10.003, lon: 123 }, { lat: 10.004, lon: 123 }] }
const mockVehicles = [{ vehicleId: 'v1', vehicleCode: 'PH-T-1', routeId: 'r1', vehicleType: 'jeepney' as const, capacity: 20 }]
describe('simulator', () => {
  it('deterministic', () => {
    const r1 = tick(initSimState([mockRoute], mockVehicles, 42, 1000), 5)
    const r2 = tick(initSimState([mockRoute], mockVehicles, 42, 1000), 5)
    expect(r1.telemetry[0]!.lat).toBe(r2.telemetry[0]!.lat)
  })
  it('advances position', () => {
    const s = initSimState([mockRoute], mockVehicles, 42, 1000)
    expect(tick(s, 5).state.vehicles[0]!.positionIndex).not.toBe(s.vehicles[0]!.positionIndex)
  })
  it('source = simulator', () => {
    expect(tick(initSimState([mockRoute], mockVehicles, 42, 1000), 5).telemetry[0]!.source).toBe('simulator')
  })
})
