import { assignPairingDraft } from '@/utils/assign-pairing-op'
import { bringPairingIdToTop } from '@/utils/bring-matches-to-top'
import type { AutoAssignPlan } from '@/services/auto-assign-api'

/** One replayed assignment's outcome, streamed to the dialog log as it runs. */
export interface ReplayStep {
  crewId: string
  pairingId: number
  label: string
  index: number
  total: number
  ok: boolean
  reason?: string
}

export interface ReplayOptions {
  /** Called after each replayed assignment (for the live log / progress bar). */
  onStep?: (step: ReplayStep) => void
  /** Cooperative cancel: checked before each step. */
  isAborted?: () => boolean
  /** Pause between the scroll-to animation and the assign, in ms (default 400). */
  stepDelayMs?: number
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * "Hands" — replay a brain-computed {@link AutoAssignPlan} as REAL assign
 * operations on the gantt, crew top-to-bottom and pairing by date, exactly the
 * order the brain decided. Each step scrolls the pairing pane to the target
 * pairing (so the user watches it get picked, like a real operation) then queues
 * the same optimistic draft op + live legality check a drag-drop would.
 *
 * The plan is warning-clean by construction, so replaying should not trip the
 * rule dialog; if a step is nonetheless declined it is rolled back, counted as
 * failed, and the replay moves on to the next.
 *
 * Nothing is committed here — the assignments accumulate in the draft, and the
 * user presses Save to persist (same as any manual batch of assigns).
 */
export const runAutoAssignReplay = async (
  plan: AutoAssignPlan,
  opts: ReplayOptions = {},
): Promise<{ assigned: number; failed: number }> => {
  const stepDelay = opts.stepDelayMs ?? 400
  const steps = plan.crews.flatMap((c) => c.assigned.map((a) => ({ crewId: c.crewId, a })))
  let assigned = 0
  let failed = 0

  for (let i = 0; i < steps.length; i++) {
    if (opts.isAborted?.()) break
    const { crewId, a } = steps[i]

    // Animate: bring the target pairing into view before assigning it.
    await bringPairingIdToTop(a.pairingId).catch(() => {})
    await sleep(stepDelay)

    const res = await assignPairingDraft(a.pairingId, crewId)
    if (res.ok) assigned++
    else failed++

    opts.onStep?.({
      crewId,
      pairingId: a.pairingId,
      label: a.label,
      index: i + 1,
      total: steps.length,
      ok: res.ok,
      reason: res.reason,
    })
    await sleep(stepDelay)
  }

  return { assigned, failed }
}
