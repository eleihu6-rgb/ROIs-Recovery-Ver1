import { assignPairingDraft } from '@/utils/assign-pairing-op'
import { bringPairingIdToTop } from '@/utils/bring-matches-to-top'
import type { BestFitSelection } from '@/services/best-fit-api'

/** One shortlist entry's outcome, reported as the replay runs. */
export interface BestFitApplyStep {
  crewId: string
  pairingId: number
  slotRank: string
  index: number
  total: number
  ok: boolean
  reason?: string
}

export interface BestFitApplyOptions {
  onStep?: (step: BestFitApplyStep) => void
  /** Cooperative cancel: checked before each step. */
  isAborted?: () => boolean
  /** Pause between the scroll-to animation and the assign, in ms (default 250). */
  stepDelayMs?: number
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * "Hands" for Best-fit crew — replay a checked shortlist as REAL assign operations.
 *
 * Each step goes through {@link assignPairingDraft}, the same code path a cross-pane
 * drag-drop uses: optimistic draft op + precheck + live legality check + rollback on
 * refusal, plus the crew lock. Best-fit therefore adds no second write path, and the
 * per-step engine check is a second gate behind the combined preview.
 *
 * Nothing is committed here. Assignments accumulate in the draft and the planner
 * presses Save in the toolbar to persist them — identical to a manual batch of assigns
 * or to Auto-assign open pairings.
 */
export const applyBestFitShortlist = async (
  selections: BestFitSelection[],
  opts: BestFitApplyOptions = {},
): Promise<{ assigned: number; failed: number }> => {
  const stepDelay = opts.stepDelayMs ?? 250
  let assigned = 0
  let failed = 0

  for (let i = 0; i < selections.length; i += 1) {
    if (opts.isAborted?.()) break
    const selection = selections[i]!

    // Animate: bring the target pairing into view before assigning it, so the planner
    // sees which pairing is being staffed (same gesture feel as Auto-assign).
    await bringPairingIdToTop(selection.pairingId).catch(() => {})
    await sleep(stepDelay)

    const result = await assignPairingDraft(selection.pairingId, selection.crewId)
    if (result.ok) assigned += 1
    else failed += 1

    opts.onStep?.({
      crewId: selection.crewId,
      pairingId: selection.pairingId,
      slotRank: selection.slotRank,
      index: i + 1,
      total: selections.length,
      ok: result.ok,
      reason: result.reason,
    })
    await sleep(stepDelay)
  }

  return { assigned, failed }
}
