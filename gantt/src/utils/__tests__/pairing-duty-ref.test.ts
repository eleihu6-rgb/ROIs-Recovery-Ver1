import { describe, expect, it } from 'vitest'
import {
  buildPairingDutyRefLookup,
  formatDutyRefTz,
  resolveDutyRefTz,
} from '@/utils/pairing-duty-ref'
import type { PairingSegment } from '@/types/pairing'

const segment = (dutySeq: number, dutyRefTz: number | null): PairingSegment =>
  ({ dutySeq, dutyRefTz } as PairingSegment)

describe('pairing duty ref resolution', () => {
  it('keeps different ref values for different crews on the same pairing and duty', () => {
    const lookup = buildPairingDutyRefLookup([
      { crewId: 'C1', pairingId: 10, dutySeq: 1, dutyRefTz: -300 },
      { crewId: 'C2', pairingId: 10, dutySeq: 1, dutyRefTz: 60 },
    ], 'C2', 10)

    expect(resolveDutyRefTz(segment(1, -240), lookup)).toBe(60)
  })

  it('uses the selected crew value even when it is explicitly null', () => {
    const lookup = buildPairingDutyRefLookup([
      { crewId: 'C1', pairingId: 10, dutySeq: 1, dutyRefTz: null },
    ], 'C1', 10)

    expect(resolveDutyRefTz(segment(1, -240), lookup)).toBeNull()
  })

  it('falls back to the pairing segment ref when no crew-specific row exists', () => {
    const lookup = buildPairingDutyRefLookup([], 'C1', 10)

    expect(resolveDutyRefTz(segment(1, -240), lookup)).toBe(-240)
  })
})

describe('formatDutyRefTz', () => {
  it('formats negative minutes as signed H:MM', () => {
    expect(formatDutyRefTz(-360)).toBe('-6:00')
    expect(formatDutyRefTz(-330)).toBe('-5:30')
  })

  it('formats positive and zero minutes with an explicit sign', () => {
    expect(formatDutyRefTz(60)).toBe('+1:00')
    expect(formatDutyRefTz(0)).toBe('+0:00')
  })

  it('returns blank for missing or non-finite values', () => {
    expect(formatDutyRefTz(null)).toBe('')
    expect(formatDutyRefTz(undefined)).toBe('')
    expect(formatDutyRefTz(Number.NaN)).toBe('')
  })
})
