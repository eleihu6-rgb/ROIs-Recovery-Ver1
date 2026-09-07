import { create } from 'zustand'
import type { RosterItem } from '@/types'
import type { PairingItem } from '@/types/pairing'
import type { RecoveryOption } from '@/services/recovery-candidates'

export type RecoveryPairingPreviewStatus = 'modified' | 'created' | 'cancelled'

export interface RecoveryPairingPreview {
  /** Stable UI identity. It is not a database Pairing ID. */
  id: string
  pairingId: number
  status: RecoveryPairingPreviewStatus
  pairingLabel: string
  beforeLabel: string | null
  afterLabel: string | null
  beforeCrewId?: string | null
  afterCrewId?: string | null
  /** Header details shown as the explicit Before/After Pairing diff. */
  beforeSummary?: string | null
  afterSummary?: string | null
  isSynthetic: boolean
  /**
   * Temporary Pairing-pane structure. For an existing Pairing this is the
   * actual After structure; for a new Pairing it is the synthetic row.
   * It is never persisted to the live Pairing store or database.
   */
  previewItem?: PairingItem
  /** Original structure used as the Before reference for an in-place edit. */
  beforeItem?: PairingItem
}

interface RecoveryPreviewStore {
  optionId: string | null
  items: RosterItem[] | null
  beforeItems: RosterItem[] | null
  pairingChanges: RecoveryPairingPreview[]
  view: 'before' | 'after' | 'compare'
  setPreview: (
    optionId: string,
    items: RosterItem[],
    beforeItems?: RosterItem[],
    pairingChanges?: RecoveryPairingPreview[],
  ) => void
  setView: (view: 'before' | 'after' | 'compare') => void
  clear: () => void
}

/**
 * Keep the loaded roster as the baseline and overlay only the roster tasks changed by the
 * selected recovery option. Overlay ids are synthetic so canvas indexes and hit testing never
 * confuse an after task with its before counterpart.
 */
export const buildRecoveryCompareItems = (
  beforeItems: RosterItem[],
  afterItems: RosterItem[],
): RosterItem[] => {
  const before = beforeItems.map((item) => ({
    ...item,
    isRecoveryBefore: item.isRecoveryAffected === true,
    isRecoveryAfter: false,
  }))
  const usedIds = new Set(before.map((item) => item.id))
  let syntheticId = -1
  const after = afterItems
    .filter((item) => item.isRecoveryAffected === true || item.isCalloutStandby === true)
    .map((item) => {
      while (usedIds.has(syntheticId)) syntheticId -= 1
      const result = {
        ...item,
        id: syntheticId,
        isRecoveryBefore: false,
        isRecoveryAfter: true,
      }
      usedIds.add(syntheticId)
      syntheticId -= 1
      return result
    })
  return [...before, ...after]
}

export const resolveRecoveryPreviewItems = (input: {
  liveItems: RosterItem[]
  afterItems: RosterItem[] | null
  beforeItems: RosterItem[] | null
  view: 'before' | 'after' | 'compare'
}): RosterItem[] => {
  if (input.afterItems == null) return input.liveItems
  if (input.view === 'before') return input.beforeItems ?? input.liveItems
  if (input.view === 'compare') return buildRecoveryCompareItems(input.beforeItems ?? input.liveItems, input.afterItems)
  return input.afterItems
}

const firstItemForPairing = (items: RosterItem[], pairingId: number): RosterItem | undefined =>
  items.find((item) => Number(item.pairingId) === pairingId)

const pairingName = (pairings: PairingItem[], pairingId: number, items: RosterItem[]): string => {
  const pairing = pairings.find((entry) => entry.pairing.id === pairingId)?.pairing
  return pairing?.pairingLabel?.trim()
    || firstItemForPairing(items, pairingId)?.pairingLabel?.trim()
    || `Pairing #${pairingId}`
}

const crewPairingLabel = (label: string, crewId: string | null | undefined): string =>
  crewId ? `${label} · Crew ${crewId}` : label

const pairingSummary = (input: {
  base: string | null | undefined
  start: string | null | undefined
  end: string | null | undefined
  segmentCount: number
}): string => {
  const range = input.start && input.end
    ? `${input.start.slice(5, 16)} → ${input.end.slice(5, 16)}`
    : '—'
  return `Base ${input.base || '—'} · ${range} · ${input.segmentCount} seg`
}

const makeCreatedPairingItem = (
  pairingId: number,
  items: RosterItem[],
  label: string,
): PairingItem | undefined => {
  const orderedItems = [...items].sort((a, b) =>
    (a.dutySeq ?? 0) - (b.dutySeq ?? 0)
    || (a.segSeq ?? 0) - (b.segSeq ?? 0)
    || new Date(a.schStrDtUtc ?? 0).getTime() - new Date(b.schStrDtUtc ?? 0).getTime(),
  )
  const first = orderedItems[0]
  if (!first) return undefined
  const timedItems = orderedItems.filter((item): item is RosterItem & { schStrDtUtc: string; schEndDtUtc: string } => Boolean(item.schStrDtUtc && item.schEndDtUtc))
  const firstTimed = timedItems[0]
  if (!firstTimed) return undefined
  const assignmentGroup = first.assignmentGroup || 'FLT'
  const assignment = first.assignment || assignmentGroup
  const start = timedItems.reduce((value, item) => item.schStrDtUtc < value ? item.schStrDtUtc : value, firstTimed.schStrDtUtc)
  const end = timedItems.reduce((value, item) => item.schEndDtUtc > value ? item.schEndDtUtc : value, firstTimed.schEndDtUtc)
  const segments = timedItems.map((item) => ({
    id: item.id,
    pairingId,
    dutySeq: item.dutySeq ?? 1,
    segSeq: item.segSeq ?? 1,
    fltId: item.fltId ?? null,
    fltNum: item.label ?? item.assignment ?? '',
    airline: '',
    depArp: item.depArp ?? '',
    arvArp: item.arvArp ?? '',
    schStrDtUtc: item.schStrDtUtc,
    schEndDtUtc: item.schEndDtUtc,
    actStrDtUtc: item.actStrDtUtc ?? item.schStrDtUtc,
    actEndDtUtc: item.actEndDtUtc ?? item.schEndDtUtc,
    segAssignment: item.segAssignment || item.assignment || assignment,
    dutyStrArp: item.depArp ?? '',
    dutyEndArp: item.arvArp ?? '',
    dutySchStrDtUtc: item.schStrDtUtc,
    dutySchEndDtUtc: item.schEndDtUtc,
    dutySchRestMin: null,
    dutyActRestMin: null,
    dutyActCreditedMinutes: null,
    pickupStartUtc: null,
    pickupEndUtc: null,
    briefAirport: null,
    briefStartUtc: null,
    briefEndUtc: null,
    debriefAirport: null,
    debriefStartUtc: null,
    debriefEndUtc: null,
    dropoffStartUtc: null,
    dropoffEndUtc: null,
    doublePickupStartUtc: null,
    doublePickupEndUtc: null,
    doubleBriefAirport: null,
    doubleBriefStartUtc: null,
    doubleBriefEndUtc: null,
    doubleDebriefAirport: null,
    doubleDebriefStartUtc: null,
    doubleDebriefEndUtc: null,
    doubleDropoffStartUtc: null,
    doubleDropoffEndUtc: null,
  })) as PairingItem['segments']
  return {
    pairing: {
      id: pairingId,
      pairingLabel: label,
      filiale: null,
      division: first.division ?? '',
      base: first.base ?? '',
      fleet: first.fleetCode ?? '',
      assignmentGroup,
      assignment,
      schStrDtUtc: start,
      schEndDtUtc: end,
      actStrDtUtc: start,
      actEndDtUtc: end,
      durationDays: 0,
      tafb: 0,
      dutyCount: 1,
      segCount: segments.length,
      blockMinutes: Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000)),
      ver: 1,
      isDeleted: 0,
      source: 'RECOVERY_PREVIEW',
      tags: null,
      comments: assignmentGroup.toUpperCase() === 'DHD' ? 'Recovery DHD positioning preview' : 'Recovery destination-base Pairing preview',
      pairingDt: start.slice(0, 10),
      composition: [],
      isFull: true,
      segments,
    },
    flights: timedItems.map((item) => ({
      fltId: item.fltId ?? -1,
      fltNum: item.label ?? item.assignment ?? '',
      depArp: item.depArp ?? '',
      arvArp: item.arvArp ?? '',
      schDepDtUtc: item.schStrDtUtc,
      schArvDtUtc: item.schEndDtUtc,
    })),
    segments,
    sessionTags: [],
  }
}

/**
 * Build an After Pairing using the Recovery option's actual roster rows. The
 * loaded Pairing is used only as a metadata/segment-detail baseline; the
 * resulting segment list comes from `items`, so removed DHD legs cannot leak
 * back into the Preview canvas.
 */
const makeModifiedPairingItem = (
  pairingId: number,
  items: RosterItem[],
  label: string,
  sourcePairing?: PairingItem,
): PairingItem | undefined => {
  const generated = makeCreatedPairingItem(pairingId, items, label)
  if (!generated) return undefined
  const first = [...items]
    .filter((item) => item.schStrDtUtc)
    .sort((a, b) => new Date(a.schStrDtUtc!).getTime() - new Date(b.schStrDtUtc!).getTime())[0]
  if (!first) return generated

  const usedSourceSegments = new Set<number>()
  const segments = generated.segments.map((segment) => {
    const sourceSegment = sourcePairing?.segments.find((candidate) => {
      if (usedSourceSegments.has(candidate.id)) return false
      if (segment.fltId != null && candidate.fltId != null) return segment.fltId === candidate.fltId
      return segment.dutySeq === candidate.dutySeq && segment.segSeq === candidate.segSeq
    })
    if (!sourceSegment) return segment
    usedSourceSegments.add(sourceSegment.id)
    return { ...sourceSegment, ...segment }
  }) as PairingItem['segments']

  // Keep the original Pairing's fields that are not represented by Roster
  // rows, while explicitly replacing all structure fields affected by the
  // recovery (base, dates, count, and segments).
  return {
    ...generated,
    pairing: {
      ...(sourcePairing?.pairing ?? generated.pairing),
      ...generated.pairing,
      pairingLabel: sourcePairing?.pairing.pairingLabel ?? generated.pairing.pairingLabel,
      base: first.depArp?.trim() || first.base?.trim() || generated.pairing.base,
      composition: sourcePairing?.pairing.composition ?? generated.pairing.composition,
      segments,
      source: 'RECOVERY_PREVIEW',
    },
    segments,
  }
}

/**
 * Convert the selected Recovery option into a Pairing-pane-only preview.
 *
 * Pairings are not mutated here. Existing pairings are represented as one row
 * with Before/After ownership, while synthetic DHD pairings are marked Created.
 * Clearing the session preview removes the complete overlay, which represents
 * cancelling an uncommitted pairing creation.
 */
export const buildRecoveryPairingPreview = (
  option: RecoveryOption,
  pairings: PairingItem[],
): RecoveryPairingPreview[] => {
  if (option.subOptions?.length) {
    return option.subOptions.flatMap((child) => buildRecoveryPairingPreview(child, pairings))
  }
  const changes: RecoveryPairingPreview[] = []
  const sourceLabel = pairingName(pairings, option.sourcePairingId, option.beforeItems)
  if (option.mode === 'cross-base-destination' && option.destinationSplit) {
    const split = option.destinationSplit
    const sourcePairingItem = pairings.find((entry) => entry.pairing.id === option.sourcePairingId)
    const sourcePairing = sourcePairingItem?.pairing
    const afterItems = option.afterItems.filter((item) => Number(item.pairingId) === option.sourcePairingId)
    const beforeItems = option.beforeItems.filter((item) => Number(item.pairingId) === option.sourcePairingId)
    const afterFirst = afterItems[0]
    const afterLast = afterItems[afterItems.length - 1]
    const beforeFirst = beforeItems[0]
    const beforeLast = beforeItems[beforeItems.length - 1]
    changes.push({
      id: `pairing:${option.sourcePairingId}:destination-source`,
      pairingId: option.sourcePairingId,
      status: 'modified',
      pairingLabel: sourceLabel,
      beforeLabel: crewPairingLabel(sourceLabel, option.sourceCrewId),
      afterLabel: `${sourceLabel} · DHD removed`,
      beforeCrewId: option.sourceCrewId,
      afterCrewId: null,
      beforeSummary: pairingSummary({
        base: sourcePairing?.base ?? beforeFirst?.base,
        start: sourcePairing?.schStrDtUtc ?? beforeFirst?.schStrDtUtc,
        end: sourcePairing?.schEndDtUtc ?? beforeLast?.schEndDtUtc,
        segmentCount: sourcePairing?.segCount ?? beforeItems.length,
      }),
      afterSummary: pairingSummary({
        base: split.adjustedPairingBase,
        start: afterFirst?.schStrDtUtc,
        end: afterLast?.schEndDtUtc,
        segmentCount: afterItems.length,
      }),
      isSynthetic: false,
      beforeItem: pairings.find((entry) => entry.pairing.id === option.sourcePairingId),
      previewItem: split.createsPairing
        ? undefined
        : makeModifiedPairingItem(option.sourcePairingId, afterItems, sourceLabel, sourcePairingItem),
    })
    if (split.createsPairing) {
      const createdItems = option.afterItems.filter((item) => Number(item.pairingId) === split.createdPairingId)
      const label = `Recovery Pairing · ${sourceLabel}`
      changes.push({
        id: `pairing:${split.createdPairingId}:destination-created`,
        pairingId: split.createdPairingId,
        status: 'created',
        pairingLabel: label,
        beforeLabel: null,
        afterLabel: crewPairingLabel(label, option.targetCrewId),
        beforeCrewId: null,
        afterCrewId: option.targetCrewId,
        afterSummary: pairingSummary({
          base: split.adjustedPairingBase,
          start: createdItems[0]?.schStrDtUtc,
          end: createdItems[createdItems.length - 1]?.schEndDtUtc,
          segmentCount: createdItems.length,
        }),
        isSynthetic: true,
        previewItem: makeCreatedPairingItem(split.createdPairingId, createdItems, label),
      })
    }
    return changes
  }
  changes.push({
    id: `pairing:${option.sourcePairingId}:source`,
    pairingId: option.sourcePairingId,
    status: 'modified',
    pairingLabel: sourceLabel,
    beforeLabel: crewPairingLabel(sourceLabel, option.sourceCrewId),
    afterLabel: crewPairingLabel(sourceLabel, option.targetCrewId),
    beforeCrewId: option.sourceCrewId,
    afterCrewId: option.targetCrewId,
    isSynthetic: false,
  })

  const isSwap = option.mode === 'swap' || option.mode === 'cross-base-swap'
  if (isSwap && option.targetPairingId != null) {
    const targetLabel = pairingName(pairings, option.targetPairingId, option.beforeItems)
    changes.push({
      id: `pairing:${option.targetPairingId}:target`,
      pairingId: option.targetPairingId,
      status: 'modified',
      pairingLabel: targetLabel,
      beforeLabel: crewPairingLabel(targetLabel, option.targetCrewId),
      afterLabel: crewPairingLabel(targetLabel, option.sourceCrewId),
      beforeCrewId: option.targetCrewId,
      afterCrewId: option.sourceCrewId,
      isSynthetic: false,
    })
  }

  const dhdByPairing = new Map<number, RosterItem[]>()
  for (const item of option.afterItems) {
    const destinationCreated = option.destinationSplit?.createsPairing
      && item.pairingId === option.destinationSplit.createdPairingId
    if ((!destinationCreated && item.assignmentGroup?.toUpperCase() !== 'DHD') || item.pairingId == null || item.pairingId >= 0) continue
    const current = dhdByPairing.get(Number(item.pairingId))
    if (current) current.push(item)
    else dhdByPairing.set(Number(item.pairingId), [item])
  }
  for (const [pairingId, items] of dhdByPairing) {
    const label = pairingName(pairings, pairingId, items)
    changes.push({
      id: `pairing:${pairingId}:created`,
      pairingId,
      status: 'created',
      pairingLabel: label,
      beforeLabel: null,
      afterLabel: crewPairingLabel(label, option.targetCrewId),
      beforeCrewId: null,
      afterCrewId: option.targetCrewId,
      isSynthetic: true,
      previewItem: makeCreatedPairingItem(pairingId, items, label),
    })
  }
  return changes
}

export const useRecoveryPreviewStore = create<RecoveryPreviewStore>((set) => ({
  optionId: null,
  items: null,
  beforeItems: null,
  pairingChanges: [],
  view: 'compare',
  setPreview: (optionId, items, beforeItems, pairingChanges = []) => set({
    optionId,
    items,
    beforeItems: beforeItems ?? items,
    pairingChanges,
    view: 'compare',
  }),
  setView: (view) => set({ view }),
  clear: () => set({ optionId: null, items: null, beforeItems: null, pairingChanges: [], view: 'compare' }),
}))
