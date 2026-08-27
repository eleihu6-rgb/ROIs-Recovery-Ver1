import { create } from 'zustand'
import type { RankActingMap } from '@rois/shared-rules'
import { api } from '@/services/api'

interface RankActingRow {
  activeRank: string
  actingRank: string
  qual: string | null
}

interface RankActingState {
  /** filiale → activeRank → Set<actingRank> */
  byFiliale: Map<string, RankActingMap>
  loading: boolean
  error: string | null

  /** One-time fetch per filiale. Idempotent — second call is a no-op. */
  loadForFiliale: (filiale: string) => Promise<void>
  /** Returns an empty Map if not loaded yet (precheck then fails closed with RANK_ACTING_DISALLOWED). */
  getForFiliale: (filiale: string) => RankActingMap
  /** Clear cached rows for a filiale (used on schema switch). */
  invalidate: (filiale: string) => void
}

export const useRankActingStore = create<RankActingState>((set, get) => ({
  byFiliale: new Map(),
  loading: false,
  error: null,

  async loadForFiliale(filiale: string) {
    if (!filiale || get().byFiliale.has(filiale)) return
    set({ loading: true, error: null })
    try {
      const rows = await (api.get('/api/rank-acting') as Promise<RankActingRow[]>)
      const map: RankActingMap = new Map()
      for (const r of rows) {
        if (!map.has(r.activeRank)) map.set(r.activeRank, new Set())
        map.get(r.activeRank)!.add(r.actingRank)
      }
      const next = new Map(get().byFiliale)
      next.set(filiale, map)
      set({ byFiliale: next, loading: false })
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  },

  getForFiliale(filiale: string): RankActingMap {
    return get().byFiliale.get(filiale) ?? new Map()
  },

  invalidate(filiale: string) {
    const next = new Map(get().byFiliale)
    next.delete(filiale)
    set({ byFiliale: next })
  },
}))