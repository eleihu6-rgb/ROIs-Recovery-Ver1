import { describe, expect, it } from 'vitest'
import {
  dedupeRosterItems,
  formatScheduleMinutes,
  resolveCrewDisplayTimezone,
  rosterItemOverlapsRp,
  rosterItemStartsInRp,
  scheduleRowsForCrew,
} from '@/utils/schedule-details'
import type { RosterPeriodOption } from '@/services/roster-period-api'
import type { RosterItem } from '@/types/roster'

const rp: RosterPeriodOption = {
  id: 7,
  rosterPeriod: '2026RP07',
  name: '2026-07',
  rpStart: '2026-07-01',
  rpEnd: '2026-07-31',
  isCurrent: true,
}

const item = (overrides: Partial<RosterItem>): RosterItem => ({
  id: 1,
  crewId: '101',
  pairingId: 200,
  ver: 1,
  base: 'YOW',
  label: 'F8001 YOW-YVR',
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

describe('schedule details helpers', () => {
  it('formats credit minutes', () => {
    expect(formatScheduleMinutes(125)).toBe('2:05')
    expect(formatScheduleMinutes('60')).toBe('1:00')
    expect(formatScheduleMinutes(null)).toBe('-')
  })

  it('resolves the crew-base timezone with toolbar fallback', () => {
    const options = [
      { airport: 'UTC', zoneId: 'UTC' },
      { airport: 'YOW', zoneId: 'America/Toronto' },
      { airport: 'YVR', zoneId: 'America/Vancouver' },
    ]
    const toolbar = { zoneId: 'UTC', airport: 'UTC' }

    // Crew base listed in timezone options → its zone wins.
    expect(resolveCrewDisplayTimezone('YOW', options, toolbar)).toEqual({ zoneId: 'America/Toronto', airport: 'YOW' })
    // Base not listed / unknown → toolbar selection.
    expect(resolveCrewDisplayTimezone('YUL', options, toolbar)).toEqual(toolbar)
    expect(resolveCrewDisplayTimezone(null, options, toolbar)).toEqual(toolbar)
    expect(resolveCrewDisplayTimezone(undefined, options, toolbar)).toEqual(toolbar)
    expect(resolveCrewDisplayTimezone('', options, toolbar)).toEqual(toolbar)
    // Non-UTC toolbar fallback is preserved when the base cannot be resolved.
    const yvrToolbar = { zoneId: 'America/Vancouver', airport: 'YVR' }
    expect(resolveCrewDisplayTimezone(null, options, yvrToolbar)).toEqual(yvrToolbar)
  })

  it('filters rows by selected RP overlap', () => {
    expect(rosterItemStartsInRp(item({ schStrDtUtc: '2026-06-30T20:00:00Z', schEndDtUtc: '2026-07-01T02:00:00Z' }), rp, 'UTC')).toBe(false)
    expect(rosterItemStartsInRp(item({ schStrDtUtc: '2026-07-01T00:00:00Z', schEndDtUtc: '2026-07-01T03:00:00Z' }), rp, 'UTC')).toBe(true)
    expect(rosterItemOverlapsRp(item({ schStrDtUtc: '2026-08-01T00:00:00Z', schEndDtUtc: '2026-08-01T03:00:00Z' }), rp)).toBe(false)
  })

  it('builds sorted crew rows with duty credit fallback first', () => {
    const rows = scheduleRowsForCrew([
      item({ id: 2, pairingId: 201, crewId: '101', schStrDtUtc: '2026-07-12T12:00:00Z', dutyActCreditedMinutes: '180' }),
      item({ id: 1, crewId: '101', schStrDtUtc: '2026-07-10T12:00:00Z', actCreditedMinutes: '120', pairingLabel: 'P100' }),
      item({ id: 3, crewId: '102', schStrDtUtc: '2026-07-09T12:00:00Z', actCreditedMinutes: '240' }),
      item({ id: -1, crewId: '101', schStrDtUtc: '2026-07-09T12:00:00Z', actCreditedMinutes: '240' }),
    ], '101', rp, 'UTC')

    expect(rows.map((row) => row.id)).toEqual([1, 2])
    expect(rows.map((row) => row.credit)).toEqual(['2:00', '3:00'])
    expect(rows[0].label).toContain('P100')
    expect(rows[0].label).not.toContain('Flight 9001')
  })

  it('dedups the same task when it is in both the pane roster and the RP fetch', () => {
    // Live regression (SIT Crew 857, RP07): the pane store already holds the days
    // inside its date-range buffer (7/25–7/31) that the fetched RP also returns.
    const paneOverlap = item({
      id: 5,
      pairingId: null,
      crewId: '101',
      label: 'pane-version',
      schStrDtUtc: '2026-07-25T07:00:00Z',
      schEndDtUtc: '2026-07-25T23:59:59Z',
    })
    const paneOnly = item({ id: 6, pairingId: null, crewId: '101', schStrDtUtc: '2026-07-24T00:00:00Z', schEndDtUtc: '2026-07-24T23:59:59Z' })
    const fetchedOverlap = item({
      id: 5,
      pairingId: null,
      crewId: '101',
      label: 'server-version',
      schStrDtUtc: '2026-07-25T07:00:00Z',
      schEndDtUtc: '2026-07-25T23:59:59Z',
    })
    const fetchedOnly = item({ id: 7, pairingId: null, crewId: '101', schStrDtUtc: '2026-07-26T00:00:00Z', schEndDtUtc: '2026-07-26T23:59:59Z' })

    const rawInput = [paneOverlap, paneOnly, fetchedOverlap, fetchedOnly]
    // Without dedup the overlap renders twice — the exact SIT regression.
    expect(
      scheduleRowsForCrew(rawInput, '101', rp, 'UTC').filter((row) => row.id === 5),
    ).toHaveLength(2)

    const merged = dedupeRosterItems(rawInput)
    const rows = scheduleRowsForCrew(merged, '101', rp, 'UTC')

    // Each task renders exactly once, pane (draft-applied) version wins on conflict.
    expect(rows.map((row) => row.id)).toEqual([6, 5, 7])
    expect(rows.filter((row) => row.id === 5)).toHaveLength(1)
    expect(rows.find((row) => row.id === 5)?.label).toContain('pane-version')
  })

  it('groups a multi-duty pairing into one row with bounds, summed duty credit and interface id', () => {
    const pairingItems = [
      item({ id: 11, pairingId: 500, assignmentGroup: 'FLY', pairingLabel: '500 YVR-YUL · V100', pairingInterfaceId: 'IF500', dutySeq: 1, segSeq: 1, schStrDtUtc: '2026-07-28T12:00:00Z', schEndDtUtc: '2026-07-28T16:00:00Z', dutyActCreditedMinutes: '300' }),
      // second segment of the SAME duty — duty credit must count once
      item({ id: 12, pairingId: 500, assignmentGroup: 'FLY', pairingLabel: '500 YVR-YUL · V100', pairingInterfaceId: 'IF500', dutySeq: 1, segSeq: 2, schStrDtUtc: '2026-07-28T17:00:00Z', schEndDtUtc: '2026-07-28T19:00:00Z', dutyActCreditedMinutes: '300' }),
      item({ id: 13, pairingId: 500, assignmentGroup: 'FLY', pairingLabel: '500 YVR-YUL · V100', pairingInterfaceId: 'IF500', dutySeq: 2, segSeq: 1, schStrDtUtc: '2026-07-29T09:00:00Z', schEndDtUtc: '2026-07-29T13:00:00Z', dutyActCreditedMinutes: '240' }),
    ]
    const rows = scheduleRowsForCrew(pairingItems, '101', rp, 'UTC')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      type: 'FLY',
      credit: '9:00', // 300 + 240; the 2-segment duty counts once
      label: '500 YVR-YUL · V100',
      pairing: '500 · IF500',
    })
    expect(rows[0].start).toMatch(/^2026-07-28/)
    expect(rows[0].end).toMatch(/^2026-07-29/)
  })

  it('shows just the pairing id when interface id is missing', () => {
    const rows = scheduleRowsForCrew([
      item({ id: 21, pairingId: 600, assignmentGroup: 'FLY', pairingLabel: '600 YUL-YVR · V200', pairingInterfaceId: null, dutySeq: 1, schStrDtUtc: '2026-07-20T10:00:00Z', schEndDtUtc: '2026-07-20T14:00:00Z', dutyActCreditedMinutes: '120' }),
    ], '101', rp, 'UTC')
    expect(rows).toHaveLength(1)
    expect(rows[0].pairing).toBe('600')
  })

  it('interleaves merged pairing rows with standalone rows chronologically', () => {
    const rows = scheduleRowsForCrew([
      item({ id: 31, pairingId: null, assignmentGroup: 'GRD', label: 'GDO', schStrDtUtc: '2026-07-25T00:00:00Z', schEndDtUtc: '2026-07-25T23:59:59Z' }),
      item({ id: 32, pairingId: 700, assignmentGroup: 'FLY', pairingLabel: '700 YVR-YUL · V300', dutySeq: 1, segSeq: 1, schStrDtUtc: '2026-07-28T12:00:00Z', schEndDtUtc: '2026-07-28T16:00:00Z', dutyActCreditedMinutes: '300' }),
      item({ id: 33, pairingId: 700, assignmentGroup: 'FLY', pairingLabel: '700 YVR-YUL · V300', dutySeq: 2, segSeq: 1, schStrDtUtc: '2026-07-29T09:00:00Z', schEndDtUtc: '2026-07-29T13:00:00Z', dutyActCreditedMinutes: '240' }),
    ], '101', rp, 'UTC')
    expect(rows.map((row) => row.type)).toEqual(['GRD', 'FLY'])
    expect(rows).toHaveLength(2)
  })
})
