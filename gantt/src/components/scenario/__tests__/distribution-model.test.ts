// gantt/src/components/scenario/__tests__/distribution-model.test.ts
// Ported from the Report's distributionModel.test.ts, minus the
// filterCrewsByRank block (that helper was not ported — the scenario tab has no
// Gantt-header rank filter).
import { describe, expect, it } from 'vitest'
import { UTC } from '../distribution-day-math'
import type { DistributionCrew, DistributionDemand, DistributionTask } from '../distribution-model'
import {
  ALL_RANKS,
  buildDays,
  buildDistribution,
  dayRange,
  rankOptions,
} from '../distribution-model'

const task = (over: Partial<DistributionTask> = {}): DistributionTask => ({
  id: 't1',
  label: 'P1',
  kind: 'assigned',
  start: '2026-07-01T14:00:00Z',
  end: '2026-07-03T02:00:00Z',
  ...over,
})

const crew = (over: Partial<DistributionCrew> = {}): DistributionCrew => ({
  crew_id: '1',
  rank: 'CA',
  tasks: [],
  ...over,
})

const demandSlot = (over: Partial<DistributionDemand> = {}): DistributionDemand => ({
  start: '2026-07-02T08:00:00Z',
  end: '2026-07-02T20:00:00Z',
  reserve: false,
  rank: 'CA',
  ...over,
})

const WINDOW = { start: '2026-07-01T00:00:00Z', end: '2026-07-05T00:00:00Z' }

function days(tz = UTC) {
  const range = dayRange([], WINDOW, [], tz)
  return buildDays(range!, tz)
}

describe('dayRange / buildDays', () => {
  it('uses the window when present and snaps to whole days', () => {
    const grid = days()
    expect(grid).toHaveLength(4)
    expect(grid[0].key).toBe('2026 Jul 01')
    expect(grid[0].weekday).toBe('Wed')
    expect(grid[0].monthStart).toBe(true)
    expect(grid[3].key).toBe('2026 Jul 04')
    expect(grid[3].weekend).toBe(true) // Sat Jul 4 2026
  })

  it('falls back to the task/demand extent without a window', () => {
    const c = crew({ tasks: [task()] })
    const range = dayRange([c], undefined, [demandSlot({ end: '2026-07-04T20:00:00Z' })], UTC)
    const grid = buildDays(range!, UTC)
    expect(grid[0].key).toBe('2026 Jul 01')
    expect(grid).toHaveLength(4) // Jul 1 … Jul 4 (demand end pushes past Jul 3)
  })

  it('returns null with no data at all', () => {
    expect(dayRange([], undefined, [], UTC)).toBeNull()
  })
})

describe('buildDistribution', () => {
  it('counts an assigned pairing on every day it overlaps', () => {
    const c = crew({ tasks: [task()] }) // Jul 1 14:00 → Jul 3 02:00 = days 1,2,3
    const { rows, totals } = buildDistribution([c], [], days(), ALL_RANKS)
    expect(rows.map((r) => r.assignedPairing)).toEqual([1, 1, 1, 0])
    expect(totals.assignedPairingSlots).toBe(1)
    expect(totals.busyCrewDays).toBe(3)
    expect(totals.busyPairingCrewDays).toBe(3)
    expect(totals.busyReserveCrewDays).toBe(0)
  })

  it('splits reserve tasks from pairings and never counts wanted tasks', () => {
    const c = crew({
      tasks: [
        task({ reserve: true, start: '2026-07-02T08:00:00Z', end: '2026-07-02T20:00:00Z' }),
        task({ kind: 'wanted', id: 'w1' }),
      ],
    })
    const { rows, totals } = buildDistribution([c], [], days(), ALL_RANKS)
    expect(rows.map((r) => r.assignedReserve)).toEqual([0, 1, 0, 0])
    expect(rows.map((r) => r.assignedPairing)).toEqual([0, 0, 0, 0])
    expect(totals.assignedReserveSlots).toBe(1)
    expect(totals.assignedPairingSlots).toBe(0)
    expect(totals.busyReserveCrewDays).toBe(1)
    expect(totals.busyPairingCrewDays).toBe(0)
  })

  it('availability counts pre-solve blank days only: preassigns block, assignments do not', () => {
    const withPre = crew({
      crew_id: '1',
      tasks: [
        task({ kind: 'preassign', sub: 'DO', start: '2026-07-01T00:00:00Z', end: '2026-07-02T00:00:00Z' }),
        task({ id: 'a1', start: '2026-07-03T08:00:00Z', end: '2026-07-03T20:00:00Z' }),
      ],
    })
    const blank = crew({ crew_id: '2', tasks: [] })
    const { rows, totals } = buildDistribution([withPre, blank], [], days(), ALL_RANKS)
    // Day 1: crew 1 blocked by the day off; assignments never reduce availability.
    expect(rows.map((r) => r.available)).toEqual([1, 2, 2, 2])
    expect(totals.availableCrewDays).toBe(7)
    expect(totals.avgAvailable).toBeCloseTo(7 / 4)
  })

  it('a task ending exactly at midnight does not bleed into the next day', () => {
    const c = crew({
      tasks: [task({ start: '2026-07-01T10:00:00Z', end: '2026-07-02T00:00:00Z' })],
    })
    const { rows } = buildDistribution([c], [], days(), ALL_RANKS)
    expect(rows.map((r) => r.assignedPairing)).toEqual([1, 0, 0, 0])
  })

  it('buckets uncovered demand per slot, split by reserve flag', () => {
    const demand = [
      demandSlot(),
      demandSlot({ reserve: true, start: '2026-07-02T08:00:00Z', end: '2026-07-04T20:00:00Z' }),
    ]
    const { rows, totals } = buildDistribution([], demand, days(), ALL_RANKS)
    expect(rows.map((r) => r.uncoveredPairing)).toEqual([0, 1, 0, 0])
    expect(rows.map((r) => r.uncoveredReserve)).toEqual([0, 1, 1, 1])
    expect(totals.uncoveredPairingSlots).toBe(1)
    expect(totals.uncoveredReserveSlots).toBe(1)
  })

  it('rank filter narrows crews and matches comma-joined demand ranks', () => {
    const ca = crew({ crew_id: '1', rank: 'CA', tasks: [task()] })
    const fo = crew({ crew_id: '2', rank: 'FO', tasks: [task({ id: 'f1' })] })
    const demand = [demandSlot({ rank: 'CA,FO' }), demandSlot({ rank: 'FO' })]
    const forCa = buildDistribution([ca, fo], demand, days(), 'CA')
    expect(forCa.totals.crewCount).toBe(1)
    expect(forCa.totals.assignedPairingSlots).toBe(1)
    expect(forCa.totals.uncoveredPairingSlots).toBe(1) // only the CA,FO slot
    const forAll = buildDistribution([ca, fo], demand, days(), ALL_RANKS)
    expect(forAll.totals.assignedPairingSlots).toBe(2)
    expect(forAll.totals.uncoveredPairingSlots).toBe(2)
  })
})

describe('rankOptions', () => {
  it('collects crew and demand ranks, seat-sorted, ignoring blanks', () => {
    const crews = [crew({ rank: 'FO' }), crew({ crew_id: '2', rank: 'CA' }), crew({ crew_id: '3', rank: '' })]
    const demand = [demandSlot({ rank: 'CA,IFD' }), demandSlot({ rank: '—' })]
    expect(rankOptions(crews, demand)).toEqual(['CA', 'FO', 'IFD'])
  })

  it('omits demand-only ranks when demand is withheld', () => {
    const crews = [crew({ rank: 'CA' })]
    expect(rankOptions(crews, [demandSlot({ rank: 'FO' })])).toEqual(['CA', 'FO'])
    expect(rankOptions(crews, undefined)).toEqual(['CA'])
  })
})
