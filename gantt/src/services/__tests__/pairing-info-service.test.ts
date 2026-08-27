import { describe, expect, it, vi, beforeEach } from 'vitest'
import { resolvePairingCrewBase, getPairingInfoWithLocalFirst } from '../pairing-info-service'

vi.mock('../pairing-detail-cache', () => ({
  getPairingInfo: vi.fn(async () => ({
    detail: { pairing: { id: 99 }, segments: [], compositions: [] },
    crew: [{ crewId: '1811', name: 'Sharma/Sandeep', base: 'YYC', gender: null, position: null, actingRank: 'FO', source: 'PA', mbhMin: null }],
  })),
}))

vi.mock('@/stores/pairing-store', () => ({
  usePairingStore: {
    getState: () => ({
      items: [{
        pairing: {
          id: 13198,
          composition: [{ rank: 'FO', plan: 1, fill: 1 }],
        },
        segments: [],
      }],
    }),
  },
}))

const rosterState = vi.hoisted(() => ({
  activeRank: 'FO' as string | null,
  rosterActingRank: null as string | null,
  flightActingRank: null as string | null,
}))

vi.mock('@/stores/roster-store', () => ({
  useRosterStore: {
    getState: () => ({
      main: {
        rosterItems: [{
          crewId: '1811',
          pairingId: 13198,
          base: '', // blank roster_flight.base — the Live bug
          position: null,
          activeRank: rosterState.activeRank,
          rosterActingRank: rosterState.rosterActingRank,
          flightActingRank: rosterState.flightActingRank,
          source: 'PA',
        }],
      },
    }),
  },
}))

const crewState = vi.hoisted(() => ({
  panelBase: 'YYC' as string | null,
}))

vi.mock('@/stores/crew-store', () => ({
  useCrewStore: {
    getState: () => ({
      items: [{
        crew: {
          crewId: '1811',
          firstName: 'Sandeep',
          lastName: 'Sharma',
          gender: null,
          panelBase: crewState.panelBase,
          bases: [],
        },
      }],
    }),
  },
}))

import { getPairingInfo } from '../pairing-detail-cache'

describe('resolvePairingCrewBase', () => {
  it('prefers panelBase over blank roster_flight.base', () => {
    expect(resolvePairingCrewBase('', { panelBase: 'YYC' })).toBe('YYC')
  })

  it('does not treat empty roster base as authoritative (?? would)', () => {
    expect('' ?? 'YYC').toBe('') // documents the bug
    expect(resolvePairingCrewBase('', { panelBase: 'YYC' })).toBe('YYC')
  })

  it('falls back to bases[0] then roster base', () => {
    expect(resolvePairingCrewBase(null, { bases: [{ base: 'YEG' }] })).toBe('YEG')
    expect(resolvePairingCrewBase('YVR', null)).toBe('YVR')
    expect(resolvePairingCrewBase('', null)).toBeNull()
  })
})

describe('getPairingInfoWithLocalFirst', () => {
  beforeEach(() => {
    vi.mocked(getPairingInfo).mockClear()
    crewState.panelBase = 'YYC'
    rosterState.activeRank = 'FO'
    rosterState.rosterActingRank = null
    rosterState.flightActingRank = null
  })

  it('uses local panelBase when roster_flight.base is blank (no server round-trip)', async () => {
    const bundle = await getPairingInfoWithLocalFirst(13198)
    expect(bundle.crew[0]?.base).toBe('YYC')
    expect(getPairingInfo).not.toHaveBeenCalled()
  })

  it('uses roster_acting_rank for Pairing Info acting rank', async () => {
    rosterState.activeRank = 'FO'
    rosterState.rosterActingRank = 'CA'
    rosterState.flightActingRank = 'FO'

    const bundle = await getPairingInfoWithLocalFirst(13198)

    expect(bundle.crew[0]?.crewRank).toBe('FO')
    expect(bundle.crew[0]?.actingRank).toBe('CA')
    expect(bundle.crew[0]?.rosterActingRank).toBe('CA')
    expect(bundle.crew[0]?.flightActingRank).toBe('FO')
    expect(getPairingInfo).not.toHaveBeenCalled()
  })

  it('falls through to server when local crew still lack a home base', async () => {
    crewState.panelBase = null
    const bundle = await getPairingInfoWithLocalFirst(13198)
    expect(getPairingInfo).toHaveBeenCalledWith(13198)
    expect(bundle.crew[0]?.base).toBe('YYC')
  })
})
