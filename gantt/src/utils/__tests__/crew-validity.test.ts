import { describe, it, expect } from 'vitest'
import { computeValidityBlock } from '../crew-validity'

type Rec = { effDt: string; expDt: string | null }
const rec = (effDt: string, expDt: string | null = null): Rec => ({ effDt, expDt })
// 窗口 2026-07-25 ~ 2026-09-07（与 RP08 2026 ±7d 一致）
const W0 = Date.UTC(2026, 6, 25)
const W1 = Date.UTC(2026, 8, 7)

describe('computeValidityBlock', () => {
  it('returns null when rank and base both cover window end', () => {
    const ranks = [rec('2022-06-09T00:00:00Z', '2055-12-31T00:00:00Z')]
    const bases = [rec('2020-02-01T00:00:00Z')]
    expect(computeValidityBlock(ranks, bases, W0, W1)).toBeNull()
  })

  it('returns the rank expiry when rank ends inside the window and nothing covers after', () => {
    const ranks = [rec('2025-03-02T00:00:00Z', '2026-07-31T00:00:00Z')] // crew 1901
    const bases = [rec('2022-08-01T00:00:00Z', '2052-08-02T00:00:00Z')]
    expect(computeValidityBlock(ranks, bases, W0, W1)).toBe(Date.UTC(2026, 6, 31))
  })

  it('returns the base expiry when base ends inside the window', () => {
    const ranks = [rec('2022-06-09T00:00:00Z', '2055-12-31T00:00:00Z')]
    const bases = [rec('2020-02-01T00:00:00Z', '2026-08-15T00:00:00Z')]
    expect(computeValidityBlock(ranks, bases, W0, W1)).toBe(Date.UTC(2026, 7, 15))
  })

  it('returns the EARLIER of rank/base ends when both end inside the window', () => {
    const ranks = [rec('2022-06-09T00:00:00Z', '2026-08-10T00:00:00Z')]
    const bases = [rec('2020-02-01T00:00:00Z', '2026-08-15T00:00:00Z')]
    expect(computeValidityBlock(ranks, bases, W0, W1)).toBe(Date.UTC(2026, 7, 10))
  })

  it('does NOT fire on a promotion chain (a later rank record covers window end)', () => {
    const ranks = [
      rec('2024-05-01T00:00:00Z', '2026-08-04T00:00:00Z'), // old rank expires 08-04
      rec('2026-08-05T00:00:00Z'),                          // new rank covers end (promotion)
    ]
    const bases = [rec('2020-02-01T00:00:00Z', '2055-12-31T00:00:00Z')]
    expect(computeValidityBlock(ranks, bases, W0, W1)).toBeNull()
  })

  it('returns null when the only expiry lies before window start', () => {
    const ranks = [rec('2022-06-09T00:00:00Z', '2026-03-31T00:00:00Z')] // crew 895
    const bases = [rec('2020-02-01T00:00:00Z', '2055-12-31T00:00:00Z')]
    expect(computeValidityBlock(ranks, bases, W0, W1)).toBeNull()
  })

  it('returns null for empty records', () => {
    expect(computeValidityBlock([], [], W0, W1)).toBeNull()
  })
})
