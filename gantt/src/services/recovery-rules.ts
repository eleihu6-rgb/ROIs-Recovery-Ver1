/**
 * Recovery rule constants and the alert → strategy mapping.
 *
 * Kept in a dependency-free module so both the candidate builder and the
 * trigger helpers can share them without an import cycle.
 */
import type { RosterItem } from '@/types'

/** Aircraft qualification mismatch — the original Recovery entry point. */
export const RECOVERY_RULE_QUALIFICATION = '8004'

/** Assignment Overlap — accepted as a Recovery entry only with a ground/fly overlap. */
export const RECOVERY_RULE_ASSIGNMENT_OVERLAP = '1001'

export type RecoveryTrigger = 'roster-qualification' | 'assignment-overlap'

/** Which recovery strategy an alert maps to, or null when it is not a Recovery alert. */
export const recoveryTriggerFor = (ruleCode: string): RecoveryTrigger | null =>
  ruleCode === RECOVERY_RULE_QUALIFICATION
    ? 'roster-qualification'
    : ruleCode === RECOVERY_RULE_ASSIGNMENT_OVERLAP
      ? 'assignment-overlap'
      : null

/** Flying duty groups — kept identical to the legality input builder's definition. */
const FLIGHT_ASSIGNMENT_GROUPS = new Set(['FLY', 'FLT', 'DHD'])

const toMs = (value: string | null | undefined): number => {
  if (!value) return Number.NaN
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? ms : Number.NaN
}

const rangeOf = (items: RosterItem[]): { start: number; end: number } | null => {
  let start = Number.POSITIVE_INFINITY
  let end = Number.NEGATIVE_INFINITY
  for (const item of items) {
    const itemStart = toMs(item.schStrDtUtc)
    const itemEnd = toMs(item.schEndDtUtc)
    if (Number.isFinite(itemStart)) start = Math.min(start, itemStart)
    if (Number.isFinite(itemEnd)) end = Math.max(end, itemEnd)
  }
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? { start, end } : null
}

/** A ground task is any loaded task that is not a flying duty. */
export const isGroundTask = (item: RosterItem): boolean =>
  !FLIGHT_ASSIGNMENT_GROUPS.has((item.assignmentGroup ?? '').trim().toUpperCase())

/**
 * True when the Crew holds a ground task whose time range overlaps the given
 * flying Pairing. This is the condition that makes an Assignment Overlap (1001)
 * alert actionable by Recovery.
 */
export const hasGroundTaskFlyOverlap = (
  items: RosterItem[],
  crewId: string,
  pairingId: number,
): boolean => {
  const crewItems = items.filter((item) => String(item.crewId) === String(crewId))
  const pairingRange = rangeOf(crewItems.filter((item) => Number(item.pairingId) === Number(pairingId)))
  if (!pairingRange) return false
  return crewItems
    .filter((item) => Number(item.pairingId) !== Number(pairingId) && isGroundTask(item))
    .some((item) => {
      const groundRange = rangeOf([item])
      return groundRange != null && groundRange.start < pairingRange.end && groundRange.end > pairingRange.start
    })
}

/**
 * Flying Pairing ids of this Crew whose time range overlaps the given task.
 * Used by the Roster context menu so right-clicking either side of an
 * Assignment Overlap (the ground task or the flying Pairing) can resolve the
 * Pairing that Recovery should act on.
 */
export const overlappingPairingIdsForTask = (
  items: RosterItem[],
  crewId: string,
  taskId: number,
): number[] => {
  const crewItems = items.filter((item) => String(item.crewId) === String(crewId))
  const anchor = crewItems.find((item) => item.id === taskId)
  const anchorRange = anchor ? rangeOf([anchor]) : null
  if (!anchorRange) return []
  return [...new Set(crewItems
    .filter((item) => item.pairingId != null && Number(item.pairingId) !== Number(anchor?.pairingId))
    .filter((item) => {
      const itemRange = rangeOf([item])
      return itemRange != null && itemRange.start < anchorRange.end && itemRange.end > anchorRange.start
    })
    .map((item) => Number(item.pairingId)))]
}
