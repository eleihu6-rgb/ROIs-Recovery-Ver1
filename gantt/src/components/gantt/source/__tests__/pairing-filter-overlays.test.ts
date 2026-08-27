import { describe, it, expect } from 'vitest'
import {
  pairingMatchesSharedFilter,
  pairingMatchesSharedFilterWithOverlays,
} from '../scenario-gantt-source'
import type { PairingFilter } from '@/types/pairing'
import type { PairingItem } from '@/types/pairing'

const openPartial: PairingFilter = {
  bases: [],
  fleets: [],
  divisions: [],
  ranks: [],
  depArps: [],
  coverage: ['open', 'partial'],
  assignments: [],
  label: '',
  pairingIds: [],
}

const fullPairing = {
  pairing: {
    id: 15534,
    pairingLabel: 'P15534',
    division: 'P',
    base: 'YYC',
    fleet: '737',
    assignment: 'FLT',
    composition: [
      { rank: 'CA', plan: 1, fill: 1 },
      { rank: 'FO', plan: 1, fill: 1 },
    ],
  },
  segments: [],
} as unknown as PairingItem

const openPairing = {
  pairing: {
    id: 99,
    pairingLabel: 'P99',
    division: 'P',
    base: 'YYC',
    fleet: '737',
    assignment: 'FLT',
    composition: [
      { rank: 'CA', plan: 1, fill: 0 },
      { rank: 'FO', plan: 1, fill: 0 },
    ],
  },
  segments: [],
} as unknown as PairingItem

describe('pairingMatchesSharedFilterWithOverlays', () => {
  it('hides full pairings under default open+partial coverage', () => {
    expect(pairingMatchesSharedFilter(fullPairing, openPartial)).toBe(false)
    expect(pairingMatchesSharedFilter(openPairing, openPartial)).toBe(true)
  })

  it('keeps a Locate-Pairing / found full pairing visible (Live coverage overlay parity)', () => {
    const found = new Set(['15534'])
    expect(pairingMatchesSharedFilterWithOverlays(fullPairing, openPartial, found)).toBe(true)
    expect(pairingMatchesSharedFilterWithOverlays(openPairing, openPartial, found)).toBe(true)
  })

  it('keeps a frozen full pairing visible under coverage narrowing', () => {
    const frozen = new Set(['15534'])
    expect(pairingMatchesSharedFilterWithOverlays(fullPairing, openPartial, frozen)).toBe(true)
  })

  it('still applies non-coverage hard filters to found overlays', () => {
    const found = new Set(['15534'])
    const baseFilter: PairingFilter = { ...openPartial, bases: ['YVR'] }
    expect(pairingMatchesSharedFilterWithOverlays(fullPairing, baseFilter, found)).toBe(false)
  })
})
