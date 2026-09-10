import { describe, expect, it } from 'vitest'
import { prependBuiltPairings } from '../pairing-build-focus'
import type { PairingItem } from '@/types'

const item = (id: number): PairingItem => ({ pairing: { id }, segments: [], flights: [], sessionTags: [] } as unknown as PairingItem)
describe('newly built pairing focus', () => {
  it('keeps completion order before filtered/sorted rows and deduplicates returned entities', () => {
    expect(prependBuiltPairings([item(1), item(3), item(2)], [item(3), item(2)])
      .map((row) => row.pairing.id)).toEqual([3, 2, 1])
  })
  it('shows a new row even when the current filter excludes it', () => {
    expect(prependBuiltPairings([item(1)], [item(2)]).map((row) => row.pairing.id)).toEqual([2, 1])
  })
  it('restores the supplied normal ordering when result focus is cleared', () => {
    expect(prependBuiltPairings([item(1), item(2)], []).map((row) => row.pairing.id)).toEqual([1, 2])
  })
  it('retains completion order while using refreshed canonical entities', () => {
    const original = item(2)
    const refreshed = { ...item(2), pairing: { ...item(2).pairing, pairingLabel: 'Updated' } }
    expect(prependBuiltPairings([item(1), refreshed], [original])[0]).toBe(refreshed)
  })
})
