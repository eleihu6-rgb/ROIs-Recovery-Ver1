// gantt/src/components/gantt/source/live-gantt-source.ts
import { useEffect, useMemo } from 'react'
import { useGanttViewStore } from '@/stores/gantt-view-store'
import { useLayoutStore } from '@/stores/layout-store'
import { usePaneStore } from '@/stores/pane-store'
import { useTimezoneStore } from '@/stores/timezone-store'
import { useFlightStore } from '@/stores/flight-store'
import { useFlightCompositionStore } from '@/stores/flight-composition-store'
import { useAirportTzStore } from '@/stores/airport-tz-store'
import { useFilterStore, matchesPairingLabelFilter, pairingCompositionMatchesRank } from '@/stores/filter-store'
import { usePairingStore } from '@/stores/pairing-store'
import { useRosterStore } from '@/stores/roster-store'
import { useCrewStore } from '@/stores/crew-store'
import { useRosterPeriodStore } from '@/stores/roster-period-store'
import { useRuleCheckStore } from '@/stores/rule-check-store'
import { useLegalityStore } from '@/stores/legality-store'
import { useSessionViolationStore } from '@/stores/session-violation-store'
import { useLockStore } from '@/stores/lock-store'
import { useColumnStore } from '@/stores/column-store'
import { useReferenceStore } from '@/stores/reference-store'
import { useUiStore } from '@/stores/ui-store'
import { isCrewBellOnlyRule } from '@/components/gantt/crew-bell-only-rules'
import {
  crewFlyTasksOverlappingWindow,
  crewTasksOverlappingWindow,
  pairingTasksOverlapViolationWindow,
  resolveViolationPaintWindow,
} from '@/utils/violation-puck-window'
import { useCrossPaneDrag } from '@/components/gantt/drag-context'
import { rpForTimestamp } from '@/hooks/use-current-rp'
import {
  sortFlightRows, reorderFrozenFirst, sortPairingRows,
  hitTestTask, hitTestTasksInRect, yToRow, xToTime, formatBlockMinutes, clampRosterScrollY,
  buildRosterIndexes, sortPanelRowsByValues, calendarDateInTimeZone, calendarDateToUtcMidnight,
} from '@/components/gantt/gantt-utils'
import type { RosterLaneHitLayout } from '@/components/gantt/gantt-utils'
import { bumpRosterModelBuild } from '@/utils/gantt-test-hook'
import { formatFlightStatusLine } from '@/utils/format-flight-status-line'
import { formatGroundTaskStatusLine } from '@/utils/format-ground-task-status-line'
import { applyGanttFilters } from '@/utils/apply-filters'
import { bringCrewIdsToTop } from '@/utils/bring-matches-to-top'
import { classifyCoverage, ALL_COVERAGE, coverageMatches } from '@/utils/pairing-coverage'
import { segmentFlightInfo, parseFlightLabel } from '@/utils/segment-flight-info'
import { formatCreditMinutes, sumPairingCreditMinutes } from '@/utils/format-credit'
import { crewMandayDelta, type MandayKpiDelta } from '@/utils/manday-delta'
import { getAllEffective } from '@/utils/crew-history'
import { computeValidityBlock } from '@/utils/crew-validity'
import { formatSeniority } from '@/utils/format-seniority'
import { buildRankOrderMap, compareRosterDefault } from '@/utils/roster-default-sort'
import { READ_ONLY_CAPABILITIES, EMPTY_LOCK_MAP, type GanttPaneSource, type FlightPaneSource, type PairingPaneSource, type RosterPaneSource } from './gantt-pane-source'
import type { CrewViolationRow } from '@/components/panes/violation-list-dialog'
import type { FlightItem, FlightCompositionStatus, Flight } from '@/types/flight'
import type { PairingItem } from '@/types/pairing'
import type { RosterItem } from '@/types'
import type { PanelRowData } from '@/components/gantt/pane-header-canvas'
import type { ColumnConfig } from '@/types/column'
import type { HitTestFn, PaneInteractionCallbacks } from '@/components/gantt/interactions/base-interaction'
import type { DragSource } from '@/components/gantt/interactions/drag-handler'
import type { PaneType as LegacyPaneType } from '@/types/pane'

/**
 * Build the Live FlightPaneSource.
 * Called inside useLiveGanttSource after acquiring crossPaneDrag from context.
 * All `use*` methods are hooks — they subscribe to their respective stores
 * when called unconditionally inside SharedFlightPane.
 */
function makeLiveFlightPaneSource(
  crossPaneDrag: ReturnType<typeof useCrossPaneDrag>,
): FlightPaneSource {
  return {
    useRows: () => {
      const rawRows = useFlightStore((s) => s.items)
      const compositionById = useFlightCompositionStore((s) => s.byId)
      const loadCompositions = useFlightCompositionStore((s) => s.loadFor)
      const loadAirportTz = useAirportTzStore((s) => s.load)
      // Sort: replicate what flight-pane.tsx does (getSortColumn/getSortDirection for 'flight')
      const sortColumn = usePaneStore((s) => s.getSortColumn('flight'))
      const sortDirection = usePaneStore((s) => s.getSortDirection('flight'))
      const frozenRowIds = usePaneStore((s) => s.getFrozenRowIds('flight'))
      const foundFlightIds = usePaneStore((s) => s.getFoundCrewIds('flight'))

      // Side-effects: load airport TZ once + load compositions for current rows.
      // These were previously in the old flight-pane.tsx. Moving them here ensures
      // they run whenever SharedFlightPane is mounted with a Live source.
      useEffect(() => { void loadAirportTz() }, [loadAirportTz])
      useEffect(() => {
        const ids: number[] = []
        for (const row of rawRows) {
          for (const f of row.flights) ids.push(f.id)
        }
        if (ids.length > 0) void loadCompositions(ids)
      }, [rawRows, loadCompositions])

      const sortedRows = sortFlightRows(rawRows, sortColumn, sortDirection)
      let floated = sortedRows
      if (foundFlightIds.length > 0) {
        const foundRows: FlightItem[] = []
        const rest: FlightItem[] = []
        const seen = new Set<string>()
        for (const id of foundFlightIds) {
          const row = sortedRows.find((r) => r.flights.some((f) => String(f.id) === id))
          if (row && !seen.has(row.registration)) {
            foundRows.push(row)
            seen.add(row.registration)
          }
        }
        for (const row of sortedRows) {
          if (!seen.has(row.registration)) rest.push(row)
        }
        floated = foundRows.length > 0 ? [...foundRows, ...rest] : sortedRows
      }
      const { frozen, nonFrozen } = reorderFrozenFirst(floated, frozenRowIds)
      const rows: FlightItem[] = [...frozen, ...nonFrozen]

      const compositionStatusMap = new Map<number, FlightCompositionStatus>()
      for (const [id, c] of Object.entries(compositionById)) {
        const ranks = Object.values(c)
        const isFull = ranks.every((r) => r.actual >= r.plan)
        const isPartial = ranks.some((r) => r.actual < r.plan && r.plan > 0)
        compositionStatusMap.set(Number(id), isFull ? 'full' : isPartial ? 'partial' : 'cancelled')
      }

      return { rows, compositionStatusMap }
    },

    capabilities: { canDrag: true, canRubberBand: true, tracksHover: true, lazyLoads: true },

    // ── Selection — wraps gantt-view-store ───────────────────────────────────
    useSelectedIds: () => useGanttViewStore((s) => s.selectedTaskIds),
    select: (id, mode) => {
      const store = useGanttViewStore.getState()
      if (mode === 'set') store.selectTask(id)
      else if (mode === 'toggle') store.toggleTaskSelection(id)
      else store.clearSelection()
    },
    selectMany: (ids) => useGanttViewStore.getState().selectTasks(ids),

    // ── Hover — wraps gantt-view-store ───────────────────────────────────────
    useHoveredId: () => useGanttViewStore((s) => s.hoveredTaskId),
    setHovered: (id, clientX, clientY) => useGanttViewStore.getState().setHoveredTask(id, clientX, clientY),

    // ── Geometry — read imperatively at event time ───────────────────────────
    getPxPerHour: () => useGanttViewStore.getState().pxPerHour,
    getRangeStart: () => usePaneStore.getState().dateRange.start,

    // ── Cross-pane drag (Live only) ──────────────────────────────────────────
    startDragToRoster: crossPaneDrag ? (source) => crossPaneDrag.startDrag(source) : undefined,

    // ── Lazy-load next page (Live only) ─────────────────────────────────────
    loadMore: () => void useFlightStore.getState().loadMore(),

    // ── Horizontal scroll / zoom (Live only) ─────────────────────────────────
    scrollByX: (dx) => useGanttViewStore.getState().scroll(dx, 0),
    zoomIn: () => useGanttViewStore.getState().zoomIn(),
    zoomOut: () => useGanttViewStore.getState().zoomOut(),

    // ── Rich status line (Live only) ──────────────────────────────────────────
    formatStatusLine: (flightId) => {
      const items = useFlightStore.getState().items
      const compositionById = useFlightCompositionStore.getState().byId
      const tzStore = useAirportTzStore.getState()
      const tz = useTimezoneStore.getState().timezone
      for (const row of items) {
        const f = row.flights.find((fl) => fl.id === flightId)
        if (f) {
          return formatFlightStatusLine({
            flight: f,
            ganttZoneId: tz,
            depLocalZoneId: tzStore.zoneIdFor(f.depArp),
            arvLocalZoneId: tzStore.zoneIdFor(f.arvArp),
            composition: compositionById[flightId],
          })
        }
      }
      return ''
    },

    // ── Cross-pane drag registration (Live only) ──────────────────────────────
    registerPane: crossPaneDrag
      ? (reg) => crossPaneDrag.registerPane({ paneType: 'flight', ...reg })
      : undefined,
    unregisterPane: crossPaneDrag
      ? () => crossPaneDrag.unregisterPane('flight')
      : undefined,

    // ── Row selection (Live only) ─────────────────────────────────────────────
    useSelectedRowIds: () => {
      const ids = usePaneStore((s) => s.getSelectedRowIds('flight'))
      // Convert array to a stable Set for structural equality
      return useMemo(() => new Set(ids), [ids.join(',')])  // eslint-disable-line react-hooks/exhaustive-deps
    },
    useFrozenRowCount: () => {
      const ids = usePaneStore((s) => s.getFrozenRowIds('flight'))
      return ids.length
    },
    selectRow: (rowId) => usePaneStore.getState().selectRow('flight', rowId),
    toggleRowSelection: (rowId) => usePaneStore.getState().toggleRowSelection('flight', rowId),
    selectRowRange: (rowId, allRowIds) => usePaneStore.getState().selectRowRange('flight', rowId, allRowIds),
    unfreezeRow: (rowId) => usePaneStore.getState().unfreezeRow('flight', rowId),
    markDirty: () => useGanttViewStore.getState().markDirty(),

    // ── Filter application (Live only) ────────────────────────────────────────
    // Called after a chip-remove mutates the filter store; triggers server reload.
    applyFilterChange: () => void applyGanttFilters(),
  }
}

/**
 * Build the Live PairingPaneSource — sibling of makeLiveFlightPaneSource.
 * Replicates pairing-pane.tsx's data pipeline (rows + interactions) so a shared
 * PairingPane can read Live data through the source abstraction. This accessor is
 * ADDITIVE this step: it is wired onto the Live source but the Live PairingPane is
 * NOT yet switched to consume it (mirrors how the flight accessor was added first).
 *
 * NOTE on SORT — Live pairing sort is SERVER-side, owned by pairing-store
 * (sortBy/sortOrder, applied before paging). The pane-store 'pairing' sortColumn is a
 * separate, client-side header-click sort that pairing-pane.tsx layers via
 * sortPairingRows(); when the Sort dialog applies a server sort it CLEARS that client
 * column (setSortCriteria('pairing', [])) so the server order stays authoritative.
 * To match today's behavior, useSortColumn/useSortDirection here reflect the pane-store
 * 'pairing' values and setSort calls setSortColumn('pairing', column). The SortDialog /
 * server-side applySort integration is NOT wired here — it lands in step 2 (the shared
 * component will gate the sort UI by capability).
 */
function makeLivePairingPaneSource(
  crossPaneDrag: ReturnType<typeof useCrossPaneDrag>,
): PairingPaneSource {
  return {
    useRows: () => {
      const pairingItems = usePairingStore((s) => s.items)
      const loadCompositions = useFlightCompositionStore((s) => s.loadFor)
      const loadAirportTz = useAirportTzStore((s) => s.load)
      // Client-side header-click sort (pane-store 'pairing'); server sort is decoupled.
      const sortColumn = usePaneStore((s) => s.getSortColumn('pairing'))
      const sortDirection = usePaneStore((s) => s.getSortDirection('pairing'))
      // Tier-1 float: explicit Label-search matches floated to top.
      const foundPairingIds = usePaneStore((s) => s.getFoundCrewIds('pairing'))
      // Tier-2 float: coverage selection from the global filter store, active only
      // when narrowed (1–2 of the 3 states selected). useShallow: the coverage array
      // is read from the store (stable ref) — no derived array here, but kept simple.
      const coverageSel = useFilterStore((s) => s.pairing.coverage)
      const rankFilter = useFilterStore((s) => s.pairing.ranks)
      const labelFilter = useFilterStore((s) => s.pairing.label)
      const frozenRowIds = usePaneStore((s) => s.getFrozenRowIds('pairing'))

      // Side-effects moved here from pairing-pane.tsx: load airport TZ once + load
      // compositions for segments of the current rows (enriches status-line lookups).
      useEffect(() => { void loadAirportTz() }, [loadAirportTz])
      useEffect(() => {
        const ids = pairingItems.flatMap(
          (pi) => pi.segments?.map((s) => s.fltId).filter((x): x is number => x != null) ?? [],
        )
        if (ids.length > 0) void loadCompositions(ids)
      }, [pairingItems, loadCompositions])

      const coverageActive = coverageSel.length > 0 && coverageSel.length < ALL_COVERAGE.length
      const filtered = rankFilter.length === 0 && labelFilter.trim() === ''
        ? pairingItems
        : pairingItems.filter((pi) =>
            pairingCompositionMatchesRank(pi.pairing.composition ?? [], rankFilter) &&
            matchesPairingLabelFilter(pi.pairing.pairingLabel, labelFilter))
      const sorted = sortPairingRows(filtered, sortColumn, sortDirection)
      const foundSet = new Set(foundPairingIds)
      const frozenSet = new Set(frozenRowIds)

      // Coverage is a HARD filter (hide full/over) — unified with Scenario. Always keep
      // explicitly frozen + label-found rows regardless of coverage (those are user overlays).
      const afterCoverage = !coverageActive
        ? sorted
        : sorted.filter((pi) =>
            frozenSet.has(String(pi.pairing.id)) ||
            foundSet.has(String(pi.pairing.id)) ||
            coverageMatches(coverageSel, pi.pairing.composition ?? [], rankFilter))

      // Tier-1 float: explicit Label-search matches floated to top.
      let floated: PairingItem[]
      if (foundSet.size === 0) {
        floated = afterCoverage
      } else {
        const rowById = new Map(afterCoverage.map((pi) => [String(pi.pairing.id), pi]))
        const labelTier = foundPairingIds
          .map((id) => rowById.get(id))
          .filter((pi): pi is PairingItem => pi != null && foundSet.has(String(pi.pairing.id)))
        const rest = afterCoverage.filter((pi) => !foundSet.has(String(pi.pairing.id)))
        floated = labelTier.length === 0 ? afterCoverage : [...labelTier, ...rest]
      }

      // Frozen-first reorder (unchanged).
      const frozen: PairingItem[] = []
      const nonFrozen: PairingItem[] = []
      for (const item of floated) {
        if (frozenSet.has(String(item.pairing.id))) frozen.push(item)
        else nonFrozen.push(item)
      }
      const rows: PairingItem[] = [...frozen, ...nonFrozen]

      return { rows }
    },

    capabilities: { canDrag: true, canRubberBand: true, tracksHover: true, lazyLoads: true, canCreateRes: true },

    // ── Selection (SEGMENT ids) — wraps gantt-view-store ─────────────────────
    useSelectedIds: () => useGanttViewStore((s) => s.selectedTaskIds),
    select: (id, mode) => {
      const store = useGanttViewStore.getState()
      if (mode === 'set') store.selectTask(id)
      else if (mode === 'toggle') store.toggleTaskSelection(id)
      else store.clearSelection()
    },
    selectMany: (ids) => useGanttViewStore.getState().selectTasks(ids),

    // ── Hover — wraps gantt-view-store ───────────────────────────────────────
    useHoveredId: () => useGanttViewStore((s) => s.hoveredTaskId),
    setHovered: (id, clientX, clientY) => useGanttViewStore.getState().setHoveredTask(id, clientX, clientY),

    // ── Geometry — read imperatively at event time ───────────────────────────
    getPxPerHour: () => useGanttViewStore.getState().pxPerHour,
    getRangeStart: () => usePaneStore.getState().dateRange.start,

    // ── Sort — reflect/no-op against the pane-store 'pairing' client sort. ────
    //    Server-side sort + SortDialog integration lands in step 2 (see header note).
    useSortColumn: () => usePaneStore((s) => s.getSortColumn('pairing')),
    useSortDirection: () => usePaneStore((s) => s.getSortDirection('pairing')),
    setSort: (column) => usePaneStore.getState().setSortColumn('pairing', column),

    // ── Lazy-load next page (Live only) ──────────────────────────────────────
    loadMore: () => void usePairingStore.getState().loadMore(),

    // ── Horizontal scroll / zoom (Live only) ─────────────────────────────────
    scrollByX: (dx) => useGanttViewStore.getState().scroll(dx, 0),
    zoomIn: () => useGanttViewStore.getState().zoomIn(),
    zoomOut: () => useGanttViewStore.getState().zoomOut(),

    // ── Rich status line (Live only) ──────────────────────────────────────────
    //    Replicates pairing-pane.tsx onItemHover (~743-752): Pairing #/Credit ·
    //    Seg # · enriched flight info (via segmentFlightInfo + TZ + composition).
    formatStatusLine: (segmentId) => {
      const items = usePairingStore.getState().items
      const tz = useTimezoneStore.getState().timezone
      const zoneIdFor = useAirportTzStore.getState().zoneIdFor
      const compositionById = useFlightCompositionStore.getState().byId
      const flightById = new Map<number, import('@/types').Flight>()
      for (const row of useFlightStore.getState().items) {
        for (const f of row.flights) flightById.set(f.id, f)
      }
      for (const item of items) {
        const seg = item.segments?.find((s) => s.id === segmentId)
        if (!seg) continue
        const p = item.pairing
        const info = segmentFlightInfo(seg.fltId, {
          airline: seg.airline, fltNum: seg.fltNum, depArp: seg.depArp, arvArp: seg.arvArp,
          schDepDtUtc: seg.schStrDtUtc, schArvDtUtc: seg.schEndDtUtc, fleet: p.fleet,
        }, { ganttZoneId: tz, zoneIdFor, compositionById, flightById })
        const flightPart = info ?? `${seg.fltNum ?? ''} ${seg.depArp ?? ''}-${seg.arvArp ?? ''}  |  ${seg.schStrDtUtc?.slice(11, 16) ?? ''} ~ ${seg.schEndDtUtc?.slice(11, 16) ?? ''}`
        const credit = formatCreditMinutes(sumPairingCreditMinutes(item.segments ?? []))
        const head = credit ? `Pairing #${p.id}  ·  Credit ${credit}` : `Pairing #${p.id}`
        return `${head}  ·  Seg #${seg.segSeq}  ·  ${flightPart}`
      }
      return ''
    },

    // ── Cross-pane drag (Live only) ──────────────────────────────────────────
    startDrag: crossPaneDrag ? (source) => crossPaneDrag.startDrag(source) : undefined,
    registerPane: crossPaneDrag
      ? (reg) => crossPaneDrag.registerPane({ paneType: 'pairing', ...reg })
      : undefined,
    unregisterPane: crossPaneDrag
      ? () => crossPaneDrag.unregisterPane('pairing')
      : undefined,

    // ── Filter application (Live only) ────────────────────────────────────────
    applyFilterChange: () => void applyGanttFilters(),

    // ── Row selection (Live only) ─────────────────────────────────────────────
    //    Mirrors pairing-pane.tsx getSelectedRowIds + the row-click/unfreeze handlers.
    useSelectedRowIds: () => {
      const ids = usePaneStore((s) => s.getSelectedRowIds('pairing'))
      return useMemo(() => new Set(ids), [ids.join(',')])  // eslint-disable-line react-hooks/exhaustive-deps
    },
    useFrozenRowCount: () => {
      const ids = usePaneStore((s) => s.getFrozenRowIds('pairing'))
      return ids.length
    },
    selectRow: (rowId) => usePaneStore.getState().selectRow('pairing', rowId),
    toggleRowSelection: (rowId) => usePaneStore.getState().toggleRowSelection('pairing', rowId),
    selectRowRange: (rowId, allRowIds) => usePaneStore.getState().selectRowRange('pairing', rowId, allRowIds),
    unfreezeRow: (rowId) => usePaneStore.getState().unfreezeRow('pairing', rowId),
    markDirty: () => useGanttViewStore.getState().markDirty(),
  }
}

// ── Live roster pipeline helpers (lifted verbatim from roster-pane.tsx) ──────────

/** roster-store key derived from the legacy pane type. */
function rosterStoreKey(legacyPaneType: LegacyPaneType): 'main' | 'sub' {
  return legacyPaneType === 'roster-main' ? 'main' : 'sub'
}

/** Build itemsByCrew from a flat roster item list (verbatim from roster-pane.tsx). */
function buildItemsByCrew(items: RosterItem[]): Map<string, RosterItem[]> {
  const map = new Map<string, RosterItem[]>()
  for (const it of items) {
    let arr = map.get(it.crewId)
    if (!arr) { arr = []; map.set(it.crewId, arr) }
    arr.push(it)
  }
  return map
}

/**
 * Build the two-source Live violationMap (taskId → max severity).
 * Index-backed (P1): pairing/crew violation expansion reads itemsByPairingId / itemsByCrew
 * instead of re-scanning all items per violation (was O(V×N), now O(V + affected tasks)).
 * Same taskId → max-severity result as the old full-scan version.
 */
function buildLiveViolationMap(
  ruleViolations: ReturnType<typeof useRuleCheckStore.getState>['violations'],
  displayViolations: ReturnType<typeof useSessionViolationStore.getState>['displayViolations'],
  itemsByPairingId: Map<number, RosterItem[]>,
  itemsByCrew: Map<string, RosterItem[]>,
): Map<number, number> {
  const map = new Map<number, number>()
  const bump = (taskId: number, sev: number): void => {
    const current = map.get(taskId) ?? 0
    if (sev > current) map.set(taskId, sev)
  }
  for (const [, violations] of ruleViolations) {
    for (const v of violations) {
      if (isCrewBellOnlyRule(v.ruleCode)) continue
      if (v.targetType === 'roster') {
        bump(v.targetId as number, v.severity)
      } else if (v.targetType === 'pairing') {
        const pairingId = v.targetId as number
        const anchorTasks = v.crewId
          ? (itemsByCrew.get(v.crewId) ?? []).filter((task) => task.pairingId === pairingId)
          : itemsByPairingId.get(pairingId) ?? []
        for (const task of anchorTasks) {
          if (!pairingTasksOverlapViolationWindow([task], v)) continue
          bump(task.id, v.severity)
        }
        if (v.ruleCode === '7501' && v.crewId && resolveViolationPaintWindow(v)) {
          for (const task of crewFlyTasksOverlappingWindow(itemsByCrew.get(v.crewId) ?? [], v)) {
            bump(task.id, v.severity)
          }
        }
        if (v.ruleCode === '7305' && v.crewId && resolveViolationPaintWindow(v)) {
          for (const task of crewTasksOverlappingWindow(itemsByCrew.get(v.crewId) ?? [], v)) {
            bump(task.id, v.severity)
          }
        }
      } else if (v.targetType === 'crew') {
        for (const task of itemsByCrew.get(String(v.targetId)) ?? []) {
          if (!pairingTasksOverlapViolationWindow([task], v)) continue
          bump(task.id, v.severity)
        }
      }
    }
  }
  for (const [pairingId, viols] of displayViolations) {
    for (const v of viols) {
      if (v.passed || isCrewBellOnlyRule(v.ruleCode)) continue
      if (v.crewId) {
        const crewPairingTasks = (itemsByCrew.get(v.crewId) ?? []).filter((task) => task.pairingId === pairingId)
        for (const task of crewPairingTasks) {
          if (!pairingTasksOverlapViolationWindow([task], v)) continue
          bump(task.id, v.severity)
        }
        if (v.ruleCode === '7501' && resolveViolationPaintWindow(v)) {
          for (const task of crewFlyTasksOverlappingWindow(itemsByCrew.get(v.crewId) ?? [], v)) {
            bump(task.id, v.severity)
          }
        }
        if (v.ruleCode === '7305' && resolveViolationPaintWindow(v)) {
          for (const task of crewTasksOverlappingWindow(itemsByCrew.get(v.crewId) ?? [], v)) {
            bump(task.id, v.severity)
          }
        }
      } else {
        for (const task of itemsByPairingId.get(pairingId) ?? []) {
          if (!pairingTasksOverlapViolationWindow([task], v)) continue
          bump(task.id, v.severity)
        }
      }
    }
  }
  return map
}

function buildLiveCrewViolationSeverityMap(
  displayViolations: ReturnType<typeof useSessionViolationStore.getState>['displayViolations'],
): Map<string, number> {
  const map = new Map<string, number>()
  for (const [, viols] of displayViolations) {
    for (const v of viols) {
      if (v.passed || !v.crewId) continue
      const current = map.get(v.crewId) ?? 0
      if (v.severity > current) map.set(v.crewId, v.severity)
    }
  }
  return map
}

/**
 * Build the Live Alert Center rows (one row per loaded violation message, attributed to the
 * crew it belongs to). Lifted verbatim from roster-pane.tsx so the bell + dialog now render
 * through the shared RosterPaneSource.useAlertCenter path (unified with Scenario) instead of a
 * Live-only chrome bundle. crew base/rank is the approximate current panel value (the dialog
 * only groups by it); pairing→crew attribution uses the loaded roster items.
 */
function buildLiveAlertRows(
  displayViolations: ReturnType<typeof useSessionViolationStore.getState>['displayViolations'],
  items: RosterItem[],
  crewItems: ReturnType<typeof useCrewStore.getState>['items'],
): CrewViolationRow[] {
  if (displayViolations.size === 0) return []
  const detail = new Map<string, { base: string; rank: string }>()
  for (const ci of crewItems) {
    const c = ci.crew
    detail.set(c.crewId, {
      base: c.panelBase ?? (c.bases?.[0]?.base ?? ''),
      rank: c.panelRank ?? (c.ranks?.[0]?.rank ?? ''),
    })
  }
  const loadedCrewIds = new Set(items.map((it) => String(it.crewId)))
  const out: CrewViolationRow[] = []
  const seen = new Set<string>()
  for (const [pairingId, viols] of displayViolations) {
    for (const v of viols) {
      if (v.passed) continue
      const crewIds = v.crewId
        ? [v.crewId]
        : [...new Set(items.filter((it) => it.pairingId === pairingId).map((it) => String(it.crewId)))]
      for (const cid of crewIds) {
        if (!loadedCrewIds.has(cid)) continue
        const d = detail.get(cid)
        const dedupKey = `${cid}|${v.ruleCode}|${v.ruleInstance ?? ''}|${v.message}`
        if (seen.has(dedupKey)) continue
        seen.add(dedupKey)
        out.push({
          crewId: cid,
          base: d?.base ?? '',
          rank: d?.rank ?? '',
          ruleCode: v.ruleCode,
          ruleInstance: v.ruleInstance ?? null,
          severity: v.severity,
          message: v.message,
        })
      }
    }
  }
  return out
}

export const buildLiveViolationMapForTest = buildLiveViolationMap
export const buildLiveCrewViolationSeverityMapForTest = buildLiveCrewViolationSeverityMap
export const buildLiveAlertRowsForTest = buildLiveAlertRows

/** Stable Live rescan: force-reload the gantt (re-pulls crew + violations for the range). */
const liveAlertScan = (): void => { void applyGanttFilters() }

/**
 * Build the Live RosterPaneSource — lifts roster-pane.tsx's data + interaction pipeline.
 * Bound to a concrete legacyPaneType ('roster-main' | 'roster-sub') which keys the
 * column-store / pane-store / roster-store. The hit-test / cross-pane-drop refs are kept
 * fresh by the shared component via setRenderedRows (so quick-filter narrows them too).
 *
 * READ-ONLY re: assign/remove (the Live roster never assigns/removes via capability;
 * cross-pane drag-to-roster is handled by the drop handler, not edit ops), matching the
 * current behavior. Reassign is achieved via cross-pane drag (onDragStart below), exactly
 * as the old pane did.
 */
function makeLiveRosterPaneSource(
  legacyPaneType: LegacyPaneType,
  paneId: string,
  crossPaneDrag: ReturnType<typeof useCrossPaneDrag>,
): RosterPaneSource {
  const rosterKey = rosterStoreKey(legacyPaneType)

  // Per-pane scrollY accessors (read fresh at event time; mirror the old roster-pane).
  const getScrollY = (): number =>
    useLayoutStore.getState().panes.get(paneId)?.viewport?.scrollY ?? 0
  const setScrollY = (n: number): void => {
    useLayoutStore.getState().setViewport(paneId, { scrollY: n })
  }

  // Event-time refs (hit-test / rubber-band / cross-pane drop). Updated by the shared
  // component through setRenderedRows so they reflect the post-quick-filter render list.
  const crewIdsRef = { current: [] as string[] }
  const itemsRef = { current: [] as RosterItem[] }
  const itemsByCrewRef = { current: new Map<string, RosterItem[]>() }
  const laneLayoutByTaskIdRef = { current: undefined as Map<number, RosterLaneHitLayout> | undefined }
  const frozenRowCountRef = { current: 0 }
  const canvasRef = { current: null as HTMLCanvasElement | null }

  /** Shared crew-history-aware panel-row build (date-effective rank/base/fleet + stats). */
  const buildPanelRows = (
    selectedCrewIds: string[],
    crewDetailMap: Map<string, ReturnType<typeof useCrewStore.getState>['items'][number]['crew']>,
    itemsByCrew: Map<string, RosterItem[]>,
    violationMap: Map<number, number>,
    crewViolationSeverityMap: Map<string, number>,
    crewStatsMap: ReturnType<typeof useCrewStore.getState>['crewStatsMap'],
    viewportLeftDate: Date,
    // 稳定排序职级的参考日期（窗口起点）。显示职级随视口日期走，但排序必须稳定，
    // 否则横向滚动会让 crew 重新排序（Rule 2 修正）。
    rangeStart: Date,
    mandayDelta: Map<string, MandayKpiDelta>,
  ): PanelRowData[] =>
    selectedCrewIds.map((cid) => {
      const crew = crewDetailMap.get(cid)
      const crewBucket = itemsByCrew.get(cid) ?? []
      let maxSev = 0
      for (const item of crewBucket) {
        const s = violationMap.get(item.id) ?? 0
        if (s > maxSev) maxSev = s
      }
      maxSev = Math.max(maxSev, crewViolationSeverityMap.get(cid) ?? 0)
      const firstItem = crewBucket[0]
      const rank = crew?.ranks
        ? getAllEffective(crew.ranks, viewportLeftDate).map((r) => r.rank).join(' | ') || ''
        : (crew?.panelRank ?? firstItem?.flightActingRank ?? '')
      const sortRank = crew?.ranks?.length
        ? (getAllEffective(crew.ranks, rangeStart).map((r) => r.rank).join(' | ') || '')
        : (crew?.panelRank ?? '')
      const base = crew?.bases
        ? getAllEffective(crew.bases, viewportLeftDate).map((b) => b.base).join(' | ') || ''
        : (crew?.panelBase ?? firstItem?.base ?? '')
      const fleet = crew?.fleets
        ? getAllEffective(crew.fleets, viewportLeftDate).map((f) => f.fleetSpecific).join(' | ') || ''
        : (crew?.panelFleets?.join(' | ') ?? '')
      const crewName = crew
        ? [crew.firstName, crew.middleName, crew.lastName].filter(Boolean).join(' ')
        : cid
      const stats = crewStatsMap.get(cid)
      // Tier-1 optimistic: add the per-crew edit delta to the server's authoritative stats so
      // ALL seven KPIs move instantly before Save (server then recomputes + broadcasts). Counts
      // are clamped ≥0 to avoid a transient negative while a multi-step edit is in flight.
      const d = mandayDelta.get(cid)
      const nz = (n: number): number => (n < 0 ? 0 : n)
      return {
        rowId: cid,
        sortRank,
        values: {
          crewId: cid,
          rank,
          base,
          seniority: formatSeniority(crew?.seniorityNum),
          fleet,
          crewName,
          ybh:   stats != null ? formatBlockMinutes(Math.round(stats.ybh + (d?.ybh ?? 0)))     : '',
          mcred: stats != null ? formatBlockMinutes(Math.round(stats.mcred + (d?.mcred ?? 0))) : '',
          mbh:   stats != null ? formatBlockMinutes(Math.round(stats.mbh + (d?.mbh ?? 0)))     : '',
          yal:   stats != null ? String(nz(stats.yal + (d?.yal ?? 0))) : '',
          mal:   stats != null ? String(nz(stats.mal + (d?.mal ?? 0))) : '',
          ydo:   stats != null ? String(nz(stats.ydo + (d?.ydo ?? 0))) : '',
          mdo:   stats != null ? String(nz(stats.mdo + (d?.mdo ?? 0))) : '',
        },
        maxViolationSeverity: maxSev,
      }
    })

  /** Sort + found-float + frozen-reorder + lock-enrich → final ordered rows. */
  const orderRows = (
    unsortedRows: PanelRowData[],
    sortCriteria: Array<{ column: string; direction: 'asc' | 'desc' }>,
    rankOrderMap: Map<string, number>,
    foundCrewIds: string[],
    frozenRowIds: string[],
    locks: ReturnType<typeof useLockStore.getState>['locks'],
  ): PanelRowData[] => {
    const defaultCmp = (a: PanelRowData, b: PanelRowData): number =>
      compareRosterDefault(
        { crewId: String(a.values.crewId ?? ''), rank: String(a.values.rank ?? ''), sortRank: a.sortRank },
        { crewId: String(b.values.crewId ?? ''), rank: String(b.values.rank ?? ''), sortRank: b.sortRank },
        rankOrderMap,
      )
    // Shared sort comparator (§Gantt-Unify) — same path Scenario uses.
    const sorted = sortPanelRowsByValues(unsortedRows, sortCriteria, defaultCmp)
    let floated = sorted
    if (foundCrewIds.length > 0) {
      const foundSet = new Set(foundCrewIds)
      const rowById = new Map(sorted.map((row) => [row.rowId, row]))
      const found = foundCrewIds
        .map((crewId) => rowById.get(crewId))
        .filter((row): row is PanelRowData => row != null && foundSet.has(row.rowId))
      const rest = sorted.filter((r) => !foundSet.has(r.rowId))
      floated = [...found, ...rest]
    }
    // Frozen-first reorder.
    const frozenSet = new Set(frozenRowIds)
    const frozen = floated.filter((r) => frozenSet.has(r.rowId))
    const nonFrozen = floated.filter((r) => !frozenSet.has(r.rowId))
    const reordered = [...frozen, ...nonFrozen]
    // Lock enrichment (verbatim from roster-pane.tsx panelRows memo).
    if (locks.size === 0) return reordered
    const lockStore = useLockStore.getState()
    return reordered.map((row) => {
      const crewKey = `crew:${row.rowId}`
      if (!locks.has(crewKey)) return row
      return {
        ...row,
        lockStatus: lockStore.isLockedByMe('crew', row.rowId) ? 'mine' as const : 'other' as const,
        lockOwner: locks.get(crewKey)?.userId ?? '',
      }
    })
  }

  return {
    // P0: one memoized model (rows + panel rows + violation map + indexes) built once
    // per dependency change — was previously rebuilt 3× across useRows / usePanelRows /
    // useViolationMap (buildLiveViolationMap ran 3×, panel build + ordering 2×).
    useRosterModel: () => {
      const items = useRosterStore((s) => s[rosterKey].rosterItems)
      const baseItems = useRosterStore((s) => s[rosterKey].baseItems)
      const selectedCrewIds = useCrewStore((s) => s.selectedCrewIds)
      const crewItems = useCrewStore((s) => s.items)
      const crewStatsMap = useCrewStore((s) => s.crewStatsMap)
      const ruleViolations = useRuleCheckStore((s) => s.violations)
      const displayViolations = useSessionViolationStore((s) => s.displayViolations)
      const locks = useLockStore((s) => s.locks)
      const sortCriteria = usePaneStore((s) => s.getSortCriteria(legacyPaneType))
      const foundCrewIds = usePaneStore((s) => s.getFoundCrewIds(legacyPaneType))
      const frozenRowIds = usePaneStore((s) => s.getFrozenRowIds(legacyPaneType))
      const referenceRanks = useReferenceStore((s) => s.ranks)
      const rangeStart = usePaneStore((s) => s.dateRange.start)
      const rangeEnd = usePaneStore((s) => s.dateRange.end)
      const timezone = useTimezoneStore((s) => s.timezone)
      const scrollX = useGanttViewStore((s) => s.scrollX)
      const pxPerHour = useGanttViewStore((s) => s.pxPerHour)
      const viewportLeftDayMs = useMemo(() => {
        const leftmost = xToTime(scrollX, rangeStart, pxPerHour)
        const calendarDate = calendarDateInTimeZone(leftmost, timezone)
        return calendarDateToUtcMidnight(calendarDate, timezone).getTime()
      }, [scrollX, pxPerHour, rangeStart, timezone])

      // Side-effects lifted from roster-pane.tsx: load references + crew manday stats.
      const loadReferences = useReferenceStore((s) => s.load)
      const loadCrewStats = useCrewStore((s) => s.loadCrewStats)
      useEffect(() => { void loadReferences() }, [loadReferences])
      const rpItems = useRosterPeriodStore((s) => s.items)
      // Rp-column stats key = roster period of the leftmost visible day. Stable within an RP,
      // recomputes on pan across an RP boundary; drives RpCred/RpDO/RpBH (and Y* year totals).
      const viewportRosterPeriod = useMemo(
        () => rpForTimestamp(rpItems, viewportLeftDayMs)?.rosterPeriod ?? '',
        [rpItems, viewportLeftDayMs],
      )
      useEffect(() => {
        if (selectedCrewIds.length > 0) void loadCrewStats(selectedCrewIds, viewportRosterPeriod)
      }, [selectedCrewIds, viewportRosterPeriod, loadCrewStats])

      return useMemo(() => {
        bumpRosterModelBuild(legacyPaneType)
        const viewportLeftDate = new Date(viewportLeftDayMs)
        const itemsByCrew = buildItemsByCrew(items)
        const { taskById, itemsByPairingId } = buildRosterIndexes(items)
        const violationMap = buildLiveViolationMap(ruleViolations, displayViolations, itemsByPairingId, itemsByCrew)
        const crewViolationSeverityMap = buildLiveCrewViolationSeverityMap(displayViolations)
        const crewDetailMap = new Map<string, typeof crewItems[number]['crew']>()
        for (const item of crewItems) crewDetailMap.set(item.crew.crewId, item.crew)
        // 失效红线：rank/base 覆盖断档点（窗口内首个无覆盖时刻）；晋升链不触发。
        const crewValidityBlock = new Map<string, number>()
        for (const cid of selectedCrewIds) {
          const crew = crewDetailMap.get(cid)
          if (!crew) continue
          const block = computeValidityBlock(crew.ranks ?? [], crew.bases ?? [], rangeStart.getTime(), rangeEnd.getTime())
          if (block !== null) crewValidityBlock.set(cid, block)
        }
        const rankOrderMap = buildRankOrderMap(referenceRanks)
        const mandayDelta = crewMandayDelta(baseItems, items, viewportRosterPeriod, rpItems)
        const unsortedRows = buildPanelRows(
          selectedCrewIds, crewDetailMap, itemsByCrew, violationMap, crewViolationSeverityMap, crewStatsMap, viewportLeftDate, rangeStart, mandayDelta,
        )
        const panelRows = orderRows(unsortedRows, sortCriteria, rankOrderMap, foundCrewIds, frozenRowIds, locks)
        const crewIds = panelRows.map((r) => r.rowId)
        const frozenSet = new Set(frozenRowIds)
        const frozenRowCount = panelRows.filter((r) => frozenSet.has(r.rowId)).length
        return { crewIds, items, itemsByCrew, panelRows, violationMap, crewViolationSeverityMap, frozenRowCount, taskById, itemsByPairingId, crewValidityBlock }
      }, [items, baseItems, selectedCrewIds, crewItems, crewStatsMap, ruleViolations, displayViolations, locks, sortCriteria, foundCrewIds, frozenRowIds, referenceRanks, viewportLeftDayMs, viewportRosterPeriod, rpItems, rangeStart, rangeEnd])
    },

    useColumns: (): ColumnConfig[] => useColumnStore((s) => s.getVisibleColumns(legacyPaneType)),

    // ── Legality Alert Center (shared bell + dialog; was roster-pane.tsx liveChrome) ──
    useAlertCenter: () => {
      const displayViolations = useSessionViolationStore((s) => s.displayViolations)
      const items = useRosterStore((s) => s[rosterKey].rosterItems)
      const crewItems = useCrewStore((s) => s.items)
      const rulesetId = useLegalityStore((s) => s.selectedId)
      const rows = useMemo(
        () => buildLiveAlertRows(displayViolations, items, crewItems),
        [displayViolations, items, crewItems],
      )
      return { rows, onScan: liveAlertScan, recheckInfo: { type: 'live', groupCode: rulesetId == null ? '' : String(rulesetId) } }
    },

    capabilities: { canAssign: false, canRemove: false, canReassign: false },

    // ── Selection — gantt-view-store selectedTaskIds + pane-store row selection ──
    useSelectedTaskIds: () => useGanttViewStore((s) => s.selectedTaskIds),
    useSelectedCrewIds: () => {
      const ids = usePaneStore((s) => s.getSelectedRowIds(legacyPaneType))
      return useMemo(() => new Set(ids), [ids.join(',')])  // eslint-disable-line react-hooks/exhaustive-deps
    },
    selectCrewRow: (crewId, mode, orderedIds) => {
      const st = usePaneStore.getState()
      if (mode === 'toggle') st.toggleRowSelection(legacyPaneType, crewId)
      else if (mode === 'range') st.selectRowRange(legacyPaneType, crewId, orderedIds)
      else st.selectRow(legacyPaneType, crewId)
      useGanttViewStore.getState().markDirty()
    },
    // Float the crew to the top of this roster pane (same found-tier mechanism as Find Crew /
    // the Filter dialog's Crew ID input). Alert-Center crew are always already loaded, so this
    // just floats + selects + scrolls; bringCrewIdsToTop also handles the not-loaded case.
    bringCrewToTop: (crewId) => { void bringCrewIdsToTop([crewId], rosterKey) },

    // ── Interaction (canvas) ─────────────────────────────────────────────────────
    getHitTest: (): HitTestFn => (canvasX, canvasY) => {
      const { scrollX: sx, pxPerHour: pph } = useGanttViewStore.getState()
      const scrollY = getScrollY()
      const { start } = usePaneStore.getState().dateRange
      const task = hitTestTask(
        canvasX, canvasY, sx, scrollY,
        itemsRef.current, crewIdsRef.current, start, pph, frozenRowCountRef.current, itemsByCrewRef.current,
        laneLayoutByTaskIdRef.current,
      )
      if (task) {
        return {
          type: 'roster-task',
          itemId: task.id,
          rowIndex: crewIdsRef.current.indexOf(task.crewId),
          rowId: task.crewId,
        }
      }
      const rowIndex = yToRow(canvasY, scrollY, frozenRowCountRef.current)
      if (rowIndex >= 0 && rowIndex < crewIdsRef.current.length) {
        return { type: 'background', itemId: null, rowIndex, rowId: crewIdsRef.current[rowIndex] }
      }
      return null
    },

    useInteractionCallbacks: (): PaneInteractionCallbacks => {
      const selectedTaskIds = useGanttViewStore((s) => s.selectedTaskIds)
      const timezone = useTimezoneStore((s) => s.timezone)
      const flightItems = useFlightStore((s) => s.items)
      const zoneIdFor = useAirportTzStore((s) => s.zoneIdFor)
      const compositionById = useFlightCompositionStore((s) => s.byId)
      const loadAirportTz = useAirportTzStore((s) => s.load)
      const loadCompositions = useFlightCompositionStore((s) => s.loadFor)
      const items = useRosterStore((s) => s[rosterKey].rosterItems)

      // Side-effects lifted from roster-pane.tsx (airport TZ + compositions for flight rows).
      useEffect(() => { void loadAirportTz() }, [loadAirportTz])
      useEffect(() => {
        const ids = items.map((t) => t.fltId).filter((x): x is number => x != null)
        if (ids.length > 0) void loadCompositions(ids)
      }, [items, loadCompositions])

      const flightById = useMemo(() => {
        const m = new Map<number, Flight>()
        for (const row of flightItems) for (const f of row.flights) m.set(f.id, f)
        return m
      }, [flightItems])
      const taskById = useMemo(() => {
        const m = new Map<number, RosterItem>()
        for (const it of items) m.set(it.id, it)
        return m
      }, [items])

      return useMemo((): PaneInteractionCallbacks => ({
        onItemClick: (hit, ctrlKey) => {
          if (hit.itemId === null) return
          const task = taskById.get(hit.itemId)
          if (task && task.pairingId && !ctrlKey) {
            const pairingTasks = (itemsByCrewRef.current.get(task.crewId) ?? []).filter((i) => i.pairingId === task.pairingId)
            const pairingTaskIds = pairingTasks.map((t) => t.id)
            const allSelected = pairingTaskIds.every((id) => selectedTaskIds.has(id))
            if (allSelected) useGanttViewStore.getState().clearSelection()
            else useGanttViewStore.getState().selectTasks(pairingTaskIds)
          } else {
            const st = useGanttViewStore.getState()
            ctrlKey ? st.toggleTaskSelection(hit.itemId) : st.selectTask(hit.itemId)
          }
        },
        onItemDoubleClick: (hit) => {
          if (hit.itemId === null) return
          const task = taskById.get(hit.itemId)
          if (!task) return
          if (task.pairingId === null) useUiStore.getState().openGroundTaskEdit(task)
          else useUiStore.getState().openPairingInfo(task.pairingId, undefined, task.crewId)
        },
        onItemRightClick: (hit, clientX, clientY) => {
          const ui = useUiStore.getState()
          if (hit.itemId !== null) {
            const selected = useGanttViewStore.getState().selectedTaskIds
            if (!(selected.size > 1 && selected.has(hit.itemId))) useGanttViewStore.getState().selectTask(hit.itemId)
            const task = taskById.get(hit.itemId)
            if (task) ui.openContextMenu(clientX, clientY, task, legacyPaneType, hit.rowIndex)
          } else if (hit.rowIndex >= 0) {
            const canvas = canvasRef.current
            const canvasRect = canvas?.getBoundingClientRect()
            const { scrollX: sx, pxPerHour: pph } = useGanttViewStore.getState()
            const { start: rangeStartFresh } = usePaneStore.getState().dateRange
            const canvasX = canvasRect ? (clientX - canvasRect.left + sx) : 0
            const clickTime = xToTime(canvasX, rangeStartFresh, pph)
            const tz = useTimezoneStore.getState().timezone
            const localDateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz })
            const localTimeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false })
            ui.setGroundTaskPrefill({
              crewId: hit.rowId ?? undefined,
              startDate: localDateFmt.format(clickTime),
              startTime: localTimeFmt.format(clickTime),
            })
            const mockTask = { id: -1, crewId: hit.rowId } as RosterItem
            ui.openContextMenu(clientX, clientY, mockTask, legacyPaneType, hit.rowIndex)
          }
        },
        onItemHover: (hit, clientX, clientY) => {
          const ui = useUiStore.getState()
          useGanttViewStore.getState().setHoveredTask(hit?.itemId ?? null, clientX, clientY)
          if (hit?.itemId) {
            const task = taskById.get(hit.itemId)
            if (task) {
              const parsed = parseFlightLabel(task.label)
              const info = parsed && task.schStrDtUtc && task.schEndDtUtc
                ? segmentFlightInfo(task.fltId, {
                    ...parsed, schDepDtUtc: task.schStrDtUtc, schArvDtUtc: task.schEndDtUtc,
                  }, { ganttZoneId: timezone, zoneIdFor, compositionById, flightById })
                : null
              if (info) {
                const pairSeg = task.pairingId != null
                  ? `Pairing #${task.pairingId}${task.segSeq != null ? `  Seg #${task.segSeq}` : ''}`
                  : ''
                const credit = formatCreditMinutes(task.dutyActCreditedMinutes)
                const meta = [pairSeg, credit ? `Credit ${credit}` : ''].filter(Boolean).join('  ·  ')
                ui.setStatusBarText([task.crewId, meta, info].filter(Boolean).join('  ·  '))
              } else {
                const time = task.schStrDtUtc && task.schEndDtUtc
                  ? `${task.schStrDtUtc.slice(5, 16)} ~ ${task.schEndDtUtc.slice(11, 16)}`
                  : ''
                const crewPart = task.pairingId == null ? `${task.crewId} #${task.id}` : task.crewId
                if (task.pairingId == null) {
                  ui.setStatusBarText(formatGroundTaskStatusLine(task, { zoneIdForBase: zoneIdFor }))
                } else {
                  ui.setStatusBarText(`${crewPart}  ·  ${task.assignment ?? task.assignmentGroup}  ·  ${time}`)
                }
              }
            }
          } else {
            ui.setStatusBarText('')
          }
        },
        onDragStart: (hit, clientX, clientY) => {
          if (!hit.itemId || !crossPaneDrag) return
          // IMP-sourced rows are immutable — block drag-move
          const dragTask = taskById.get(hit.itemId)
          if (dragTask?.source === 'IMP') return
          const canvas = canvasRef.current
          if (!canvas) return
          const source: DragSource = {
            paneType: legacyPaneType,
            itemId: hit.itemId,
            itemType: 'roster-task',
            sourceRowId: hit.rowId,
            startClientX: clientX,
            startClientY: clientY,
            sourceCanvasRect: canvas.getBoundingClientRect(),
          }
          crossPaneDrag.startDrag(source)
        },
        onDragMove: () => {},
        onDragEnd: () => {},
        onBackgroundClick: () => { useGanttViewStore.getState().clearSelection() },
        onScroll: (dx, dy) => {
          if (dx !== 0) useGanttViewStore.getState().scroll(dx, 0)
          if (dy !== 0) {
            const canvas = canvasRef.current
            const containerHeight = canvas?.clientHeight ?? 600
            const cur = getScrollY()
            setScrollY(clampRosterScrollY(cur + dy, crewIdsRef.current.length, containerHeight))
          }
        },
        onZoom: (direction) => {
          if (direction === 'in') useGanttViewStore.getState().zoomIn()
          else useGanttViewStore.getState().zoomOut()
        },
        onRubberBandSelect: (x1, y1, x2, y2, additive) => {
          const { scrollX: sx, pxPerHour: pph } = useGanttViewStore.getState()
          const sy = getScrollY()
          const { start } = usePaneStore.getState().dateRange
          const matched = hitTestTasksInRect(
            x1, y1, x2, y2, sx, sy, itemsRef.current, crewIdsRef.current, start, pph, frozenRowCountRef.current, itemsByCrewRef.current,
          )
          const ids = matched.map((i) => i.id)
          if (additive) {
            const existing = useGanttViewStore.getState().selectedTaskIds
            useGanttViewStore.getState().selectTasks([...existing, ...ids])
          } else {
            useGanttViewStore.getState().selectTasks(ids)
          }
        },
      }), [selectedTaskIds, timezone, zoneIdFor, compositionById, flightById, taskById])
    },

    // ── Optional Live-only overlays ───────────────────────────────────────────
    useLockMap: () => {
      const items = useRosterStore((s) => s[rosterKey].rosterItems)
      const locks = useLockStore((s) => s.locks)
      return useMemo(() => {
        if (locks.size === 0) return EMPTY_LOCK_MAP
        const map = new Map<number, 'mine' | 'other'>()
        const lockStore = useLockStore.getState()
        for (const item of items) {
          const crewLocked = locks.has(`crew:${item.crewId}`)
          const pairingLocked = item.pairingId != null && locks.has(`pairing:${item.pairingId}`)
          if (crewLocked || pairingLocked) {
            map.set(item.id, lockStore.isLockedByMe('crew', item.crewId) ? 'mine' : 'other')
          }
        }
        return map
      }, [items, locks])
    },
    useSessionTags: () => {
      const crewItems = useCrewStore((s) => s.items)
      return useMemo(() => {
        const map = new Map<string, number[]>()
        for (const item of crewItems) {
          if (item.sessionTags.length > 0) map.set(item.crew.crewId, item.sessionTags)
        }
        return map
      }, [crewItems])
    },
    // showSessionTags is a boolean prop; the old pane uses sessions.length > 1. The shared
    // component reads it as a static flag; the Live source recomputes it via a getter so a
    // session change flips it. (Sessions rarely change without a re-render of the pane.)
    get showSessionTags() {
      return useCrewStore.getState().sessions.length > 1
    },

    // ── Cross-pane drop registration ────────────────────────────────────────────
    registerPane: crossPaneDrag
      ? (reg) => {
          canvasRef.current = reg.getCanvasElement()
          crossPaneDrag.registerPane({ paneType: legacyPaneType, ...reg })
        }
      : undefined,
    unregisterPane: crossPaneDrag
      ? () => {
          canvasRef.current = null
          crossPaneDrag.unregisterPane(legacyPaneType)
        }
      : undefined,

    // ── Quick-filter feedback (Live) — keep event-time refs aligned with the painted list ──
    setRenderedRows: ({ crewIds, items, itemsByCrew, frozenRowCount, laneLayoutByTaskId }) => {
      crewIdsRef.current = crewIds
      itemsRef.current = items
      itemsByCrewRef.current = itemsByCrew
      frozenRowCountRef.current = frozenRowCount
      laneLayoutByTaskIdRef.current = laneLayoutByTaskId
    },
  }
}

/**
 * Live 数据源：把现有 zustand 单例适配成 GanttPaneSource。
 * hook 内部仍按需订阅各 store，行为与迁移前一致（零回归）。
 */
export const useLiveGanttSource = (rosterPaneType?: LegacyPaneType, rosterPaneId?: string): GanttPaneSource => {
  const crossPaneDrag = useCrossPaneDrag()
  // flight + pairing sources are memoized — crossPaneDrag is null until a DragProvider
  // mounts, so capture it in deps so the sources recreate when it becomes available.
  const flight = useMemo(() => makeLiveFlightPaneSource(crossPaneDrag), [crossPaneDrag])
  const pairing = useMemo(() => makeLivePairingPaneSource(crossPaneDrag), [crossPaneDrag])
  // The roster source is legacyPaneType + paneId bound (column/pane/roster store keys +
  // per-pane scrollY). Only the roster wrapper passes these; flight/pairing wrappers omit
  // them (they never read source.roster), so it stays undefined there.
  const roster = useMemo(
    () => (rosterPaneType && rosterPaneId ? makeLiveRosterPaneSource(rosterPaneType, rosterPaneId, crossPaneDrag) : undefined),
    [rosterPaneType, rosterPaneId, crossPaneDrag],
  )
  return useMemo<GanttPaneSource>(() => ({
    mode: 'live',
    useScrollX: () => useGanttViewStore((s) => s.scrollX),
    useScrollY: (paneId: string) => useLayoutStore((s) => s.panes.get(paneId)?.viewport?.scrollY ?? 0),
    setScrollY: (paneId: string, n: number) => useLayoutStore.getState().setViewport(paneId, { scrollY: n }),
    getScrollX: () => useGanttViewStore.getState().scrollX,
    getScrollY: (paneId: string) => useLayoutStore.getState().panes.get(paneId)?.viewport?.scrollY ?? 0,
    usePxPerHour: () => useGanttViewStore((s) => s.pxPerHour),
    useRange: () => {
      const start = usePaneStore((s) => s.dateRange.start)
      const end = usePaneStore((s) => s.dateRange.end)
      return { start, end }
    },
    useTimezone: () => useTimezoneStore((s) => s.timezone),
    useRosterPeriods: () => useRosterPeriodStore((s) => s.items),
    useDirtySignal: () => useGanttViewStore((s) => s.dirtyEpoch),
    markClean: () => useGanttViewStore.getState().markClean(),
    capabilities: READ_ONLY_CAPABILITIES,
    flight,
    pairing,
    roster,
  }), [flight, pairing, roster])
}
