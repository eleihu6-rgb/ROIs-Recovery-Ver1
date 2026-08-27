// gantt/src/utils/__tests__/pairing-credit.test.ts
import { describe, it, expect } from 'vitest'
import { pairingCreditedMinutes, isOpenPartialCoverage, sumCoverageCredit } from '../pairing-credit'
import type { PairingItem, PairingSegment, CompositionSlot } from '@/types/pairing'

/** Build a PairingItem with the only fields the credit helpers read. */
const item = (
  composition: CompositionSlot[],
  duties: Array<{ dutySeq: number; credited: number | null }>,
): PairingItem => {
  // One segment per duty entry; the helper dedups by dutySeq, so two segments with the
  // same dutySeq must be counted once (duplicate the first duty to prove the dedup).
  const segments: PairingSegment[] = duties.flatMap((d, i) =>
    [0, 1].map((segSeq) => ({
      id: i * 10 + segSeq,
      dutySeq: d.dutySeq,
      segSeq,
      dutyActCreditedMinutes: d.credited === null ? null : String(d.credited),
    }) as unknown as PairingSegment),
  )
  return {
    pairing: { composition } as PairingItem['pairing'],
    flights: [],
    segments,
    sessionTags: [],
  }
}

const slot = (plan: number, fill: number): CompositionSlot => ({ rank: 'CA', plan, fill } as CompositionSlot)

describe('pairingCreditedMinutes', () => {
  it('sums duty_act_credited_minutes once per dutySeq (dedup across a duty\'s segments)', () => {
    // Two duties (90 + 150), each duplicated across 2 segments → must count 240, not 480.
    expect(pairingCreditedMinutes(item([], [{ dutySeq: 1, credited: 90 }, { dutySeq: 2, credited: 150 }]))).toBe(240)
  })
  it('treats null credited minutes as 0', () => {
    expect(pairingCreditedMinutes(item([], [{ dutySeq: 1, credited: null }]))).toBe(0)
  })
})

describe('isOpenPartialCoverage', () => {
  it('true for non-empty subsets of {open, partial}', () => {
    expect(isOpenPartialCoverage(['open'])).toBe(true)
    expect(isOpenPartialCoverage(['partial'])).toBe(true)
    expect(isOpenPartialCoverage(['open', 'partial'])).toBe(true)
  })
  it('false when empty, or when full/over are part of the selection', () => {
    expect(isOpenPartialCoverage([])).toBe(false)
    expect(isOpenPartialCoverage(['open', 'full'])).toBe(false)
    expect(isOpenPartialCoverage(['over'])).toBe(false)
    expect(isOpenPartialCoverage(['open', 'partial', 'full', 'over'])).toBe(false)
  })
})

describe('sumCoverageCredit', () => {
  const open = item([slot(2, 0)], [{ dutySeq: 1, credited: 100 }])       // fill 0 → open
  const partial = item([slot(2, 1)], [{ dutySeq: 1, credited: 200 }])    // short → partial
  const full = item([slot(2, 2)], [{ dutySeq: 1, credited: 999 }])       // met → full

  it('sums only the credit of pairings whose coverage is in the selection', () => {
    // Open+Partial selected → 100 + 200; the full pairing (999) is excluded.
    expect(sumCoverageCredit([open, partial, full], ['open', 'partial'])).toBe(300)
    // Only Open → 100.
    expect(sumCoverageCredit([open, partial, full], ['open'])).toBe(100)
    // Only Partial → 200.
    expect(sumCoverageCredit([open, partial, full], ['partial'])).toBe(200)
  })
  it('excludes full/over pairings even when the selection contains them', () => {
    expect(sumCoverageCredit([open, partial, full], ['full'])).toBe(999)
  })
})
