import { describe, it, expect } from 'vitest'
import type { RosterPeriodOption } from '@/services/roster-period-api'
import { applyMaxSpan } from '../rp-span'

// items: 2026RP01..2026RP14 with ids 1..14, ascending by rpStart.
const items: RosterPeriodOption[] = Array.from({ length: 14 }, (_, i) => ({
  id: i + 1,
  rosterPeriod: `2026RP${String(i + 1).padStart(2, '0')}`,
  name: `2026-${String(i + 1).padStart(2, '0')}`,
  rpStart: `2026-${String(i + 1).padStart(2, '0')}-01`,
  rpEnd: `2026-${String(i + 1).padStart(2, '0')}-28`,
  isCurrent: false,
}))

const MAX = 6

describe('applyMaxSpan', () => {
  it('keeps a within-span add unchanged, even with a gap', () => {
    // {01,02,03,04} + 06 → span 6 → unchanged (05 gap stays)
    expect(applyMaxSpan(['1', '2', '3', '4', '6'], ['1', '2', '3', '4'], items, MAX))
      .toEqual(['1', '2', '3', '4', '6'])
  })

  it('sorts a within-span selection ascending regardless of input order', () => {
    expect(applyMaxSpan(['6', '3'], ['3'], items, MAX)).toEqual(['3', '6'])
  })

  it('drops the newest selected RP when an older RP exceeds the span', () => {
    // {08} + click 01 → {01}; no intermediate RPs are auto-selected.
    expect(applyMaxSpan(['1', '8'], ['8'], items, MAX)).toEqual(['1'])
  })

  it('drops the oldest selected RP when a newer RP exceeds the span', () => {
    // {01,02,03,04,06} + 07 → {02,03,04,06,07}; the gap stays a gap.
    expect(applyMaxSpan(['1', '2', '3', '4', '6', '7'], ['1', '2', '3', '4', '6'], items, MAX))
      .toEqual(['2', '3', '4', '6', '7'])
  })

  it('preserves all other checks when a newer RP exceeds the span', () => {
    // {02,03,04,06,07} + 08 → {03,04,06,07,08}; no RP is filled in.
    expect(applyMaxSpan(['2', '3', '4', '6', '7', '8'], ['2', '3', '4', '6', '7'], items, MAX))
      .toEqual(['3', '4', '6', '7', '8'])
  })

  it('drops every out-of-range RP for a sparse selection', () => {
    // {02..06} + 08 → {03..06,08}; 02 is the only RP outside the 6-period window.
    const prev = ['2', '3', '4', '5', '6']
    expect(applyMaxSpan([...prev, '8'], prev, items, MAX)).toEqual(['3', '4', '5', '6', '8'])
  })

  it('does not rebuild on a pure removal', () => {
    expect(applyMaxSpan(['1', '2', '3'], ['1', '2', '3', '4'], items, MAX)).toEqual(['1', '2', '3'])
  })

  it('drops the complete older tail for a far newer click', () => {
    // {02..06} + click 12 → {12}
    const prev = ['2', '3', '4', '5', '6']
    expect(applyMaxSpan([...prev, '12'], prev, items, MAX)).toEqual(['12'])
  })

  it('removes all newer checks when an older RP is clicked across years', () => {
    // IDs 01..14 represent consecutive RPs, so 01 is 12 periods before 13/14.
    expect(applyMaxSpan(['14', '13', '1'], ['14', '13'], items, MAX)).toEqual(['1'])
  })
})
