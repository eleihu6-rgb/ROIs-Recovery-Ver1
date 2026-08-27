import { describe, it, expect } from 'vitest'
import {
  computeRosterQuality,
  findStandaloneReserveDays,
  findLongWorkingRuns,
  findMaxWorkingDaysInPeriod,
  isReserveStandby,
  isSim,
  isDayOff,
  DEFAULT_QUALITY_PARAMS,
  type QualityParams,
} from '@/components/scenario-gantt/quality-analysis'
import { READ_ONLY_CAPABILITIES } from '@/components/gantt/source/gantt-pane-source'
import type {
  ScenarioGanttData,
  ScenarioGanttCrew,
  ScenarioGanttPairing,
  ScenarioGanttPairingSegment,
  ScenarioGanttGroundItem,
  ScenarioGanttAssignment,
} from '@/types/scenario-gantt'

// ── Fixture factories (minimal valid scenario shapes) ──────────────────────────
const crew = (crewId: string, base = 'YEG', rank = 'CA'): ScenarioGanttCrew => ({
  crewId, base, division: 'P', rank, seniorityNum: '1', crewName: crewId,
})

const pairing = (
  pairingId: number,
  opts: Partial<ScenarioGanttPairing> = {},
): ScenarioGanttPairing => ({
  pairingId,
  pairingLabel: `P${pairingId}`,
  base: 'YEG',
  schStrDtUtc: '2026-06-02T08:00:00.000Z',
  schEndDtUtc: '2026-06-02T16:00:00.000Z',
  assignmentGroup: 'FLT',
  assignment: 'FLT',
  division: 'P',
  compositions: [],
  ...opts,
})

const seg = (
  pairingId: number,
  dutySeq: number,
  creditMin: number,
): ScenarioGanttPairingSegment => ({
  pairingId, dutySeq, segSeq: 1, fltId: null, fltDt: null, fltNum: '', airline: 'F8',
  depArp: 'YEG', arvArp: 'YYZ', segAssignment: 'FLT',
  schStrDtUtc: '2026-06-02T08:00:00.000Z', schEndDtUtc: '2026-06-02T16:00:00.000Z',
  actStrDtUtc: '2026-06-02T08:00:00.000Z', actEndDtUtc: '2026-06-02T16:00:00.000Z',
  dutyStrArp: 'YEG', dutyEndArp: 'YYZ',
  dutySchStrDtUtc: '2026-06-02T08:00:00.000Z', dutySchEndDtUtc: '2026-06-02T16:00:00.000Z',
  dutySchRestMin: null, dutyActRestMin: null, dutyActCreditedMinutes: creditMin,
  brief1StartUtc: '', brief1EndUtc: '', debrief1StartUtc: '', debrief1EndUtc: '',
  pickup1StartUtc: '', pickup1EndUtc: '', dropoff1StartUtc: '', dropoff1EndUtc: '',
})

const ground = (
  crewId: string,
  assignment: string,
  day: string,
  source: 'CR' | 'PA' = 'CR',
  creditMin?: number,
  assignmentGroup = 'SBY',
): ScenarioGanttGroundItem => ({
  crewId, assignmentGroup, assignment,
  schStrDtUtc: `${day}T00:00:00.000Z`, schEndDtUtc: `${day}T23:59:00.000Z`,
  actingRank: 'CA', source, actCreditedMinutes: creditMin,
})

const data = (over: Partial<ScenarioGanttData>): ScenarioGanttData => ({
  scenarioId: 1, scenarioName: 'T', fileType: 'RO', capabilities: READ_ONLY_CAPABILITIES,
  strDtLoc: '2026-06-01T00:00:00.000Z', endDtLoc: '2026-06-30T23:59:59.000Z',
  scenarioStrDt: '2026-06-01T00:00:00', scenarioEndDt: '2026-06-30T00:00:00',
  leadinLive: 0, dataSource: 'snapshot',
  crew: [], pairings: [], assignments: [], pairingSegments: [], flights: [], groundItems: [],
  crewStats: {},
  ...over,
})

describe('findStandaloneReserveDays', () => {
  it('flags an isolated RES surrounded by blanks (RES + blank + RES = two standalone)', () => {
    expect(findStandaloneReserveDays(['2026-06-02', '2026-06-04'])).toEqual([
      '2026-06-02', '2026-06-04',
    ])
  })
  it('does NOT flag two consecutive reserve days (the client minimum)', () => {
    expect(findStandaloneReserveDays(['2026-06-02', '2026-06-03'])).toEqual([])
  })
  it('flags only the isolated tail when a 3-day run is followed by a lone day', () => {
    expect(
      findStandaloneReserveDays(['2026-06-02', '2026-06-03', '2026-06-04', '2026-06-10']),
    ).toEqual(['2026-06-10'])
  })
})

describe('findLongWorkingRuns', () => {
  it('flags a run of more than 6 consecutive working days', () => {
    const days = ['01', '02', '03', '04', '05', '06', '07'].map((d) => `2026-06-${d}`) // 7 days
    expect(findLongWorkingRuns(days)).toEqual(['2026-06-01–2026-06-07 (7d)'])
  })
  it('does NOT flag exactly 6 consecutive working days', () => {
    const days = ['01', '02', '03', '04', '05', '06'].map((d) => `2026-06-${d}`)
    expect(findLongWorkingRuns(days)).toEqual([])
  })
  it('a gap splits the streak so neither side exceeds 6', () => {
    const days = ['01', '02', '03', '05', '06', '07', '08'].map((d) => `2026-06-${d}`) // 3 + 4
    expect(findLongWorkingRuns(days)).toEqual([])
  })
})

describe('isReserveStandby / isSim', () => {
  it('reserve matches SBY group or explicit RES code', () => {
    expect(isReserveStandby('SBY', 'PRAM')).toBe(true)
    expect(isReserveStandby('GRD', 'RES')).toBe(true)
    expect(isReserveStandby('FLT', 'FLT')).toBe(false)
  })
  it('sim matches SIM group or code', () => {
    expect(isSim('SIM', 'SIM')).toBe(true)
    expect(isSim('GRD', 'DO')).toBe(false)
  })
  it('day-off matches OFF group or explicit DO code', () => {
    expect(isDayOff('OFF', 'DO')).toBe(true)
    expect(isDayOff('GRD', 'DO')).toBe(true)
    expect(isDayOff('SBY', 'RES')).toBe(false)
    expect(isDayOff('VAC', 'VAC')).toBe(false)
  })
})

describe('computeRosterQuality', () => {
  it('credit: before opt counts live pre-assignment; after opt counts CR pairing plus credited RES/SBY ground only', () => {
    const d = data({
      crew: [crew('C1')],
      pairings: [pairing(100), pairing(200)],
      pairingSegments: [seg(100, 1, 3600), seg(200, 1, 1200)],
      assignments: [
        { crewId: 'C1', pairingId: 100, source: 'PA' },
        { crewId: 'C1', pairingId: 200, source: 'CR' },
      ] satisfies ScenarioGanttAssignment[],
      groundItems: [
        ground('C1', 'TRN', '2026-05-30', 'PA', 1200, 'GRD'),
        ground('C1', 'RES', '2026-06-03', 'CR', 480, 'SBY'),
        ground('C1', 'DO', '2026-06-04', 'CR', 999, 'OFF'),
        ground('C1', 'SIM', '2026-06-05', 'CR', 777, 'SIM'),
        ground('C1', 'TRN', '2026-06-06', 'CR', 666, 'GRD'),
      ],
    })
    const [row] = computeRosterQuality(d)
    expect(row.leadInCreditMin).toBe(1200)
    expect(row.preAssignCreditMin).toBe(3600)
    expect(row.solverCreditMin).toBe(1680)
  })

  it('dedupes pairing credit by dutySeq (multi-segment duty counted once)', () => {
    const d = data({
      crew: [crew('C1')],
      pairings: [pairing(200)],
      pairingSegments: [seg(200, 1, 600), seg(200, 1, 600), seg(200, 2, 600)],
      assignments: [{ crewId: 'C1', pairingId: 200, source: 'CR' }],
    })
    expect(computeRosterQuality(d)[0].solverCreditMin).toBe(1200)
  })

  it('standalone RES: isolated reserve days flagged; consecutive pass', () => {
    const isolated = computeRosterQuality(data({
      crew: [crew('C1')],
      groundItems: [ground('C1', 'RES', '2026-06-02'), ground('C1', 'RES', '2026-06-04')],
    }))[0].findings.find((f) => f.key === 'standalone-res')!
    expect(isolated.count).toBe(2)
    expect(isolated.ok).toBe(false)
    expect(isolated.detail).toEqual(['2026-06-02', '2026-06-04'])

    const consec = computeRosterQuality(data({
      crew: [crew('C1')],
      groundItems: [ground('C1', 'PRAM', '2026-06-02'), ground('C1', 'PRPM', '2026-06-03')],
    }))[0].findings.find((f) => f.key === 'standalone-res')!
    expect(consec.ok).toBe(true)
  })

  it('consecutive working > 6: a single 8-day pairing flags 1 long run', () => {
    const d = data({
      crew: [crew('C1')],
      pairings: [pairing(400, { schStrDtUtc: '2026-06-01T08:00:00.000Z', schEndDtUtc: '2026-06-08T16:00:00.000Z' })],
      pairingSegments: [seg(400, 1, 1200)],
      assignments: [{ crewId: 'C1', pairingId: 400, source: 'CR' }],
    })
    const finding = computeRosterQuality(d)[0].findings.find((f) => f.key === 'consecutive-working')!
    expect(finding.count).toBe(1)
    expect(finding.ok).toBe(false)
    expect(finding.detail).toEqual(['2026-06-01–2026-06-08 (8d)'])
  })

  it('working days combine flight + sim + RES across consecutive days', () => {
    // 5 reserve days, then a 2-day sim → 7 consecutive working days → flagged.
    const reserveDays = ['01', '02', '03', '04', '05'].map((d) => ground('C1', 'RES', `2026-06-${d}`))
    const d = data({
      crew: [crew('C1')],
      groundItems: [
        ...reserveDays,
        ground('C1', 'SIM', '2026-06-06', 'CR', 0, 'SIM'),
        ground('C1', 'SIM', '2026-06-07', 'CR', 0, 'SIM'),
      ],
    })
    const finding = computeRosterQuality(d)[0].findings.find((f) => f.key === 'consecutive-working')!
    expect(finding.count).toBe(1)
    expect(finding.detail).toEqual(['2026-06-01–2026-06-07 (7d)'])
  })

  it('day off breaks a working streak (sim is working, DO is not)', () => {
    // RES x6, DO on day 7, RES on day 8 → longest working run is 6 → no flag.
    const d = data({
      crew: [crew('C1')],
      groundItems: [
        ...['01', '02', '03', '04', '05', '06'].map((x) => ground('C1', 'RES', `2026-06-${x}`)),
        ground('C1', 'DO', '2026-06-07', 'CR', 0, 'GRD'),
        ground('C1', 'RES', '2026-06-08'),
      ],
    })
    const finding = computeRosterQuality(d)[0].findings.find((f) => f.key === 'consecutive-working')!
    expect(finding.ok).toBe(true)
  })

  it('day-off only: a roster of only DO days (no flying/reserve) is flagged as a data issue', () => {
    const d = data({
      crew: [crew('C1')],
      groundItems: ['01', '02', '03'].map((x) => ground('C1', 'DO', `2026-06-${x}`, 'CR', 0, 'OFF')),
    })
    const finding = computeRosterQuality(d)[0].findings.find((f) => f.key === 'day-off-only')!
    expect(finding.ok).toBe(false)
    expect(finding.count).toBe(1)
    expect(finding.detail).toEqual(['3 days off'])
  })

  it('day-off only: NOT flagged when the crew also holds an assigned flying pairing', () => {
    const d = data({
      crew: [crew('C1')],
      pairings: [pairing(500)],
      pairingSegments: [seg(500, 1, 600)],
      assignments: [{ crewId: 'C1', pairingId: 500, source: 'CR' }],
      groundItems: [ground('C1', 'DO', '2026-06-10', 'CR', 0, 'OFF')],
    })
    expect(computeRosterQuality(d)[0].findings.find((f) => f.key === 'day-off-only')!.ok).toBe(true)
  })

  it('day-off only: NOT flagged when a non-DO ground item (e.g. vacation) is present', () => {
    const d = data({
      crew: [crew('C1')],
      groundItems: [
        ground('C1', 'DO', '2026-06-10', 'CR', 0, 'OFF'),
        ground('C1', 'VAC', '2026-06-11', 'CR', 0, 'VAC'),
      ],
    })
    expect(computeRosterQuality(d)[0].findings.find((f) => f.key === 'day-off-only')!.ok).toBe(true)
  })

  it('day-off only: NOT flagged for a crew with no roster data at all', () => {
    const finding = computeRosterQuality(data({ crew: [crew('C1')] }))[0].findings
      .find((f) => f.key === 'day-off-only')!
    expect(finding.ok).toBe(true)
    expect(finding.count).toBe(0)
  })

  it('returns one row per crew in crew order, each with all findings + Qlty ids', () => {
    const rows = computeRosterQuality(data({ crew: [crew('C2'), crew('C1')] }))
    expect(rows.map((r) => r.crewId)).toEqual(['C2', 'C1'])
    expect(rows[0].findings.map((f) => f.key)).toEqual([
      'standalone-res', 'consecutive-working', 'day-off-only', 'max-working-days',
    ])
    // Quality rules are named Qlty-1001.. in finding order.
    expect(rows[0].findings.map((f) => f.id)).toEqual(['Qlty-1001', 'Qlty-1002', 'Qlty-1003', 'Qlty-1004'])
  })
})

// ── findMaxWorkingDaysInPeriod ────────────────────────────────────────────────

const P_START = '2026-06-01'
const P_END   = '2026-06-30'
const DEF     = DEFAULT_QUALITY_PARAMS

const flightCrew = (crewId = 'C001') => crew(crewId, 'CA')  // division='P' from factory
const cabinCrew = () => ({ ...crew('C002', 'FA'), division: 'C' })
const mkPairing = (startDay: string, endDay = startDay) =>
  pairing(1, {
    schStrDtUtc: `${startDay}T08:00:00.000Z`,
    schEndDtUtc: `${endDay}T16:00:00.000Z`,
  })
const mkGround = (day: string, assignment: string, assignmentGroup = 'GRD') =>
  ground('C001', assignment, day, 'CR', undefined, assignmentGroup)

describe('findMaxWorkingDaysInPeriod', () => {
  it('P4-1: flags division P crew with 19 working days in period', () => {
    const pairings = Array.from({ length: 19 }, (_, i) =>
      pairing(i + 1, {
        schStrDtUtc: `2026-06-${String(i + 1).padStart(2, '0')}T08:00:00.000Z`,
        schEndDtUtc: `2026-06-${String(i + 1).padStart(2, '0')}T16:00:00.000Z`,
      }),
    )
    const r = findMaxWorkingDaysInPeriod(flightCrew(), pairings, [], P_START, P_END, DEF)
    expect(r.ok).toBe(false)
    expect(r.count).toBe(1)
    expect(r.detail[0]).toContain('19 working days')
  })

  it('P4-2: does NOT flag division P crew with exactly 18 working days', () => {
    const pairings = Array.from({ length: 18 }, (_, i) =>
      pairing(i + 1, {
        schStrDtUtc: `2026-06-${String(i + 1).padStart(2, '0')}T08:00:00.000Z`,
        schEndDtUtc: `2026-06-${String(i + 1).padStart(2, '0')}T16:00:00.000Z`,
      }),
    )
    const r = findMaxWorkingDaysInPeriod(flightCrew(), pairings, [], P_START, P_END, DEF)
    expect(r.ok).toBe(true)
    expect(r.count).toBe(0)
    expect(r.detail).toHaveLength(0)
  })

  it('P4-3: division C crew is exempt — returns OK regardless of working days', () => {
    const pairings = Array.from({ length: 28 }, (_, i) =>
      pairing(i + 1, {
        schStrDtUtc: `2026-06-${String(i + 1).padStart(2, '0')}T08:00:00.000Z`,
        schEndDtUtc: `2026-06-${String(i + 1).padStart(2, '0')}T16:00:00.000Z`,
      }),
    )
    const r = findMaxWorkingDaysInPeriod(cabinCrew(), pairings, [], P_START, P_END, DEF)
    expect(r.ok).toBe(true)
    expect(r.count).toBe(0)
  })

  it('P4-4: multi-day pairing spanning 3 days counts as 3 working days', () => {
    const strictP: QualityParams = { ...DEF, maxWorkingDaysInPeriod: 2 }
    const r = findMaxWorkingDaysInPeriod(
      flightCrew(), [mkPairing('2026-06-01', '2026-06-03')], [], P_START, P_END, strictP,
    )
    expect(r.ok).toBe(false)
    expect(r.detail[0]).toContain('3 working days')
  })

  it('P4-5: overlapping duties on same day count as 1 working day', () => {
    const strictP: QualityParams = { ...DEF, maxWorkingDaysInPeriod: 0 }
    const p = mkPairing('2026-06-01')
    const g = mkGround('2026-06-01', 'RES', 'SBY')
    const r = findMaxWorkingDaysInPeriod(flightCrew(), [p], [g], P_START, P_END, strictP)
    expect(r.detail[0]).toContain('1 working days')
  })

  it('P4-6: ILL ground item is not a working day', () => {
    const g = mkGround('2026-06-01', 'ILL', 'GRD')
    const r = findMaxWorkingDaysInPeriod(flightCrew(), [], [g], P_START, P_END, DEF)
    expect(r.ok).toBe(true)
  })

  it('P4-7: custom nonWorkingAssignments without ILL → ILL counts as working', () => {
    const customP: QualityParams = { ...DEF, nonWorkingAssignments: ['VAC', 'DO'], maxWorkingDaysInPeriod: 0 }
    const g = mkGround('2026-06-01', 'ILL', 'GRD')
    const r = findMaxWorkingDaysInPeriod(flightCrew(), [], [g], P_START, P_END, customP)
    expect(r.ok).toBe(false)
  })

  it('P4-8: pairing entirely before period start is not counted', () => {
    const p = mkPairing('2026-05-31')
    const r = findMaxWorkingDaysInPeriod(flightCrew(), [p], [], P_START, P_END, DEF)
    expect(r.ok).toBe(true)
  })

  it('P4-9: multi-day pairing partially outside period is clipped to in-period days', () => {
    const strictP: QualityParams = { ...DEF, maxWorkingDaysInPeriod: 1 }
    const r = findMaxWorkingDaysInPeriod(
      flightCrew(), [mkPairing('2026-05-31', '2026-06-02')], [], P_START, P_END, strictP,
    )
    expect(r.ok).toBe(false)
    expect(r.detail[0]).toContain('2 working days')
  })
})

describe('computeRosterQuality — P4 max-working-days finding', () => {
  it('P4 finding appears in each crew row with key max-working-days', () => {
    const rows = computeRosterQuality(data({ crew: [flightCrew()] }))
    expect(rows[0].findings.some((f) => f.key === 'max-working-days')).toBe(true)
  })

  it('P4 flags division P crew with 19 pairings using default params', () => {
    const pairings = Array.from({ length: 19 }, (_, i) =>
      pairing(i + 1, {
        schStrDtUtc: `2026-06-${String(i + 1).padStart(2, '0')}T08:00:00.000Z`,
        schEndDtUtc: `2026-06-${String(i + 1).padStart(2, '0')}T16:00:00.000Z`,
      }),
    )
    const assignments = pairings.map((p) => ({ crewId: 'C001', pairingId: p.pairingId, source: 'CR' as const }))
    const rows = computeRosterQuality(data({ crew: [flightCrew()], pairings, assignments }))
    const p4 = rows[0].findings.find((f) => f.key === 'max-working-days')!
    expect(p4.ok).toBe(false)
    expect(p4.detail[0]).toContain('19 working days')
  })

  it('P4 passes when custom maxWorkingDaysInPeriod=20 and crew has 19 pairings', () => {
    const pairings = Array.from({ length: 19 }, (_, i) =>
      pairing(i + 1, {
        schStrDtUtc: `2026-06-${String(i + 1).padStart(2, '0')}T08:00:00.000Z`,
        schEndDtUtc: `2026-06-${String(i + 1).padStart(2, '0')}T16:00:00.000Z`,
      }),
    )
    const assignments = pairings.map((p) => ({ crewId: 'C001', pairingId: p.pairingId, source: 'CR' as const }))
    const customP: QualityParams = { ...DEF, maxWorkingDaysInPeriod: 20 }
    const rows = computeRosterQuality(data({ crew: [flightCrew()], pairings, assignments }), customP)
    const p4 = rows[0].findings.find((f) => f.key === 'max-working-days')!
    expect(p4.ok).toBe(true)
  })
})
