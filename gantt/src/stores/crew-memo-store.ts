import { create } from 'zustand'
import { crewMemoApi } from '@/services/crew-memo-api'
import type { CrewMemo } from '@/types/crew-memo'

interface CrewMemoState {
  /** all visible memos, keyed by crewId */
  memosByCrew: Map<string, CrewMemo[]>
  /** lookup by the roster_flight id a memo is anchored to (for canvas rendering) */
  memosByRosterId: Map<number, CrewMemo[]>
  loading: boolean
  /** bump to force the roster pane to re-fetch memos for its loaded crew */
  refreshNonce: number
  bumpRefresh: () => void
  /** Fetch memos for the loaded crew over a range (call AFTER first paint). */
  fetchForCrew: (crewIds: string[], from: string, to: string) => Promise<void>
  /** Upsert a memo locally after a successful save. */
  put: (memo: CrewMemo) => void
  /** Remove a memo locally after a successful delete. */
  drop: (id: number) => void
  clear: () => void
}

const reindex = (byCrew: Map<string, CrewMemo[]>): Map<number, CrewMemo[]> => {
  const byRoster = new Map<number, CrewMemo[]>()
  for (const list of byCrew.values()) {
    for (const m of list) {
      if (m.rosterId == null) continue
      const arr = byRoster.get(m.rosterId) ?? []
      arr.push(m)
      byRoster.set(m.rosterId, arr)
    }
  }
  return byRoster
}

export const useCrewMemoStore = create<CrewMemoState>((set, get) => ({
  memosByCrew: new Map(),
  memosByRosterId: new Map(),
  loading: false,
  refreshNonce: 0,
  bumpRefresh: () => set({ refreshNonce: get().refreshNonce + 1 }),

  fetchForCrew: async (crewIds, from, to) => {
    if (crewIds.length === 0) return
    set({ loading: true })
    try {
      const memos = await crewMemoApi.list(crewIds, from, to)
      const byCrew = new Map<string, CrewMemo[]>()
      for (const m of memos) {
        const arr = byCrew.get(m.crewId) ?? []
        arr.push(m)
        byCrew.set(m.crewId, arr)
      }
      set({ memosByCrew: byCrew, memosByRosterId: reindex(byCrew), loading: false })
    } catch {
      set({ loading: false })
    }
  },

  put: (memo) => {
    const byCrew = new Map(get().memosByCrew)
    const list = (byCrew.get(memo.crewId) ?? []).filter((m) => m.id !== memo.id)
    if (memo.status === 'Y') list.push(memo)
    byCrew.set(memo.crewId, list)
    set({ memosByCrew: byCrew, memosByRosterId: reindex(byCrew) })
  },

  drop: (id) => {
    const byCrew = new Map(get().memosByCrew)
    for (const [crewId, list] of byCrew) byCrew.set(crewId, list.filter((m) => m.id !== id))
    set({ memosByCrew: byCrew, memosByRosterId: reindex(byCrew) })
  },

  clear: () => set({ memosByCrew: new Map(), memosByRosterId: new Map() }),
}))
