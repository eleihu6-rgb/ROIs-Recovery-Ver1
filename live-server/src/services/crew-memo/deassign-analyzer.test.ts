import { describe, it, expect } from 'vitest'
import { classifyDuties } from './deassign-analyzer.js'
import type { Duty } from './deassign-types.js'

const OPTS = { monthStart: '2026-06-01T00:00:00Z', monthEnd: '2026-07-01T00:00:00Z' }
const fly = (pairingId: number, label: string, start: string, end: string, segCount = 2): Duty =>
  ({ kind: 'FLY', assignment: 'FLY', pairingId, pairingLabel: label, segCount, rosterIds: [pairingId], start, end })
const grd = (a: string, start: string, end: string, id: number): Duty =>
  ({ kind: 'GRD', assignment: a, pairingId: null, pairingLabel: null, segCount: 0, rosterIds: [id], start, end })

const byPairing = (r: ReturnType<typeof classifyDuties>, id: number) => r.find((d) => d.pairingId === id)!

describe('classifyDuties', () => {
  it('de-assigns line flying + days off', () => {
    const r = classifyDuties([
      fly(10827, 'V4110', '2026-06-03T01:12:00Z', '2026-06-03T12:00:00Z'),
      grd('DO', '2026-06-03T14:01:00Z', '2026-06-04T14:00:00Z', 1),
    ], OPTS)
    expect(byPairing(r, 10827).disposition).toBe('DE_ASSIGN')
    expect(r.find((d) => d.assignment === 'DO')!.disposition).toBe('DE_ASSIGN')
  })

  it('never touches VAC / RES / SIM / GRD / ILL', () => {
    for (const a of ['VAC', 'RES', 'SIM', 'GRD', 'ILL']) {
      const r = classifyDuties([grd(a, '2026-06-10T00:00:00Z', '2026-06-10T06:00:00Z', 1)], OPTS)
      expect(r[0].disposition).toBe('NO_TOUCH')
    }
  })

  it('protects sim-commute F8 pairings flanking a SIM block (crew 535)', () => {
    const r = classifyDuties([
      fly(103442, 'F8604', '2026-06-13T01:50:00Z', '2026-06-13T07:30:00Z', 1),
      grd('SIM', '2026-06-13T20:00:00Z', '2026-06-14T02:15:00Z', 1),
      grd('SIM', '2026-06-15T00:30:00Z', '2026-06-15T06:30:00Z', 2),
      fly(103443, 'F8601', '2026-06-15T17:40:00Z', '2026-06-15T23:50:00Z', 1),
      fly(11768, 'V4152', '2026-06-19T01:15:00Z', '2026-06-19T12:05:00Z'),
    ], OPTS)
    expect(byPairing(r, 103442).disposition).toBe('NO_TOUCH')
    expect(byPairing(r, 103443).disposition).toBe('NO_TOUCH')
    expect(byPairing(r, 11768).disposition).toBe('DE_ASSIGN')
  })

  it('does NOT treat a non-F8 high-id pairing as a commute (97297/VB8221)', () => {
    const r = classifyDuties([
      fly(97297, 'VB8221', '2026-06-08T09:05:00Z', '2026-06-08T12:56:00Z'),
      fly(145531, 'F8606', '2026-06-10T00:15:00Z', '2026-06-10T05:56:00Z', 1),
      grd('SIM', '2026-06-12T00:30:00Z', '2026-06-12T06:30:00Z', 1),
    ], OPTS)
    expect(byPairing(r, 97297).disposition).toBe('DE_ASSIGN')
    expect(byPairing(r, 145531).disposition).toBe('NO_TOUCH')
  })

  it('protects lead-in (May->Jun) and tail (Jun->Jul) pairings', () => {
    const r = classifyDuties([
      fly(10634, 'TB7976', '2026-05-31T02:40:00Z', '2026-06-03T04:02:00Z', 1),
      fly(61681, 'V4152', '2026-06-30T19:00:00Z', '2026-07-01T12:05:00Z'),
    ], OPTS)
    expect(byPairing(r, 10634).disposition).toBe('NO_TOUCH')
    expect(byPairing(r, 61681).disposition).toBe('NO_TOUCH')
  })

  it('protects 2 DOs before and after a VAC block (crew 535 VAC Jun22-26)', () => {
    const do_ = (d: number, id: number) => grd('DO', `2026-06-${String(d).padStart(2, '0')}T14:01:00Z`, `2026-06-${String(d + 1).padStart(2, '0')}T14:00:00Z`, id)
    const vac = (d: number, id: number) => grd('VAC', `2026-06-${String(d).padStart(2, '0')}T14:00:00Z`, `2026-06-${String(d + 1).padStart(2, '0')}T14:00:00Z`, id)
    const r = classifyDuties([
      do_(19, 1), do_(20, 2), do_(21, 3),
      vac(22, 4), vac(23, 5), vac(24, 6), vac(25, 7), vac(26, 8),
      do_(27, 9), do_(28, 10), do_(29, 11),
    ], OPTS)
    const dispo = (id: number) => r.find((d) => d.rosterIds[0] === id)!.disposition
    expect(dispo(1)).toBe('DE_ASSIGN')   // Jun19 (3rd before)
    expect(dispo(2)).toBe('NO_TOUCH')    // Jun20 (2nd before)
    expect(dispo(3)).toBe('NO_TOUCH')    // Jun21 (1st before)
    expect(dispo(9)).toBe('NO_TOUCH')    // Jun27 (1st after)
    expect(dispo(10)).toBe('NO_TOUCH')   // Jun28 (2nd after)
    expect(dispo(11)).toBe('DE_ASSIGN')  // Jun29 (3rd after)
  })
})
