import { useCallback, useEffect, useRef, useState } from 'react'
import { flightApi } from '@/services/flight-api'
import { publicConfigService } from '@/services/public-config-service'
import { useFlightStore } from '@/stores/flight-store'
import { useFilterStore } from '@/stores/filter-store'
import { useAuthStore } from '@/stores/auth-store'
import { notify } from '@/utils/notify'
import type { Flight } from '@/types'
import type { NaviRow } from './flight-navi-filters'

const formatDate = (d: Date): string => d.toISOString().slice(0, 10)

/** Backend caps the flight list at 50 registration groups per page. */
const PAGE_SIZE = 50
/** Safety bound on page-through (50 groups × 200 ≈ 10k registrations). */
const MAX_PAGES = 200

/**
 * In-session cache of computed rows keyed by date range. Lets reopening the dialog (same
 * range) paint instantly from memory instead of re-fetching + re-deriving every time. It is
 * revalidated in the background (stale-while-revalidate) so edits made elsewhere still show.
 */
const rowCache = new Map<string, NaviRow[]>()

/** Fetch every flight in the range. Page 1 reveals the group total; remaining pages (rare —
 *  usually there is only one) are fetched in parallel rather than sequentially. */
const fetchAllFlights = async (startDate: string, endDate: string): Promise<Flight[]> => {
  const first = await flightApi.list({ startDate, endDate, page: 1, pageSize: PAGE_SIZE })
  const items = [...first.items]
  const pages = Math.min(MAX_PAGES, Math.ceil(first.total / PAGE_SIZE))
  if (pages > 1) {
    const rest = await Promise.all(
      Array.from({ length: pages - 1 }, (_, i) =>
        flightApi.list({ startDate, endDate, page: i + 2, pageSize: PAGE_SIZE })),
    )
    for (const r of rest) items.push(...r.items)
  }
  return items.flatMap((item) => item.flights)
}

/** Flight list, local-first: Apply background-loads the full flight list into flight-store,
 *  so reuse it (zero round-trips) and only page the server when it isn't loaded yet. */
const getFlights = async (startDate: string, endDate: string): Promise<Flight[]> => {
  const local = useFlightStore.getState().items.flatMap((it) => it.flights)
  return local.length > 0 ? local : fetchAllFlights(startDate, endDate)
}

const buildRows = async (startDate: string, endDate: string): Promise<NaviRow[]> => {
  // Flight LIST comes from the loaded store (local-first); the per-flight pairing/crew
  // COUNTS are not derivable in the browser (see note below) so they stay a server call.
  const [flights, { counts }] = await Promise.all([
    getFlights(startDate, endDate),
    flightApi.naviCounts(startDate, endDate),
  ])
  const countByFlt = new Map(counts.map((c) => [c.fltId, c]))
  return flights.map((flight) => {
    const c = countByFlt.get(flight.id)
    return { flight, pairingCount: c?.pairingCount ?? 0, crewCount: c?.crewCount ?? 0 }
  })
}

/**
 * Loads the flights for the current Gantt date range together with their per-flight pairing
 * & crew counts. Serves a cached result instantly on reopen (revalidating in the background);
 * the first load fetches flights and counts in parallel.
 *
 * Counts come from a batched endpoint (two GROUP BY aggregates server-side, not N+1): the
 * flight→pairing link lives in pairing_segment.flt_id and the flight→crew link in
 * roster_flight.flt_id, neither of which is present in the client-loaded pairing list or
 * roster pane view — so they cannot be derived in the browser.
 *
 * @param open  Fetch only while the dialog is open; revalidates when it (re)opens.
 */
export const useFlightNaviData = (open: boolean): {
  rows: NaviRow[]
  loading: boolean
  homeAirline: string
  reload: () => void
} => {
  const [rows, setRows] = useState<NaviRow[]>([])
  const [loading, setLoading] = useState(false)
  const reqSeq = useRef(0)

  const homeAirline = (
    useAuthStore.getState().user?.schema ?? publicConfigService.getDefaultAirlineCached() ?? '--'
  ).toUpperCase()

  const load = useCallback(async (force = false) => {
    const { dateRange } = useFilterStore.getState()
    const startDate = formatDate(dateRange.start)
    const endDate = formatDate(dateRange.end)
    const key = `${startDate}:${endDate}`
    const seq = ++reqSeq.current

    // Stale-while-revalidate: paint the cached rows immediately, then refresh in background.
    const cached = rowCache.get(key)
    if (cached && !force) {
      setRows(cached)
      setLoading(false)
    } else {
      setLoading(true)
    }

    try {
      const fresh = await buildRows(startDate, endDate)
      if (seq !== reqSeq.current) return // superseded by a newer open/reload
      rowCache.set(key, fresh)
      setRows(fresh)
    } catch {
      if (seq === reqSeq.current && !cached) {
        notify.error('Failed to load flights')
        setRows([])
      }
    } finally {
      if (seq === reqSeq.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) void load()
  }, [open, load])

  return { rows, loading, homeAirline, reload: () => void load(true) }
}
