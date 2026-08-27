import { describe, it, expect } from 'vitest'
import { formatCreditMinutes, sumPairingCreditMinutes, sumCrewCreditMinutes } from '../format-credit'

describe('formatCreditMinutes', () => {
  it('formats whole minutes as H:MM', () => {
    expect(formatCreditMinutes(680)).toBe('11:20')
    expect(formatCreditMinutes(240)).toBe('4:00')
    expect(formatCreditMinutes(5)).toBe('0:05')
  })

  it('accepts numeric strings from the API and rounds fractional minutes', () => {
    expect(formatCreditMinutes('330.00')).toBe('5:30')
    expect(formatCreditMinutes('330.6')).toBe('5:31')
  })

  it('returns empty string for null / non-numeric / non-positive input', () => {
    expect(formatCreditMinutes(null)).toBe('')
    expect(formatCreditMinutes(undefined)).toBe('')
    expect(formatCreditMinutes(0)).toBe('')
    expect(formatCreditMinutes(-10)).toBe('')
    expect(formatCreditMinutes('abc')).toBe('')
  })
})

describe('sumPairingCreditMinutes', () => {
  it('sums each DISTINCT duty once (credit repeats per segment of a duty)', () => {
    // Duty 1 spans two sectors (credit 300 repeated); duty 2 one sector (credit 240).
    const segs = [
      { dutySeq: 1, dutyActCreditedMinutes: '300.00' },
      { dutySeq: 1, dutyActCreditedMinutes: '300.00' },
      { dutySeq: 2, dutyActCreditedMinutes: '240.00' },
    ]
    // 300 + 240 = 540 — NOT 840 (which a naive per-segment sum would give).
    expect(sumPairingCreditMinutes(segs)).toBe(540)
  })

  it('ignores duties with null credit and returns 0 when none carry credit', () => {
    expect(sumPairingCreditMinutes([
      { dutySeq: 1, dutyActCreditedMinutes: null },
      { dutySeq: 2, dutyActCreditedMinutes: '120' },
    ])).toBe(120)
    expect(sumPairingCreditMinutes([{ dutySeq: 1, dutyActCreditedMinutes: null }])).toBe(0)
    expect(sumPairingCreditMinutes([])).toBe(0)
  })
})

describe('sumCrewCreditMinutes', () => {
  const fly = (pairingId: number, dutySeq: number, credit: string, day = '05') => ({
    pairingId,
    dutySeq,
    dutyActCreditedMinutes: credit,
    actCreditedMinutes: null,
    schStrDtUtc: `2026-06-${day}T08:00:00Z`,
  })
  const ground = (credit: string, day = '05') => ({
    pairingId: null,
    dutySeq: null,
    dutyActCreditedMinutes: null,
    actCreditedMinutes: credit,
    schStrDtUtc: `2026-06-${day}T08:00:00Z`,
  })

  it('dedups a multi-segment duty to one credit value', () => {
    const items = [fly(100, 1, '240'), fly(100, 1, '240'), fly(100, 2, '180')]
    expect(sumCrewCreditMinutes(items, '2026-06')).toBe(420)
  })

  it('adds ground-task credit', () => {
    expect(sumCrewCreditMinutes([fly(100, 1, '240'), ground('300')], '2026-06')).toBe(540)
  })

  it('excludes items outside the month', () => {
    const out = { ...fly(101, 1, '500'), schStrDtUtc: '2026-07-01T08:00:00Z' }
    expect(sumCrewCreditMinutes([fly(100, 1, '240'), out], '2026-06')).toBe(240)
  })

  it('treats null credit as zero', () => {
    expect(
      sumCrewCreditMinutes(
        [
          {
            pairingId: 100,
            dutySeq: 1,
            dutyActCreditedMinutes: null,
            actCreditedMinutes: null,
            schStrDtUtc: '2026-06-05T08:00:00Z',
          },
        ],
        '2026-06',
      ),
    ).toBe(0)
  })
})
