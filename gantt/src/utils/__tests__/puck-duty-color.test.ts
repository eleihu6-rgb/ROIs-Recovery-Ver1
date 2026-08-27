import { describe, expect, it } from 'vitest'

import {
  RESERVE_PUCK_COLOR,
  ROSTER_FLIGHT_BOTTOM,
  ROSTER_FLIGHT_TOP,
  isDeadheadRosterPuck,
  isDeadheadSegAssignment,
  isReservePuck,
  resolveSegmentDutyFill,
} from '../puck-duty-color'

describe('isReservePuck', () => {
  it('returns true when assignmentGroup is RES', () => {
    expect(isReservePuck('RES', 'FLY')).toBe(true)
    expect(isReservePuck(' res ', null)).toBe(true)
  })

  it('returns true for reserve assignment codes', () => {
    for (const code of ['RES', 'CRAM', 'CRPM', 'PRAM', 'PRPM', ' crpm ']) {
      expect(isReservePuck('FLY', code)).toBe(true)
    }
  })

  it('returns false for normal FLY and ordinary standby codes', () => {
    expect(isReservePuck('FLY', 'FLY')).toBe(false)
    expect(isReservePuck('FLT', null)).toBe(false)
    expect(isReservePuck('SBY', 'SBY')).toBe(false)
    expect(isReservePuck('GRD', 'ASBY')).toBe(false)
    expect(isReservePuck('GRD', 'SSB')).toBe(false)
  })
})

describe('resolveSegmentDutyFill', () => {
  it('returns deadhead for DHD', () => {
    expect(resolveSegmentDutyFill({ assignmentGroup: 'DHD', assignment: null, isDeadhead: true })).toEqual({
      kind: 'dhd',
    })
  })

  it('returns reserve fill color for reserve duties', () => {
    expect(resolveSegmentDutyFill({ assignmentGroup: 'RES', assignment: 'CRPM', isDeadhead: false })).toEqual({
      kind: 'reserve',
      baseColor: RESERVE_PUCK_COLOR,
    })
  })

  it('returns fly blue gradient for normal flying', () => {
    expect(resolveSegmentDutyFill({ assignmentGroup: 'FLY', assignment: 'FLY', isDeadhead: false })).toEqual({
      kind: 'fly',
      top: ROSTER_FLIGHT_TOP,
      bottom: ROSTER_FLIGHT_BOTTOM,
    })
  })
})

describe('isDeadheadSegAssignment', () => {
  it('returns true for DH and DHD (trimmed / mixed case)', () => {
    expect(isDeadheadSegAssignment('DH')).toBe(true)
    expect(isDeadheadSegAssignment('DHD')).toBe(true)
    expect(isDeadheadSegAssignment(' dh ')).toBe(true)
    expect(isDeadheadSegAssignment('dHd')).toBe(true)
  })

  it('returns false for flying / reserve / empty', () => {
    expect(isDeadheadSegAssignment('FLY')).toBe(false)
    expect(isDeadheadSegAssignment('FLT')).toBe(false)
    expect(isDeadheadSegAssignment('RES')).toBe(false)
    expect(isDeadheadSegAssignment('')).toBe(false)
    expect(isDeadheadSegAssignment(null)).toBe(false)
    expect(isDeadheadSegAssignment(undefined)).toBe(false)
  })
})

describe('isDeadheadRosterPuck', () => {
  it('prefers segAssignment over group/assignment', () => {
    expect(isDeadheadRosterPuck({
      segAssignment: 'DHD',
      assignmentGroup: 'FLY',
      assignment: 'FLY',
    })).toBe(true)
  })

  it('falls back to assignmentGroup DHD or assignment DH/DHD', () => {
    expect(isDeadheadRosterPuck({ assignmentGroup: 'DHD', assignment: 'FLY' })).toBe(true)
    expect(isDeadheadRosterPuck({ assignmentGroup: 'FLY', assignment: 'DHD' })).toBe(true)
    expect(isDeadheadRosterPuck({ assignmentGroup: 'FLY', assignment: 'FLY' })).toBe(false)
  })
})
