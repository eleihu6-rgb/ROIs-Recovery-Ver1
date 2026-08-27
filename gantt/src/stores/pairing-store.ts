import { create } from 'zustand'
import { pairingApi } from '@/services/pairing-api'
import { clearPairingInfoCache } from '@/services/pairing-detail-cache'
import type { Pairing, PairingItem, DateRange, PairingFilters, QuerySession, PairingListQuery } from '@/types'
import type { RosterItem } from '@/types/roster'
import { hasPairingFilterValues, type PairingFilter } from '@/stores/filter-store'
import { useGanttViewStore } from './gantt-view-store'
import { usePaneStore } from './pane-store'

const formatDate = (d: Date): string => d.toISOString().slice(0, 10)
const PAGE_SIZE = 100
/** Apply Filters: send pageSize=0 so server returns all matching records without LIMIT. */
const ALL_DATA_PAGE_SIZE = 0

/** Session colors for visual indication (used by UI to show session tags) */
export const SESSION_COLORS = [
  '#f97316', // 1 orange
  '#3b82f6', // 2 blue
  '#22c55e', // 3 green
  '#a855f7', // 4 purple
]

interface PairingStore {
  /** Loaded pairing items (grows as user scrolls, deduped by pairing.id) */
  items: PairingItem[]
  /** Total count from backend (unfiltered, for current date range) */
  total: number
  /** Total in date range without filters (for ≡ badge showing filtered count) */
  unfilteredTotal: number
  loading: boolean
  /** Real load progress 0-100; null = not loading (drives PaneLoadingBar). */
  progress: number | null
  loadingMore: boolean
  /** True when more pairings are available on the server */
  hasMore: boolean

  /** Query mode: replace clears items, append keeps and adds session tags */
  queryMode: 'replace' | 'append'
  /** Query session queue for append mode */
  sessions: QuerySession[]
  /** Counter for generating session IDs */
  nextSessionId: number
  /** Global sort column */
  sortBy: PairingListQuery['sortBy']
  /** Global sort order */
  sortOrder: PairingListQuery['sortOrder']

  /** Filters specific to pairing pane (legacy, may be removed later) */
  fleetFilter: string | null
  compositionFilter: 'all' | 'full' | 'partial'
  /** Server composition fills before any local roster draft delta. */
  authoritativeComposition: Map<number, Pairing['composition']>

  /** Fetch first page of pairings (segments included inline), sets unfilteredTotal */
  fetchPairings: (dateRange: DateRange, filter?: PairingFilter, opts?: { pageSize?: number }) => Promise<void>

  /** Single-round pairing load: split the range into ~30-day windows, fetch them
   *  concurrently, merge by id, and advance progress 0→100. Avoids one giant request
   *  (a 6-month pairing query is ~99MB and can exceed the 30s HTTP timeout). */
  fetchPairingsBatched: (dateRange: DateRange, filter?: PairingFilter) => Promise<void>

  /** True once the COMPLETE pairing set is loaded. False during windowed first-paint. */
  fullyLoaded: boolean
  markPartiallyLoaded: () => void
  markFullyLoaded: () => void
  whenFullyLoaded: () => Promise<void>

  /** Search with filters: replace or append based on queryMode */
  search: (filters: PairingFilters) => Promise<void>

  /** Load next page (FIFO consumption of sessions) */
  loadMore: () => Promise<void>

  /** Apply new sort order, re-execute all searches */
  applySort: (sortBy: PairingListQuery['sortBy'], sortOrder: PairingListQuery['sortOrder']) => Promise<void>

  /** Set query mode */
  setQueryMode: (mode: 'replace' | 'append') => void

  /** Clear all filters and sessions */
  clearFilters: () => void

  /** Remove a filter from a specific session */
  removeFilter: (sessionId: number, key: keyof PairingFilters) => void

  /** Set fleet filter (legacy) */
  setFleetFilter: (fleet: string | null) => void

  /** Set composition filter (legacy) */
  setCompositionFilter: (filter: 'all' | 'full' | 'partial') => void

  /** Get filtered items (computed, legacy) */
  getFilteredItems: () => PairingItem[]

  /** Merge extra pairings into local state (dedupe by id), e.g. label-matched bring-to-top. */
  addItems: (pairings: Pairing[]) => void

  /** Remove a pairing from local state (after delete) */
  removeItem: (pairingId: number) => void

  /** Recompute loaded pairing fills from the server baseline plus roster draft delta. */
  refreshDraftCoverage: (baseItems: RosterItem[], displayedItems: RosterItem[]) => void
  /** Make the currently displayed composition the new local server baseline after save. */
  promoteDraftCoverage: () => void

  /** Check if segments are loaded for a pairing */
  hasSegments: (pairingId: number) => boolean

  /** Computed: get total matched across all sessions */
  getMatchedTotal: () => number

  /** Computed: get loaded count */
  getLoadedCount: () => number

  /** Computed: check if any session has more data */
  getHasMore: () => boolean
}

function comparePairingItems(a: PairingItem, b: PairingItem, sortBy: string, sortOrder: string): number {
  const dir = sortOrder === 'desc' ? -1 : 1
  switch (sortBy) {
    case 'pairingLabel':
      return dir * (a.pairing.pairingLabel ?? '').localeCompare(b.pairing.pairingLabel ?? '')
    case 'tafb':
      return dir * (a.pairing.tafb - b.pairing.tafb)
    case 'fleet':
      return dir * a.pairing.fleet.localeCompare(b.pairing.fleet)
    case 'base':
      return dir * a.pairing.base.localeCompare(b.pairing.base)
    case 'segCount':
      return dir * (a.pairing.segCount - b.pairing.segCount)
    case 'durationDays':
      return dir * (a.pairing.durationDays - b.pairing.durationDays)
    case 'schStrDtUtc':
    default:
      return dir * a.pairing.schStrDtUtc.localeCompare(b.pairing.schStrDtUtc)
  }
}

function mapPairings(rawItems: Pairing[], sessionTags: number[] = []): PairingItem[] {
  // Preserve the server's ordering — the backend already sorts by the requested
  // sortBy/sortOrder. Re-sorting here would silently override any sort other than
  // sch-start-asc (the dedicated Sort dialog drives the server sort).
  return rawItems.map((pairing) => ({
    pairing,
    flights: [],
    segments: pairing.segments ?? [],
    sessionTags,
  }))
}

/** Merge new items with existing, deduplicating by pairing.id and merging sessionTags */
function mergeItems(existing: PairingItem[], newItems: PairingItem[]): PairingItem[] {
  const map = new Map<number, PairingItem>()

  // Add existing items
  for (const item of existing) {
    map.set(item.pairing.id, { ...item, sessionTags: [...item.sessionTags] })
  }

  // Merge new items
  for (const item of newItems) {
    const existingItem = map.get(item.pairing.id)
    if (existingItem) {
      // Merge session tags (dedupe)
      const mergedTags = new Set([...existingItem.sessionTags, ...item.sessionTags])
      map.set(item.pairing.id, { ...item, sessionTags: [...mergedTags] })
    } else {
      map.set(item.pairing.id, { ...item, sessionTags: [...item.sessionTags] })
    }
  }

  return [...map.values()]
}

/**
 * Map a global PairingFilter (multi-select arrays) to the server list-query params.
 * Phase 1: pass the first element of each multi-select dimension; assignments is a
 * true multi-value OR. Coverage is intentionally excluded — it's a client-side reorder
 * (and, where a server coverage match IS needed, passed explicitly by the caller).
 *
 * Single source of truth for every server pairing load (fetchPairings, the pane quick
 * search, and the coverage bring-to-top overlay) so a filter dimension can never be
 * silently dropped from one path — which surfaced wrong-division pairings in the pane.
 */
export const pairingFilterToListParams = (filter: PairingFilter): Partial<PairingListQuery> => ({
  ...(filter.bases[0] ? { base: filter.bases[0] } : {}),
  ...(filter.fleets[0] ? { fleet: filter.fleets[0] } : {}),
  ...(filter.divisions[0] ? { division: filter.divisions[0] } : {}),
  ...(filter.depArps[0] ? { depArp: filter.depArps[0] } : {}),
  ...(filter.assignments.length ? { assignments: filter.assignments } : {}),
  ...(filter.label.trim() ? { label: filter.label.trim() } : {}),
})

/** Build query params from filters */
function buildQueryFromFilters(filters: PairingFilters): Partial<PairingListQuery> {
  const query: Partial<PairingListQuery> = {}
  if (filters.label) query.label = filters.label
  if (filters.fleet) query.fleet = filters.fleet
  if (filters.base) query.base = filters.base
  if (filters.division) query.division = filters.division
  if (filters.segFltNum) query.segFltNum = filters.segFltNum
  if (filters.depArp) query.depArp = filters.depArp
  if (filters.isFull !== undefined) query.isFull = filters.isFull
  if (filters.assignments?.length) query.assignments = filters.assignments
  return query
}

// Deferred used by whenFullyLoaded() so sort can await the background full load.
let pairingFullLoadDeferred: { promise: Promise<void>; resolve: () => void } | null = null
const newPairingDeferred = (): { promise: Promise<void>; resolve: () => void } => {
  let resolve!: () => void
  const promise = new Promise<void>((r) => { resolve = r })
  return { promise, resolve }
}

export const usePairingStore = create<PairingStore>((set, get) => ({
  items: [],
  fullyLoaded: true,
  total: 0,
  unfilteredTotal: 0,
  loading: false,
  progress: null,
  loadingMore: false,
  hasMore: false,
  queryMode: 'replace',
  sessions: [],
  nextSessionId: 1,
  sortBy: 'schStrDtUtc',
  sortOrder: 'asc',
  fleetFilter: null,
  compositionFilter: 'all',
  authoritativeComposition: new Map(),

  // 单轮全量 pairing 分批并发：按 ~30 天（≈RP 周期）拆窗，并行拉取后按 id 合并，
  // 每批完成更新 progress（0-100）。避免单次全量请求过大超时（6 个月 pairing 约 99MB，
  // 会超过 30s HTTP timeout）。filter 维度全局生效，coverage 由调用方做 client overlay。
  fetchPairingsBatched: async (dateRange, filter) => {
    set({ loading: true, progress: 0 })
    clearPairingInfoCache()
    try {
      const startMs = dateRange.start.getTime()
      const endMs = dateRange.end.getTime()
      const BATCH_DAYS = 30
      const totalDays = Math.max(1, Math.round((endMs - startMs) / 86_400_000))
      const batchCount = Math.ceil(totalDays / BATCH_DAYS)
      const filterParams = filter ? pairingFilterToListParams(filter) : {}
      const { sortBy, sortOrder } = get()
      // collect per-batch items + composition; merge after all resolve
      let mergedItems: PairingItem[] = []
      const mergedComposition = new Map<number, PairingItem['pairing']['composition']>()
      let total = 0

      // Concurrently fetch each ~30d window; a window that fails (large payload,
      // transient network) is split in half and retried — never drop a whole window.
      const fetchWindow = async (
        winStart: number,
        winEnd: number,
      ): Promise<{ items: PairingItem[]; batchTotal: number }> => {
        try {
          const result = await pairingApi.list({
            startDate: formatDate(new Date(winStart)),
            endDate: formatDate(new Date(winEnd)),
            page: 1,
            pageSize: ALL_DATA_PAGE_SIZE,
            sortBy,
            sortOrder,
            ...filterParams,
          })
          return { items: mapPairings(result.items, [1]), batchTotal: result.total }
        } catch (err) {
          if (winEnd - winStart <= BATCH_DAYS * 86_400_000 / 2) {
            console.warn('[PairingStore] window permanently failed:', err)
            return { items: [], batchTotal: 0 }
          }
          const mid = winStart + Math.floor((winEnd - winStart) / 2)
          const [left, right] = await Promise.all([fetchWindow(winStart, mid), fetchWindow(mid + 1, winEnd)])
          return { items: [...left.items, ...right.items], batchTotal: left.batchTotal + right.batchTotal }
        }
      }
      let completed = 0
      await Promise.allSettled(
        Array.from({ length: batchCount }, (_, idx) =>
          (async () => {
            const winStart = startMs + idx * BATCH_DAYS * 86_400_000
            const winEnd = Math.min(endMs + 86_400_000 - 1, startMs + (idx + 1) * BATCH_DAYS * 86_400_000 - 1)
            const out = await fetchWindow(winStart, winEnd)
            for (const it of out.items) {
              mergedComposition.set(it.pairing.id, it.pairing.composition.map((slot) => ({ ...slot })))
            }
            total += out.batchTotal
            mergedItems = mergeItems(mergedItems, out.items)
            // Monotonic progress: count completed windows (concurrent order varies, so
            // indexing by window would make the bar jump backwards).
            completed += 1
            set({ progress: Math.round((completed / batchCount) * 100) })
          })(),
        ),
      )

      const hasFilter = filter ? hasPairingFilterValues(filter) : false
      // Windows finish in network order, which is unrelated to their date range.
      // Re-sort the merged list so the displayed order always matches the active sort.
      const sortedItems = mergedItems.sort((a, b) =>
        comparePairingItems(a, b, sortBy ?? 'schStrDtUtc', sortOrder ?? 'asc'),
      )
      set({
        items: sortedItems,
        authoritativeComposition: mergedComposition,
        total,
        ...(hasFilter ? {} : { unfilteredTotal: total }),
        hasMore: false,
        loading: false,
        sessions: [{ id: 1, filters: {}, page: 1, total, exhausted: true }],
        nextSessionId: 2,
      })
      if (hasFilter) {
        void pairingApi.list({
          startDate: formatDate(dateRange.start),
          endDate: formatDate(dateRange.end),
          page: 1,
          pageSize: 1,
        })
          .then((r) => set({ unfilteredTotal: r.total }))
          .catch((err) => console.error('[PairingStore] unfiltered count error:', err))
      }
      useGanttViewStore.getState().markDirty()
    } catch (err) {
      console.error('[PairingStore] fetch error:', err)
      set({ loading: false })
    } finally {
      set({ progress: null })
    }
  },

  fetchPairings: async (dateRange, filter, opts) => {
    set({ loading: true, progress: 0 })
    // A pairing-list reload means details may have changed (filter change, or a commit
    // that touched pairings) — drop the Pairing-Info popup cache so it never serves stale.
    clearPairingInfoCache()
    try {
      const pageSize = opts?.pageSize ?? ALL_DATA_PAGE_SIZE
      const params: PairingListQuery = {
        startDate: formatDate(dateRange.start),
        endDate: formatDate(dateRange.end),
        page: 1,
        pageSize,
        // Keep the list deterministic for both paged and full-range loads.
        sortBy: get().sortBy,
        sortOrder: get().sortOrder,
        ...(filter ? pairingFilterToListParams(filter) : {}),
      }
      const result = await pairingApi.list(params)
      set({ progress: 100 })
      const session: QuerySession = {
        id: 1,
        filters: {},
        page: 1,
        total: result.total,
        exhausted: true,
      }
      const items = mapPairings(result.items, [session.id])
      const authoritativeComposition = new Map(
        items.map((item) => [
          item.pairing.id,
          item.pairing.composition.map((slot) => ({ ...slot })),
        ]),
      )
      const hasFilter = filter ? hasPairingFilterValues(filter) : false
      set({
        items,
        authoritativeComposition,
        total: result.total,
        // 无筛选时 filtered = total；有筛选时真实总数由下方计数查询回填，
        // 不能把筛选后的 total 写进 unfilteredTotal（否则徽标显示 321/321）。
        ...(hasFilter ? {} : { unfilteredTotal: result.total }),
        hasMore: false,
        loading: false,
        sessions: [session],
        nextSessionId: 2,
      })
      if (hasFilter) {
        void pairingApi.list({
          startDate: formatDate(dateRange.start),
          endDate: formatDate(dateRange.end),
          page: 1,
          pageSize: 1,
        })
          .then((r) => set({ unfilteredTotal: r.total }))
          .catch((err) => console.error('[PairingStore] unfiltered count error:', err))
      }
      useGanttViewStore.getState().markDirty()
    } catch (err) {
      console.error('[PairingStore] fetch error:', err)
      set({ loading: false })
    } finally {
      set({ progress: null })
    }
  },

  search: async (filters) => {
    const state = get()
    const { queryMode, sortBy, sortOrder, nextSessionId } = state
    const { dateRange } = usePaneStore.getState()

    if (queryMode === 'replace') {
      // Clear items and start fresh
      set({ loading: true, items: [], total: 0, hasMore: false, sessions: [] })
      try {
        const params: PairingListQuery = {
          startDate: formatDate(dateRange.start),
          endDate: formatDate(dateRange.end),
          page: 1,
          pageSize: PAGE_SIZE,
          sortBy,
          sortOrder,
          ...buildQueryFromFilters(filters),
        }
        const result = await pairingApi.list(params)
        const session: QuerySession = {
          id: nextSessionId,
          filters,
          page: 1,
          total: result.total,
          exhausted: result.items.length < PAGE_SIZE,
        }
        const items = mapPairings(result.items, [session.id])
        const authoritativeComposition = new Map(
          items.map((item) => [
            item.pairing.id,
            item.pairing.composition.map((slot) => ({ ...slot })),
          ]),
        )
        set({
          items,
          authoritativeComposition,
          total: result.total,
          hasMore: result.items.length < result.total,
          loading: false,
          sessions: [session],
          nextSessionId: nextSessionId + 1,
        })
        useGanttViewStore.getState().markDirty()
      } catch (err) {
        console.error('[PairingStore] search error:', err)
        set({ loading: false })
      }
    } else {
      // Append mode: keep existing items, add new session
      set({ loading: true })
      try {
        const params: PairingListQuery = {
          startDate: formatDate(dateRange.start),
          endDate: formatDate(dateRange.end),
          page: 1,
          pageSize: PAGE_SIZE,
          sortBy,
          sortOrder,
          ...buildQueryFromFilters(filters),
        }
        const result = await pairingApi.list(params)
        const session: QuerySession = {
          id: nextSessionId,
          filters,
          page: 1,
          total: result.total,
          exhausted: result.items.length < PAGE_SIZE,
        }
        const newItems = mapPairings(result.items, [session.id])
        // Use get() after await to avoid race conditions
        const mergedItems = mergeItems(get().items, newItems)
        const currentState = get()
        const newTotal = currentState.sessions.reduce((sum, s) => sum + s.total, 0) + result.total
        set({
          items: mergedItems,
          total: newTotal,
          hasMore: true, // In append mode, we always check hasMore via getHasMore()
          loading: false,
          sessions: [...currentState.sessions, session],
          nextSessionId: nextSessionId + 1,
        })
        useGanttViewStore.getState().markDirty()
      } catch (err) {
        console.error('[PairingStore] search error:', err)
        set({ loading: false })
      }
    }
  },

  loadMore: async () => {
    const state = get()
    if (state.loadingMore || !state.getHasMore()) return

    // In replace mode with single session, use traditional loadMore
    if (state.queryMode === 'replace' && state.sessions.length === 1) {
      const session = state.sessions[0]
      const { dateRange } = usePaneStore.getState()
      const nextPage = session.page + 1

      set({ loadingMore: true })
      try {
        const params: PairingListQuery = {
          startDate: formatDate(dateRange.start),
          endDate: formatDate(dateRange.end),
          page: nextPage,
          pageSize: PAGE_SIZE,
          sortBy: get().sortBy,
          sortOrder: get().sortOrder,
          ...buildQueryFromFilters(session.filters),
        }
        const result = await pairingApi.list(params)
        const newItems = mapPairings(result.items, [session.id])
        // Use get() after await to avoid race conditions
        const allItems = mergeItems(get().items, newItems)
        const updatedSession: QuerySession = {
          ...session,
          page: nextPage,
          exhausted: result.items.length < PAGE_SIZE,
        }
        set({
          items: allItems,
          total: result.total,
          hasMore: result.items.length >= PAGE_SIZE,
          loadingMore: false,
          sessions: [updatedSession],
        })
        useGanttViewStore.getState().markDirty()
      } catch (err) {
        console.error('[PairingStore] loadMore error:', err)
        set({ loadingMore: false })
      }
      return
    }

    // Append mode: FIFO consumption of sessions
    // Find first non-exhausted session
    const activeSession = state.sessions.find((s) => !s.exhausted)
    if (!activeSession) return

    const { dateRange } = usePaneStore.getState()
    const nextPage = activeSession.page + 1

    set({ loadingMore: true })
    try {
      const params: PairingListQuery = {
        startDate: formatDate(dateRange.start),
        endDate: formatDate(dateRange.end),
        page: nextPage,
        pageSize: PAGE_SIZE,
        sortBy: get().sortBy,
        sortOrder: get().sortOrder,
        ...buildQueryFromFilters(activeSession.filters),
      }
      const result = await pairingApi.list(params)
      const newItems = mapPairings(result.items, [activeSession.id])
      // Use get() after await to avoid race conditions
      const allItems = mergeItems(get().items, newItems)

      // Update session state - use actual response count for exhaustion
      const updatedSessions = get().sessions.map((s) =>
        s.id === activeSession.id
          ? { ...s, page: nextPage, exhausted: result.items.length < PAGE_SIZE }
          : s,
      )

      set({
        items: allItems,
        loadingMore: false,
        sessions: updatedSessions,
      })
      useGanttViewStore.getState().markDirty()
    } catch (err) {
      console.error('[PairingStore] loadMore error:', err)
      set({ loadingMore: false })
    }
  },

  markPartiallyLoaded: () => {
    if (get().fullyLoaded) pairingFullLoadDeferred = newPairingDeferred()
    set({ fullyLoaded: false })
  },
  markFullyLoaded: () => {
    set({ fullyLoaded: true })
    pairingFullLoadDeferred?.resolve()
    pairingFullLoadDeferred = null
  },
  whenFullyLoaded: () => (get().fullyLoaded ? Promise.resolve() : (pairingFullLoadDeferred?.promise ?? Promise.resolve())),

  applySort: async (sortBy, sortOrder) => {
    if (get().sortBy === sortBy && get().sortOrder === sortOrder) return
    set({ sortBy, sortOrder })
    // Wait for the full set during windowed first-paint — never sort a partial list.
    if (!get().fullyLoaded) await get().whenFullyLoaded()
    const sorted = [...get().items].sort((a, b) =>
      comparePairingItems(a, b, sortBy ?? 'schStrDtUtc', sortOrder ?? 'asc'),
    )
    set({ items: sorted })
    useGanttViewStore.getState().markDirty()
  },

  setQueryMode: (mode) => set({ queryMode: mode }),

  clearFilters: () => {
    set({
      sessions: [],
      items: [],
      total: 0,
      hasMore: false,
    })
  },

  removeFilter: (sessionId, key) => {
    const state = get()
    const session = state.sessions.find((s) => s.id === sessionId)
    if (!session) return

    const newFilters = { ...session.filters }
    delete newFilters[key]

    // If no filters left, remove the session
    if (Object.keys(newFilters).length === 0) {
      const newSessions = state.sessions.filter((s) => s.id !== sessionId)
      // Remove session tags from items
      const newItems = state.items
        .map((item) => ({
          ...item,
          sessionTags: item.sessionTags.filter((t) => t !== sessionId),
        }))
        .filter((item) => item.sessionTags.length > 0)

      set({
        sessions: newSessions,
        items: newItems,
        total: newSessions.reduce((sum, s) => sum + s.total, 0),
      })
      return
    }

    // Update the session with new filters
    const updatedSessions = state.sessions.map((s) =>
      s.id === sessionId ? { ...s, filters: newFilters } : s,
    )
    set({ sessions: updatedSessions })
  },

  setFleetFilter: (fleet) => set({ fleetFilter: fleet }),

  setCompositionFilter: (filter) => set({ compositionFilter: filter }),

  getFilteredItems: () => {
    const { items, fleetFilter, compositionFilter } = get()
    return items.filter((item) => {
      if (fleetFilter && item.pairing.fleet !== fleetFilter) return false
      if (compositionFilter === 'full' && !item.pairing.isFull) return false
      if (compositionFilter === 'partial' && item.pairing.isFull) return false
      return true
    })
  },

  removeItem: (pairingId) => {
    set((state) => ({
      items: state.items.filter((i) => i.pairing.id !== pairingId),
      total: state.total - 1,
    }))
  },

  addItems: (pairings) => {
    if (pairings.length === 0) return
    set((state) => {
      const newItems = mapPairings(pairings)
      const authoritativeComposition = new Map(state.authoritativeComposition)
      for (const item of newItems) {
        if (!authoritativeComposition.has(item.pairing.id)) {
          authoritativeComposition.set(
            item.pairing.id,
            item.pairing.composition.map((slot) => ({ ...slot })),
          )
        }
      }
      return {
        items: mergeItems(state.items, newItems),
        authoritativeComposition,
      }
    })
  },

  refreshDraftCoverage: (baseItems, displayedItems) => {
    // Derive each pairing's composition fill directly from the EFFECTIVE roster
    // (displayedItems = baseItems + draft ops). The server's authoritative fill
    // value can lag (e.g. Pairing Info shows empty but slot.fill=1), so adding
    // a delta on top of the stale value double-counts — instead, mirror the
    // Scenario-side `computeScenarioPairingCompositions` semantics:
    //   fill = min(plan, distinct-crew-count-for-this-rank).
    // baseItems is accepted but unused — kept in the signature for callers
    // and to make the contract explicit.
    void baseItems
    const counts = (items: RosterItem[]): Map<string, number> => {
      const crewsByPairingRank = new Map<string, Set<string>>()
      for (const item of items) {
        if (item.pairingId == null) continue
        const rank = item.rosterActingRank || item.flightActingRank || item.activeRank || ''
        if (!rank) continue
        const key = `${item.pairingId}:${rank}`
        const crewIds = crewsByPairingRank.get(key) ?? new Set<string>()
        crewIds.add(item.crewId)
        crewsByPairingRank.set(key, crewIds)
      }
      return new Map([...crewsByPairingRank].map(([key, crewIds]) => [key, crewIds.size]))
    }

    const effectiveCounts = counts(displayedItems)

    set((state) => {
      const items = state.items.map((item) => {
        const composition = item.pairing.composition.map((slot) => ({
          ...slot,
          fill: Math.min(slot.plan, effectiveCounts.get(`${item.pairing.id}:${slot.rank}`) ?? 0),
        }))
        return {
          ...item,
          pairing: {
            ...item.pairing,
            composition,
            isFull: composition.every((slot) => slot.fill >= slot.plan),
          },
        }
      })
      return { items }
    })
    useGanttViewStore.getState().markDirty()
  },

  promoteDraftCoverage: () => {
    set((state) => ({
      authoritativeComposition: new Map(
        state.items.map((item) => [
          item.pairing.id,
          item.pairing.composition.map((slot) => ({ ...slot })),
        ]),
      ),
    }))
    useGanttViewStore.getState().markDirty()
  },

  hasSegments: (pairingId) => {
    const item = get().items.find((i) => i.pairing.id === pairingId)
    return item !== undefined && item.segments.length > 0
  },

  getMatchedTotal: () => {
    const { sessions } = get()
    return sessions.reduce((sum, s) => sum + s.total, 0)
  },

  getLoadedCount: () => {
    return get().items.length
  },

  getHasMore: () => {
    const { sessions, hasMore, queryMode } = get()
    if (queryMode === 'replace') {
      return hasMore
    }
    // In append mode, check if any session is not exhausted
    return sessions.some((s) => !s.exhausted)
  },
}))
