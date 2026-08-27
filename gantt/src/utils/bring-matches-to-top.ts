import { pairingApi } from '@/services/pairing-api'
import { flightApi } from '@/services/flight-api'
import { useCrewStore } from '@/stores/crew-store'
import { useRosterStore } from '@/stores/roster-store'
import { usePairingStore, pairingFilterToListParams } from '@/stores/pairing-store'
import { useFlightStore } from '@/stores/flight-store'
import { usePaneStore } from '@/stores/pane-store'
import { useLayoutStore } from '@/stores/layout-store'
import { useFilterStore } from '@/stores/filter-store'
import { ALL_COVERAGE } from '@/utils/pairing-coverage'
import { useGanttViewStore } from '@/stores/gantt-view-store'
import { timeToX } from '@/components/gantt/gantt-utils'
import { notify } from '@/utils/notify'
import type { PaneType } from '@/types'

const MS_PER_DAY = 24 * 60 * 60 * 1000
/** Days of context to keep on either side when jumping the timeline to an off-range target. */
const JUMP_CONTEXT_DAYS = 2

const dayStartUtc = (ms: number): Date => { const d = new Date(ms); d.setUTCHours(0, 0, 0, 0); return d }
const dayEndUtc = (ms: number): Date => { const d = new Date(ms); d.setUTCHours(23, 59, 59, 999); return d }

/** Force-load any of `ids` not already in the pairing store (via getDetail). Returns how many were added. */
const ensurePairingsLoaded = async (ids: number[]): Promise<number> => {
  const have = new Set(usePairingStore.getState().items.map((pi) => pi.pairing.id))
  const missing = ids.filter((id) => !have.has(id))
  if (missing.length === 0) return 0
  const fetched = await Promise.all(missing.map(async (id) => {
    try { return (await pairingApi.getDetail(id)).pairing } catch { return null }
  }))
  const addable = fetched.filter((p): p is NonNullable<typeof p> => p != null)
  if (addable.length > 0) usePairingStore.getState().addItems(addable)
  return addable.length
}

/** Earliest schStrDtUtc (ms) among the given loaded pairing ids, or null if none carry a start. */
const earliestPairingStart = (ids: number[]): number | null => {
  const byId = new Map(usePairingStore.getState().items.map((pi) => [pi.pairing.id, pi.pairing]))
  const times = ids
    .map((id) => byId.get(id)?.schStrDtUtc)
    .filter((s): s is string => !!s)
    .map((s) => Date.parse(s))
  return times.length ? Math.min(...times) : null
}

/**
 * "Bring matches to the top" helpers for the Filter dialog's Crew ID and Pairing
 * Label inputs. Matches float to the top of their pane (via pane-store.foundCrewIds,
 * the same per-pane "found rows" mechanism used by Find Crew); other rows stay below
 * in their existing sort order. The matched group renders in the pane's current sort
 * order — crew by rank displayOrder, pairings by sch start (the pane defaults).
 *
 * Kept separate from find-crew.ts (which is under concurrent change); consolidate later.
 */

type RosterPaneKey = 'main' | 'sub'

const formatDate = (d: Date): string => d.toISOString().slice(0, 10)

/** Bring the given crew IDs to the top of the target roster pane (added if not loaded). */
export const bringCrewIdsToTop = async (
  rawIds: string[],
  paneKey: RosterPaneKey = 'main',
  order: 'append' | 'replace' = 'append',
): Promise<void> => {
  const crewIds = [...new Set(rawIds.map((s) => s.trim()).filter(Boolean))]
  const paneType: PaneType = paneKey === 'main' ? 'roster-main' : 'roster-sub'
  if (crewIds.length === 0) {
    usePaneStore.getState().clearFoundCrewIds(paneType)
    useGanttViewStore.getState().markDirty()
    return
  }

  const crewStore = useCrewStore.getState()
  const existing = new Set(crewStore.selectedCrewIds)
  const missing = crewIds.filter((cid) => !existing.has(cid))
  if (missing.length > 0) {
    crewStore.selectCrews([...crewStore.selectedCrewIds, ...missing])
    const dateRange = useFilterStore.getState().dateRange
    await Promise.all([
      crewStore.fetchCrewsByIds(missing),
      useRosterStore.getState().appendRoster(paneKey, missing, dateRange),
    ])
    // Remove IDs that the API returned no data for — they would render as empty rows.
    const fetchedIds = new Set(useCrewStore.getState().items.map((c) => c.crew.crewId))
    const notFound = missing.filter((cid) => !fetchedIds.has(cid))
    if (notFound.length > 0) {
      crewStore.selectCrews(useCrewStore.getState().selectedCrewIds.filter((cid) => !notFound.includes(cid)))
      notify.warning(`Crew ID${notFound.length > 1 ? 's' : ''} not found: ${notFound.join(', ')}`)
    }
  }

  const allLoadedIds = new Set(useCrewStore.getState().items.map((c) => c.crew.crewId))
  const foundIds = crewIds.filter((cid) => existing.has(cid) || allLoadedIds.has(cid))
  const paneStore = usePaneStore.getState()
  if (order === 'replace') paneStore.setFoundCrewIds(paneType, foundIds)
  else paneStore.addFoundCrewIds(paneType, foundIds)
  paneStore.clearRowSelection(paneType)
  for (const cid of foundIds) paneStore.toggleRowSelection(paneType, cid)
  scrollPaneToTop((pid) => useLayoutStore.getState().panes.get(pid)?.type === 'roster', paneKey)
  useGanttViewStore.getState().markDirty()
}

/** Bring pairings whose label contains `label` to the top of the pairing pane. */
export const bringPairingLabelToTop = async (label: string): Promise<void> => {
  const term = label.trim()
  if (term === '') {
    usePaneStore.getState().clearFoundCrewIds('pairing')
    useGanttViewStore.getState().markDirty()
    return
  }

  const { dateRange } = useFilterStore.getState()
  let matched
  try {
    const res = await pairingApi.list({
      startDate: formatDate(dateRange.start),
      endDate: formatDate(dateRange.end),
      label: term,
      page: 1,
      pageSize: 500,
      sortBy: 'schStrDtUtc',
      sortOrder: 'asc',
    })
    matched = res.items
  } catch {
    notify.error('Failed to search pairings')
    return
  }

  if (matched.length === 0) {
    notify.info('No pairings match that label')
    return
  }

  usePairingStore.getState().addItems(matched)
  usePaneStore.getState().addFoundCrewIds('pairing', matched.map((p) => String(p.id)))
  scrollPaneToTop((pid) => useLayoutStore.getState().panes.get(pid)?.type === 'pairing', 'main')
  useGanttViewStore.getState().markDirty()
}

/**
 * Bring a single pairing (by id) to the top of the pairing pane — backs the roster
 * puck's "Locate Pairing" action. Fetches the pairing if it isn't already loaded,
 * floats it into the top "found" tier (same mechanism as label search), and scrolls
 * the pane to the top. Mirrors bringPairingLabelToTop, keyed by id instead of label.
 */
export const bringPairingIdToTop = async (pairingId: number): Promise<void> => {
  const store = usePairingStore.getState()
  // Only fetch when the row isn't already loaded — the loaded list item carries the
  // richer composition/coverage fields the pane renders, so prefer it when present.
  if (!store.items.some((pi) => pi.pairing.id === pairingId)) {
    try {
      const { pairing } = await pairingApi.getDetail(pairingId)
      store.addItems([pairing])
    } catch {
      notify.error('Failed to locate pairing')
      return
    }
  }
  usePaneStore.getState().addFoundCrewIds('pairing', [String(pairingId)])
  scrollPaneToTop((pid) => useLayoutStore.getState().panes.get(pid)?.type === 'pairing', 'main')
  useGanttViewStore.getState().markDirty()
}

/** True when the Live Flight pane is currently visible (Locate Flight menu gate). */
export const liveHasFlightPaneOpen = (): boolean =>
  usePaneStore.getState().panes.some((p) => p.type === 'flight' && p.visible)

/**
 * Bring a single flight (by id) to the top of the Flight pane — backs "Locate Flight".
 * Fetches the flight if it is not already loaded, floats its registration row into the
 * found tier, selects the flight, scrolls the pane to the top, and scrolls X when needed.
 */
export const bringFlightIdToTop = async (flightId: number): Promise<void> => {
  const flightStore = useFlightStore.getState()
  let flight = flightStore.items.flatMap((row) => row.flights).find((f) => f.id === flightId) ?? null
  if (!flight) {
    try {
      flight = await flightApi.getById(flightId)
      useFlightStore.getState().upsertFlight(flight)
    } catch {
      notify.error('Failed to locate flight')
      return
    }
  }

  usePaneStore.getState().addFoundCrewIds('flight', [String(flightId)])
  useGanttViewStore.getState().selectTasks([flightId])
  scrollPaneToTop((pid) => useLayoutStore.getState().panes.get(pid)?.type === 'flight', 'main')

  const startMs = Date.parse(flight.schDepDtUtc)
  if (!Number.isNaN(startMs)) {
    const { dateRange } = useFilterStore.getState()
    const { pxPerHour, scrollX } = useGanttViewStore.getState()
    const canvasW = typeof window !== 'undefined' ? Math.max(400, window.innerWidth - 320) : 1200
    const absX = timeToX(new Date(startMs), dateRange.start, pxPerHour)
    if (absX < scrollX || absX > scrollX + canvasW) {
      const anchor = new Date(startMs - JUMP_CONTEXT_DAYS * MS_PER_DAY)
      useGanttViewStore.getState().setScrollX(Math.max(0, timeToX(anchor, dateRange.start, pxPerHour)))
    }
  }

  useGanttViewStore.getState().markDirty()
}

/**
 * "Find Pairing by Flight" — float the pairing(s) that use this flight
 * (pairing_segment.flt_id) to the top of the pairing pane AND bring them into view.
 *
 * Floating a row to the top (vertical) doesn't make it visible if the pairing's time
 * lies outside the current timeline window (horizontal). So we also:
 *  - force-load pairings hidden by the current filter (getDetail → addItems);
 *  - if a target pairing is OUTSIDE the loaded date range, extend the range and reload
 *    (applyGanttFilters → fitToRange) so its bars exist on the timeline, then notify;
 *  - otherwise scroll the timeline horizontally to the pairing so its bars are on screen.
 */
/** Pairings that contain this flight, from the already-loaded pairing list (segments carry
 *  fltId). Apply background-loads the full pairing set, so this is usually complete; the
 *  caller falls back to the server when the local set yields nothing. */
const localPairingIdsByFlight = (flightId: number): number[] => {
  const seen = new Set<number>()
  for (const item of usePairingStore.getState().items) {
    if ((item.segments ?? []).some((s) => s.fltId === flightId)) seen.add(item.pairing.id)
  }
  return [...seen]
}

export const findPairingsByFlight = async (flightId: number): Promise<void> => {
  // Local-first: derive from the loaded pairing list; only hit the server if not found.
  let pairingIds: number[] = localPairingIdsByFlight(flightId)
  if (pairingIds.length === 0) {
    try {
      pairingIds = (await flightApi.getPairingIds(flightId)).pairingIds
    } catch {
      notify.error('Failed to find pairing')
      return
    }
  }

  if (pairingIds.length === 0) {
    notify.info('This flight has no pairing')
    return
  }

  // Force-load any pairings hidden by the current filter so they can render in the pane.
  const forcedLoaded = await ensurePairingsLoaded(pairingIds)
  const targetMs = earliestPairingStart(pairingIds)

  // Jump the timeline if the target pairing falls outside the loaded date range — extend
  // the range to include it (keeping a few days of context) and reload, so fitToRange
  // brings the widened window (and the pairing) on screen.
  const { dateRange } = useFilterStore.getState()
  let jumped = false
  if (targetMs != null && (targetMs < dateRange.start.getTime() || targetMs > dateRange.end.getTime())) {
    const newStart = targetMs < dateRange.start.getTime()
      ? dayStartUtc(targetMs - JUMP_CONTEXT_DAYS * MS_PER_DAY)
      : dateRange.start
    const newEnd = targetMs > dateRange.end.getTime()
      ? dayEndUtc(targetMs + JUMP_CONTEXT_DAYS * MS_PER_DAY)
      : dateRange.end
    useFilterStore.getState().setDateRange(newStart, newEnd)
    const { applyGanttFilters } = await import('@/utils/apply-filters')
    await applyGanttFilters()
    await ensurePairingsLoaded(pairingIds) // the range reload pages results — re-add if missed
    jumped = true
  }

  // Float the target pairing(s) to the top of the pane and bring them into the viewport.
  usePaneStore.getState().addFoundCrewIds('pairing', pairingIds.map(String))
  scrollPaneToTop((pid) => useLayoutStore.getState().panes.get(pid)?.type === 'pairing', 'main')
  if (targetMs != null && !jumped) {
    // In-range target: scroll horizontally so its bars are visible (jumped targets are
    // already framed by fitToRange).
    const dr = useFilterStore.getState().dateRange
    const { pxPerHour } = useGanttViewStore.getState()
    const anchor = new Date(targetMs - JUMP_CONTEXT_DAYS * MS_PER_DAY)
    useGanttViewStore.getState().setScrollX(Math.max(0, timeToX(anchor, dr.start, pxPerHour)))
  }
  useGanttViewStore.getState().markDirty()

  if (jumped && targetMs != null) {
    notify.info(`Jumped the timeline to show this flight's pairing (${formatDate(new Date(targetMs))})`)
  } else if (forcedLoaded > 0) {
    notify.info('Pairing not in the current filter — added to the Gantt anyway')
  }
}

/**
 * Ensure pairings of the selected coverage states are loaded (fetched & merged) so the
 * pairing pane's client-side coverage reorder can float them to the top. No-op when the
 * coverage selection is empty or all three (no narrowing).
 */
export const bringPairingCoverageToTop = async (coverage: string[]): Promise<void> => {
  if (coverage.length === 0 || coverage.length >= ALL_COVERAGE.length) return
  const { dateRange, pairing: pairingFilter } = useFilterStore.getState()
  try {
    // Large page: the backend coverage classification is a post-filter applied after
    // SQL paging, so we must request the whole range to capture every match. (A future
    // SQL-level coverage filter would let this page small.)
    // Carry the active pairing filter (base/division/fleet/depArp/assignments) — without
    // it this merged the full unfiltered range into the pane, surfacing wrong-division
    // pairings (e.g. Cabin pairings under a Pilot-division filter).
    const res = await pairingApi.list({
      startDate: formatDate(dateRange.start),
      endDate: formatDate(dateRange.end),
      coverage,
      page: 1,
      pageSize: 5000,
      sortBy: 'schStrDtUtc',
      sortOrder: 'asc',
      ...pairingFilterToListParams(pairingFilter),
    })
    usePairingStore.getState().addItems(res.items)
  } catch {
    notify.error('Failed to load pairings by coverage')
    return
  }
  scrollPaneToTop((pid) => useLayoutStore.getState().panes.get(pid)?.type === 'pairing', 'main')
  useGanttViewStore.getState().markDirty()
}

/** Scroll the first (main) / second (sub) pane of a type to the top. */
const scrollPaneToTop = (isType: (paneId: string) => boolean, paneKey: RosterPaneKey): void => {
  const layout = useLayoutStore.getState()
  const { grid } = layout
  const ids: string[] = []
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      const pid = grid[r][c]
      if (pid && isType(pid) && !ids.includes(pid)) ids.push(pid)
    }
  }
  const targetId = paneKey === 'main' ? ids[0] : (ids[1] ?? ids[0])
  if (targetId) layout.setViewport(targetId, { scrollY: 0 })
}
