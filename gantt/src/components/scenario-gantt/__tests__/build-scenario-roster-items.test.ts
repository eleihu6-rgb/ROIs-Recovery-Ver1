import { describe, it, expect } from 'vitest'
import {
  stableRosterItemId,
  buildEffectiveAssignments,
  buildScenarioRosterItems,
} from '../build-scenario-roster-items'
import type {
  ScenarioGanttAssignment,
  ScenarioGanttGroundItem,
  ScenarioGanttPairing,
  ScenarioGanttPairingSegment,
} from '@/types/scenario-gantt'

const mkPairing = (id: number, over: Partial<ScenarioGanttPairing> = {}): ScenarioGanttPairing => ({
  pairingId: id,
  pairingLabel: `P${id}`,
  base: 'YYZ',
  schStrDtUtc: '2026-06-01T08:00:00Z',
  schEndDtUtc: '2026-06-01T12:00:00Z',
  assignmentGroup: 'FLT',
  assignment: 'PAIRING',
  division: 'CC',
  compositions: [],
  ...over,
})

const mkSeg = (
  pairingId: number,
  over: Partial<ScenarioGanttPairingSegment> = {},
): ScenarioGanttPairingSegment => ({
  pairingId,
  dutySeq: 1,
  segSeq: 1,
  fltId: 5001,
  fltDt: '2026-06-01',
  fltNum: 'AC100',
  airline: 'AC',
  depArp: 'YYZ',
  arvArp: 'YVR',
  segAssignment: 'FLT',
  schStrDtUtc: '2026-06-01T08:00:00Z',
  schEndDtUtc: '2026-06-01T12:00:00Z',
  actStrDtUtc: '2026-06-01T08:10:00Z',
  actEndDtUtc: '2026-06-01T12:20:00Z',
  dutyStrArp: 'YYZ',
  dutyEndArp: 'YVR',
  dutySchStrDtUtc: '2026-06-01T07:00:00Z',
  dutySchEndDtUtc: '2026-06-01T13:00:00Z',
  dutySchRestMin: null,
  dutyActRestMin: null,
  dutyActCreditedMinutes: null,
  brief1StartUtc: '2026-06-01T07:00:00Z',
  brief1EndUtc: '2026-06-01T07:30:00Z',
  debrief1StartUtc: '2026-06-01T12:00:00Z',
  debrief1EndUtc: '2026-06-01T12:30:00Z',
  pickup1StartUtc: '',
  pickup1EndUtc: '',
  dropoff1StartUtc: '',
  dropoff1EndUtc: '',
  ...over,
})

describe('stableRosterItemId', () => {
  it('is deterministic for the same key', () => {
    expect(stableRosterItemId('CREW1|100|1|1|5001')).toBe(stableRosterItemId('CREW1|100|1|1|5001'))
  })

  it('returns a non-negative 32-bit integer', () => {
    const id = stableRosterItemId('any-key-here')
    expect(Number.isInteger(id)).toBe(true)
    expect(id).toBeGreaterThanOrEqual(0)
    expect(id).toBeLessThanOrEqual(0xffffffff)
  })

  it('distinguishes different keys', () => {
    expect(stableRosterItemId('CREW1|100|1|1|5001')).not.toBe(stableRosterItemId('CREW1|100|1|2|5002'))
    expect(stableRosterItemId('CREW1|100|whole')).not.toBe(stableRosterItemId('CREW2|100|whole'))
  })
})

describe('buildEffectiveAssignments', () => {
  const base: ScenarioGanttAssignment[] = [
    { crewId: 'A', pairingId: 100, source: 'CR' },
    { crewId: 'B', pairingId: 200, source: 'PA' },
  ]

  it('applies remove', () => {
    const out = buildEffectiveAssignments(base, [{ op: 'remove', crewId: 'A', pairingId: 100 }])
    expect(out).toHaveLength(1)
    expect(out[0]).toEqual({ crewId: 'B', pairingId: 200, source: 'PA' })
  })

  it('only removes source=CR when duplicate crew/pairing assignments exist', () => {
    const out = buildEffectiveAssignments([
      { crewId: 'A', pairingId: 100, source: 'CR' },
      { crewId: 'A', pairingId: 100, source: 'PA' },
    ], [{ op: 'remove', crewId: 'A', pairingId: 100 }])

    expect(out).toEqual([{ crewId: 'A', pairingId: 100, source: 'PA' }])
  })

  it('removes MA assignments too (manually-assigned tasks are user-editable)', () => {
    const out = buildEffectiveAssignments([
      { crewId: 'A', pairingId: 100, source: 'MA' },
      { crewId: 'B', pairingId: 200, source: 'PA' },
    ], [{ op: 'remove', crewId: 'A', pairingId: 100 }])

    // MA (manual add) is removable; PA stays immutable.
    expect(out).toEqual([{ crewId: 'B', pairingId: 200, source: 'PA' }])
  })

  it('applies add', () => {
    const out = buildEffectiveAssignments(base, [{ op: 'add', crewId: 'C', pairingId: 300 }])
    expect(out).toHaveLength(3)
    expect(out[2]).toEqual({ crewId: 'C', pairingId: 300, source: 'MA' })
  })

  it('applies reassign', () => {
    const out = buildEffectiveAssignments(base, [{ op: 'reassign', crewId: 'A', pairingId: 100, toCrewId: 'Z' }])
    expect(out.find((a) => a.pairingId === 100)?.crewId).toBe('Z')
    // unrelated assignment untouched
    expect(out.find((a) => a.pairingId === 200)?.crewId).toBe('B')
  })

  it('reassigns CR and MA when duplicate crew/pairing assignments exist', () => {
    const out = buildEffectiveAssignments([
      { crewId: 'A', pairingId: 100, source: 'CR' },
      { crewId: 'A', pairingId: 100, source: 'MA' },
    ], [{ op: 'reassign', crewId: 'A', pairingId: 100, toCrewId: 'Z' }])

    // Both CR and MA move (backend moves source IN ('CR','MA')); PA stays.
    expect(out).toEqual([
      { crewId: 'Z', pairingId: 100, source: 'CR' },
      { crewId: 'Z', pairingId: 100, source: 'MA' },
    ])
  })

  it('does not mutate the input array', () => {
    const copy = [...base]
    buildEffectiveAssignments(base, [{ op: 'remove', crewId: 'A', pairingId: 100 }])
    expect(base).toEqual(copy)
  })
})

describe('buildScenarioRosterItems id stability', () => {
  const pairingMap = new Map<number, ScenarioGanttPairing>([[100, mkPairing(100)]])
  const pairingSegments: ScenarioGanttPairingSegment[] = [mkSeg(100)]
  const assignments: ScenarioGanttAssignment[] = [{ crewId: 'CREW1', pairingId: 100, source: 'CR' }]
  const crew = [{ crewId: 'CREW1' }]

  it('keeps the same segment item id across an unrelated pending change', () => {
    const built1 = buildScenarioRosterItems({
      crew, pairingMap, assignments, pairingSegments, groundItems: [],
      pendingChanges: [],
    })
    const built2 = buildScenarioRosterItems({
      crew, pairingMap, assignments, pairingSegments, groundItems: [],
      // an UNRELATED add for a different crew / pairing
      pendingChanges: [{ op: 'add', crewId: 'OTHER', pairingId: 999 }],
    })

    const item1 = built1.itemsByCrew.get('CREW1')!
    const item2 = built2.itemsByCrew.get('CREW1')!
    expect(item1).toHaveLength(1)
    expect(item2).toHaveLength(1)
    // The unrelated 'add' references pairingId 999 which is not in pairingMap, so it
    // is skipped and produces no item — CREW1's segment id must be identical.
    expect(item2[0].id).toBe(item1[0].id)
    expect(item2[0].fltId).toBe(5001)
    expect(item2[0].dutySeq).toBe(1)
    expect(item2[0].segSeq).toBe(1)
  })

  it('copies pairingLabel onto flying roster items', () => {
    const { items } = buildScenarioRosterItems({
      crew,
      pairingMap: new Map([[100, mkPairing(100, { pairingLabel: 'PAIR100' })]]),
      assignments,
      pairingSegments,
      groundItems: [],
      pendingChanges: [],
    })

    expect(items[0]).toMatchObject({ pairingId: 100, pairingLabel: 'PAIR100' })
  })

  it('maps DH and DHD segAssignment to assignmentGroup DHD and copies segAssignment', () => {
    const pairingMap = new Map([[100, mkPairing(100, { assignmentGroup: 'FLY', assignment: 'FLY' })]])
    const forDhd = buildScenarioRosterItems({
      crew: [{ crewId: 'CREW1' }],
      pairingMap,
      assignments: [{ crewId: 'CREW1', pairingId: 100, source: 'CR' }],
      pairingSegments: [mkSeg(100, { segAssignment: 'DHD', segSeq: 3, fltNum: 'GT' })],
      groundItems: [],
      pendingChanges: [],
    })
    expect(forDhd.items[0]).toMatchObject({
      assignmentGroup: 'DHD',
      segAssignment: 'DHD',
    })

    const forDh = buildScenarioRosterItems({
      crew: [{ crewId: 'CREW1' }],
      pairingMap,
      assignments: [{ crewId: 'CREW1', pairingId: 100, source: 'CR' }],
      pairingSegments: [mkSeg(100, { segAssignment: 'DH', segSeq: 2 })],
      groundItems: [],
      pendingChanges: [],
    })
    expect(forDh.items[0]).toMatchObject({
      assignmentGroup: 'DHD',
      segAssignment: 'DH',
    })
  })

  it('keeps pairing assignmentGroup for non-deadhead segments', () => {
    const { items } = buildScenarioRosterItems({
      crew: [{ crewId: 'CREW1' }],
      pairingMap: new Map([[100, mkPairing(100, { assignmentGroup: 'FLY' })]]),
      assignments: [{ crewId: 'CREW1', pairingId: 100, source: 'CR' }],
      pairingSegments: [mkSeg(100, { segAssignment: 'FLY' })],
      groundItems: [],
      pendingChanges: [],
    })
    expect(items[0].assignmentGroup).toBe('FLY')
    expect(items[0].segAssignment).toBe('FLY')
  })

  it('uses segment actual timestamps separately from scheduled timestamps', () => {
    const { items } = buildScenarioRosterItems({
      crew,
      pairingMap,
      assignments,
      pairingSegments: [mkSeg(100, {
        schStrDtUtc: '2026-06-01T08:00:00Z',
        schEndDtUtc: '2026-06-01T12:00:00Z',
        actStrDtUtc: '2026-06-01T08:10:00Z',
        actEndDtUtc: '2026-06-01T12:20:00Z',
      })],
      groundItems: [],
      pendingChanges: [],
    })

    expect(items[0]).toMatchObject({
      schStrDtUtc: '2026-06-01T08:00:00Z',
      schEndDtUtc: '2026-06-01T12:00:00Z',
      actStrDtUtc: '2026-06-01T08:10:00Z',
      actEndDtUtc: '2026-06-01T12:20:00Z',
    })
  })

  it('builds a whole-pairing item when the pairing has no segments', () => {
    const { itemsByCrew } = buildScenarioRosterItems({
      crew, pairingMap, assignments, pairingSegments: [], groundItems: [],
      pendingChanges: [],
    })
    const items = itemsByCrew.get('CREW1')!
    expect(items).toHaveLength(1)
    expect(items[0].id).toBe(stableRosterItemId('CREW1|100|whole'))
    expect(items[0].fltId).toBeNull()
    expect(items[0].label).toBe('P100')
  })

  it('marks only pendingChanges-derived items as isPending', () => {
    // Committed CR assignment — not pending.
    const committed = buildScenarioRosterItems({
      crew, pairingMap, assignments, pairingSegments, groundItems: [],
      pendingChanges: [],
    })
    expect(committed.items.every((i) => !i.isPending)).toBe(true)

    // add patch for CREW1|100 → its items become pending (source stays CR for reassign).
    const added = buildScenarioRosterItems({
      crew, pairingMap,
      assignments: [],
      pairingSegments, groundItems: [],
      pendingChanges: [{ op: 'add', crewId: 'CREW1', pairingId: 100 }],
    })
    expect(added.items.every((i) => i.isPending === true)).toBe(true)

    // reassign CREW1 → CREW2 on 100 marks the moved items pending while keeping source CR.
    const reassigned = buildScenarioRosterItems({
      crew: [{ crewId: 'CREW1' }, { crewId: 'CREW2' }],
      pairingMap, assignments, pairingSegments, groundItems: [],
      pendingChanges: [{ op: 'reassign', crewId: 'CREW1', pairingId: 100, toCrewId: 'CREW2' }],
    })
    const moved = reassigned.itemsByCrew.get('CREW2') ?? []
    expect(moved.length).toBeGreaterThan(0)
    expect(moved.every((i) => i.isPending === true)).toBe(true)
    expect(moved.every((i) => i.source === 'CR')).toBe(true)
  })
})

describe('scenario seed — PA source', () => {
  it('preserves source=PA on seeded assignments', () => {
    const pairingMap = new Map([[1, mkPairing(1)]])
    const assignments: ScenarioGanttAssignment[] = [{ crewId: 'C1', pairingId: 1, source: 'PA' }]
    const { items, itemsByCrew } = buildScenarioRosterItems({
      crew: [{ crewId: 'C1' }],
      pairingMap,
      assignments,
      pairingSegments: [mkSeg(1)],
      groundItems: [],
      pendingChanges: [],
    })
    const c1 = itemsByCrew.get('C1') ?? []
    expect(c1.length).toBeGreaterThan(0)
    expect(items.every((i) => i.source === 'PA')).toBe(true)
  })

  it('produces no items for a leadinLive=0 (empty) assignment set', () => {
    const { items } = buildScenarioRosterItems({
      crew: [{ crewId: 'C1' }, { crewId: 'C2' }],
      pairingMap: new Map([[1, mkPairing(1)]]),
      assignments: [],
      pairingSegments: [mkSeg(1)],
      groundItems: [],
      pendingChanges: [],
    })
    expect(items).toHaveLength(0) // crew rows themselves come from the pane, not the builder
  })
})

describe('scenario ground items', () => {
  it('maps ground item base into roster items', () => {
    const groundItems: ScenarioGanttGroundItem[] = [{
      crewId: 'C1',
      base: 'YVR',
      assignmentGroup: 'GRD',
      assignment: 'SIM',
      schStrDtUtc: '2026-06-01T08:00:00Z',
      schEndDtUtc: '2026-06-01T12:00:00Z',
      actingRank: '',
      source: 'CR',
    }]

    const { items } = buildScenarioRosterItems({
      crew: [{ crewId: 'C1' }],
      pairingMap: new Map(),
      assignments: [],
      pairingSegments: [],
      groundItems,
      pendingChanges: [],
    })

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ crewId: 'C1', pairingId: null, base: 'YVR' })
  })

  it('prefers Live label (GDO) over generic assignment (DO) on the roster puck', () => {
    const groundItems: ScenarioGanttGroundItem[] = [{
      crewId: 'C1',
      base: 'YVR',
      assignmentGroup: 'DO',
      assignment: 'DO',
      label: 'GDO',
      schStrDtUtc: '2026-06-25T07:01:00Z',
      schEndDtUtc: '2026-06-26T07:00:00Z',
      actingRank: '',
      source: 'PA',
    }]

    const { items } = buildScenarioRosterItems({
      crew: [{ crewId: 'C1' }],
      pairingMap: new Map(),
      assignments: [],
      pairingSegments: [],
      groundItems,
      pendingChanges: [],
    })

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ assignment: 'DO', label: 'GDO' })
  })
})
