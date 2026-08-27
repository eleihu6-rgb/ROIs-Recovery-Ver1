import { describe, it, expect } from 'vitest'
import { resolvePartitions } from '../scenario-partition.js'

describe('resolvePartitions', () => {
  it('routes partition 0 to f8 (live) and non-zero to scenario schema', () => {
    const live = resolvePartitions({ id: 6, pairingScenarioId: 0, flightScenarioId: 0 })
    expect(live.pairingTable).toBe('f8.pairing')
    expect(live.pairingPart).toBe(0)
    expect(live.flightTable).toBe('f8.flight')
    expect(live.rosterPart).toBe(6)

    const copy = resolvePartitions({ id: 460, pairingScenarioId: 405, flightScenarioId: 456 })
    expect(copy.pairingTable).toBe('scenario.pairing')
    expect(copy.segmentTable).toBe('scenario.pairing_segment')
    expect(copy.compositionTable).toBe('scenario.pairing_composition')
    expect(copy.pairingPart).toBe(405)
    expect(copy.flightTable).toBe('scenario.flight')
    expect(copy.flightCompTable).toBe('scenario.flight_composition')
    expect(copy.flightPart).toBe(456)
  })

  it('treats null/undefined pointers as live (0)', () => {
    const r = resolvePartitions({ id: 7, pairingScenarioId: null as unknown as number, flightScenarioId: undefined as unknown as number })
    expect(r.pairingTable).toBe('f8.pairing')
    expect(r.flightTable).toBe('f8.flight')
    expect(r.pairingPart).toBe(0)
    expect(r.flightPart).toBe(0)
  })
})
