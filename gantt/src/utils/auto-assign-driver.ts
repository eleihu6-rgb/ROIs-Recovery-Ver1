import { assignPairingDraft } from '@/utils/assign-pairing-op'
import { bringPairingIdToTop } from '@/utils/bring-matches-to-top'
import { useRosterStore } from '@/stores/roster-store'
import type { AutoAssignPlan } from '@/services/auto-assign-api'

/** One replayed assignment's outcome, streamed to the dialog log as it runs. */
export interface ReplayStep {
  crewId: string
  /** Pairing id for pairing steps; 0 for ground duties. */
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
  /** Pause between scroll-to animation and assign, in ms (default 400). */
  stepDelayMs?: number
  /** Roster pane that owns the draft ops ('main' unless the dialog was opened from the sub pane). */
  paneId?: 'main' | 'sub'
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

type QueuedStep =
  | { crewId: string; kind: 'pairing'; pairingId: number; label: string }
  | { crewId: string; kind: 'ground'; assignment: string; base: string; startDtUtc: string; endDtUtc: string; label: string }

/**
 * "Hands" — replay a brain-computed {@link AutoAssignPlan} as REAL operations on
 * the gantt, crew top-to-bottom, pairings first then ground duties, exactly in
 * the order the brain decided. Pairing steps scroll the pairing pane to the
 * target (so the user watches it get picked) then queue the same optimistic
 * draft op + live legality check drag-drop would; ground steps (DO) queue the
 * same `add-ground-task` draft op the Ground Task dialog uses.
 *
 * Nothing is committed here — assignments accumulate in the draft, and the
 * user presses Save to persist (same as manual batch assigns).
 */
export const runAutoAssignReplay = async (
  plan: AutoAssignPlan,
  opts: ReplayOptions = {},
): Promise<{ assigned: number; failed: number }> => {
  const stepDelay = opts.stepDelayMs ?? 400
  const paneId = opts.paneId ?? 'main'
  const steps: QueuedStep[] = []
  for (const crew of plan.crews) {
    for (const a of crew.assigned) steps.push({ crewId: crew.crewId, kind: 'pairing', pairingId: a.pairingId, label: a.label })
    for (const g of crew.assignedGround ?? []) {
      steps.push({ crewId: crew.crewId, kind: 'ground', assignment: g.assignment, base: g.base, startDtUtc: g.startDtUtc, endDtUtc: g.endDtUtc, label: `${g.assignment} ${g.day}` })
    }
  }

  let assigned = 0
  let failed = 0
  for (let i = 0; i < steps.length; i++) {
    if (opts.isAborted?.()) break
    const s = steps[i]
    let ok = false
    let reason: string | undefined

    if (s.kind === 'pairing') {
      // Animate: bring the target pairing to the top before assigning it.
      await bringPairingIdToTop(s.pairingId).catch(() => {})
      await sleep(stepDelay)
      const res = await assignPairingDraft(s.pairingId, s.crewId)
      ok = res.ok
      reason = res.reason
    } else {
      const created = await useRosterStore.getState().addGroundTask(paneId, {
        crewIds: [s.crewId],
        assignment: s.assignment,
        depArp: s.base,
        arvArp: s.base,
        startDtUtc: s.startDtUtc,
        endDtUtc: s.endDtUtc,
      })
      ok = created != null && created.length > 0
      if (!ok) reason = 'Ground duty declined by legality check'
    }

    if (ok) assigned++
    else failed++

    opts.onStep?.({
      crewId: s.crewId,
      pairingId: s.kind === 'pairing' ? s.pairingId : 0,
      label: s.label,
      index: i + 1,
      total: steps.length,
      ok,
      reason,
    })
    await sleep(stepDelay)
  }

  return { assigned, failed }
}
