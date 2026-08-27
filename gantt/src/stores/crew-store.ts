import { create } from 'zustand'
import { crewApi } from '@/services/crew-api'
import { useFilterStore } from '@/stores/filter-store'
import type { CrewQualSummary } from '@/services/crew-api'
import type { Crew, CrewDetail, CrewInfo, CrewListFilters, CrewFilters, CrewQuerySession, CrewItem, CrewListResponse, CrewStats } from '@/types'

const PAGE_SIZE = 100
/** Apply Filters: send pageSize=0 so server returns all matching records without LIMIT. */
const ALL_DATA_PAGE_SIZE = 0

/** 当前 Gantt 窗口（RP±7d），作为 crew 有效性的 dateRange 参数——所有 crew list 调用都必须携带，
 * 否则后端全局 rank/base 有效性门槛会退化为 [today, today]。 */
const currentDateRangeParams = (): Pick<CrewListFilters, 'dateRangeStart' | 'dateRangeEnd'> => {
  const { start, end } = useFilterStore.getState().dateRange
  return {
    dateRangeStart: start.toISOString().slice(0, 10),
    dateRangeEnd: end.toISOString().slice(0, 10),
  }
}

interface CrewStore {
  /** Crew items with session tags (grows as user scrolls, deduped by crew.crewId) */
  items: CrewItem[]
  /** Total count from backend (for current session in replace mode) */
  total: number
  /** Total without filters (for badge showing filtered count) */
  unfilteredTotal: number
  loading: boolean
  loadingMore: boolean
  /** True when more crews are available on the server */
  hasMore: boolean

  /** Query mode: replace clears items, append keeps and adds session tags */
  queryMode: 'replace' | 'append'
  /** Query session queue for append mode */
  sessions: CrewQuerySession[]
  /** Counter for generating session IDs */
  nextSessionId: number
  /** Global sort column */
  sortBy: CrewListFilters['sortBy']
  /** Global sort order */
  sortOrder: CrewListFilters['sortOrder']

  /** Legacy filters for backwards compatibility */
  filters: CrewListFilters

  /** Active global filter set by fetchCrewsWithFilter — reused for loadMore pagination. Null means no global filter. */
  activeGlobalFilter: {
    divisions?: string[]
    bases?: string[]
    ranks?: string[]
    fleets?: string[]
    dateRangeStart: string
    dateRangeEnd: string
  } | null

  /** Selected crew IDs for Gantt display */
  selectedCrewIds: string[]

  /** Crew detail cache */
  detailCache: Map<number, CrewDetail>

  /** Fetch crews (no date range), sets unfilteredTotal. opts.pageSize: 0 (default) = full
   *  load; a positive value = windowed first page (server-sorted by the current sort).
   *  opts.onProgress: per-batch progress callback (0-15 during crew phase) so the roster
   *  progress bar moves while crews load, not just during the roster batches. */
  fetchCrews: (opts?: { pageSize?: number; onProgress?: (p: number) => void }) => Promise<void>

  /** True once the COMPLETE crew set is loaded. False during windowed first-paint, while
   *  the background full load is still in flight. Client-side sort needs the full set. */
  fullyLoaded: boolean
  /** Mark windowed first-paint started (full set not yet loaded). */
  markPartiallyLoaded: () => void
  /** Mark the full crew set loaded; resolves any whenFullyLoaded() waiters. */
  markFullyLoaded: () => void
  /** Resolves when the full crew set is loaded (immediately if already loaded). */
  whenFullyLoaded: () => Promise<void>

  /** 用一页 slim crew 结果填充 store（fetchCrews 与首屏 bootstrap 共用），并后台补拉全量历史。 */
  applyCrewListResult: (result: CrewListResponse) => void

  /** Search with filters: replace or append based on queryMode */
  search: (filters: CrewFilters) => Promise<void>

  /** Load next page (FIFO consumption of sessions) */
  loadMore: () => Promise<void>

  /** Apply new sort order, re-execute all searches */
  applySort: (sortBy: CrewListFilters['sortBy'], sortOrder: CrewListFilters['sortOrder']) => Promise<void>

  /** Set query mode */
  setQueryMode: (mode: 'replace' | 'append') => void

  /** Clear all filters and sessions */
  clearFilters: () => void

  /** Remove a filter from a specific session */
  removeFilter: (sessionId: number, key: keyof CrewFilters) => void

  /** Legacy: Set filters (backwards compatibility) */
  setFilters: (filters: Partial<CrewListFilters>) => void

  /** Legacy: Set page (backwards compatibility) */
  setPage: (page: number) => void

  selectCrews: (crewIds: string[]) => void
  toggleCrewSelection: (crewId: string) => void
  fetchCrewDetail: (id: number) => Promise<CrewDetail | null>

  /** Get quals for a crew from inline list data */
  getQuals: (crewId: string) => CrewQualSummary | undefined

  /** Re-fetch crew list using global filter (divisions/bases/ranks/fleets arrays + date range).
   *  Replaces current items and selectedCrewIds. Does NOT update unfilteredTotal. */
  fetchCrewsWithFilter: (
    filter: { divisions: string[]; bases: string[]; ranks: string[]; fleets: string[] },
    dateRange: { start: Date; end: Date },
  ) => Promise<void>

  /** Hydrate a specific set of crew by ID into `items` (merge, not replace) — used by
   *  Find Crew so brought-in rows have Base/SEN/Fleet. Loads slim panel fields first,
   *  then background-loads full history. Leaves selectedCrewIds untouched. */
  fetchCrewsByIds: (crewIds: string[]) => Promise<void>

  /** Remove a crew from local state (after delete) */
  removeItem: (crewId: string) => void

  /** Manday stats for the CURRENT viewport month: crewId → CrewStats (drives display). */
  crewStatsMap: Map<string, CrewStats>
  /** Year-month currently represented by crewStatsMap. */
  crewStatsYearMonth: string | null

  /** Per-month stats cache, keyed `${crewId}:${yearMonth}`. Lets revisiting an already
   *  loaded month skip the round-trip (matters on the high-latency Asia↔Canada link).
   *  Cleared on roster commit via clearCrewStatsCache(). */
  crewStatsByMonth: Map<string, CrewStats>

  /** Load manday stats for the given crew IDs and yearMonth (YYYY-MM). */
  loadCrewStats: (crewIds: string[], yearMonth: string) => Promise<void>

  /** Drop the per-month stats cache (call after a roster mutation/commit invalidates stats). */
  clearCrewStatsCache: () => void

  /** Computed: get total matched across all sessions */
  getMatchedTotal: () => number

  /** Computed: get loaded count */
  getLoadedCount: () => number

  /** Computed: check if any session has more data */
  getHasMore: () => boolean
}

function compareCrewItems(a: CrewItem, b: CrewItem, sortBy: string, sortOrder: string): number {
  const dir = sortOrder === 'desc' ? -1 : 1
  switch (sortBy) {
    case 'name':
      return dir * (a.crew.lastName ?? '').localeCompare(b.crew.lastName ?? '')
    case 'rank':
      return dir * (a.crew.panelRank ?? a.crew.ranks?.[0]?.rank ?? '').localeCompare(
        b.crew.panelRank ?? b.crew.ranks?.[0]?.rank ?? '',
      )
    case 'base':
      return dir * (a.crew.panelBase ?? a.crew.bases?.[0]?.base ?? '').localeCompare(
        b.crew.panelBase ?? b.crew.bases?.[0]?.base ?? '',
      )
    case 'fleet':
      return dir * (a.crew.panelFleets?.[0] ?? a.crew.fleets?.[0]?.fleetSpecific ?? '').localeCompare(
        b.crew.panelFleets?.[0] ?? b.crew.fleets?.[0]?.fleetSpecific ?? '',
      )
    case 'crew_id':
    default:
      return dir * a.crew.crewId.localeCompare(b.crew.crewId)
  }
}

/** Map raw crew data to CrewItems with session tags */
function mapCrews(rawItems: Crew[], sessionTags: number[] = []): CrewItem[] {
  return rawItems.map((crew) => ({
    crew,
    sessionTags,
  }))
}

/** Merge new items with existing, deduplicating by crew.crewId and merging sessionTags */
function mergeItems(existing: CrewItem[], newItems: CrewItem[]): CrewItem[] {
  const map = new Map<string, CrewItem>()

  // Add existing items
  for (const item of existing) {
    map.set(item.crew.crewId, { ...item, sessionTags: [...item.sessionTags] })
  }

  // Merge new items
  for (const item of newItems) {
    const existingItem = map.get(item.crew.crewId)
    if (existingItem) {
      // Merge session tags (dedupe)
      const mergedTags = new Set([...existingItem.sessionTags, ...item.sessionTags])
      map.set(item.crew.crewId, { ...item, sessionTags: [...mergedTags] })
    } else {
      map.set(item.crew.crewId, { ...item, sessionTags: [...item.sessionTags] })
    }
  }

  return [...map.values()]
}

/** Build query params from CrewFilters */
function buildQueryFromFilters(filters: CrewFilters): Partial<CrewListFilters & CrewFilters> {
  const query: Partial<CrewListFilters & CrewFilters> = {}
  if (filters.empCode) query.empCode = filters.empCode
  if (filters.name) query.name = filters.name
  if (filters.rank) query.rank = filters.rank
  if (filters.base) query.base = filters.base
  if (filters.fleet) query.fleet = filters.fleet
  return query
}

// Deferred used by whenFullyLoaded() so sort can await the background full load.
let crewFullLoadDeferred: { promise: Promise<void>; resolve: () => void } | null = null
const newDeferred = (): { promise: Promise<void>; resolve: () => void } => {
  let resolve!: () => void
  const promise = new Promise<void>((r) => { resolve = r })
  return { promise, resolve }
}

export const useCrewStore = create<CrewStore>((set, get) => ({
  items: [],
  fullyLoaded: true,
  total: 0,
  unfilteredTotal: 0,
  loading: false,
  loadingMore: false,
  hasMore: false,
  queryMode: 'replace',
  sessions: [],
  nextSessionId: 1,
  sortBy: 'crew_id',
  sortOrder: 'asc',
  filters: {},
  activeGlobalFilter: null,
  selectedCrewIds: [],
  detailCache: new Map(),
  crewStatsMap: new Map(),
  crewStatsYearMonth: null,
  crewStatsByMonth: new Map(),

  fetchCrews: async (opts) => {
    set({ loading: true })
    try {
      const pageSize = opts?.pageSize ?? ALL_DATA_PAGE_SIZE
      // Full load (pageSize=0) is batched by crewId: the full response now inlines
      // qual/cert/team history (~12MB for 817 crew) and must not be one giant request.
      // A failing batch recursively halves and retries (same pattern as roster).
      if (pageSize === 0) {
        const count = await crewApi.list({ page: 1, pageSize: 1, ...currentDateRangeParams() })
        const total = count.total
        const BATCH = 200
        // Lightweight crew-id fetch (slim list, no history) to slice into batches, then
        // fetch each batch fully (full list inlines qual/cert/team history). A failing
        // batch recursively halves and retries (same pattern as roster).
        const slim = await crewApi.list({ page: 1, pageSize: 0, ...currentDateRangeParams() }, 'gantt-panel')
        const ids = slim.items.map((c) => c.crewId)
        const batches: string[][] = []
        for (let i = 0; i < ids.length; i += BATCH) batches.push(ids.slice(i, i + BATCH))
        const fetchChunk = async (chunk: string[]): Promise<Crew[]> => {
          try {
            const r = await crewApi.list({ crewIds: chunk, page: 1, pageSize: 0, ...currentDateRangeParams() })
            return r.items
          } catch (err) {
            if (chunk.length <= 1) {
              console.warn('[CrewStore] crew chunk permanently failed:', err)
              return []
            }
            const mid = Math.ceil(chunk.length / 2)
            const [left, right] = await Promise.all([fetchChunk(chunk.slice(0, mid)), fetchChunk(chunk.slice(mid))])
            return [...left, ...right]
          }
        }
        // fetchChunk recurses/halves on failure and never rejects (returns [] for
        // permanently-failed chunks), so every batch fulfills. Report progress per batch
        // as it completes so the roster bar moves during the crew phase (0→15).
        // Use a monotonic counter — concurrent completion order varies, so indexing by
        // batch would make the bar jump backwards.
        let completedCrew = 0
        const results = await Promise.all(
          batches.map(async (batch) => {
            const items = await fetchChunk(batch)
            completedCrew += 1
            opts?.onProgress?.(Math.round((completedCrew / batches.length) * 15))
            return items
          }),
        )
        const merged = new Map<string, Crew>()
        for (const items of results) {
          for (const c of items) merged.set(c.crewId, c)
        }
        const allCrews = [...merged.values()]
        set({
          items: mapCrews(allCrews, [1]),
          total,
          unfilteredTotal: total,
          hasMore: false,
          loading: false,
          sessions: [{ id: 1, filters: {}, page: 1, total, exhausted: true }],
          nextSessionId: 2,
          activeGlobalFilter: null,
          selectedCrewIds: allCrews.map((c) => c.crewId),
        })
        return
      }
      const params: CrewListFilters & CrewFilters = {
        page: 1,
        pageSize,
        // Windowed first page (pageSize>0): ask the server to sort by the current sort so
        // the first N rows are the correct top-N. Full load (pageSize=0) sorts client-side.
        ...(pageSize > 0 ? { sortBy: get().sortBy, sortOrder: get().sortOrder } : {}),
        ...currentDateRangeParams(),
      }
      const result = await crewApi.list(params)
      get().applyCrewListResult(result)
    } catch (err) {
      console.error('[CrewStore] fetch error:', err)
      set({ loading: false })
    }
  },

  markPartiallyLoaded: () => {
    if (get().fullyLoaded) crewFullLoadDeferred = newDeferred()
    set({ fullyLoaded: false })
  },
  markFullyLoaded: () => {
    set({ fullyLoaded: true })
    crewFullLoadDeferred?.resolve()
    crewFullLoadDeferred = null
  },
  whenFullyLoaded: () => (get().fullyLoaded ? Promise.resolve() : (crewFullLoadDeferred?.promise ?? Promise.resolve())),

  applyCrewListResult: (result) => {
    const session: CrewQuerySession = {
      id: 1,
      filters: {},
      page: 1,
      total: result.total,
      exhausted: true,
    }
    const items = mapCrews(result.items, [session.id])
    const crewIds = result.items.map((c) => c.crewId)
    set({
      items,
      total: result.total,
      unfilteredTotal: result.total,
      hasMore: false,
      loading: false,
      sessions: [session],
      nextSessionId: 2,
      activeGlobalFilter: null,
      selectedCrewIds: crewIds,
    })
  },

  search: async (filters) => {
    const state = get()
    const { queryMode, nextSessionId, sortBy, sortOrder } = state

    if (queryMode === 'replace') {
      // Clear items and start fresh
      set({ loading: true, items: [], total: 0, hasMore: false, sessions: [], selectedCrewIds: [] })
      try {
        const params: CrewListFilters & CrewFilters = {
          page: 1,
          pageSize: PAGE_SIZE,
          sortBy,
          sortOrder,
          ...buildQueryFromFilters(filters),
        }
        const result = await crewApi.list(params)
        const session: CrewQuerySession = {
          id: nextSessionId,
          filters,
          page: 1,
          total: result.total,
          exhausted: result.items.length < PAGE_SIZE,
        }
        const items = mapCrews(result.items, [session.id])
        const crewIds = result.items.map((c) => c.crewId)
        set({
          items,
          total: result.total,
          hasMore: result.items.length < result.total,
          loading: false,
          sessions: [session],
          nextSessionId: nextSessionId + 1,
          selectedCrewIds: crewIds,
        })
      } catch (err) {
        console.error('[CrewStore] search error:', err)
        set({ loading: false })
      }
    } else {
      // Append mode: keep existing items, add new session
      set({ loading: true })
      try {
        const params: CrewListFilters & CrewFilters = {
          page: 1,
          pageSize: PAGE_SIZE,
          sortBy,
          sortOrder,
          ...buildQueryFromFilters(filters),
        }
        const result = await crewApi.list(params)
        const session: CrewQuerySession = {
          id: nextSessionId,
          filters,
          page: 1,
          total: result.total,
          exhausted: result.items.length < PAGE_SIZE,
        }
        const newItems = mapCrews(result.items, [session.id])
        // Use get() after await to avoid race conditions
        const mergedItems = mergeItems(get().items, newItems)
        const currentState = get()
        const newTotal = currentState.sessions.reduce((sum, s) => sum + s.total, 0) + result.total
        // Add new crewIds to selectedCrewIds
        const existingIds = new Set(currentState.selectedCrewIds)
        const newCrewIds = result.items.map((c) => c.crewId).filter((id) => !existingIds.has(id))
        set({
          items: mergedItems,
          total: newTotal,
          hasMore: true, // In append mode, we always check hasMore via getHasMore()
          loading: false,
          sessions: [...currentState.sessions, session],
          nextSessionId: nextSessionId + 1,
          selectedCrewIds: [...currentState.selectedCrewIds, ...newCrewIds],
        })
      } catch (err) {
        console.error('[CrewStore] search error:', err)
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
      const nextPage = session.page + 1

      set({ loadingMore: true })
      try {
        const globalFilter = get().activeGlobalFilter
        const params: CrewListFilters & CrewFilters = {
          page: nextPage,
          pageSize: PAGE_SIZE,
          sortBy: get().sortBy,
          sortOrder: get().sortOrder,
          ...buildQueryFromFilters(session.filters),
          ...(globalFilter ?? { ...currentDateRangeParams() }),
        }
        const result = await crewApi.list(params)
        const newItems = mapCrews(result.items, [session.id])
        // Use get() after await to avoid race conditions
        const allItems = mergeItems(get().items, newItems)
        // Add new crewIds to selectedCrewIds
        const existingIds = new Set(get().selectedCrewIds)
        const newCrewIds = result.items.map((c) => c.crewId)
        const allCrewIds = [...get().selectedCrewIds, ...newCrewIds.filter((id) => !existingIds.has(id))]
        const updatedSession: CrewQuerySession = {
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
          selectedCrewIds: allCrewIds,
        })
      } catch (err) {
        console.error('[CrewStore] loadMore error:', err)
        set({ loadingMore: false })
      }
      return
    }

    // Append mode: FIFO consumption of sessions
    // Find first non-exhausted session
    const activeSession = state.sessions.find((s) => !s.exhausted)
    if (!activeSession) return

    const nextPage = activeSession.page + 1

    set({ loadingMore: true })
    try {
      const params: CrewListFilters & CrewFilters = {
        page: nextPage,
        pageSize: PAGE_SIZE,
        sortBy: get().sortBy,
        sortOrder: get().sortOrder,
        ...buildQueryFromFilters(activeSession.filters),
        ...currentDateRangeParams(),
      }
      const result = await crewApi.list(params)
      const newItems = mapCrews(result.items, [activeSession.id])
      // Use get() after await to avoid race conditions
      const allItems = mergeItems(get().items, newItems)

      // Update session state - use actual response count for exhaustion
      const updatedSessions = get().sessions.map((s) =>
        s.id === activeSession.id
          ? { ...s, page: nextPage, exhausted: result.items.length < PAGE_SIZE }
          : s,
      )

      // Add new crewIds to selectedCrewIds
      const currentState = get()
      const existingIds = new Set(currentState.selectedCrewIds)
      const newCrewIds = result.items.map((c) => c.crewId).filter((id) => !existingIds.has(id))

      set({
        items: allItems,
        loadingMore: false,
        sessions: updatedSessions,
        selectedCrewIds: [...currentState.selectedCrewIds, ...newCrewIds],
      })
    } catch (err) {
      console.error('[CrewStore] loadMore error:', err)
      set({ loadingMore: false })
    }
  },

  applySort: async (sortBy, sortOrder) => {
    if (get().sortBy === sortBy && get().sortOrder === sortOrder) return
    set({ sortBy, sortOrder })
    // Client-side sort needs the COMPLETE set; during windowed first-paint wait for the
    // background full load to finish so we never sort a partial list into a wrong order.
    if (!get().fullyLoaded) await get().whenFullyLoaded()
    const sorted = [...get().items].sort((a, b) => compareCrewItems(a, b, sortBy ?? 'crew_id', sortOrder ?? 'asc'))
    set({ items: sorted })
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

  setFilters: (filters) => {
    set((state) => ({ filters: { ...state.filters, ...filters } }))
  },

  setPage: (_page: number) => {
    // Legacy pagination no longer used with session-based approach
  },

  selectCrews: (crewIds) => {
    set({ selectedCrewIds: crewIds })
  },

  fetchCrewsByIds: async (crewIds) => {
    const ids = [...new Set(crewIds.filter(Boolean))]
    if (ids.length === 0) return
    const params: CrewListFilters & CrewFilters = {
      page: 1,
      pageSize: Math.max(PAGE_SIZE, ids.length),
      crewIds: ids,
      sortBy: get().sortBy,
      sortOrder: get().sortOrder,
      ...currentDateRangeParams(),
    }
    try {
      // Phase 1: slim panel fields (panelBase/panelFleets/seniorityNum) — merged, not replaced.
      const slim = await crewApi.list(params, 'gantt-panel')
      set((s) => ({ items: mergeItems(s.items, mapCrews(slim.items, [])) }))
      // Phase 2: full history (date-effective ranks/bases/fleets) in the background.
      void crewApi.list(params)
        .then((full) => set((s) => ({ items: mergeItems(s.items, mapCrews(full.items, [])) })))
        .catch((err) => console.error('[CrewStore] fetchCrewsByIds history error:', err))
    } catch (err) {
      console.error('[CrewStore] fetchCrewsByIds error:', err)
    }
  },

  toggleCrewSelection: (crewId) => {
    set((state) => {
      const exists = state.selectedCrewIds.includes(crewId)
      return {
        selectedCrewIds: exists
          ? state.selectedCrewIds.filter((id) => id !== crewId)
          : [...state.selectedCrewIds, crewId],
      }
    })
  },

  fetchCrewDetail: async (id) => {
    const cached = get().detailCache.get(id)
    if (cached) return cached

    try {
      const detail = await crewApi.getDetail(id)
      set((state) => {
        const newCache = new Map(state.detailCache)
        newCache.set(id, detail)
        return { detailCache: newCache }
      })
      return detail
    } catch {
      return null
    }
  },

  getQuals: (crewId) => {
    const item = get().items.find((c) => c.crew.crewId === crewId)
    return item?.crew.quals
  },

  fetchCrewsWithFilter: async (filter, dateRange) => {
    set({ loading: true })
    try {
      const params: CrewListFilters = {
        page: 1,
        pageSize: ALL_DATA_PAGE_SIZE,
        divisions: filter.divisions.length > 0 ? filter.divisions : undefined,
        bases: filter.bases.length > 0 ? filter.bases : undefined,
        ranks: filter.ranks.length > 0 ? filter.ranks : undefined,
        fleets: filter.fleets.length > 0 ? filter.fleets : undefined,
        dateRangeStart: dateRange.start.toISOString().slice(0, 10),
        dateRangeEnd: dateRange.end.toISOString().slice(0, 10),
      }
      const result = await crewApi.list(params)
      const session: CrewQuerySession = { id: 1, filters: {}, page: 1, total: result.total, exhausted: true }
      const items = mapCrews(result.items, [session.id])
      const crewIds = result.items.map((c) => c.crewId)
      const activeGlobalFilter = {
        divisions: params.divisions,
        bases: params.bases,
        ranks: params.ranks,
        fleets: params.fleets,
        dateRangeStart: params.dateRangeStart!,
        dateRangeEnd: params.dateRangeEnd!,
      }
      set({
        items,
        total: result.total,
        hasMore: false,
        loading: false,
        sessions: [session],
        nextSessionId: 2,
        activeGlobalFilter,
        selectedCrewIds: crewIds,
      })
      // 总数回填：面板徽标显示 filtered/total，而 unfilteredTotal 只在无筛选拉取时
      // 写入 —— 会话首次拉取就带筛选时它会停留在 0。这里用 pageSize=1 的纯计数
      // 查询后台补齐，不阻塞主数据加载。
      void crewApi.list({ page: 1, pageSize: 1, ...currentDateRangeParams() })
        .then((r) => set({ unfilteredTotal: r.total }))
        .catch((err) => console.error('[CrewStore] unfiltered count error:', err))
    } catch (err) {
      console.error('[CrewStore] fetchCrewsWithFilter error:', err)
      set({ loading: false })
    }
  },

  removeItem: (crewId) => {
    set((state) => ({
      items: state.items.filter((i) => i.crew.crewId !== crewId),
      total: state.total - 1,
    }))
  },

  loadCrewStats: async (crewIds, yearMonth) => {
    if (crewIds.length === 0) return
    const cacheKey = (id: string): string => `${id}:${yearMonth}`
    set((state) => {
      const next = new Map(state.crewStatsMap)
      for (const id of crewIds) {
        const hit = state.crewStatsByMonth.get(cacheKey(id))
        if (hit) next.set(id, hit)
        else next.delete(id)
      }
      return { crewStatsMap: next, crewStatsYearMonth: yearMonth }
    })

    const cache = get().crewStatsByMonth
    const missing = crewIds.filter((id) => !cache.has(cacheKey(id)))

    if (missing.length === 0) return

    try {
      const statsMap = await crewApi.getCrewStats(missing, yearMonth)
      set((state) => {
        const next = new Map(state.crewStatsMap)
        const byMonth = new Map(state.crewStatsByMonth)
        for (const [id, stats] of Object.entries(statsMap)) {
          byMonth.set(`${id}:${yearMonth}`, stats)
          if (state.crewStatsYearMonth === yearMonth) next.set(id, stats)
        }
        return { crewStatsMap: next, crewStatsByMonth: byMonth }
      })
    } catch (err) {
      console.error('[CrewStore] loadCrewStats error:', err)
    }
  },

  clearCrewStatsCache: () => set({ crewStatsByMonth: new Map() }),

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

/**
 * CrewInfo 数据组装：全部 6 类历史（ranks/bases/fleets + qual/cert/team）都随全量 crew 列表
 * 内联到 store，直接本地读，零后端请求。store 未命中或 crew 是 slim（Find Crew 用 gantt-panel，
 * 不带历史数组）时回退 crewApi.getInfo 全量。
 */
export const crewInfoFromStore = async (crewId: string): Promise<CrewInfo> => {
  const item = useCrewStore.getState().items.find((i) => i.crew.crewId === crewId)
  if (!item) return crewApi.getInfo(crewId)
  const crew = item.crew
  // Full list mode inlines all six history arrays; slim (gantt-panel) only has
  // panelRank/panelBase/panelFleets. Fall back to the backend when the crew was
  // loaded slim (no ranks array) so CrewInfo still shows full history.
  if (crew.ranks === undefined) return crewApi.getInfo(crewId)
  return {
    crew,
    ranks: crew.ranks ?? [],
    bases: crew.bases ?? [],
    fleets: crew.fleets ?? [],
    qualifications: crew.qualifications ?? [],
    certifications: crew.certifications ?? [],
    teams: crew.teams ?? [],
  }
}
