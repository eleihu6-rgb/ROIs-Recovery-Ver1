import { describe, expect, it } from 'vitest'
import { buildRosterLaneItemLayout, buildRosterRenderBuckets, getRosterRestMinutes } from '../roster-renderer'
import type { RosterItem } from '@/types/roster'

const item = (over: Partial<RosterItem>): RosterItem => ({
  id: 0,
  crewId: 'C1',
  pairingId: null,
  ver: 1,
  base: 'YYZ',
  label: 'DUTY',
  assignmentGroup: 'GRD',
  assignment: 'GRD',
  role: null,
  subRole: null,
  source: null,
  isRequested: 0,
  isSwapped: 0,
  preference: null,
  comments: null,
  score: null,
  workingHour: null,
  schStrDtUtc: '2026-01-01T00:00:00Z',
  schEndDtUtc: '2026-01-01T01:00:00Z',
  actStrDtUtc: null,
  actEndDtUtc: null,
  fltId: null,
  fltDt: null,
  dutySeq: null,
  segSeq: null,
  division: null,
  flightActingRank: '',
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
  ...over,
})

const bucketsFor = (items: RosterItem[]) => {
  const byCrew = new Map<string, RosterItem[]>([['C1', items]])
  return buildRosterRenderBuckets(byCrew).get('C1') ?? []
}

describe('roster overlap lanes', () => {
  it('keeps non-overlapping duties on lane 0', () => {
    const buckets = bucketsFor([
      item({ id: 1, schStrDtUtc: '2026-01-01T00:00:00Z', schEndDtUtc: '2026-01-01T01:00:00Z' }),
      item({ id: 2, schStrDtUtc: '2026-01-01T01:00:00Z', schEndDtUtc: '2026-01-01T02:00:00Z' }),
    ])

    expect(buckets.map((g) => [g.key, g.laneIndex, g.laneCount])).toEqual([
      ['ground:1', 0, 1],
      ['ground:2', 0, 1],
    ])
  })

  it('places overlapping duties in start-time order and reuses lane 0 after the overlap', () => {
    const buckets = bucketsFor([
      item({ id: 1, schStrDtUtc: '2026-01-01T00:00:00Z', schEndDtUtc: '2026-01-01T03:00:00Z' }),
      item({ id: 2, schStrDtUtc: '2026-01-01T01:00:00Z', schEndDtUtc: '2026-01-01T02:00:00Z' }),
      item({ id: 3, schStrDtUtc: '2026-01-01T03:00:00Z', schEndDtUtc: '2026-01-01T04:00:00Z' }),
    ])

    expect(buckets.map((g) => [g.key, g.laneIndex, g.laneCount])).toEqual([
      ['ground:1', 0, 2],
      ['ground:2', 1, 2],
      ['ground:3', 0, 2],
    ])
  })

  it('keeps a pairing as one lane unit and ground duties as individual lane units', () => {
    const buckets = bucketsFor([
      item({
        id: 10,
        pairingId: 77,
        assignmentGroup: 'FLT',
        schStrDtUtc: '2026-01-01T00:00:00Z',
        schEndDtUtc: '2026-01-01T01:00:00Z',
        dutySeq: 1,
        segSeq: 1,
      }),
      item({
        id: 11,
        pairingId: 77,
        assignmentGroup: 'FLT',
        schStrDtUtc: '2026-01-01T02:00:00Z',
        schEndDtUtc: '2026-01-01T03:00:00Z',
        dutySeq: 1,
        segSeq: 2,
      }),
      item({ id: 20, schStrDtUtc: '2026-01-01T01:30:00Z', schEndDtUtc: '2026-01-01T02:30:00Z' }),
    ])
    const layout = buildRosterLaneItemLayout(new Map([['C1', buckets]]))

    expect(buckets.map((g) => [g.key, g.items.map((i) => i.id), g.laneIndex, g.laneCount])).toEqual([
      ['pairing:77', [10, 11], 0, 2],
      ['ground:20', [20], 1, 2],
    ])
    expect(layout.get(10)).toEqual({ laneIndex: 0, laneCount: 2 })
    expect(layout.get(11)).toEqual({ laneIndex: 0, laneCount: 2 })
    expect(layout.get(20)).toEqual({ laneIndex: 1, laneCount: 2 })
  })

  it('extends pairing lane bounds using duty rest when actRestMin is missing', () => {
    const buckets = bucketsFor([
      item({
        id: 30,
        pairingId: 88,
        assignmentGroup: 'FLT',
        schStrDtUtc: '2026-01-01T00:00:00Z',
        schEndDtUtc: '2026-01-01T01:00:00Z',
        dropoffEndUtc: '2026-01-01T01:15:00Z',
        actRestMin: null,
        dutyActRestMin: 600,
        dutySeq: 1,
        segSeq: 1,
      }),
    ])

    expect(buckets[0].endMs).toBe(new Date('2026-01-01T11:15:00Z').getTime())
  })

  it('resolves roster rest minutes from act rest before duty-level fallbacks', () => {
    expect(getRosterRestMinutes(item({ actRestMin: 30, dutyActRestMin: 60, dutySchRestMin: 90 }))).toBe(30)
    expect(getRosterRestMinutes(item({ actRestMin: null, dutyActRestMin: 60, dutySchRestMin: 90 }))).toBe(60)
    expect(getRosterRestMinutes(item({ actRestMin: null, dutyActRestMin: null, dutySchRestMin: 90 }))).toBe(90)
    expect(getRosterRestMinutes(item({ actRestMin: null, dutyActRestMin: null, dutySchRestMin: null }))).toBe(0)
  })
})
