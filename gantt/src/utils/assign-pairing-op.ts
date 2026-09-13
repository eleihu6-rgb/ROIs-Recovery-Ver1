import { usePairingStore } from '@/stores/pairing-store'
import { useCrewStore } from '@/stores/crew-store'
import { useRankActingStore } from '@/stores/rank-acting-store'
import { useAuthStore } from '@/stores/auth-store'
import { validateAssignment } from '@rois/shared-rules'
import { useLockStore } from '@/stores/lock-store'
import { useDraftStore } from '@/stores/draft-store'
import { useGanttViewStore } from '@/stores/gantt-view-store'
import { checkLiveDraftLegality, useRosterStore } from '@/stores/roster-store'
import { useRuleCheckStore } from '@/stores/rule-check-store'
import { isDeadheadSegAssignment } from '@/utils/puck-duty-color'
import type { RosterItem } from '@/types'

export interface AssignPairingResult {
  ok: boolean
  /** Present when ok=false: why the assignment did not go through. */
  reason?: string
  /** The draft op id, so callers may correlate/undo; present only when the op was queued. */
  opId?: string
}

/**
 * Queue one "assign pairing → crew" draft op with an optimistic apply and a live
 * legality check, exactly the way a cross-pane drag-drop does. Extracted from
 * AppLayout's `case 'assign-pairing'` so the drag handler AND the auto-assign
 * driver share ONE code path (§Gantt-Unify) — no duplicated placeholder-build /
 * precheck / rollback logic.
 *
 * Returns { ok } once the legality preview approves (or the user confirms via the
 * rule dialog). On rejection the optimistic op is rolled back and ok=false.
 * The caller owns the toolbar `checking` lifecycle for its own UX; this helper
 * sets/releases it around a single assignment, matching the drag path.
 */
export const assignPairingDraft = async (
  pairingId: number,
  toCrewId: string,
  opts?: { autoAcceptSoft?: boolean },
): Promise<AssignPairingResult> => {
  const pairingItem = usePairingStore.getState().items.find((i) => i.pairing.id === pairingId)
  if (!pairingItem) {
    return { ok: false, reason: 'Pairing data not found locally. Try refreshing.' }
  }

  const pairing = pairingItem.pairing

  // Resolve the crew's acting rank for this pairing assignment.
  const crewEntry = useCrewStore.getState().items.find((c) => c.crew.crewId === toCrewId)
  const initialActingRank = crewEntry?.crew.panelRank ?? crewEntry?.crew.ranks?.[0]?.rank ?? ''

  // Pre-check: division / open position / rank_acting must all pass, and this
  // resolves the EXACT slot rank (after rank_acting downgrade).
  let resolvedActingRank = initialActingRank
  if (crewEntry) {
    const schema = useAuthStore.getState().user?.schema ?? ''
    const rankActingMap = useRankActingStore.getState().getForFiliale(schema)
    const precheck = validateAssignment(
      { id: toCrewId, division: crewEntry.crew.division, rank: initialActingRank },
      {
        id: pairing.id,
        division: pairing.division,
        composition: pairing.composition.map((c) => ({ actingRank: c.rank, plan: c.plan, fill: c.fill })),
      },
      rankActingMap,
    )
    if (!precheck.ok) {
      return { ok: false, reason: precheck.message }
    }
    resolvedActingRank = precheck.actingRank
  }
  const rosterActingRank = resolvedActingRank

  // Build placeholder RosterItems for immediate visual feedback (one per segment).
  let tempId = -Date.now()
  const placeholders: RosterItem[] = pairingItem.segments.length > 0
    ? pairingItem.segments.map((seg) => ({
        id: tempId--,
        crewId: toCrewId,
        pairingId: pairing.id,
        ver: 0,
        base: pairing.base,
        label: `${seg.fltNum} ${seg.depArp}-${seg.arvArp}`,
        assignmentGroup: isDeadheadSegAssignment(seg.segAssignment) ? 'DHD' : pairing.assignmentGroup,
        assignment: pairing.assignment,
        segAssignment: seg.segAssignment,
        role: null, subRole: null, source: null,
        isRequested: 0, isSwapped: 0, preference: null,
        comments: null, score: null, workingHour: null,
        schStrDtUtc: seg.schStrDtUtc, schEndDtUtc: seg.schEndDtUtc,
        actStrDtUtc: null, actEndDtUtc: null,
        fltId: seg.fltId, fltDt: null,
        dutySeq: seg.dutySeq, segSeq: seg.segSeq,
        division: pairing.division,
        flightActingRank: rosterActingRank, rosterActingRank, activeRank: null, position: null,
        schCreditedMinutes: null, actCreditedMinutes: null,
        dutyActCreditedMinutes: seg.dutyActCreditedMinutes ?? null,
        tagSet: null, exceptionCode: null,
        actRestMin: seg.dutyActRestMin ?? null,
        ybh: null, mbh: null, yal: null, mal: null, ydo: null, mdo: null, mcred: null,
        pickupStartUtc: seg.pickupStartUtc, pickupEndUtc: seg.pickupEndUtc,
        briefStartUtc: seg.briefStartUtc, briefEndUtc: seg.briefEndUtc,
        debriefStartUtc: seg.debriefStartUtc, debriefEndUtc: seg.debriefEndUtc,
        dropoffStartUtc: seg.dropoffStartUtc, dropoffEndUtc: seg.dropoffEndUtc,
      }))
    : [{
        id: tempId--,
        crewId: toCrewId,
        pairingId: pairing.id,
        ver: 0,
        base: pairing.base,
        label: pairing.pairingLabel,
        assignmentGroup: pairing.assignmentGroup,
        assignment: pairing.assignment,
        role: null, subRole: null, source: null,
        isRequested: 0, isSwapped: 0, preference: null,
        comments: null, score: null, workingHour: null,
        schStrDtUtc: pairing.schStrDtUtc, schEndDtUtc: pairing.schEndDtUtc,
        actStrDtUtc: null, actEndDtUtc: null,
        fltId: null, fltDt: null,
        dutySeq: null, segSeq: null,
        division: pairing.division,
        flightActingRank: rosterActingRank, rosterActingRank, activeRank: null, position: null,
        schCreditedMinutes: null, actCreditedMinutes: null,
        tagSet: null, exceptionCode: null,
        actRestMin: null,
        ybh: null, mbh: null, yal: null, mal: null, ydo: null, mdo: null, mcred: null,
      }]

  const draft = useDraftStore.getState()
  const beforeItems = useRosterStore.getState().main.rosterItems
  useRuleCheckStore.getState().setChecking(true)
  const opId = draft.addOp(
    { type: 'assign-pairing', pairingId: pairing.id, crewId: toCrewId, rosterActingRank, tasks: placeholders as unknown as Record<string, unknown>[] },
    [toCrewId],
    [pairing.id],
  )

  // Optimistic apply — show the placeholder tasks immediately.
  const base = useRosterStore.getState().main.baseItems
  const displayed = draft.applyDraftOps(base)
  useRosterStore.setState((s) => ({ main: { ...s.main, rosterItems: displayed } }))
  usePairingStore.getState().refreshDraftCoverage(base, displayed)
  useGanttViewStore.getState().markDirty()

  void useLockStore.getState().acquireLock(toCrewId, [pairing.id]).catch(() => {})
  const allowed = await checkLiveDraftLegality(
    [toCrewId],
    beforeItems,
    displayed,
    { relatedItems: placeholders, relatedPairingIds: [pairing.id], autoAcceptSoft: opts?.autoAcceptSoft },
  )
  if (!allowed) {
    useDraftStore.getState().removeOp(opId)
    const reverted = draft.applyDraftOps(base)
    useRosterStore.setState((s) => ({ main: { ...s.main, rosterItems: reverted } }))
    usePairingStore.getState().refreshDraftCoverage(base, reverted)
    useGanttViewStore.getState().markDirty()
    if (!useRuleCheckStore.getState().confirmDialog.open) {
      useRuleCheckStore.getState().setChecking(false)
    }
    return { ok: false, reason: 'Assignment reverted — legality check did not approve', opId }
  }
  useRuleCheckStore.getState().setChecking(false)
  return { ok: true, opId }
}
