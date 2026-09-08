import { describe, expect, it } from 'vitest'

import { flight as flightTable } from '../../../models/flight/flight.js'
import { planDuties, validateBuildRules, MAX_DUTY_BLOCK_MIN, REST_FLOOR_MIN } from '../../../services/pairing/pairing-build-service.js'

type FlightRow = typeof flightTable.$inferSelect

/** Minimal flight row for duty planning (planDuties only reads the sched timestamps + airports). */
const leg = (dep: string, arv: string, depArp = 'ADD', arvArp = 'ADD'): FlightRow => {
  const schDepDtUtc = new Date(dep)
  const schArvDtUtc = new Date(arv)
  return {
    depArp,
    arvArp,
    schDepDtUtc,
    schArvDtUtc,
    blkMin: (schArvDtUtc.getTime() - schDepDtUtc.getTime()) / 60000,
  } as unknown as FlightRow
}

/** Ground gap (minutes) at each duty boundary: duty[n] last arrival → duty[n+1] first departure. */
const boundaryGaps = (duties: FlightRow[][]): number[] =>
  duties
    .slice(1)
    .map((d, i) => (d[0].schDepDtUtc.getTime() - duties[i][duties[i].length - 1].schArvDtUtc.getTime()) / 60000)

describe('planDuties — duty boundaries are rest-driven', () => {
  // Regression for pairing #150707 (Ryan): ET861 ADD-BZV-PNR-ADD is one continuous same-flight
  // multi-sector trip; its 60-min turns at BZV and PNR are quick turns, NOT rests. It must be ONE
  // duty. The old block-cap split forced a 2nd duty and stamped a fictitious 12h rest over PNR's
  // 60-min turn — a rest the crew never got.
  it('keeps a continuous multi-sector trip (ET861 ADD-BZV-PNR-ADD, 9h55m block) in ONE duty', () => {
    const duties = planDuties([
      leg('2026-09-01T05:45:00Z', '2026-09-01T10:10:00Z', 'ADD', 'BZV'),
      leg('2026-09-01T11:10:00Z', '2026-09-01T12:15:00Z', 'BZV', 'PNR'), // 60-min turn at BZV
      leg('2026-09-01T13:15:00Z', '2026-09-01T17:40:00Z', 'PNR', 'ADD'), // 60-min turn at PNR
    ])
    expect(duties).toHaveLength(1)
    expect(duties[0]).toHaveLength(3)
  })

  it('opens a NEW duty only after a real ≥12h rest (overnight layover)', () => {
    const duties = planDuties([
      leg('2026-09-01T06:00:00Z', '2026-09-01T10:00:00Z', 'ADD', 'JFK'),
      leg('2026-09-02T10:00:00Z', '2026-09-02T14:00:00Z', 'JFK', 'ADD'), // 24h layover
    ])
    expect(duties).toHaveLength(2)
    expect(boundaryGaps(duties)).toEqual([24 * 60])
  })

  it('splits at exactly the rest floor, but not one minute below it', () => {
    const at720 = planDuties([
      leg('2026-09-01T06:00:00Z', '2026-09-01T10:00:00Z', 'ADD', 'CAI'),
      leg('2026-09-01T22:00:00Z', '2026-09-02T02:00:00Z', 'CAI', 'ADD'), // gap exactly 720m
    ])
    expect(at720).toHaveLength(2)

    const at719 = planDuties([
      leg('2026-09-01T06:00:00Z', '2026-09-01T10:00:00Z', 'ADD', 'CAI'),
      leg('2026-09-01T21:59:00Z', '2026-09-02T01:59:00Z', 'CAI', 'ADD'), // gap 719m — below the floor
    ])
    expect(at719).toHaveLength(1)
    expect(at719[0]).toHaveLength(2)
  })

  it('INVARIANT: no duty boundary ever sits over a gap shorter than the minimum rest', () => {
    // Mixed trip: two quick turns and one real overnight → duties split ONLY at the overnight.
    const duties = planDuties([
      leg('2026-09-01T06:00:00Z', '2026-09-01T09:00:00Z', 'ADD', 'DXB'),
      leg('2026-09-01T10:00:00Z', '2026-09-01T13:00:00Z', 'DXB', 'BOM'), // 60-min turn
      leg('2026-09-02T08:00:00Z', '2026-09-02T11:00:00Z', 'BOM', 'DXB'), // 19h overnight rest
      leg('2026-09-02T12:30:00Z', '2026-09-02T15:30:00Z', 'DXB', 'ADD'), // 90-min turn
    ])
    expect(duties).toHaveLength(2)
    for (const gap of boundaryGaps(duties)) {
      expect(gap).toBeGreaterThanOrEqual(REST_FLOOR_MIN)
    }
  })
})

describe('validateBuildRules — surface violations, never block (Option A)', () => {
  // #150717 regression: ET823 ADD-VFA-GBE-ADD welded same-day = 3 legs, 680min block in ONE
  // duty. The build must SUCCEED (build as-is) but warn about the 8h multi-segment cap.
  it('warns when a multi-segment duty exceeds the 8h block cap (ET823 same-day weld)', () => {
    const duties = planDuties([
      leg('2026-08-31T05:30:00Z', '2026-08-31T10:10:00Z', 'ADD', 'VFA'),
      leg('2026-08-31T11:05:00Z', '2026-08-31T12:35:00Z', 'VFA', 'GBE'),
      leg('2026-08-31T13:30:00Z', '2026-08-31T18:40:00Z', 'GBE', 'ADD'),
    ])
    const warnings = validateBuildRules(duties, 'ADD')
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain(`exceeds the ${MAX_DUTY_BLOCK_MIN}min multi-segment cap`)
  })

  it('does NOT warn for the rule-clean layover shape (outbound day N |rest| return day N+1)', () => {
    const duties = planDuties([
      leg('2026-08-31T05:30:00Z', '2026-08-31T10:10:00Z', 'ADD', 'VFA'),
      leg('2026-08-31T11:05:00Z', '2026-08-31T12:35:00Z', 'VFA', 'GBE'), // quick turn, duty blk 370 <= 480
      leg('2026-09-01T13:30:00Z', '2026-09-01T18:40:00Z', 'GBE', 'ADD'), // ~25h real layover at GBE
    ])
    expect(validateBuildRules(duties, 'ADD')).toEqual([])
  })

  it('does NOT warn for a single-segment long-haul duty over 8h (augmented-crew exemption)', () => {
    const duties = planDuties([
      leg('2026-08-31T06:00:00Z', '2026-08-31T16:30:00Z', 'ADD', 'JFK'), // 630min single leg
      leg('2026-09-01T18:00:00Z', '2026-09-02T04:00:00Z', 'JFK', 'ADD'), // next-day return, 600min
    ])
    expect(validateBuildRules(duties, 'ADD')).toEqual([])
  })

  it('warns when the chain is not a home-base loop (#150497 class)', () => {
    const duties = planDuties([
      leg('2026-08-31T06:00:00Z', '2026-08-31T08:00:00Z', 'BZV', 'PNR'),
      leg('2026-08-31T09:00:00Z', '2026-08-31T11:00:00Z', 'PNR', 'ADD'),
    ])
    const warnings = validateBuildRules(duties, 'ADD')
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('not a ADD base loop')
    expect(warnings[0]).toContain('starts at BZV')
  })

  it('warns on a station break and a time overlap inside a duty', () => {
    const brokenStation = planDuties([
      leg('2026-08-31T06:00:00Z', '2026-08-31T07:30:00Z', 'ADD', 'DIR'),
      leg('2026-08-31T09:00:00Z', '2026-08-31T10:30:00Z', 'MQX', 'ADD'), // departs MQX, crew is at DIR
    ])
    expect(validateBuildRules(brokenStation, 'ADD').some((w) => w.includes('station break'))).toBe(true)

    const overlapping = planDuties([
      leg('2026-08-31T06:00:00Z', '2026-08-31T09:00:00Z', 'ADD', 'MQX'),
      leg('2026-08-31T08:30:00Z', '2026-08-31T10:30:00Z', 'MQX', 'ADD'), // departs before prev arrives
    ])
    expect(validateBuildRules(overlapping, 'ADD').some((w) => w.includes('time overlap'))).toBe(true)
  })
})
