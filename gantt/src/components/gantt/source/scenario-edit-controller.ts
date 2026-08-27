// gantt/src/components/gantt/source/scenario-edit-controller.ts
import { useMemo } from 'react'
import { getScenarioGanttStore } from '@/stores/scenario-gantt-store'
import { useRuleCheckStore } from '@/stores/rule-check-store'
import type { GanttEditController, GanttEditOp } from './gantt-pane-source'
import { buildScenarioRosterItems, buildEffectiveAssignments } from '@/components/scenario-gantt/build-scenario-roster-items'
import { checkLiveDraftLegality } from '@/stores/roster-store'
import { notify } from '@/utils/notify'
import { useCrossRankConfirm } from '@/components/scenario-gantt/cross-rank-confirm-dialog'
import { computeScenarioPairingCompositions } from '@/utils/scenario-composition-fill'
import { resolveAssignmentRank } from '@/utils/scenario-assignment-rank'
import { useReferenceStore } from '@/stores/reference-store'
import type { AssignmentPatch, ScenarioGanttData } from '@/types/scenario-gantt'

/**
 * Scenario edit controller — adapts roster edit ops to the per-scenario gantt store's
 * optimistic patch pipeline (addPatch → pendingChanges → buildScenarioRosterItems → save).
 *
 * Edits are applied OPTIMISTICALLY on drop (the task appears instantly) and the Rust
 * legality preview then runs in the background via applyScenarioPatchOptimistically; if the
 * preview does not approve, the patch is rolled back and a warning toast is shown. Only the
 * local + synchronous rank/cross-rank gate stays ahead of the optimistic apply.
 *
 * Capability gating happens INSIDE execute (reads the live capabilities + lock state from
 * the store getter, never a stale snapshot). Lock gating: edits require the current user to
 * own the edit lock (lockStatus.isOwner); non-owners / PO scenarios silently no-op so the
 * shared interaction layer can call execute unconditionally.
 *
 * Pairing segment ops (pairing-add-segment / pairing-remove-segment) are P4 — ignored here.
 */
export const useScenarioEditController = (scenarioId: number): GanttEditController => {
  const { confirmCrossRank } = useCrossRankConfirm()
  return useMemo<GanttEditController>(() => ({
    execute: async (op: GanttEditOp) => {
      const store = getScenarioGanttStore(scenarioId).getState()
      const caps = store.data?.capabilities
      // Lock gate: only the lock owner may mutate the scenario output.
      if (!store.lockStatus?.isOwner) return

      switch (op.type) {
        case 'roster-assign': {
          if (!caps?.roster.canAssign || op.pairingId == null) return
          // Rank gate: CrewRank effective at the task date + pairing open-slot position.
          // Blocks (no valid rank / no open position), or confirms cross-rank before any patch.
          const gate = resolveScenarioAssignmentGate(store, op.toCrewId, op.pairingId)
          if (gate.status === 'no-valid-rank') {
            notify.warning(`CrewRank invalid for ${gate.crewId} on ${gate.taskDate}`)
            return
          }
          if (gate.status === 'no-open-position') {
            notify.warning('Pairing positions full')
            return
          }
          if (gate.crossRank) {
            const ok = await confirmCrossRank({
              crewId: gate.crewId,
              crewRank: gate.crewRank,
              actingRank: gate.actingRank,
              pairingLabel: gate.pairingLabel,
            })
            if (!ok) return
          }
          const patch = {
            op: 'add' as const,
            crewId: op.toCrewId,
            pairingId: op.pairingId,
            rosterActingRank: gate.actingRank,
          }
          await applyScenarioPatchOptimistically(scenarioId, store, patch, [op.toCrewId])
          break
        }
        case 'roster-remove':
          if (!caps?.roster.canRemove) return
          // Removing a task that exists ONLY as a pending add (manual assignment not yet
          // saved) cancels the add — emitting a separate remove patch instead would reach the
          // backend as [add, remove] for the same (crew, pairing), where the remove can't
          // validate because the add hasn't been applied to the DB yet.
          {
            const pendingAdd = store.pendingChanges.find(
              (p) => p.op === 'add' && p.crewId === op.crewId && p.pairingId === op.pairingId,
            )
            if (pendingAdd) {
              store.removePatch(pendingAdd)
              return
            }
          }
          if (!isScenarioPairingAssignmentMutable(store.data, op.crewId, op.pairingId)) return
          {
            const patch = { op: 'remove' as const, crewId: op.crewId, pairingId: op.pairingId }
            await applyScenarioPatchOptimistically(scenarioId, store, patch, [op.crewId])
          }
          break
        case 'roster-reassign':
          if (!caps?.roster.canReassign) return
          if (!isScenarioPairingAssignmentMutable(store.data, op.fromCrewId, op.pairingId)) return
          {
            const patch = {
              op: 'reassign' as const,
              crewId: op.fromCrewId,
              pairingId: op.pairingId,
              toCrewId: op.toCrewId,
            }
            await applyScenarioPatchOptimistically(scenarioId, store, patch, [op.fromCrewId, op.toCrewId])
          }
          break
        // pairing-add-segment / pairing-remove-segment: P4 — not executed here.
        default:
          break
      }
    },
  }), [scenarioId, confirmCrossRank])
}

type AssignmentGate =
  | { status: 'no-valid-rank'; crewId: string; taskDate: string }
  | { status: 'no-open-position' }
  | { status: 'ok'; crewId: string; crewRank: string; actingRank: string; crossRank: boolean; pairingLabel: string | null }

const buildRankOrder = (): Map<string, number> => {
  const rs = useReferenceStore.getState()
  if (rs.ranks.length === 0) void rs.load()
  return new Map(rs.ranks.map((r) => [r.rank, r.displayOrder]))
}

const resolveScenarioAssignmentGate = (
  store: ScenarioStore,
  crewId: string,
  pairingId: number,
): AssignmentGate => {
  const data = store.data
  const crew = data?.crew.find((c) => c.crewId === crewId)
  const pairing = data?.pairings.find((p) => p.pairingId === pairingId)
  if (!data || !crew || !pairing) return { status: 'no-open-position' }

  const effective = buildEffectiveAssignments(data.assignments, store.pendingChanges)
  const fillMap = computeScenarioPairingCompositions(effective, data.crew, data.pairings)
  const openSlots = (fillMap.get(pairing.pairingId) ?? []).filter((s) => s.fill < s.plan)
  const resolved = resolveAssignmentRank({
    crewRanks: crew.ranks ?? [],
    openSlots,
    taskDate: new Date(pairing.schStrDtUtc),
    rankOrder: buildRankOrder(),
  })
  if (resolved.status === 'no-valid-rank') return { status: 'no-valid-rank', crewId, taskDate: pairing.schStrDtUtc.slice(0, 10) }
  if (resolved.status === 'no-open-position') return { status: 'no-open-position' }
  return {
    status: 'ok',
    crewId,
    crewRank: crew.crewRank ?? crew.rank,
    actingRank: resolved.actingRank,
    crossRank: resolved.crossRank,
    pairingLabel: pairing.pairingLabel,
  }
}

const isScenarioPairingAssignmentMutable = (
  data: ScenarioGanttData | null | undefined,
  crewId: string,
  pairingId: number,
): boolean =>
  data?.assignments.some((assignment) =>
    assignment.crewId === crewId &&
    assignment.pairingId === pairingId &&
    (assignment.source === 'CR' || assignment.source === 'MA'),
  ) ?? false

const buildScenarioItems = (
  data: ScenarioGanttData,
  pendingChanges: AssignmentPatch[],
) => {
  const pairingMap = new Map(data.pairings.map((pairing) => [pairing.pairingId, pairing]))
  return buildScenarioRosterItems({
    crew: data.crew,
    pairingMap,
    assignments: data.assignments,
    pairingSegments: data.pairingSegments,
    groundItems: data.groundItems,
    pendingChanges,
  }).items
}

type ScenarioStore = ReturnType<typeof getScenarioGanttStore> extends { getState: () => infer T } ? T : never

/**
 * Optimistic scenario edit: apply the patch to the store immediately (the assignment shows
 * on the roster at once), then run the Rust legality preview in the background. If the
 * preview does not approve (blocked / declined / error), roll the patch back and warn.
 * beforeItems is captured BEFORE addPatch so the preview diffs against the pre-edit state;
 * afterItems is the store's pendingChanges (which now includes the patch).
 */
const applyScenarioPatchOptimistically = async (
  scenarioId: number,
  store: ScenarioStore,
  patch: AssignmentPatch,
  affectedCrewIds: string[],
): Promise<void> => {
  const data = store.data
  if (!data) return
  const beforeItems = buildScenarioItems(data, store.pendingChanges)
  // Mirror Live moveTask's lock-before-addOp pattern: flip the shared
  // rule-check-store.checking flag BEFORE addPatch so the toolbar's Save/Undo
  // stay disabled through the 1-2s legality preview. checkLiveDraftLegality
  // only sets `checking` when it opens the confirm dialog, which is too late
  // — the gap between addPatch and the first network response was the
  // window where Save briefly lit up (SIT regression: drag pairing → crew).
  useRuleCheckStore.getState().setChecking(true)
  store.addPatch(patch)
  // addPatch replaces the zustand state object, so the captured `store` snapshot's
  // pendingChanges is stale after the call — re-read before building the after state.
  const afterStore = getScenarioGanttStore(scenarioId).getState()
  const afterItems = buildScenarioItems(afterStore.data ?? data, afterStore.pendingChanges)
  const relatedPairingIds = patch.pairingId != null ? [patch.pairingId] : []
  const relatedCrewIds = new Set(affectedCrewIds)
  if (patch.toCrewId) relatedCrewIds.add(patch.toCrewId)
  // Prefer after-state items for the edited pairing (assign/reassign); fall back to before (remove).
  const relatedItems = (
    afterItems.some((item) => item.pairingId != null && relatedPairingIds.includes(item.pairingId))
      ? afterItems
      : beforeItems
  ).filter((item) =>
    item.pairingId != null &&
    relatedPairingIds.includes(item.pairingId) &&
    relatedCrewIds.has(item.crewId),
  )
  try {
    // Same before/after + related-new filter + confirm gate as Live draft edits.
    const allowed = await checkLiveDraftLegality(
      affectedCrewIds,
      beforeItems,
      afterItems,
      {
        contextType: 'scenario',
        scenarioId,
        relatedPairingIds,
        relatedItems,
      },
    )
    if (!allowed) {
      afterStore.removePatch(patch)
      notify.warning('Assignment reverted — legality check did not approve')
      // If the confirm dialog is open, it owns `checking`; otherwise the
      // preview rejected without a dialog — release the lock ourselves.
      if (!useRuleCheckStore.getState().confirmDialog.open) {
        useRuleCheckStore.getState().setChecking(false)
      }
    } else {
      useRuleCheckStore.getState().setChecking(false)
    }
  } catch (error) {
    // Scenario edit must not keep a patch when the Rust preview is unavailable.
    console.error('Scenario legality preview failed', error)
    notify.error(`Scenario legality preview failed: ${(error as Error).message}`)
    getScenarioGanttStore(scenarioId).getState().removePatch(patch)
    notify.warning('Assignment reverted — legality check failed')
    if (!useRuleCheckStore.getState().confirmDialog.open) {
      useRuleCheckStore.getState().setChecking(false)
    }
  }
}
