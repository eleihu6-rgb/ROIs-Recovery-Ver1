import type { RosterItem } from '@/types'
import { isRosterCompleted } from './recovery-candidates'
import {
  RECOVERY_RULE_ASSIGNMENT_OVERLAP,
  RECOVERY_RULE_QUALIFICATION,
  hasGroundTaskFlyOverlap,
  isGroundTask,
  recoveryTriggerFor,
} from './recovery-rules'

/**
 * Recovery entry points.
 *
 * Two alert types can open the Recovery dialog:
 *   - Rule 8004 (aircraft qualification mismatch) — the original entry point.
 *   - Rule 1001 (Assignment Overlap) — accepted only when the Crew actually holds
 *     a ground task overlapping the alert's flying Pairing, which is the
 *     operational situation Recovery can act on.
 *
 * Everything else stays non-recoverable so an unrelated alert can never be run
 * through the 8004 recovery strategy.
 */
export { RECOVERY_RULE_ASSIGNMENT_OVERLAP, RECOVERY_RULE_QUALIFICATION, hasGroundTaskFlyOverlap, isGroundTask, recoveryTriggerFor }

/**
 * Single recovery-entry gate shared by the Gantt canvas, the Alert Center list,
 * the crew bell list and the Recovery dialog itself.
 */
export const canRecoverViolation = (input: {
  ruleCode: string
  items: RosterItem[]
  crewId: string | null | undefined
  pairingId: number | null | undefined
  now?: number
}): boolean => {
  const { ruleCode, items, crewId, pairingId, now } = input
  if (!crewId || pairingId == null || !Number.isFinite(Number(pairingId))) return false
  const trigger = recoveryTriggerFor(ruleCode)
  if (trigger == null) return false
  if (trigger === 'roster-qualification') {
    return !isRosterCompleted(items, String(crewId), Number(pairingId), now)
  }
  return hasGroundTaskFlyOverlap(items, String(crewId), Number(pairingId))
}

/**
 * Minimal shape of a violation row from either source (live check results or the
 * persisted rule_violation rows). Structural typing keeps this module free of
 * store imports.
 */
export interface RecoveryAlertRow {
  ruleCode: string
  severity?: number
  message?: string
  passed?: boolean
  crewId?: string | null
  targetType?: 'roster' | 'pairing' | 'crew'
  targetId?: string | number
  anchorPairingId?: number | null
}

export interface RecoveryAlertLookup {
  ruleCode: string
  severity: number
  message: string
}

/**
 * Collect every recovery-eligible alert for one (crew, Pairing) pair.
 *
 * Live check results are keyed `${targetType}:${targetId}` and may anchor a
 * roster-level rule (1001) on the crew instead of the Pairing, so both anchors
 * are accepted; persisted rows are keyed by Pairing id.
 *
 * A Pairing usually carries several alerts (e.g. 8004 AND 1001). Each alert type
 * has its own entry condition, so callers must pick the first alert whose
 * condition actually holds — never gate the whole Pairing on an arbitrary one.
 */
export const collectRecoveryAlerts = (input: {
  crewId: string
  pairingId: number
  liveViolations?: Iterable<RecoveryAlertRow[]>
  persistedViolations?: Map<number, RecoveryAlertRow[]>
}): RecoveryAlertLookup[] => {
  const { crewId, pairingId } = input
  const found: RecoveryAlertLookup[] = []
  const seen = new Set<string>()
  const push = (alert: RecoveryAlertLookup): void => {
    if (seen.has(alert.ruleCode)) return
    seen.add(alert.ruleCode)
    found.push(alert)
  }
  for (const list of input.liveViolations ?? []) {
    for (const violation of list) {
      const ruleCode = String(violation.ruleCode ?? '').trim().toUpperCase()
      if (recoveryTriggerFor(ruleCode) == null) continue
      const matchPairing = violation.targetType === 'pairing' && Number(violation.targetId) === pairingId
      const matchCrew = violation.targetType === 'crew'
        && violation.anchorPairingId != null
        && Number(violation.anchorPairingId) === pairingId
      if (!matchPairing && !matchCrew) continue
      if (violation.crewId != null && String(violation.crewId) !== String(crewId)) continue
      push({
        ruleCode,
        severity: typeof violation.severity === 'number' ? violation.severity : 3,
        message: violation.message ?? '',
      })
    }
  }
  const persisted = input.persistedViolations?.get(pairingId) ?? []
  for (const row of persisted) {
    if (row.passed) continue
    if (row.crewId != null && String(row.crewId) !== String(crewId)) continue
    const ruleCode = String(row.ruleCode ?? '').trim().toUpperCase()
    if (recoveryTriggerFor(ruleCode) == null) continue
    push({
      ruleCode,
      severity: typeof row.severity === 'number' ? row.severity : 3,
      message: row.message ?? '',
    })
  }
  return found
}

/**
 * First alert for this (crew, Pairing) whose entry condition is satisfied.
 * Falls back to null when no alert type applies (e.g. only an 8004 alert on an
 * already-finished Roster).
 */
export const findRecoverableAlert = (input: {
  crewId: string
  pairingId: number
  items: RosterItem[]
  liveViolations?: Iterable<RecoveryAlertRow[]>
  persistedViolations?: Map<number, RecoveryAlertRow[]>
  now?: number
}): RecoveryAlertLookup | null => {
  // A Pairing often carries BOTH alert types. When each has its own entry
  // condition and both hold, the Assignment Overlap (1001) decision wins — it is
  // the operational overlap the user is acting on, and 8004-only gating would
  // hide the newer options.
  const priority = (alert: RecoveryAlertLookup): number =>
    recoveryTriggerFor(alert.ruleCode) === 'assignment-overlap' ? 0 : 1
  const ordered = [...collectRecoveryAlerts(input)].sort((a, b) => priority(a) - priority(b))
  for (const alert of ordered) {
    if (canRecoverViolation({
      ruleCode: alert.ruleCode,
      items: input.items,
      crewId: input.crewId,
      pairingId: input.pairingId,
      now: input.now,
    })) return alert
  }
  return null
}

/**
 * Recoverable Pairings for one Crew: the Pairing carries a recovery alert AND the
 * trigger condition actually holds (1001 → a ground task overlaps it; 8004 → the
 * Roster has not ended).
 *
 * Used by the Roster context menu for both a task right-click and a row
 * right-click, so the entry no longer depends on hitting the exact puck.
 */
export const recoverablePairingsForCrew = (input: {
  crewId: string
  items: RosterItem[]
  liveViolations?: Iterable<RecoveryAlertRow[]>
  persistedViolations?: Map<number, RecoveryAlertRow[]>
  now?: number
}): Array<{ pairingId: number; alert: RecoveryAlertLookup }> => {
  const crewId = String(input.crewId)
  const pairingIds = [...new Set(input.items
    .filter((item) => String(item.crewId) === crewId && item.pairingId != null)
    .map((item) => Number(item.pairingId)))]
  const found: Array<{ pairingId: number; alert: RecoveryAlertLookup }> = []
  for (const pairingId of pairingIds) {
    const alert = findRecoverableAlert({
      crewId,
      pairingId,
      items: input.items,
      liveViolations: input.liveViolations,
      persistedViolations: input.persistedViolations,
      now: input.now,
    })
    if (!alert) continue
    found.push({ pairingId, alert })
  }
  return found
}
