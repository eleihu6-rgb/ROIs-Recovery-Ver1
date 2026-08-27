import { describe, expect, it } from 'vitest'

import { pairingCompositionMatchesRank } from '../filter-store'

describe('pairingCompositionMatchesRank', () => {
  const composition = [
    { rank: 'CA', plan: 1, fill: 0 },
    { rank: 'FO', plan: 1, fill: 1 },
  ]

  it('keeps pairings when no ranks are selected', () => {
    expect(pairingCompositionMatchesRank(composition, [])).toBe(true)
  })

  it('keeps pairings whose composition contains a selected rank', () => {
    expect(pairingCompositionMatchesRank(composition, ['CA'])).toBe(true)
    expect(pairingCompositionMatchesRank(composition, ['FA', 'FO'])).toBe(true)
  })

  it('rejects pairings whose composition has no selected rank', () => {
    expect(pairingCompositionMatchesRank(composition, ['FA'])).toBe(false)
  })

  it('rejects empty composition when a rank is selected', () => {
    expect(pairingCompositionMatchesRank([], ['CA'])).toBe(false)
  })
})
