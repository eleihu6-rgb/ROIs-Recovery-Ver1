import { describe, it, expect } from 'vitest'
import { buildGroundTaskPuckLabel } from '../roster-renderer'
import type { RosterItem } from '@/types/roster'

/**
 * Non-flying (ground) puck text rule (F314):
 *   prefer roster_flight.label over the generic assignment code,
 *   falling back to assignment then assignmentGroup when label is null.
 *   Exception: DHD keeps its assignment code (its label is a flight number).
 *
 * Cases are taken from the REAL distinct (assignment, label) pairs in the demo
 * roster_flight (pairing_id IS NULL) so the test reflects production data.
 */
const ground = (over: Partial<RosterItem>): RosterItem =>
  ({ assignmentGroup: 'GRD', assignment: null, label: null, pairingId: null, ...over } as RosterItem)

describe('buildGroundTaskPuckLabel', () => {
  it('shows the specific label instead of the generic assignment (the requested change)', () => {
    // Before this change these all rendered as "DO"; now they show the real reason.
    expect(buildGroundTaskPuckLabel(ground({ assignment: 'DO', label: 'GDO' }))).toBe('GDO')
    expect(buildGroundTaskPuckLabel(ground({ assignment: 'DO', label: 'MLOA' }))).toBe('MLOA')
    expect(buildGroundTaskPuckLabel(ground({ assignment: 'DO', label: 'VGDO' }))).toBe('VGDO')
    expect(buildGroundTaskPuckLabel(ground({ assignment: 'DO', label: 'LEAVE' }))).toBe('LEAVE')
    // Other assignment groups gain their label too.
    expect(buildGroundTaskPuckLabel(ground({ assignment: 'GRD', label: 'FAIT' }))).toBe('FAIT')
    expect(buildGroundTaskPuckLabel(ground({ assignment: 'GRD', label: 'CGS' }))).toBe('CGS')
    expect(buildGroundTaskPuckLabel(ground({ assignment: 'VAC', label: 'RVAC' }))).toBe('RVAC')
    expect(buildGroundTaskPuckLabel(ground({ assignment: 'SFT', label: 'MLP' }))).toBe('MLP')
  })

  it('falls back to assignment when label is null (regression guard for the 269 null-label rows)', () => {
    expect(buildGroundTaskPuckLabel(ground({ assignment: 'DO', label: null }))).toBe('DO')
    expect(buildGroundTaskPuckLabel(ground({ assignment: 'VAC', label: null }))).toBe('VAC')
    expect(buildGroundTaskPuckLabel(ground({ assignment: 'RES', label: null }))).toBe('RES')
  })

  it('preserves the existing RES → specific reserve label behaviour', () => {
    expect(buildGroundTaskPuckLabel(ground({ assignment: 'RES', label: 'CRAM' }))).toBe('CRAM')
    expect(buildGroundTaskPuckLabel(ground({ assignment: 'RES', label: 'PRPM' }))).toBe('PRPM')
  })

  it('keeps DHD as its code rather than exposing the deadhead flight number in its label', () => {
    expect(buildGroundTaskPuckLabel(ground({ assignment: 'DHD', label: 'F8606' }))).toBe('DHD')
    expect(buildGroundTaskPuckLabel(ground({ assignment: 'DHD', label: 'AC178' }))).toBe('DHD')
    expect(buildGroundTaskPuckLabel(ground({ assignment: 'DHD', label: 'GT' }))).toBe('DHD')
  })

  it('falls back to assignmentGroup when both assignment and label are null', () => {
    expect(buildGroundTaskPuckLabel(ground({ assignment: null, label: null, assignmentGroup: 'GRD' }))).toBe('GRD')
  })
})
