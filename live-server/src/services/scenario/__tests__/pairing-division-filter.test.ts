import { describe, it, expect } from 'vitest'
import { filterPairingsByCrewDivision } from '../pairing-division-filter.js'

const crew = (divs: string[]) => divs.map((division, i) => ({ crewId: `c${i}`, division }))
const pair = (divs: string[]) => divs.map((division, i) => ({ pairingId: i, division }))

describe('filterPairingsByCrewDivision', () => {
  it('keeps only pairings whose division is present among the crew (pilot scenario)', () => {
    const out = filterPairingsByCrewDivision(crew(['P', 'P']), pair(['P', 'C', 'P']))
    expect(out.map((p) => p.division)).toEqual(['P', 'P'])
  })

  it('keeps all present divisions for a mixed-crew scenario', () => {
    const out = filterPairingsByCrewDivision(crew(['P', 'C']), pair(['P', 'C', 'A']))
    expect(out.map((p) => p.division).sort()).toEqual(['C', 'P'])
  })

  it('returns all pairings when crew carries no division (safe fallback)', () => {
    const out = filterPairingsByCrewDivision(crew(['', '']), pair(['P', 'C']))
    expect(out.length).toBe(2)
  })

  it('returns all pairings when crew is empty', () => {
    const out = filterPairingsByCrewDivision([], pair(['P', 'C']))
    expect(out.length).toBe(2)
  })
})
