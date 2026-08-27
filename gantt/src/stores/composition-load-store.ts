// gantt/src/stores/composition-load-store.ts
import { create } from 'zustand'
import { compositionApi } from '@/services/composition-api'
import type { CompositionLoad, Composition, CreateLoadData } from '@/types/composition'

export interface CompositionLoadFilters {
  division: string
  sequence: string
  fleet: string
  fltNum: string
  subFleet: string
  flightFlag: string
  flightAssignment: string
}

const DEFAULT_FILTERS: CompositionLoadFilters = {
  division: '', sequence: '', fleet: '', fltNum: '',
  subFleet: '', flightFlag: '', flightAssignment: '',
}

interface CompositionLoadStore {
  items: CompositionLoad[]
  compositions: Composition[]   // for name resolution in table + dialog dropdown
  loading: boolean

  filters: CompositionLoadFilters

  fetchAll(): Promise<void>
  fetchCompositions(): Promise<void>
  setFilter(patch: Partial<CompositionLoadFilters>): void
  clearFilters(): void
  create(data: CreateLoadData): Promise<void>
  update(id: number, data: Partial<CreateLoadData>): Promise<void>
  remove(id: number): Promise<void>
}

export const useCompositionLoadStore = create<CompositionLoadStore>((set, get) => ({
  items: [],
  compositions: [],
  loading: false,
  filters: { ...DEFAULT_FILTERS },

  fetchAll: async () => {
    set({ loading: true })
    try {
      const items = await compositionApi.listLoads()
      set({ items })
    } finally {
      set({ loading: false })
    }
  },

  fetchCompositions: async () => {
    try {
      const compositions = await compositionApi.listCompositions()
      set({ compositions })
    } catch (err) {
      console.error('[CompositionLoadStore] fetchCompositions error:', err)
    }
  },

  setFilter: (patch) =>
    set((s) => ({ filters: { ...s.filters, ...patch } })),

  clearFilters: () =>
    set({ filters: { ...DEFAULT_FILTERS } }),

  create: async (data) => {
    try {
      const item = await compositionApi.createLoad(data)
      set((s) => ({ items: [...s.items, item] }))
    } catch (err) {
      console.error('[CompositionLoadStore] create error:', err)
    }
  },

  update: async (id, data) => {
    try {
      const updated = await compositionApi.updateLoad(id, data)
      set((s) => ({ items: s.items.map((i) => (i.id === id ? updated : i)) }))
    } catch (err) {
      console.error('[CompositionLoadStore] update error:', err)
    }
  },

  remove: async (id) => {
    try {
      await compositionApi.deleteLoad(id)
      set((s) => ({ items: s.items.filter((i) => i.id !== id) }))
    } catch (err) {
      console.error('[CompositionLoadStore] remove error:', err)
    }
  },
}))