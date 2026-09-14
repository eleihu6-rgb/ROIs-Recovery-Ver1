import { describe, expect, it } from 'vitest'
import {
  chooseRecoveryRotations,
  type RecoveryRotationResult,
} from '../../../services/pairing/recovery-rotations.js'
import type { RoundtripFlight, RoundtripScope } from '../../../services/pairing/roundtrip-chooser.js'

const scope: RoundtripScope = {
  startDate: '2026-09-20',
  endDate: '2026-09-23',
  ganttStart: '2026-09-01',
  ganttEnd: '2026-09-30',
  timezone: 'UTC',
  base: 'ADD',
  fleets: ['738'],
  composition: [{ rank: 'CA', plan: 1 }, { rank: 'FO', plan: 1 }],
  rules: { checkinMin: 120, debriefMin: 15, restMin: 720, maxDutyBlockMin: 480, singleLegExemption: true },
}

const flight = (id: number, depArp: string, arvArp: string, startMin: number, blockMin = 60, overrides: Partial<RoundtripFlight> = {}): RoundtripFlight => ({
  id,
  airline: 'ET',
  fleet: '738',
  fltNum: `ET${id}`,
  depArp,
  arvArp,
  schDepDtUtc: new Date(Date.UTC(2026, 8, 20, 0, startMin)).toISOString(),
  schArvDtUtc: new Date(Date.UTC(2026, 8, 20, 0, startMin + blockMin)).toISOString(),
  blockMin,
  ...overrides,
})

const ids = (result: RecoveryRotationResult): number[][] => result.rotations.map((rotation) => rotation.flightIds)

describe('chooseRecoveryRotations', () => {
  it('returns both valid same-fleet base loops for an ADD outbound anchor', () => {
    const flights = [
      flight(100, 'ADD', 'DIR', 240),
      flight(101, 'DIR', 'ADD', 360),
      flight(102, 'DIR', 'ADD', 1_440 + 360),
    ]
    const result = chooseRecoveryRotations(flights, scope, 100)
    expect(ids(result)).toEqual(expect.arrayContaining([[100, 101], [100, 102]]))
    expect(result.truncated).toBe(false)
  })

  it('includes the preceding base leg when the anchor is outstation', () => {
    const flights = [flight(200, 'ADD', 'JFK', 120), flight(201, 'JFK', 'ADD', 1_440)]
    const result = chooseRecoveryRotations(flights, scope, 201)
    expect(ids(result)).toEqual([[200, 201]])
  })

  it.each([
    ['mixed airline', { airline: 'XX' }],
    ['mixed fleet', { fleet: '7M8' }],
  ])('rejects a %s candidate', (_name, overrides) => {
    const result = chooseRecoveryRotations([
      flight(300, 'ADD', 'DIR', 240),
      flight(301, 'DIR', 'ADD', 360, 60, overrides),
    ], scope, 300)
    expect(result.rotations).toEqual([])
  })

  it('rejects nonconnecting and overlapping candidates', () => {
    const flights = [
      flight(400, 'ADD', 'DIR', 240),
      flight(401, 'JFK', 'ADD', 360),
      flight(402, 'DIR', 'ADD', 250),
    ]
    expect(chooseRecoveryRotations(flights, scope, 400).rotations).toEqual([])
  })

  it('rejects a chain whose required rest is below the scope minimum', () => {
    const result = chooseRecoveryRotations([
      flight(500, 'ADD', 'JFK', 240, 420),
      flight(501, 'JFK', 'ADD', 720, 420),
    ], scope, 500)
    expect(result.rotations).toEqual([])
  })

  it('rejects a rotation that does not return to the selected base', () => {
    const result = chooseRecoveryRotations([
      flight(600, 'ADD', 'DIR', 240),
      flight(601, 'DIR', 'JFK', 360),
    ], scope, 600)
    expect(result.rotations).toEqual([])
  })

  it('finds the selected outbound despite more than a search budget of earlier base departures', () => {
    const earlier = Array.from({ length: 300 }, (_, i) => flight(2000 + i, 'ADD', 'JIB', 120 + i))
    const result = chooseRecoveryRotations([
      ...earlier, flight(3000, 'ADD', 'BJM', 1440 + 435, 165),
      flight(3001, 'BJM', 'ADD', 1440 + 755, 145),
    ], scope, 3000)
    expect(ids(result)).toContainEqual([3000, 3001])
    expect(result.truncated).toBe(false)
  })

  it('finds an inbound anchor without exploring unrelated earlier base departures', () => {
    const earlier = Array.from({ length: 300 }, (_, i) => flight(2000 + i, 'ADD', 'JIB', 120 + i))
    const result = chooseRecoveryRotations([
      ...earlier, flight(3000, 'ADD', 'BJM', 1440 + 435, 165),
      flight(3001, 'BJM', 'ADD', 1440 + 755, 145),
    ], scope, 3001)
    expect(ids(result)).toEqual([[3000, 3001]])
    expect(result.truncated).toBe(false)
  })

  it('connects both sides of an outstation anchor', () => {
    const result = chooseRecoveryRotations([
      flight(4000, 'ADD', 'JIB', 240), flight(4001, 'JIB', 'DIR', 360),
      flight(4002, 'DIR', 'ADD', 480),
    ], scope, 4001)
    expect(ids(result)).toEqual([[4000, 4001, 4002]])
  })

  it('reports search truncation rather than silently dropping anchor candidates', () => {
    const flights = [flight(700, 'ADD', 'DIR', 240)]
    for (let i = 0; i < 300; i += 1) {
      flights.push(flight(701 + i, 'DIR', 'DIR', 360 + i * 5))
    }
    flights.push(flight(1_100, 'DIR', 'ADD', 2_000))
    const result = chooseRecoveryRotations(flights, scope, 700)
    expect(result.truncated).toBe(true)
    expect(ids(result)).toContainEqual([700, 1_100])
  })
})
