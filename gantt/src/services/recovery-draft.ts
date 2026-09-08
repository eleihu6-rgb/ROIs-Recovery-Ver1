import type { RosterItem } from '@/types'
import type { DraftOp } from './draft-api'
import type { RecoveryOption } from './recovery-candidates'

export interface RecoveryDraftPlan {
  operations: DraftOp[]
  affectedCrewIds: string[]
  affectedPairingIds: number[]
}

const rosterItemsFor = (items: RosterItem[], crewId: string, pairingId: number): RosterItem[] =>
  items.filter((item) => item.crewId === crewId && Number(item.pairingId) === pairingId)

/**
 * Convert a validated Recovery option into the same Draft operations used by the Gantt.
 * Assign operations carry local task copies only for immediate rendering; the Save path
 * intentionally uses the pairing id and lets the existing Assign service rebuild rows.
 */
const draftTasksForCrew = (items: RosterItem[], crewId: string, pairingId: number): Record<string, unknown>[] =>
  rosterItemsFor(items, crewId, pairingId).map((item) => {
    const {
      isRecoveryAffected: _isRecoveryAffected,
      isRecoveryBefore: _isRecoveryBefore,
      isRecoveryAfter: _isRecoveryAfter,
      isCalloutStandby: _isCalloutStandby,
      ...persistedShape
    } = item
    return { ...persistedShape, crewId, isPending: true }
  })

const actingRankFor = (items: RosterItem[], crewId: string, pairingId: number): string => {
  const item = rosterItemsFor(items, crewId, pairingId)[0]
  return item?.rosterActingRank || item?.flightActingRank || 'CREW'
}

export const buildRecoveryDraftPlan = (option: RecoveryOption, items: RosterItem[]): RecoveryDraftPlan => {
  if (option.subOptions?.length) {
    const plans = option.subOptions.map((child) => buildRecoveryDraftPlan(child, items))
    return {
      operations: plans.flatMap((plan) => plan.operations),
      affectedCrewIds: [...new Set(plans.flatMap((plan) => plan.affectedCrewIds))],
      affectedPairingIds: [...new Set(plans.flatMap((plan) => plan.affectedPairingIds))],
    }
  }
  const affectedCrewIds = [...new Set([option.sourceCrewId, option.targetCrewId])]
  const affectedPairingIds = [...new Set([
    option.sourcePairingId,
    ...(option.targetPairingId != null ? [option.targetPairingId] : []),
  ])]
  const operations: DraftOp[] = []

  if (option.mode === 'cross-base-destination' && option.destinationSplit) {
    const destinationItems = option.afterItems
      .filter((item) => item.crewId === option.targetCrewId
        && Number(item.pairingId) === option.destinationSplit!.createdPairingId)
      .map((item) => {
        const { isRecoveryAffected: _affected, isRecoveryBefore: _before, isRecoveryAfter: _after, ...persistedShape } = item
        return { ...persistedShape }
      })
    operations.push({
      type: 'cross-base-recovery',
      crossBase: {
        operation: 'destination',
        sourceCrewId: option.sourceCrewId,
        sourcePairingId: option.sourcePairingId,
        targetCrewId: option.targetCrewId,
        targetPairingId: null,
        standbyTaskId: null,
        outboundFlightId: null,
        returnFlightId: null,
        supportBase: option.destinationSplit.destinationBase,
        recoveryBase: option.destinationSplit.destinationBase,
        division: items.find((item) => item.pairingId === option.sourcePairingId)?.division || '',
        rosterActingRank: option.destinationSplit.actingRank,
        minFlightLeadHours: 0,
        maxFlightLeadHours: 0,
        reserveBeforeHours: 0,
        returnAfterHours: 0,
        destinationSplit: {
          destinationBase: option.destinationSplit.destinationBase,
          middleFlightIds: option.destinationSplit.middleFlightIds,
          removedDhdFlightIds: option.destinationSplit.removedDhdFlightIds,
          actingRank: option.destinationSplit.actingRank,
          createsPairing: option.destinationSplit.createsPairing,
        },
      },
      mockItems: destinationItems,
    })
    return { operations, affectedCrewIds, affectedPairingIds }
  }

  if ((option.mode === 'cross-base-standby' || option.mode === 'cross-base-swap') && option.positioning) {
    const afterItems = option.afterItems
      .filter((item) => item.assignmentGroup?.toUpperCase() !== 'SBY'
        && (item.pairingId === option.sourcePairingId
          || item.pairingId === option.targetPairingId
          || item.assignmentGroup?.toUpperCase() === 'DHD'))
      .map((item) => {
        const { isRecoveryAffected: _affected, isRecoveryBefore: _before, isRecoveryAfter: _after, isCalloutStandby: _callout, ...persistedShape } = item
        return { ...persistedShape }
      })
    operations.push({
      type: 'cross-base-recovery',
      crossBase: {
        operation: option.mode === 'cross-base-swap' ? 'swap' : 'standby',
        sourceCrewId: option.sourceCrewId,
        sourcePairingId: option.sourcePairingId,
        targetCrewId: option.targetCrewId,
        targetPairingId: option.targetPairingId,
        standbyTaskId: option.standbyTaskId,
        outboundFlightId: option.positioning.outbound.id,
        returnFlightId: option.positioning.inbound.id,
        supportBase: option.positioning.supportBase,
        recoveryBase: option.positioning.recoveryBase,
        division: items.find((item) => item.pairingId === option.sourcePairingId)?.division || '',
        rosterActingRank: actingRankFor(items, option.sourceCrewId, option.sourcePairingId),
        minFlightLeadHours: option.positioning.minFlightLeadHours,
        maxFlightLeadHours: option.positioning.maxFlightLeadHours,
        reserveBeforeHours: option.positioning.reserveBeforeHours,
        returnAfterHours: option.positioning.returnAfterHours,
      },
      mockItems: afterItems,
    })
    return { operations, affectedCrewIds, affectedPairingIds }
  }

  operations.push({
    type: 'remove-pairing-from-crew',
    pairingId: option.sourcePairingId,
    crewId: option.sourceCrewId,
  })

  if (option.mode === 'swap' && option.targetPairingId != null) {
    operations.push({
      type: 'remove-pairing-from-crew',
      pairingId: option.targetPairingId,
      crewId: option.targetCrewId,
    })
  }

  operations.push({
    type: 'assign-pairing',
    pairingId: option.sourcePairingId,
    crewId: option.targetCrewId,
    rosterActingRank: actingRankFor(items, option.sourceCrewId, option.sourcePairingId),
    tasks: draftTasksForCrew(items, option.sourceCrewId, option.sourcePairingId)
      .map((task) => ({ ...task, crewId: option.targetCrewId })),
  })

  if (option.mode === 'swap' && option.targetPairingId != null) {
    operations.push({
      type: 'assign-pairing',
      pairingId: option.targetPairingId,
      crewId: option.sourceCrewId,
      rosterActingRank: actingRankFor(items, option.targetCrewId, option.targetPairingId),
      tasks: draftTasksForCrew(items, option.targetCrewId, option.targetPairingId)
        .map((task) => ({ ...task, crewId: option.sourceCrewId })),
    })
  }

  if (option.mode === 'standby' && option.standbyTaskId != null) {
    operations.push({
      type: 'update',
      taskId: option.standbyTaskId,
      data: { exceptionCode: 'CALLOUT_STANDBY' },
    })
  }

  return { operations, affectedCrewIds, affectedPairingIds }
}
