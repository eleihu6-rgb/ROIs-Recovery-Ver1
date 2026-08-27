// gantt/src/stores/composition-store.ts
import { create } from 'zustand'
import { compositionApi } from '@/services/composition-api'
import type { Composition, CompositionRank, CreateCompositionData } from '@/types/composition'

interface CompositionStore {
  compositions: Composition[]
  loading: boolean

  selectedId: number | null
  ranks: CompositionRank[]         // all rank rows for the selected composition
  rankLoading: boolean

  // Derived display state (rebuilt whenever ranks changes)
  displayRanks: string[]           // unique rank codes, determines columns
  displayOptions: number[]         // unique option indices, determines rows

  fetchAll(): Promise<void>
  selectComposition(id: number): Promise<void>

  createComposition(data: CreateCompositionData): Promise<void>
  updateComposition(id: number, data: Partial<CreateCompositionData>): Promise<void>
  removeComposition(id: number): Promise<void>

  // Matrix operations (each triggers API immediately)
  setCell(rank: string, optionIdx: number, value: number | null): Promise<void>
  addRank(rankCode: string): void
  deleteRank(rankCode: string): Promise<void>
  addOption(): void
  deleteOption(optionIdx: number): Promise<void>
}

const deriveDisplay = (ranks: CompositionRank[]) => ({
  displayRanks: [...new Set(ranks.map((r) => r.rank))].sort(),
  displayOptions: [...new Set(ranks.map((r) => r.options))].sort((a, b) => a - b),
})

export const useCompositionStore = create<CompositionStore>((set, get) => ({
  compositions: [],
  loading: false,
  selectedId: null,
  ranks: [],
  rankLoading: false,
  displayRanks: [],
  displayOptions: [],

  fetchAll: async () => {
    set({ loading: true })
    try {
      const compositions = await compositionApi.listCompositions()
      set({ compositions })
    } finally {
      set({ loading: false })
    }
  },

  selectComposition: async (id) => {
    set({ selectedId: id, rankLoading: true, ranks: [], displayRanks: [], displayOptions: [] })
    try {
      const ranks = await compositionApi.getRanksByCompId(id)
      set({ ranks, ...deriveDisplay(ranks) })
    } finally {
      set({ rankLoading: false })
    }
  },

  createComposition: async (data) => {
    try {
      const created = await compositionApi.createComposition(data)
      set((s) => ({ compositions: [...s.compositions, created] }))
    } catch (err) {
      console.error('[CompositionStore] create error:', err)
    }
  },

  updateComposition: async (id, data) => {
    try {
      const updated = await compositionApi.updateComposition(id, data)
      set((s) => ({
        compositions: s.compositions.map((c) => (c.id === id ? updated : c)),
      }))
    } catch (err) {
      console.error('[CompositionStore] update error:', err)
      throw err
    }
  },

  removeComposition: async (id) => {
    try {
      await compositionApi.deleteComposition(id)
      set((s) => ({
        compositions: s.compositions.filter((c) => c.id !== id),
        ...(s.selectedId === id ? { selectedId: null, ranks: [], displayRanks: [], displayOptions: [] } : {}),
      }))
    } catch (err) {
      console.error('[CompositionStore] remove error:', err)
      throw err
    }
  },

  setCell: async (rank, optionIdx, value) => {
    const { selectedId, ranks } = get()
    if (!selectedId) return

    const existing = ranks.find((r) => r.rank === rank && r.options === optionIdx)

    if (value !== null) {
      try {
        if (existing) {
          const updated = await compositionApi.updateRank(existing.id, { planValue: value })
          const newRanks = get().ranks.map((r) => (r.id === existing.id ? updated : r))
          set({ ranks: newRanks, ...deriveDisplay(newRanks) })
        } else {
          const created = await compositionApi.createRank({
            compId: selectedId,
            rank,
            options: optionIdx,
            planValue: value,
            planValueExtra: 0,
          })
          const newRanks = [...get().ranks, created]
          set({ ranks: newRanks, ...deriveDisplay(newRanks) })
        }
      } catch (err) {
        console.error('[CompositionStore] setCell error:', err)
      }
    } else {
      try {
        if (existing) {
          await compositionApi.deleteRank(existing.id)
          const newRanks = get().ranks.filter((r) => r.id !== existing.id)
          set({ ranks: newRanks, ...deriveDisplay(newRanks) })
        }
      } catch (err) {
        console.error('[CompositionStore] deleteCell error:', err)
      }
    }
  },

  addRank: (rankCode) => {
    const { displayRanks } = get()
    if (displayRanks.includes(rankCode)) return
    set((s) => ({ displayRanks: [...s.displayRanks, rankCode].sort() }))
  },

  deleteRank: async (rankCode) => {
    const { ranks } = get()
    const toDelete = ranks.filter((r) => r.rank === rankCode)
    try {
      await Promise.all(toDelete.map((r) => compositionApi.deleteRank(r.id)))
      const newRanks = get().ranks.filter((r) => r.rank !== rankCode)
      set({ ranks: newRanks, displayRanks: get().displayRanks.filter((r) => r !== rankCode) })
    } catch (err) {
      console.error('[CompositionStore] deleteRank error:', err)
    }
  },

  addOption: () => {
    const { displayOptions } = get()
    const nextIdx = displayOptions.length > 0 ? Math.max(...displayOptions) + 1 : 1
    set((s) => ({ displayOptions: [...s.displayOptions, nextIdx] }))
  },

  deleteOption: async (optionIdx) => {
    const { ranks } = get()
    const toDelete = ranks.filter((r) => r.options === optionIdx)
    try {
      await Promise.all(toDelete.map((r) => compositionApi.deleteRank(r.id)))
      const newRanks = get().ranks.filter((r) => r.options !== optionIdx)
      set({ ranks: newRanks, displayOptions: get().displayOptions.filter((o) => o !== optionIdx) })
    } catch (err) {
      console.error('[CompositionStore] deleteOption error:', err)
    }
  },
}))