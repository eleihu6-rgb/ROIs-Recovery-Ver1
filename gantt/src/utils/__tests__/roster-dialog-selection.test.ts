import { describe, expect, it } from 'vitest'
import { selectedRosterTaskIdsForDialog } from '@/utils/roster-dialog-selection'
import type { RosterItem } from '@/types/roster'

const item = (overrides: Partial<RosterItem>): RosterItem => ({
  id: 1,
  crewId: '101',
  pairingId: 200,
  pairingLabel: 'P200',
  ver: 1,
  base: 'YOW',
  label: 'F8001',
  assignmentGroup: 'FLT',
  assignment: 'FLY',
  role: null,
  subRole: null,
  source: 'CR',
  isRequested: 0,
  isSwapped: 0,
  preference: null,
  comments: null,
  score: null,
  workingHour: null,
  schStrDtUtc: '2026-07-10T12:00:00Z',
  schEndDtUtc: '2026-07-10T16:00:00Z',
  actStrDtUtc: null,
  actEndDtUtc: null,
  fltId: 9001,
  fltDt: null,
  dutySeq: 1,
  segSeq: 1,
  division: 'P',
  flightActingRank: 'CA',
  rosterActingRank: null,
  activeRank: null,
  position: null,
  schCreditedMinutes: null,
  actCreditedMinutes: null,
  tagSet: null,
  exceptionCode: null,
  ybh: null,
  mbh: null,
  yal: null,
  mal: null,
  ydo: null,
  mdo: null,
  mcred: null,
  ...overrides,
})

describe('roster dialog selection helpers', () => {
  it('selects all tasks for the same crew pairing', () => {
    expect(selectedRosterTaskIdsForDialog([
      item({ id: 1, crewId: '101', pairingId: 200 }),
      item({ id: 2, crewId: '101', pairingId: 200 }),
      item({ id: 3, crewId: '102', pairingId: 200 }),
      item({ id: 4, crewId: '101', pairingId: 300 }),
    ], 1)).toEqual([1, 2])
  })

  it('selects only the clicked ground task', () => {
    expect(selectedRosterTaskIdsForDialog([
      item({ id: 5, crewId: '101', pairingId: null }),
      item({ id: 6, crewId: '101', pairingId: null }),
    ], 5)).toEqual([5])
  })
})
