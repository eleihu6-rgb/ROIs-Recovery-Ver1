import { useGanttViewStore } from '@/stores/gantt-view-store'
import { useLayoutStore } from '@/stores/layout-store'
import { useRuleCheckStore } from '@/stores/rule-check-store'
import {
  useFilterStore,
  crewFiltersEqual,
  pairingFiltersEqual,
  flightFiltersEqual,
  dateRangesEqual,
  hasCrewFilterValues,
  crewIdsEqual,
  pairingCoverageEqual,
  pairingIdsEqual,
} from '@/stores/filter-store'
import { bringCrewIdsToTop, bringPairingCoverageToTop } from '@/utils/bring-matches-to-top'
import { useCrewStore } from '@/stores/crew-store'
import { useRosterStore } from '@/stores/roster-store'
import { usePairingStore } from '@/stores/pairing-store'
import { useFlightStore } from '@/stores/flight-store'
import { useFlightCompositionStore } from '@/stores/flight-composition-store'
import { markPhase } from '@/utils/gantt-perf-marks'

export type ApplyGanttFiltersOptions = {
  /** Re-fetch pairing pane even when the pairing filter snapshot is unchanged. */
  forcePairingReload?: boolean
}

/**
 * Apply the current filter-store filters to all visible panes.
 *
 * Pure store-orchestration (reads/writes Zustand stores via getState) so it can be
 * reused both by the toolbar's "Apply" action and by condition-chip removal — the
 * single source of truth for "re-run queries for whatever filter-store now holds".
 * Selectively re-fetches only the panes whose query conditions changed.
 */
export const applyGanttFilters = async (opts?: ApplyGanttFiltersOptions): Promise<void> => {
  const {
    crew: crewFilter,
    pairing: pairingFilter,
    flight: flightFilter,
    dateRange,
    appliedFilters,
  } =
    useFilterStore.getState()

  const dateChanged = !appliedFilters || !dateRangesEqual(appliedFilters.dateRange, dateRange)
  const crewChanged = !appliedFilters || dateChanged || !crewFiltersEqual(appliedFilters.crew, crewFilter)
  const pairingChanged =
    !!opts?.forcePairingReload
    || !appliedFilters
    || dateChanged
    || !pairingFiltersEqual(appliedFilters.pairing, pairingFilter)
  const flightChanged = !appliedFilters || dateChanged || !flightFiltersEqual(appliedFilters.flight, flightFilter)
  // Overlay (bring-to-top) inputs — tracked separately so they don't force a base reload.
  const crewIdsChanged = !appliedFilters || dateChanged || !crewIdsEqual(appliedFilters.crew, crewFilter)
  const coverageChanged = !appliedFilters || dateChanged || !pairingCoverageEqual(appliedFilters.pairing, pairingFilter)
  // Pairing ID is a client-side HARD filter (all pairings are already loaded) — tracked as an
  // overlay-style change so it never forces a server reload, but still re-runs markApplied.
  const pairingIdsChanged = !appliedFilters || dateChanged || !pairingIdsEqual(appliedFilters.pairing, pairingFilter)

  if (!crewChanged && !pairingChanged && !flightChanged && !crewIdsChanged && !coverageChanged && !pairingIdsChanged) return

  // 首屏阶段时间线锚点：Live 空启动后数据加载由 Apply 驱动，加载起点在这里
  // （旧 mount 自动加载的 gantt:open 打点已随之删除，见 use-gantt-viewport）。
  markPhase('gantt:open')

  // Zoom is owned by the RP selector (RpMultiSelect): it zooms to the selected RP(s)
  // on mount and on selection change. Applying filters must NOT move the viewport —
  // that caused an Apply → full-range → RP bounce. Data loads under the existing zoom.
  const panes = useLayoutStore.getState().panes
  const visibleTypes = new Set([...panes.values()].map((p) => p.type))

  useGanttViewStore.setState({ refreshing: true })
  // Show bars immediately so the user sees loading start the instant Apply closes.
  // Only for panes that will actually reload (crewChanged/pairingChanged) — otherwise
  // the bar would sit at 0% forever with no load behind it.
  if (crewChanged && visibleTypes.has('roster')) {
    useRosterStore.setState((s) => ({ main: { ...s.main, progress: 0 } }))
  }
  if (pairingChanged && visibleTypes.has('pairing')) {
    usePairingStore.setState({ progress: 0 })
  }
  try {
    const hasCrewFilter = hasCrewFilterValues(crewFilter)
    const rosterVisible = visibleTypes.has('roster')
    const pairingVisible = visibleTypes.has('pairing')
    const flightVisible = visibleTypes.has('flight')

    // ── 单轮加载：crew 全量 → roster 分批并发；pairing 单请求（实测 pairing 全量比分批快）──
    const rosterBatchPromise =
      crewChanged && rosterVisible
        ? (async () => {
            // Show the roster bar immediately; crew phase advances it 0→15, roster batches
            // 15→100 (each crew batch updates progress via onProgress).
            useRosterStore.setState((s) => ({ main: { ...s.main, progress: 0 } }))
            let crewProgress = 0
            const onCrewProgress = (p: number): void => {
              crewProgress = p
              useRosterStore.setState((s) => ({ main: { ...s.main, progress: p } }))
            }
            if (hasCrewFilter) await useCrewStore.getState().fetchCrewsWithFilter(crewFilter, dateRange)
            else await useCrewStore.getState().fetchCrews({ onProgress: onCrewProgress })
            const { selectedCrewIds } = useCrewStore.getState()
            if (selectedCrewIds.length > 0) {
              await useGanttViewStore.getState().loadRosterBatched(selectedCrewIds, dateRange, crewProgress)
            }
            const items = useRosterStore.getState().main.rosterItems
            if (items.length > 0) useRuleCheckStore.getState().checkCrews(selectedCrewIds, items)
          })()
        : Promise.resolve()

    const pairingPromise =
      pairingChanged && pairingVisible
        ? usePairingStore.getState().fetchPairingsBatched(dateRange, pairingFilter)
        : Promise.resolve()

    await Promise.all([rosterBatchPromise, pairingPromise])
    if (pairingChanged && pairingVisible && pairingFilter.coverage?.length) {
      await bringPairingCoverageToTop(pairingFilter.coverage)
    }

    // Zoom is set ONCE at the top (selectedRosterPeriodRange → zoomToRp) so the viewport
    // lands on the RP before data streams in and does NOT jump again after load. No second
    // zoomToRp here — that caused the Apply → full-range → RP bounce.
    // Explicit crew IDs the user typed must still be floated to the top (overlay).
    if ((crewIdsChanged || crewChanged) && rosterVisible) {
      await bringCrewIdsToTop(crewFilter.crewIds, 'main')
    }

    useGanttViewStore.getState().markDirty()
    useFilterStore.getState().markApplied()

    // Flight + compositions in the background — even with the pane closed. Flight is the
    // basis of pairing/crew lookups, so we load it ready for the local-first consumers
    // (pairing-info, flight-navi, find-by-flight). Off the critical path (void).
    if (flightChanged) {
      void (async () => {
        await useFlightStore.getState().fetchFlights(dateRange, flightFilter)
        const flightIds = useFlightStore.getState().items.flatMap((it) => it.flights.map((f) => f.id))
        if (flightIds.length > 0) await useFlightCompositionStore.getState().loadFor(flightIds)
        if (flightVisible) useGanttViewStore.getState().markDirty()
      })()
    }
  } finally {
    useGanttViewStore.setState({ refreshing: false })
  }
}
