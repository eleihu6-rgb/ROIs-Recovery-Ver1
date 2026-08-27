import { describe, it, expect } from 'vitest'
import { crewMandayDelta } from '../manday-delta'
import type { RosterItem } from '@/types/roster'
import type { RosterPeriodOption } from '@/services/roster-period-api'

// Roster periods covering the June/July 2026 dates used below (F8 seed boundaries).
const rpItems: RosterPeriodOption[] = [
  { id: 6, rosterPeriod: '2026RP06', name: '2026-06', rpStart: '2026-06-01', rpEnd: '2026-06-30', isCurrent: false },
  { id: 7, rosterPeriod: '2026RP07', name: '2026-07', rpStart: '2026-07-01', rpEnd: '2026-07-31', isCurrent: false },
]

// Minimal RosterItem factory — only the fields crewMandayDelta reads matter.
const item = (p: Partial<RosterItem>): RosterItem => ({
  id: 0, crewId: 'C1', pairingId: null, ver: 1, base: '', label: null,
  assignmentGroup: '', assignment: null, role: null, subRole: null, source: null,
  isRequested: 0, isSwapped: 0, preference: null, comments: null, score: null, workingHour: null,
  schStrDtUtc: null, schEndDtUtc: null, actStrDtUtc: null, actEndDtUtc: null,
  fltId: null, fltDt: null, dutySeq: null, segSeq: null, division: null,
  flightActingRank: '', rosterActingRank: null, activeRank: null, position: null,
  schCreditedMinutes: null, actCreditedMinutes: null, tagSet: null, exceptionCode: null,
  dutyActCreditedMinutes: null,
  ybh: null, mbh: null, yal: null, mal: null, ydo: null, mdo: null, mcred: null,
  ...p,
})
const fly = (pairingId: number, dutySeq: number, credit: string, day = '05') =>
  item({ pairingId, dutySeq, dutyActCreditedMinutes: credit, schStrDtUtc: `2026-06-${day}T08:00:00Z` })
const ground = (assignment: string, day: string) =>
  item({ pairingId: null, assignment, schStrDtUtc: `2026-06-${day}T00:00:00Z` })

describe('crewMandayDelta', () => {
  it('de-assigning a flying duty drops credit AND block (proxy) for month + year', () => {
    const base = [fly(100, 1, '300'), fly(200, 1, '240')]
    const virtual = [fly(200, 1, '240')] // pairing 100 removed
    const d = crewMandayDelta(base, virtual, '2026RP06', rpItems).get('C1')!
    expect(d.mcred).toBe(-300)
    expect(d.mbh).toBe(-300) // block proxy = the removed duty's credit
    expect(d.ybh).toBe(-300)
    expect(d.mdo).toBe(0)
    expect(d.mal).toBe(0)
  })

  it('a multi-segment duty counts once in the block proxy', () => {
    const base = [fly(100, 1, '300'), fly(100, 1, '300')] // two sectors, same duty
    const virtual: RosterItem[] = []
    const d = crewMandayDelta(base, virtual, '2026RP06', rpItems).get('C1')!
    expect(d.mbh).toBe(-300) // deduped, not -600
  })

  it('adding a DO ground task increments day-off counts (month + year)', () => {
    const d = crewMandayDelta([], [ground('DO', '10')], '2026RP06', rpItems).get('C1')!
    expect(d.mdo).toBe(1)
    expect(d.ydo).toBe(1)
    expect(d.mcred).toBe(0)
    expect(d.mbh).toBe(0)
  })

  it('adding VAC/ILL increments leave counts', () => {
    const vac = crewMandayDelta([], [ground('VAC', '11'), ground('VAC', '12')], '2026RP06', rpItems).get('C1')!
    expect(vac.mal).toBe(2)
    expect(vac.yal).toBe(2)
    const ill = crewMandayDelta([], [ground('ILL', '11')], '2026RP06', rpItems).get('C1')!
    expect(ill.mal).toBe(1)
  })

  it('an out-of-month flying duty still affects yearly block but not monthly', () => {
    const julyFly = item({ pairingId: 300, dutySeq: 1, dutyActCreditedMinutes: '500', schStrDtUtc: '2026-07-02T08:00:00Z' })
    const d = crewMandayDelta([], [julyFly], '2026RP06', rpItems).get('C1')!
    expect(d.mbh).toBe(0)   // not in June
    expect(d.ybh).toBe(500) // same year
    expect(d.mcred).toBe(0) // mcred is month-scoped
  })

  it('returns no entry for a crew whose KPIs are unchanged', () => {
    const same = [fly(100, 1, '300')]
    expect(crewMandayDelta(same, [...same], '2026RP06', rpItems).has('C1')).toBe(false)
  })
})
