import type { RosterItem } from '@/types'
import type { RecoveryChange, RecoveryOption } from './recovery-candidates'
import type { StaffingOption } from './open-pairing-recovery'

/**
 * Adapt an open-seat staffing candidate to the common Recovery presentation
 * model. Open-seat recovery has no displaced/source crew; the target crew is
 * the only ownership change, while a standby task is retained and a move-up
 * explicitly releases the donor pairing.
 */
export const staffingOptionToRecoveryOption = (option: StaffingOption, loadedRosterCount?: number): RecoveryOption => {
  const before = option.beforeItems
  const label = (items: RosterItem[]): string => items.length > 0
    ? items.map((item) => item.label || item.assignment || item.assignmentGroup).join(' · ')
    : 'No assigned Roster in loaded data'
  const firstStart = (items: RosterItem[]): number | null => {
    const value = items.map((item) => Date.parse(item.schStrDtUtc || item.briefStartUtc || '')).find(Number.isFinite)
    return value ?? null
  }
  const changes: RecoveryChange[] = []
  if (option.donorPairingId != null) {
    const donorItems = before.filter((item) => Number(item.pairingId) === option.donorPairingId)
    changes.push({
      crewId: option.crewId,
      crewName: option.crewName,
      rosterId: `R${option.donorPairingId}`,
      pairingId: option.donorPairingId,
      before: label(donorItems),
      after: 'Released / vacant donor seat',
      changeType: 'cancel',
      startTimeMs: firstStart(donorItems),
    })
  }
  if (option.standbyTaskId != null) {
    const standby = before.find((item) => item.id === option.standbyTaskId)
    changes.push({
      crewId: option.crewId,
      crewName: option.crewName,
      rosterId: `R${option.standbyTaskId}`,
      pairingId: null,
      before: label(standby ? [standby] : []),
      after: `${label(standby ? [standby] : [])} · Callout standby retained`,
      changeType: 'keep',
      startTimeMs: firstStart(standby ? [standby] : []),
    })
  }
  const additions = option.afterItems.filter((item) => item.pairingId === option.pairingId)
  changes.push({
    crewId: option.crewId,
    crewName: option.crewName,
    rosterId: `R${option.pairingId}`,
    pairingId: option.pairingId,
    before: 'No assigned Roster in loaded data',
    after: label(additions),
    changeType: 'add',
    startTimeMs: firstStart(additions),
  })

  const costUnpriced = option.cost == null || option.cost.directCost == null
  const directCost = option.cost?.directCost ?? 0
  const loadedRosters = loadedRosterCount ?? Math.max(1, new Set(before.map(item => item.pairingId != null ? `p:${item.pairingId}` : `t:${item.id}`)).size)
  const cancelled = changes.filter((change) => change.changeType === 'cancel').length
  const added = changes.filter((change) => change.changeType === 'add').length
  const followOn = option.donorPairingId == null ? 0 : 1
  const stability = Math.round(Math.max(0, Math.min(100, 100 * (1 - (0.35 * followOn + 0.30 * cancelled + 0.20 * added + 0.15 * (cancelled + added)) / loadedRosters))) * 100) / 100
  return {
    id: option.id,
    mode: option.method === 'standby' ? 'standby' : 'transfer',
    title: `${option.crewName || option.crewId} · ${option.rank}`,
    targetCrewId: option.crewId,
    targetCrewName: option.crewName,
    sourceCrewId: '',
    sourcePairingId: option.pairingId,
    targetPairingId: null,
    standbyTaskId: option.standbyTaskId ?? null,
    standbyWindow: option.standbyTaskId == null ? null : (() => {
      const task = before.find((item) => item.id === option.standbyTaskId)
      return task?.schStrDtUtc && task.schEndDtUtc ? `${task.schStrDtUtc} - ${task.schEndDtUtc}` : null
    })(),
    timeDistanceMinutes: null,
    sameRank: true,
    sameBase: true,
    crossDivision: false,
    crossRole: false,
    localExecutable: true,
    reasons: option.reasons,
    beforeItems: option.beforeItems,
    afterItems: option.afterItems,
    changes,
    metrics: {
      affectedCrewCount: 1,
      cancelledRosterCount: cancelled,
      addedRosterCount: added,
      changedRosterCount: cancelled + added,
      followOnImpactCount: followOn,
      rosterStability: stability,
      directCost,
      totalCost: directCost,
      currency: option.cost?.currency ?? 'CNY',
      dhdFlightCost: 0,
      costBreakdown: option.cost?.breakdown,
      costNotes: option.cost?.notes,
      costEnrichmentFailed: costUnpriced,
    },
    ruleCheck: option.ruleCheck,
    ruleMessages: option.ruleMessages,
    positioning: null,
    destinationSplit: null,
    flightDelay: null,
    fdpDiscretion: null,
  }
}

export const staffingOptionsToRecoveryOptions = (options: StaffingOption[]): RecoveryOption[] => options.map(option => staffingOptionToRecoveryOption(option))
