import { create } from 'zustand'
import { flightApi } from '@/services/flight-api'
import type { FlightComposition } from '@/types'

interface FlightCompositionStore {
  byId: Record<number, FlightComposition>
  /** Fetch compositions for ids not already loaded; merges into byId. */
  loadFor: (flightIds: number[]) => Promise<void>
  clear: () => void
}

export const useFlightCompositionStore = create<FlightCompositionStore>((set, get) => ({
  byId: {},
  loadFor: async (flightIds) => {
    const have = get().byId
    const missing = [...new Set(flightIds)].filter((id) => have[id] === undefined)
    if (missing.length === 0) return
    try {
      const res = await flightApi.compositions(missing)
      set((s) => ({ byId: { ...s.byId, ...res } }))
    } catch {
      // Composition segment is simply omitted on failure.
    }
  },
  clear: () => set({ byId: {} }),
}))
