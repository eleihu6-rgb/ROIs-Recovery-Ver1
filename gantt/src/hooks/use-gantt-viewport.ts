import { useEffect, useRef } from 'react'
import { useCrewStore } from '@/stores/crew-store'
import { useFilterStore } from '@/stores/filter-store'
import { usePaneStore } from '@/stores/pane-store'
import { useRosterStore } from '@/stores/roster-store'
import { useLayoutStore } from '@/stores/layout-store'

/**
 * Hook that (a) syncs the filter dateRange → pane dateRange for Canvas rendering,
 * and (b) appends roster data for loadMore crew-page deltas.
 *
 * Data loading is NOT initiated here on mount. The sole initial loader is
 * applyGanttFilters() (triggered by Filter-dialog Apply), which fetches crew +
 * roster + pairing + flight itself. This hook only handles the loadMore case
 * where the crew list grows beyond the first page.
 */
export const useGanttViewport = () => {
  const dateRange = useFilterStore((s) => s.dateRange)
  const setPaneDateRange = usePaneStore((s) => s.setDateRange)

  // Track the previous selection to distinguish loadMore (appends to the tail,
  // prefix preserved) from a replacement (re-filter swaps the whole array).
  const prevCrewIds = useRef<string[]>([])

  // Sync filter dateRange → pane dateRange (used by Canvas rendering)
  useEffect(() => {
    setPaneDateRange(dateRange.start, dateRange.end)
  }, [dateRange, setPaneDateRange])

  const selectedCrewIds = useCrewStore((s) => s.selectedCrewIds)

  // Handle crew-selection changes after initial selection.
  // - Initial selection / replacement (re-filter): the orchestrated load
  //   (applyGanttFilters / loadFromBootstrap) fetches roster itself — only
  //   record the new selection here; appending would double-load.
  // - LoadMore (old selection is a strict PREFIX of the new one): append
  //   roster for the NEWLY added crews (delta).
  useEffect(() => {
    const ids = selectedCrewIds
    const prev = prevCrewIds.current
    prevCrewIds.current = ids

    if (ids.length <= prev.length || prev.length === 0) return

    // During the windowed first-paint, applyGanttFilters' phase-2 loads the full roster
    // itself (40 crew → all crew, month window then append). Crew growing 40→all looks
    // like a loadMore here, but appending again would double-load AND race the phase-2
    // load (abort/replace) → the visible roster flickers/shrinks. Skip until fully loaded;
    // a genuine loadMore happens only after that (fullyLoaded === true).
    if (!useCrewStore.getState().fullyLoaded) return

    // loadMore appends to the tail (see crew-store loadMore); a re-filter via
    // fetchCrewsWithFilter / fetchCrews replaces the whole array atomically
    // (N→M without passing 0), so slice(prev.length) would be crews from a
    // DIFFERENT query — verify the old selection is a strict prefix first.
    const isPrefix = prev.every((id, i) => ids[i] === id)
    if (!isPrefix) return

    const newCrewIds = ids.slice(prev.length)
    const panes = useLayoutStore.getState().panes
    const hasRoster = [...panes.values()].some(p => p.type === 'roster')
    if (hasRoster && newCrewIds.length > 0) {
      useRosterStore.getState().appendRoster('main', newCrewIds, dateRange)
    }
  }, [selectedCrewIds, dateRange])

  return {}
}
