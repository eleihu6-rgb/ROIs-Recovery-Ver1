import { describe, expect, it } from 'vitest'
import { buildGanttDayStatistics } from '@/utils/gantt-day-statistics'
import type { Crew } from '@/types/crew'
import type { Pairing, PairingSegment } from '@/types/pairing'
import type { RosterItem } from '@/types/roster'

const crew = (crewId: string, rank: string, base = 'YOW'): Crew => ({
  id: Number(crewId),
  crewId,
  firstName: '',
  middleName: null,
  lastName: '',
  preferredName: null,
  gender: '',
  division: 'P',
  filiale: 'F8',
  status: 1,
  remarks: null,
  seniorityNum: null,
  panelRank: rank,
  panelBase: base,
})

const roster = (overrides: Partial<RosterItem>): RosterItem => ({
  id: 1,
  crewId: '101',
  pairingId: null,
  ver: 1,
  base: 'YOW',
  label: null,
  assignmentGroup: 'GND',
  assignment: 'TRN',
  role: null,
  subRole: null,
  source: 'CR',
  isRequested: 0,
  isSwapped: 0,
  preference: null,
  comments: null,
  score: null,
  workingHour: null,
  schStrDtUtc: '2026-07-10T16:00:00Z',
  schEndDtUtc: '2026-07-10T18:00:00Z',
  actStrDtUtc: null,
  actEndDtUtc: null,
  fltId: null,
  fltDt: null,
  dutySeq: null,
  segSeq: null,
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

const pairing = (overrides: Partial<Pairing>): Pairing => ({
  id: 200,
  pairingLabel: 'P-200',
  filiale: 'F8',
  division: 'P',
  base: 'YOW',
  fleet: '320',
  assignmentGroup: 'FLT',
  assignment: 'FLY',
  schStrDtUtc: '2026-07-10T08:00:00Z',
  schEndDtUtc: '2026-07-10T20:00:00Z',
  actStrDtUtc: '',
  actEndDtUtc: '',
  durationDays: 1,
  tafb: 0,
  dutyCount: 1,
  segCount: 1,
  blockMinutes: 0,
  ver: 1,
  isDeleted: 0,
  source: null,
  tags: null,
  comments: null,
  pairingDt: '2026-07-10',
  composition: [{ rank: 'CA', plan: 2, fill: 1 }],
  isFull: false,
  ...overrides,
})

const segment = (overrides: Partial<PairingSegment>): PairingSegment => ({
  id: 1,
  pairingId: 200,
  dutySeq: 1,
  segSeq: 1,
  fltId: 1,
  fltNum: '12045',
  airline: 'F8',
  depArp: 'YOW',
  arvArp: 'YYZ',
  schStrDtUtc: '2026-07-10T08:00:00Z',
  schEndDtUtc: '2026-07-10T20:00:00Z',
  actStrDtUtc: '2026-07-10T08:00:00Z',
  actEndDtUtc: '2026-07-10T20:00:00Z',
  segAssignment: 'FLY',
  dutyStrArp: 'YOW',
  dutyEndArp: 'YOW',
  dutySchStrDtUtc: '2026-07-10T08:00:00Z',
  dutySchEndDtUtc: '2026-07-10T20:00:00Z',
  dutySchRestMin: 720,
  dutyActRestMin: null,
  dutyActCreditedMinutes: null,
  pickupStartUtc: null,
  pickupEndUtc: null,
  briefAirport: null,
  briefStartUtc: null,
  briefEndUtc: null,
  debriefAirport: null,
  debriefStartUtc: null,
  debriefEndUtc: null,
  dropoffStartUtc: null,
  dropoffEndUtc: null,
  doublePickupStartUtc: null,
  doublePickupEndUtc: null,
  doubleBriefAirport: null,
  doubleBriefStartUtc: null,
  doubleBriefEndUtc: null,
  doubleDebriefAirport: null,
  doubleDebriefEndUtc: null,
  doubleDebriefStartUtc: null,
  doubleDropoffStartUtc: null,
  doubleDropoffEndUtc: null,
  ...overrides,
})

describe('gantt day statistics', () => {
  it('uses timezone day boundaries, actual task times, and groups assignments', () => {
    const model = buildGanttDayStatistics({
      date: '2026-07-10',
      timezone: 'America/Toronto',
      crews: [crew('101', 'CA'), crew('102', 'FO')],
      rosterItems: [roster({
        id: 7,
        schStrDtUtc: '2026-07-11T03:00:00Z',
        schEndDtUtc: '2026-07-11T05:00:00Z',
        actStrDtUtc: '2026-07-10T22:00:00Z',
        actEndDtUtc: '2026-07-11T02:00:00Z',
      })],
      pairings: [],
      pairingSegments: [],
    })

    expect(model.nodes[0].count).toBe(2)
    expect(model.nodes[0].children.map((child) => [child.label, child.count])).toEqual([['CA', 1], ['FO', 1]])
    expect(model.nodes[1].children[0]?.label).toBe('TRN')
    expect(model.nodes[3].count).toBe(1)
    expect(model.nodes[1].rows[0]?.startUtc).toBe('2026-07-10T22:00:00Z')
  })

  it('deduplicates layover duties and counts open pairings', () => {
    const model = buildGanttDayStatistics({
      date: '2026-07-10',
      timezone: 'UTC',
      crews: [crew('101', 'CA')],
      rosterItems: [],
      pairings: [pairing({ id: 200, dutyCount: 2 }), pairing({ id: 201, composition: [{ rank: 'CA', plan: 1, fill: 1 }] })],
      pairingSegments: [
        segment({ id: 1 }),
        segment({
          id: 2,
          dutySeq: 2,
          dutySchStrDtUtc: '2026-07-11T08:00:00Z',
          dutySchEndDtUtc: '2026-07-11T20:00:00Z',
          segSeq: 2,
        }),
      ],
    })

    expect(model.nodes.find((node) => node.id === 'layover')?.count).toBe(1)
    expect(model.nodes.find((node) => node.id === 'open-pairing')?.count).toBe(1)
  })

  it('includes assigned crew rank and base on layover detail rows', () => {
    const model = buildGanttDayStatistics({
      date: '2026-07-10',
      timezone: 'UTC',
      crews: [crew('101', 'CA', 'YOW')],
      rosterItems: [roster({
        crewId: '101',
        pairingId: 200,
        base: 'YOW',
        schStrDtUtc: '2026-07-09T16:00:00Z',
        schEndDtUtc: '2026-07-09T18:00:00Z',
      })],
      pairings: [pairing({ id: 200, dutyCount: 2 })],
      pairingSegments: [
        segment({ id: 1 }),
        segment({
          id: 2,
          dutySeq: 2,
          dutySchStrDtUtc: '2026-07-11T08:00:00Z',
          dutySchEndDtUtc: '2026-07-11T20:00:00Z',
          segSeq: 2,
        }),
      ],
    })

    const layoverRow = model.nodes.find((node) => node.id === 'layover')?.rows[0]
    expect(layoverRow).toMatchObject({ crewId: '101', rank: 'CA', base: 'YOW' })
    expect(model.nodes.find((node) => node.id === 'no-assignment')?.rows).toHaveLength(0)
  })

  it('does not count trailing REST for a single-duty pairing', () => {
    const model = buildGanttDayStatistics({
      date: '2026-07-10',
      timezone: 'UTC',
      crews: [crew('101', 'CA', 'YOW')],
      rosterItems: [],
      pairings: [pairing({ id: 200, dutyCount: 1 })],
      pairingSegments: [segment({ id: 1, dutySchRestMin: 720 })],
    })

    expect(model.nodes.find((node) => node.id === 'layover')?.rows).toHaveLength(0)
  })
})
