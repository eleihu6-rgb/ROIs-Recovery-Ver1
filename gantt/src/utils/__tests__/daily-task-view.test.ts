import { describe, expect, it } from 'vitest'
import {
  buildDailyTaskCalendarModel,
  buildMonthRange,
  buildRpRange,
  getRangeFetchBoundsUtc,
  shiftYearMonth,
  statusForRosterItem,
} from '@/utils/daily-task-view'
import type { RosterItem } from '@/types/roster'

const item = (overrides: Partial<RosterItem>): RosterItem => ({
  id: 1,
  crewId: '101',
  pairingId: 200,
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

describe('daily task calendar helpers', () => {
  it('builds month and RP ranges', () => {
    expect(buildMonthRange('2026-02')).toEqual({ startDate: '2026-02-01', endDate: '2026-02-28', label: '2026-02' })
    expect(shiftYearMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftYearMonth('2026-12', 1)).toBe('2027-01')
    expect(buildRpRange('2026-07-01T00:00:00', '2026-07-31T23:59:59', '2026RP07')).toEqual({
      startDate: '2026-07-01',
      endDate: '2026-07-31',
      label: '2026RP07',
    })
  })

  it('uses display timezone for fetch bounds', () => {
    expect(getRangeFetchBoundsUtc(buildMonthRange('2026-03'), 'UTC')).toEqual({
      startDate: '2026-03-01T00:00:00.000Z',
      endDate: '2026-03-31T23:59:59.999Z',
    })
  })

  it('classifies primary daily status with flight priority', () => {
    expect(statusForRosterItem(item({ pairingId: 10, assignmentGroup: 'FLT' }))).toBe('flight')
    expect(statusForRosterItem(item({ pairingId: null, assignmentGroup: 'GRD', assignment: 'RES' }))).toBe('reserve')
    expect(statusForRosterItem(item({ pairingId: null, assignmentGroup: 'GND', assignment: 'TRN' }))).toBe('ground')
    expect(statusForRosterItem(item({ pairingId: null, assignmentGroup: 'LVE', assignment: 'DO', label: 'DO' }))).toBe('dayoff')
  })

  it('maps tasks to their start day only and dedupes credit stats', () => {
    const model = buildDailyTaskCalendarModel([
      item({
        id: 1,
        schStrDtUtc: '2026-07-10T22:00:00Z',
        schEndDtUtc: '2026-07-12T02:00:00Z',
        dutyActCreditedMinutes: '180',
      }),
      item({
        id: 2,
        pairingId: null,
        assignmentGroup: 'GRD',
        assignment: 'RES',
        label: 'RES',
        schStrDtUtc: '2026-07-11T22:00:00Z',
        schEndDtUtc: '2026-07-12T16:00:00Z',
        actCreditedMinutes: '60',
      }),
      item({ id: 3, crewId: '102' }),
    ], '101', buildRpRange('2026-07-10', '2026-07-12', 'RP'), 'UTC', () => '#336699')

    expect(model.days.map((day) => [day.date, day.tasks.map((task) => task.id), day.status])).toEqual([
      ['2026-07-10', [1], 'flight'],
      ['2026-07-11', [2], 'reserve'],
      ['2026-07-12', [], 'open'],
    ])
    expect(model.stats.taskBlocks).toBe(2)
    expect(model.stats.totalCreditMinutes).toBe(240)
    expect(model.stats.flightDays).toBe(1)
    expect(model.stats.reserveDays).toBe(1)
    expect(model.stats.maxConsecutiveWork).toBe(2)
  })

  it('sorts task blocks by roster scheduled start time within a day', () => {
    const model = buildDailyTaskCalendarModel([
      item({
        id: 10,
        schStrDtUtc: '2026-07-10T18:00:00Z',
        schEndDtUtc: '2026-07-10T20:00:00Z',
      }),
      item({
        id: 11,
        schStrDtUtc: '2026-07-10T06:00:00Z',
        schEndDtUtc: '2026-07-10T08:00:00Z',
      }),
      item({
        id: 12,
        schStrDtUtc: '2026-07-10T12:00:00Z',
        schEndDtUtc: '2026-07-10T14:00:00Z',
      }),
    ], '101', buildRpRange('2026-07-10', '2026-07-10', 'RP'), 'UTC', () => '#336699')

    expect(model.days[0].tasks.map((task) => task.id)).toEqual([11, 12, 10])
  })

  it('sorts by actual start first, then scheduled start, then assignment with FLY first', () => {
    const model = buildDailyTaskCalendarModel([
      item({
        id: 20,
        assignment: 'RES',
        schStrDtUtc: '2026-07-10T08:00:00Z',
        actStrDtUtc: '2026-07-10T11:00:00Z',
      }),
      item({
        id: 21,
        assignment: 'TRN',
        schStrDtUtc: '2026-07-10T08:00:00Z',
        actStrDtUtc: '2026-07-10T08:30:00Z',
      }),
      item({
        id: 22,
        assignment: 'FLY',
        schStrDtUtc: '2026-07-10T09:00:00Z',
        actStrDtUtc: null,
      }),
      item({
        id: 23,
        assignment: 'DHD',
        schStrDtUtc: '2026-07-10T09:00:00Z',
        actStrDtUtc: null,
      }),
      item({
        id: 24,
        assignment: 'SBY',
        schStrDtUtc: '2026-07-10T09:00:00Z',
        actStrDtUtc: null,
      }),
    ], '101', buildRpRange('2026-07-10', '2026-07-10', 'RP'), 'UTC', () => '#336699')

    expect(model.days[0].tasks.map((task) => task.id)).toEqual([21, 22, 23, 24, 20])
  })
})
