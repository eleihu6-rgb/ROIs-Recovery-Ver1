import { create } from 'zustand'
import { flightApi } from '@/services/flight-api'
import type { Flight, FlightItem, FlightCompositionStatus, DateRange, FlightFilters, FlightQuerySession, FlightListQuery } from '@/types'
import { hasFlightFilterValues, type FlightFilter } from '@/stores/filter-store'
import { usePaneStore } from './pane-store'

const formatDate = (d: Date): string => d.toISOString().slice(0, 10)
const PAGE_SIZE = 20
/** Apply Filters: send pageSize=0 so server returns all matching records without LIMIT. */
const ALL_DATA_PAGE_SIZE = 0

interface FlightStore {
  /** Flight items grouped by registration */
  items: FlightItem[]
  /** RegNo row count (after grouping / bin-pack) for the current query */
  total: number
  /** RegNo row count without facet filters */
  unfilteredTotal: number
  /** Single-leg flight count for the current query (pane badge numerator) */
  flightTotal: number
  /** Single-leg flight count without facet filters (pane badge denominator) */
  unfilteredFlightTotal: number
  page: number
  pageSize: number
  loading: boolean
  loadingMore: boolean
  /** True when more flights are available on the server */
  hasMore: boolean

  /** Query mode: replace clears items, append keeps and adds session tags */
  queryMode: 'replace' | 'append'
  /** Query session queue for append mode */
  sessions: FlightQuerySession[]
  /** Counter for generating session IDs */
  nextSessionId: number

  /** Filters specific to flight pane (legacy) */
  fleetFilter: string | null
  statusFilter: FlightCompositionStatus | 'all'

  /** Fetch flights for the current date range */
  fetchFlights: (dateRange: DateRange, filter?: FlightFilter) => Promise<void>

  /** Search with filters: replace or append based on queryMode */
  search: (filters: FlightFilters) => Promise<void>

  /** Load next page (FIFO consumption of sessions) */
  loadMore: () => Promise<void>

  /** Set query mode */
  setQueryMode: (mode: 'replace' | 'append') => void

  /** Set page */
  setPage: (page: number) => void

  /** Set fleet filter */
  setFleetFilter: (fleet: string | null) => void

  /** Set status filter */
  setStatusFilter: (status: FlightCompositionStatus | 'all') => void

  /** Get filtered items (computed) */
  getFilteredItems: () => FlightItem[]

  /** Clear all filters and sessions */
  clearFilters: () => void

  /**
   * Inject a single flight into the pane rows (Locate Flight when the flight is
   * not already loaded). Groups by registration / fleet like the list API.
   */
  upsertFlight: (flight: Flight) => void

  /** Remove a filter from a specific session */
  removeFilter: (sessionId: number, key: keyof FlightFilters) => void

  /** Computed: get total matched across all sessions */
  getMatchedTotal: () => number

  /** Computed: get loaded count */
  getLoadedCount: () => number

  /** Computed: check if any session has more data */
  getHasMore: () => boolean
}

/** Merge new items with existing, deduplicating by registration and merging sessionTags */
function mergeItems(existing: FlightItem[], newItems: FlightItem[]): FlightItem[] {
  const map = new Map<string, FlightItem>()

  // Add existing items
  for (const item of existing) {
    map.set(item.registration, { ...item, sessionTags: [...item.sessionTags] })
  }

  // Merge new items
  for (const item of newItems) {
    const existingItem = map.get(item.registration)
    if (existingItem) {
      // Merge session tags (dedupe)
      const mergedTags = new Set([...existingItem.sessionTags, ...item.sessionTags])
      map.set(item.registration, { ...item, sessionTags: [...mergedTags] })
    } else {
      map.set(item.registration, { ...item, sessionTags: [...item.sessionTags] })
    }
  }

  return [...map.values()]
}

/** Build query params from filters */
function buildQueryFromFilters(filters: FlightFilters): Partial<FlightListQuery> {
  const query: Partial<FlightListQuery> = {}
  if (filters.fltNum) query.fltNum = filters.fltNum
  if (filters.depArp) query.depArp = filters.depArp
  if (filters.arvArp) query.arvArp = filters.arvArp
  if (filters.fleet) query.fleet = filters.fleet
  if (filters.status) query.status = filters.status
  return query
}

export const useFlightStore = create<FlightStore>((set, get) => ({
  items: [],
  total: 0,
  unfilteredTotal: 0,
  flightTotal: 0,
  unfilteredFlightTotal: 0,
  page: 1,
  pageSize: PAGE_SIZE,
  loading: false,
  loadingMore: false,
  hasMore: false,
  queryMode: 'replace',
  sessions: [],
  nextSessionId: 1,
  fleetFilter: null,
  statusFilter: 'all',

  fetchFlights: async (dateRange, filter) => {
    set({ loading: true })
    try {
      const result = await flightApi.list({
        startDate: formatDate(dateRange.start),
        endDate: formatDate(dateRange.end),
        page: 1,
        pageSize: ALL_DATA_PAGE_SIZE,
        // Phase 1: pass first element of each multi-select array
        ...(filter?.depArps[0] ? { depArp: filter.depArps[0] } : {}),
        ...(filter?.arvArps[0] ? { arvArp: filter.arvArps[0] } : {}),
        ...(filter?.fltNums[0] ? { fltNum: filter.fltNums[0] } : {}),
        ...(filter?.fleets[0] ? { fleet: filter.fleets[0] } : {}),
        ...(filter?.statuses[0] ? { status: filter.statuses[0] } : {}),
      })
      const session: FlightQuerySession = {
        id: 1,
        filters: {},
        page: 1,
        total: result.total,
        exhausted: true,
      }
      // API returns grouped FlightItem, add sessionTags
      const items = result.items.map(item => ({ ...item, sessionTags: [session.id] }))
      const hasFilter = filter ? hasFlightFilterValues(filter) : false
      const flightTotal = result.flightTotal ?? items.reduce((n, it) => n + it.flights.length, 0)
      set({
        items,
        total: result.total,
        flightTotal,
        // 无筛选时徽章分母 = 当前航班条数；有筛选时由下方无筛选探针回填。
        ...(hasFilter
          ? {}
          : { unfilteredTotal: result.total, unfilteredFlightTotal: flightTotal }),
        hasMore: false,
        loading: false,
        sessions: [session],
        nextSessionId: 2,
      })
      if (hasFilter) {
        void flightApi.list({
          startDate: formatDate(dateRange.start),
          endDate: formatDate(dateRange.end),
          page: 1,
          pageSize: 1,
        })
          .then((r) => set({
            unfilteredTotal: r.total,
            unfilteredFlightTotal: r.flightTotal ?? r.total,
          }))
          .catch((err) => console.error('[FlightStore] unfiltered count error:', err))
      }
    } catch (err) {
      console.error('[FlightStore] fetch error:', err)
      set({ loading: false })
    }
  },

  search: async (filters) => {
    const state = get()
    const { queryMode, nextSessionId } = state
    const { dateRange } = usePaneStore.getState()

    if (queryMode === 'replace') {
      // Clear items and start fresh
      set({ loading: true, items: [], total: 0, flightTotal: 0, hasMore: false, sessions: [] })
      try {
        const params: FlightListQuery = {
          startDate: formatDate(dateRange.start),
          endDate: formatDate(dateRange.end),
          page: 1,
          pageSize: PAGE_SIZE,
          ...buildQueryFromFilters(filters),
        }
        const result = await flightApi.list(params)
        const session: FlightQuerySession = {
          id: nextSessionId,
          filters,
          page: 1,
          total: result.total,
          exhausted: result.items.length < PAGE_SIZE,
        }
        // API returns grouped FlightItem, add sessionTags
        const items = result.items.map(item => ({ ...item, sessionTags: [session.id] }))
        const flightTotal = result.flightTotal ?? items.reduce((n, it) => n + it.flights.length, 0)
        set({
          items,
          total: result.total,
          flightTotal,
          hasMore: result.items.length < result.total,
          loading: false,
          sessions: [session],
          nextSessionId: nextSessionId + 1,
        })
      } catch (err) {
        console.error('[FlightStore] search error:', err)
        set({ loading: false })
      }
    } else {
      // Append mode: keep existing items, add new session
      set({ loading: true })
      try {
        const params: FlightListQuery = {
          startDate: formatDate(dateRange.start),
          endDate: formatDate(dateRange.end),
          page: 1,
          pageSize: PAGE_SIZE,
          ...buildQueryFromFilters(filters),
        }
        const result = await flightApi.list(params)
        const session: FlightQuerySession = {
          id: nextSessionId,
          filters,
          page: 1,
          total: result.total,
          exhausted: result.items.length < PAGE_SIZE,
        }
        // API returns grouped FlightItem, add sessionTags
        const newItems = result.items.map(item => ({ ...item, sessionTags: [session.id] }))
        // Use get() after await to avoid race conditions
        const mergedItems = mergeItems(get().items, newItems)
        const currentState = get()
        const newTotal = currentState.sessions.reduce((sum, s) => sum + s.total, 0) + result.total
        const sessionFlightTotal = result.flightTotal ?? newItems.reduce((n, it) => n + it.flights.length, 0)
        set({
          items: mergedItems,
          total: newTotal,
          flightTotal: currentState.flightTotal + sessionFlightTotal,
          hasMore: true, // In append mode, we always check hasMore via getHasMore()
          loading: false,
          sessions: [...currentState.sessions, session],
          nextSessionId: nextSessionId + 1,
        })
      } catch (err) {
        console.error('[FlightStore] search error:', err)
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
        const params: FlightListQuery = {
          startDate: formatDate(dateRange.start),
          endDate: formatDate(dateRange.end),
          page: nextPage,
          pageSize: PAGE_SIZE,
          ...buildQueryFromFilters(session.filters),
        }
        const result = await flightApi.list(params)
        // API returns grouped FlightItem, add sessionTags
        const newItems = result.items.map(item => ({ ...item, sessionTags: [session.id] }))
        // Use get() after await to avoid race conditions
        const allItems = mergeItems(get().items, newItems)
        const updatedSession: FlightQuerySession = {
          ...session,
          page: nextPage,
          exhausted: result.items.length < PAGE_SIZE,
        }
        set({
          items: allItems,
          total: result.total,
          flightTotal: result.flightTotal ?? get().flightTotal,
          hasMore: result.items.length >= PAGE_SIZE,
          loadingMore: false,
          sessions: [updatedSession],
        })
      } catch (err) {
        console.error('[FlightStore] loadMore error:', err)
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
      const params: FlightListQuery = {
        startDate: formatDate(dateRange.start),
        endDate: formatDate(dateRange.end),
        page: nextPage,
        pageSize: PAGE_SIZE,
        ...buildQueryFromFilters(activeSession.filters),
      }
      const result = await flightApi.list(params)
      // API returns grouped FlightItem, add sessionTags
      const newItems = result.items.map(item => ({ ...item, sessionTags: [activeSession.id] }))
      // Use get() after await to avoid race conditions
      const allItems = mergeItems(get().items, newItems)

      // Update session state - use actual response count for exhaustion
      const updatedSessions = get().sessions.map((s) =>
        s.id === activeSession.id ? { ...s, page: nextPage, exhausted: result.items.length < PAGE_SIZE } : s,
      )

      set({
        items: allItems,
        loadingMore: false,
        sessions: updatedSessions,
      })
    } catch (err) {
      console.error('[FlightStore] loadMore error:', err)
      set({ loadingMore: false })
    }
  },

  setQueryMode: (mode) => set({ queryMode: mode }),

  setPage: (page) => set({ page }),

  setFleetFilter: (fleet) => set({ fleetFilter: fleet }),

  setStatusFilter: (status) => set({ statusFilter: status }),

  getFilteredItems: () => {
    const { items, fleetFilter } = get()
    return items.filter((item) => {
      if (fleetFilter && item.fleet !== fleetFilter) return false
      return true
    })
  },

  clearFilters: () => {
    set({
      sessions: [],
      items: [],
      total: 0,
      flightTotal: 0,
      hasMore: false,
    })
  },

  upsertFlight: (flight) => {
    const reg = (flight.register?.trim() || flight.fleet || String(flight.id)).toUpperCase()
    set((state) => {
      const existingIdx = state.items.findIndex(
        (row) => row.flights.some((f) => f.id === flight.id) || row.registration.toUpperCase() === reg,
      )
      if (existingIdx >= 0) {
        const row = state.items[existingIdx]
        const flights = row.flights.some((f) => f.id === flight.id)
          ? row.flights.map((f) => (f.id === flight.id ? flight : f))
          : [...row.flights, flight]
        const next = [...state.items]
        next[existingIdx] = { ...row, flights, fleet: row.fleet || flight.fleet }
        return { items: next }
      }
      const item: FlightItem = {
        registration: reg,
        fleet: flight.fleet,
        flights: [flight],
        isFleetGrouped: !flight.register?.trim(),
        sessionTags: [],
      }
      return { items: [item, ...state.items] }
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