import { create } from 'zustand'
import type { PairingItem } from '@/types'
import { prependBuiltPairings } from '@/utils/pairing-build-focus'

/** Scope handed over by another surface (R'Bot) when it opens the builder. */
export interface RoundtripBuildPrefill {
  base?: string
  fleets?: string[]
  composition?: Array<{ rank: string; plan: number }>
  rules?: {
    checkinMin?: number
    debriefMin?: number
    restMin?: number
    maxDutyBlockMin?: number
    singleLegExemption?: boolean
  }
  startDate?: string
  endDate?: string
  /** Where the prefill came from — drives the "R'Bot prepared this" banner. */
  source?: 'rbot'
}

/** Outcome of the last build run, rendered as the dialog's build summary. */
export interface RoundtripBuildRun {
  requested: number
  built: number
  failed: number
  /** Flights the search could not close into a base-return rotation. */
  uncoveredFlights: number
  warnings: string[]
}

interface RoundtripBuilderState {
  isOpen: boolean
  running: boolean
  progress: string
  created: PairingItem[]
  prefill: RoundtripBuildPrefill | null
  lastRun: RoundtripBuildRun | null
  open: () => void
  openWithPrefill: (prefill: RoundtripBuildPrefill) => void
  close: () => void
  setProgress: (running: boolean, progress: string) => void
  addCreated: (item: PairingItem) => void
  clearFocus: () => void
  removeCreated: (id: number) => void
  consumePrefill: () => RoundtripBuildPrefill | null
  setLastRun: (run: RoundtripBuildRun | null) => void
}
export const useRoundtripBuilderStore = create<RoundtripBuilderState>((set, get) => ({
  isOpen: false,
  running: false,
  progress: '',
  created: [],
  prefill: null,
  lastRun: null,
  open: () => set({ isOpen: true }),
  openWithPrefill: (prefill) => set({ isOpen: true, prefill, lastRun: null }),
  close: () => set({ isOpen: false }),
  setProgress: (running, progress) => set({ running, progress }),
  addCreated: (item) => set((state) => ({ created: prependBuiltPairings(state.created, [item]) })),
  clearFocus: () => set({ created: [] }),
  removeCreated: (id) => set((state) => ({ created: state.created.filter((item) => item.pairing.id !== id) })),
  consumePrefill: () => {
    const pending = get().prefill
    if (pending) set({ prefill: null })
    return pending
  },
  setLastRun: (lastRun) => set({ lastRun }),
}))
