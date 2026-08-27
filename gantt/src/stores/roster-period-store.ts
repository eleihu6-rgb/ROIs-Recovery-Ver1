import { create } from 'zustand'
import { fetchRosterPeriods, fetchOlderRosterPeriods, type RosterPeriodOption } from '../services/roster-period-api'

interface RosterPeriodState {
  items: RosterPeriodOption[]
  /** Max RP span (max-min+1) selectable in the toolbar multi-select (default 6 until loaded). */
  maxSpan: number
  /** RPs loaded per "Load earlier RPs" click (default 12 until loaded). */
  loadMoreCount: number
  /** True while older (historical) RPs remain unloaded. */
  hasOlder: boolean
  loaded: boolean
  loading: boolean
  loadingMore: boolean
  /** Fetch once and cache the windowed roster-period list. */
  loadRosterPeriods: () => Promise<void>
  /** Fetch the next batch of older RPs and prepend them (keeps items ascending). */
  loadOlderRosterPeriods: () => Promise<void>
}

export const useRosterPeriodStore = create<RosterPeriodState>((set, get) => ({
  items: [],
  maxSpan: 6,
  loadMoreCount: 12,
  hasOlder: false,
  loaded: false,
  loading: false,
  loadingMore: false,
  loadRosterPeriods: async () => {
    if (get().loaded || get().loading) return
    set({ loading: true })
    try {
      const { items, maxSpan, loadMoreCount, hasMore } = await fetchRosterPeriods()
      set({
        items,
        maxSpan: maxSpan ?? 6,
        loadMoreCount: loadMoreCount ?? 12,
        hasOlder: hasMore ?? false,
        loaded: true,
      })
    } finally {
      set({ loading: false })
    }
  },
  loadOlderRosterPeriods: async () => {
    const { items, loadMoreCount, loadingMore } = get()
    if (loadingMore || items.length === 0) return
    const earliest = items[0] // items are ascending; [0] is the oldest
    if (!earliest) return
    set({ loadingMore: true })
    try {
      const res = await fetchOlderRosterPeriods(earliest.rpStart, loadMoreCount)
      const known = new Set(get().items.map((rp) => rp.id))
      const fresh = res.items.filter((rp) => !known.has(rp.id))
      set({ items: [...fresh, ...get().items], hasOlder: res.hasMore ?? false })
    } finally {
      set({ loadingMore: false })
    }
  },
}))
