/**
 * Shared FLY / Reserve puck colors for Pairing and Roster Canvas renderers.
 * Keeps both panes on the same duty-type palette.
 */

/** Roster / Pairing normal-FLY segment gradient (blue). */
export const ROSTER_FLIGHT_TOP = '#1e40af'
export const ROSTER_FLIGHT_BOTTOM = '#2563eb'

/** Pre-assigned RES and Reserve pairing segment fill (light green). */
export const RESERVE_PUCK_COLOR = '#66CDAA'

const RESERVE_ASSIGNMENT_CODES = new Set(['RES', 'CRAM', 'CRPM', 'PRAM', 'PRPM'])

const normalizeCode = (value: string | null | undefined): string =>
  (value ?? '').trim().toUpperCase()

const DEADHEAD_SEG_CODES = new Set(['DH', 'DHD'])

/** True when pairing_segment.seg_assignment (or equivalent) is deadhead. */
export const isDeadheadSegAssignment = (code: string | null | undefined): boolean =>
  DEADHEAD_SEG_CODES.has(normalizeCode(code))

/** Roster segment-mode deadhead: prefer segAssignment, then group/assignment fallback. */
export const isDeadheadRosterPuck = (item: {
  segAssignment?: string | null
  assignmentGroup?: string | null
  assignment?: string | null
}): boolean => {
  if (item.segAssignment != null && String(item.segAssignment).trim() !== '') {
    return isDeadheadSegAssignment(item.segAssignment)
  }
  if (normalizeCode(item.assignmentGroup) === 'DHD') return true
  return isDeadheadSegAssignment(item.assignment)
}

/** True when the duty is a Reserve puck (group RES or reserve assignment code). */
export const isReservePuck = (
  assignmentGroup: string | null | undefined,
  assignment: string | null | undefined,
): boolean => {
  const group = normalizeCode(assignmentGroup)
  const code = normalizeCode(assignment)
  if (group === 'RES') return true
  return RESERVE_ASSIGNMENT_CODES.has(code)
}

export type SegmentDutyFill =
  | { kind: 'dhd' }
  | { kind: 'reserve'; baseColor: string }
  | { kind: 'fly'; top: string; bottom: string }

/**
 * Resolve segment-mode fill for Pairing / Roster flight-style pucks.
 * Does not cover ordinary ground/SBY paths (those keep assignment-store colors).
 */
export const resolveSegmentDutyFill = (opts: {
  assignmentGroup: string | null | undefined
  assignment: string | null | undefined
  isDeadhead: boolean
}): SegmentDutyFill => {
  if (opts.isDeadhead) return { kind: 'dhd' }
  if (isReservePuck(opts.assignmentGroup, opts.assignment)) {
    return { kind: 'reserve', baseColor: RESERVE_PUCK_COLOR }
  }
  return { kind: 'fly', top: ROSTER_FLIGHT_TOP, bottom: ROSTER_FLIGHT_BOTTOM }
}
