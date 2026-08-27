import { describe, it, expect } from 'vitest'
import { rowsToDuties, buildPlan, type RosterRow } from './deassign-loader.js'

const MS = '2026-06-01T00:00:00Z'
const ME = '2026-07-01T00:00:00Z'

const row = (p: Partial<RosterRow> & { id: number }): RosterRow => ({
  crewId: '113', assignmentGroup: 'GRD', assignment: 'DO', pairingId: null, pairingLabel: null,
  start: '2026-06-03T14:01:00Z', end: '2026-06-04T14:00:00Z', ...p,
})

describe('rowsToDuties', () => {
  it('collapses a multi-segment flying pairing into one duty', () => {
    const duties = rowsToDuties([
      row({ id: 1, assignmentGroup: 'FLY', assignment: 'FLY', pairingId: 10827, pairingLabel: 'V4110', start: '2026-06-03T01:12:00Z', end: '2026-06-03T05:00:00Z' }),
      row({ id: 2, assignmentGroup: 'FLY', assignment: 'FLY', pairingId: 10827, pairingLabel: 'V4110', start: '2026-06-03T06:50:00Z', end: '2026-06-03T12:00:00Z' }),
    ])
    expect(duties).toHaveLength(1)
    expect(duties[0].rosterIds).toEqual([1, 2])
    expect(duties[0].segCount).toBe(2)
    expect(duties[0].start).toBe('2026-06-03T01:12:00Z')
    expect(duties[0].end).toBe('2026-06-03T12:00:00Z')
  })

  it('keeps each ground row as its own duty', () => {
    const duties = rowsToDuties([row({ id: 1 }), row({ id: 2, start: '2026-06-05T14:01:00Z', end: '2026-06-06T14:00:00Z' })])
    expect(duties).toHaveLength(2)
  })
})

describe('buildPlan', () => {
  it('records flying → "label (id) · date(s)" and day-off → "CODE · date"', () => {
    const byCrew = new Map([['113', rowsToDuties([
      row({ id: 1, assignmentGroup: 'FLY', assignment: 'FLY', pairingId: 10827, pairingLabel: 'V4110', start: '2026-06-03T01:12:00Z', end: '2026-06-03T12:00:00Z' }),
      row({ id: 9 }),
    ])]])
    const plan = buildPlan(byCrew, MS, ME)
    const fly = plan.find((p) => p.pairingId === 10827)!
    expect(fly.name).toBe('De-assign pairing')
    expect(fly.memo).toBe('V4110 (10827) · 2026-06-03')
    expect(fly.rosterId).toBe(1)
    const dayoff = plan.find((p) => p.name === 'De-assign day off')!
    expect(dayoff.memo).toBe('DO · 2026-06-03')
    expect(dayoff.pairingId).toBeNull()
    expect(dayoff.rosterId).toBe(9)
  })

  it('records a multi-day trip as a date range', () => {
    const byCrew = new Map([['113', rowsToDuties([
      row({ id: 1, assignmentGroup: 'FLY', assignment: 'FLY', pairingId: 555, pairingLabel: 'V4900', start: '2026-06-10T01:00:00Z', end: '2026-06-10T08:00:00Z' }),
      row({ id: 2, assignmentGroup: 'FLY', assignment: 'FLY', pairingId: 555, pairingLabel: 'V4900', start: '2026-06-12T03:00:00Z', end: '2026-06-12T11:00:00Z' }),
    ])]])
    const plan = buildPlan(byCrew, MS, ME)
    expect(plan.find((p) => p.pairingId === 555)!.memo).toBe('V4900 (555) · 2026-06-10→2026-06-12')
  })

  it('excludes protected duties (VAC and a sim-commute F8 pairing)', () => {
    const byCrew = new Map([['535', rowsToDuties([
      row({ id: 1, assignmentGroup: 'FLY', assignment: 'FLY', pairingId: 103442, pairingLabel: 'F8604', start: '2026-06-13T01:50:00Z', end: '2026-06-13T07:30:00Z' }),
      row({ id: 2, assignmentGroup: 'GRD', assignment: 'SIM', start: '2026-06-13T20:00:00Z', end: '2026-06-14T02:15:00Z' }),
      row({ id: 3, assignmentGroup: 'GRD', assignment: 'VAC', start: '2026-06-22T14:00:00Z', end: '2026-06-23T14:00:00Z' }),
      row({ id: 4, assignmentGroup: 'FLY', assignment: 'FLY', pairingId: 11768, pairingLabel: 'V4152', start: '2026-06-19T01:15:00Z', end: '2026-06-19T12:05:00Z' }),
    ])]])
    const plan = buildPlan(byCrew, MS, ME)
    const pairings = plan.filter((p) => p.pairingId).map((p) => p.pairingId)
    expect(pairings).toContain(11768)        // line flying → de-assign
    expect(pairings).not.toContain(103442)   // sim-commute → protected
    expect(plan.find((p) => p.memo === 'VAC')).toBeUndefined() // VAC never planned
  })
})
