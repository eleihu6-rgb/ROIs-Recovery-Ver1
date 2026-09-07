import { describe, expect, it } from 'vitest'
import type { RosterItem } from '@/types'
import { buildCheckInputs } from '@/utils/roster-to-check-input'

const flightItem = (assignmentGroup: string, fleetCode: string): RosterItem => ({
  id: 1,
  crewId: '1012',
  pairingId: 135559,
  ver: 1,
  base: 'PVG',
  label: 'MU135559 PVG-PEK',
  assignmentGroup,
  assignment: 'FLY',
  role: 'CREW',
  subRole: null,
  source: 'PA',
  isRequested: 0,
  isSwapped: 0,
  preference: null,
  comments: null,
  score: null,
  workingHour: null,
  schStrDtUtc: '2026-09-07T05:40:00.000Z',
  schEndDtUtc: '2026-09-07T08:40:00.000Z',
  actStrDtUtc: null,
  actEndDtUtc: null,
  fltId: 605,
  fltDt: '2026-09-07',
  fleetCode,
  dutySeq: 2,
  segSeq: 1,
  division: 'P',
  flightActingRank: 'CA',
  rosterActingRank: 'CA',
  activeRank: 'CA',
  position: null,
  schCreditedMinutes: null,
  actCreditedMinutes: null,
  tagSet: null,
  exceptionCode: null,
  ybh: 0,
  mbh: 0,
  yal: 0,
  mal: 0,
  ydo: 0,
  mdo: 0,
  mcred: 0,
})

describe('buildCheckInputs', () => {
  it('recognizes Live FLY tasks and forwards the segment fleet', () => {
    const [input] = buildCheckInputs('1012', [flightItem('FLY', '7M8')], '1', new Map([
      ['1012', { division: 'P', rank: 'CA', fleetQuals: ['737'], airportQuals: [] }],
    ]))

    expect(input.pairing.pairingId).toBe(135559)
    expect(input.pairing.duties[0].segments[0]).toMatchObject({ fleetCode: '7M8' })
  })
})
