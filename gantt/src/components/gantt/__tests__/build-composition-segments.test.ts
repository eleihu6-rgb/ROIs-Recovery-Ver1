import { describe, expect, it } from 'vitest'
import { buildCompositionSegments, buildCompositionString } from '../gantt-utils'
import type { Pairing } from '@/types/pairing'

const pairingWith = (composition: Pairing['composition']): Pairing =>
  ({ id: 1, composition } as Pairing)

describe('buildCompositionSegments rank order', () => {
  it('preserves input order when no rankOrder map is provided', () => {
    const segs = buildCompositionSegments(
      pairingWith([
        { rank: 'FO', plan: 1, fill: 0 },
        { rank: 'CA', plan: 1, fill: 1 },
      ]),
    )
    expect(segs.map((s) => s.text)).toEqual(['FO(1:0)', 'CA(1)'])
  })

  it('sorts by display_order so CA appears before FO', () => {
    const rankOrder = new Map([
      ['CA', 1],
      ['FO', 2],
    ])
    const segs = buildCompositionSegments(
      pairingWith([
        { rank: 'FO', plan: 1, fill: 0 },
        { rank: 'CA', plan: 1, fill: 0 },
      ]),
      rankOrder,
    )
    expect(segs.map((s) => s.text)).toEqual(['CA(1:0)', 'FO(1:0)'])
    expect(buildCompositionString(
      pairingWith([
        { rank: 'FO', plan: 1, fill: 0 },
        { rank: 'CA', plan: 1, fill: 0 },
      ]),
      rankOrder,
    )).toBe('CA(1:0)FO(1:0)')
  })

  it('puts unknown ranks after known ones, then by rank code', () => {
    const rankOrder = new Map([['CA', 1]])
    const segs = buildCompositionSegments(
      pairingWith([
        { rank: 'ZZ', plan: 1, fill: 1 },
        { rank: 'CA', plan: 1, fill: 1 },
        { rank: 'AA', plan: 1, fill: 1 },
      ]),
      rankOrder,
    )
    expect(segs.map((s) => s.text)).toEqual(['CA(1)', 'AA(1)', 'ZZ(1)'])
  })
})
