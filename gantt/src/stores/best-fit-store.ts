import { create } from 'zustand'
import { bestFitApi } from '@/services/best-fit-api'
import { applyBestFitShortlist } from '@/utils/best-fit-apply'
import type {
  BestFitBasis,
  BestFitCombinedResult,
  BestFitPairingResult,
  BestFitSelection,
} from '@/services/best-fit-api'

export type BestFitJobStatus = 'idle' | 'checking' | 'done' | 'error'

export interface BestFitJob {
  status: BestFitJobStatus
  result: BestFitPairingResult | null
  error: string | null
}

interface BestFitState {
  open: boolean
  /** Open pairings offered for selection, in the order the caller supplied them. */
  candidates: Array<{ pairingId: number; label: string; base: string; fleet: string; departsLocal: string; openSlots: string }>
  selected: Set<number>
  activePairingId: number | null
  basis: BestFitBasis
  costSetId: number | null
  jobs: Record<number, BestFitJob>
  /** pairingId|slotRank -> crewId */
  choices: Record<string, string>
  combined: BestFitCombinedResult | null
  combinedStale: boolean
  combinedChecking: boolean
  /** Replay of the shortlist into the assign draft (not a commit). */
  applying: boolean
  applySteps: Array<{ crewId: string; pairingId: number; slotRank: string; ok: boolean; reason?: string }>
  applyResult: { assigned: number; failed: number } | null
  error: string | null

  openWith: (candidates: BestFitState['candidates'], preselected?: number[]) => void
  close: () => void
  togglePairing: (pairingId: number, selected?: boolean) => void
  setActivePairing: (pairingId: number) => void
  setBasis: (basis: BestFitBasis) => void
  setCostSetId: (costSetId: number | null) => void
  runSelected: (opts?: { rulesetId?: number; rosterPeriod?: string; rpFrom?: string; rpTo?: string }) => Promise<void>
  selectCandidate: (pairingId: number, slotRank: string, crewId: string) => void
  checkCombined: (opts?: { rulesetId?: number; rosterPeriod?: string; rpFrom?: string; rpTo?: string }) => Promise<void>
  applyShortlist: (opts?: { rulesetId?: number; rosterPeriod?: string; rpFrom?: string; rpTo?: string }) => Promise<void>
  reset: () => void
}

export const selectionKey = (pairingId: number, slotRank: string): string => `${pairingId}|${slotRank}`

/** Pairings planned per "Find best-fit crew" click (each costs real engine runs). */
export const BEST_FIT_BATCH_LIMIT = 5

const emptyJob = (): BestFitJob => ({ status: 'idle', result: null, error: null })

/**
 * Best-fit crew dialog state (Live Gantt).
 *
 * Each selected pairing is planned by its OWN request, so per-pairing progress is
 * real progress (a pairing flips to `done` as soon as its bounded candidate set has
 * been simulated) instead of a single long blocking call. Legality evidence is
 * per candidate and comes from the server; this store never re-implements a rule.
 */
export const useBestFitStore = create<BestFitState>((set, get) => ({
  open: false,
  candidates: [],
  selected: new Set<number>(),
  activePairingId: null,
  basis: 'fairness',
  costSetId: null,
  jobs: {},
  choices: {},
  combined: null,
  combinedStale: false,
  combinedChecking: false,
  applying: false,
  applySteps: [],
  applyResult: null,
  error: null,

  openWith(candidates, preselected) {
    // Default to a runnable batch (most urgent first) rather than the whole month:
    // every checked pairing costs real rule-engine simulations. "Select all" stays
    // available and the footer reports what is queued for the next run.
    const selected = new Set<number>(
      preselected?.length
        ? preselected
        : candidates.slice(0, BEST_FIT_BATCH_LIMIT).map((c) => c.pairingId),
    )
    const activePairingId = (preselected?.[0] ?? candidates[0]?.pairingId) ?? null
    set({
      open: true,
      candidates,
      selected,
      activePairingId,
      jobs: {},
      choices: {},
      combined: null,
      combinedStale: false,
      applying: false,
      applySteps: [],
      applyResult: null,
      error: null,
    })
  },

  close() {
    set({ open: false })
  },

  togglePairing(pairingId, selected) {
    const next = new Set(get().selected)
    const shouldSelect = selected ?? !next.has(pairingId)
    if (shouldSelect) next.add(pairingId)
    else next.delete(pairingId)
    set({ selected: next, combinedStale: get().combined != null })
  },

  setActivePairing(pairingId) {
    set({ activePairingId: pairingId })
  },

  setBasis(basis) {
    set({ basis, combinedStale: get().combined != null })
  },

  setCostSetId(costSetId) {
    set({ costSetId })
  },

  async runSelected(opts) {
    const { selected, candidates, basis, costSetId } = get()
    // Bounded batch: each pairing costs one bounded set of engine simulations, so a
    // "select all" over a busy month must not fire hundreds of requests at once.
    // Already-checked pairings are skipped; the footer reports what remains.
    const targets = candidates
      .filter((candidate) => selected.has(candidate.pairingId))
      .filter((candidate) => get().jobs[candidate.pairingId]?.status !== 'done')
      .slice(0, BEST_FIT_BATCH_LIMIT)
    if (targets.length === 0) return

    set((state) => {
      const jobs = { ...state.jobs }
      for (const target of targets) jobs[target.pairingId] = { status: 'checking', result: null, error: null }
      return { jobs, error: null, combined: null, combinedStale: false, choices: {} }
    })

    await Promise.all(
      targets.map(async (target) => {
        try {
          const result = await bestFitApi.planPairing({
            pairingId: target.pairingId,
            basis,
            ...(costSetId ? { costSetId } : {}),
            ...(opts?.rulesetId ? { rulesetId: opts.rulesetId } : {}),
            ...(opts?.rosterPeriod ? { rosterPeriod: opts.rosterPeriod } : {}),
            ...(opts?.rpFrom && opts?.rpTo ? { rpFrom: opts.rpFrom, rpTo: opts.rpTo } : {}),
          })
          set((state) => ({
            jobs: { ...state.jobs, [target.pairingId]: { status: 'done', result, error: null } },
          }))
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Best-fit request failed'
          set((state) => ({
            jobs: { ...state.jobs, [target.pairingId]: { status: 'error', result: null, error: message } },
            error: state.error ?? message,
          }))
        }
      }),
    )
  },

  selectCandidate(pairingId, slotRank, crewId) {
    set((state) => ({
      choices: { ...state.choices, [selectionKey(pairingId, slotRank)]: crewId },
      combinedStale: state.combined != null,
      activePairingId: pairingId,
    }))
  },

  async checkCombined(opts) {
    const { choices, costSetId } = get()
    const selections: BestFitSelection[] = Object.entries(choices).map(([key, crewId]) => {
      const [pairingId, slotRank] = key.split('|')
      return { pairingId: Number(pairingId), slotRank: slotRank ?? '', crewId }
    })
    if (selections.length === 0) return

    set({ combinedChecking: true, error: null })
    try {
      const combined = await bestFitApi.combinedPreview({
        selections,
        ...(costSetId ? { costSetId } : {}),
        ...(opts?.rulesetId ? { rulesetId: opts.rulesetId } : {}),
        ...(opts?.rosterPeriod ? { rosterPeriod: opts.rosterPeriod } : {}),
        ...(opts?.rpFrom && opts?.rpTo ? { rpFrom: opts.rpFrom, rpTo: opts.rpTo } : {}),
      })
      set({ combined, combinedStale: false, combinedChecking: false })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Combined check failed'
      set({ combinedChecking: false, error: message, combined: null })
    }
  },

  /**
   * Replay the shortlist into the assign draft.
   *
   * Guarded by a FRESH combined check first: the decision the planner approved must
   * still hold at the moment of writing, because another planner may have moved crew
   * or the roster may have changed since the button was enabled. Each assignment then
   * re-validates through the normal assign path, and a step that is refused is rolled
   * back by that path — a partial apply is reported, never silently completed.
   */
  async applyShortlist(opts) {
    const selections = Object.entries(get().choices).map(([key, crewId]) => {
      const [pairingId, slotRank] = key.split('|')
      return { pairingId: Number(pairingId), slotRank: slotRank ?? '', crewId }
    })
    if (selections.length === 0) return

    set({ applying: true, applySteps: [], applyResult: null, error: null })

    await get().checkCombined(opts)
    const combined = get().combined
    if (!combined || !combined.ok || get().combinedStale) {
      set({
        applying: false,
        error:
          combined?.comparison === 'incomplete'
            ? 'Combined check could not be completed — nothing was assigned. Re-run the check.'
            : 'Combined check did not pass — nothing was assigned. Resolve the conflicts first.',
      })
      return
    }

    const result = await applyBestFitShortlist(selections, {
      onStep: (step) => set((state) => ({ applySteps: [...state.applySteps, step] })),
    })
    set({ applying: false, applyResult: result })
  },

  reset() {
    set({
      open: false,
      candidates: [],
      selected: new Set<number>(),
      activePairingId: null,
      jobs: {},
      choices: {},
      combined: null,
      combinedStale: false,
      combinedChecking: false,
      applying: false,
      applySteps: [],
      applyResult: null,
      error: null,
    })
  },
}))
