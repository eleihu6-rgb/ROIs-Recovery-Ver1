import { memo, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useCrossPaneDrag } from '@/components/gantt/drag-context'
import type { DragSource } from '@/components/gantt/interactions/drag-handler'
import { useTimezoneStore } from '@/stores/timezone-store'
import { PaneCanvas } from '@/components/gantt/pane-canvas'
import { PaneHeaderCanvas } from '@/components/gantt/pane-header-canvas'
import type { PanelRowData } from '@/components/gantt/pane-header-canvas'
import { PaneLoadingBar } from './pane-loading-bar'
import { PaneToolbar, type FilterChip, type SortChip, type GlobalFilterChip } from './pane-toolbar'
import { PaneConditionStrip } from './pane-condition-strip'
import { SortDialog, type SortField } from './sort-dialog'
import { PaneQuickFilter, EMPTY_QUICK_FILTER, getQuickFilterChips } from './pane-quick-filter'
import type { QuickFilterState } from './pane-quick-filter'
import { useFilterStore, hasPairingFilterValues, matchesPairingIdFilter, matchesPairingLabelFilter, pairingCompositionMatchesRank } from '@/stores/filter-store'
import { coverageMatches, ALL_COVERAGE } from '@/utils/pairing-coverage'
import { useShellStore } from '@/stores/shell-store'
import { applyGanttFilters } from '@/utils/apply-filters'
import { buildGlobalFilterChips } from '@/utils/global-filter-chips'
import { renderPairingTasks, buildPairingDutyBuckets } from '@/components/gantt/renderers/pairing-renderer'
import type { PairingRenderContext } from '@/components/gantt/renderers/pairing-renderer'
import { createPaneInteractionHandler } from '@/components/gantt/interactions/base-interaction'
import type { HitTestResult, PaneInteractionCallbacks, RubberBandRect } from '@/components/gantt/interactions/base-interaction'
import { timeToX, xToTime, formatBlockMinutes, parseIsoCached, buildCompositionString, buildCompositionSegments, sortPairingRows } from '@/components/gantt/gantt-utils'
import { startOfDay } from 'date-fns'
import { findPairingStartingAtDay } from '@/utils/locate-today-pairing'
import { publishPairingOrder } from '@/utils/gantt-test-hook'
import { HEADER_HEIGHT, MIN_TASK_WIDTH, PAIRING_ROW_HEIGHT as SEGMENT_ROW_HEIGHT, PAIRING_HEADER_HEIGHT, SEGMENT_FLIGHT_HEIGHT, SPLITTER_WIDTH } from '@/components/gantt/gantt-constants'
import { useGanttViewStore } from '@/stores/gantt-view-store'
import { usePaneStore } from '@/stores/pane-store'
import type { SortCriterion } from '@/stores/pane-store'
import { usePairingStore, pairingFilterToListParams } from '@/stores/pairing-store'
import { useFlightStore } from '@/stores/flight-store'
import { useAirportTzStore } from '@/stores/airport-tz-store'
import { useFlightCompositionStore } from '@/stores/flight-composition-store'
import { useReferenceStore } from '@/stores/reference-store'
import { buildRankOrderMap } from '@/utils/roster-default-sort'
import { segmentFlightInfo } from '@/utils/segment-flight-info'
import { formatCreditMinutes, sumPairingCreditMinutes } from '@/utils/format-credit'
import { useUiStore } from '@/stores/ui-store'
import { useColumnStore } from '@/stores/column-store'
import { useLayoutStore } from '@/stores/layout-store'
import { usePaneInstanceStore } from '@/stores/pane-instance-store'
import { useResPlannerStore } from '@/stores/res-planner-store'
import { useGanttSource } from '@/components/gantt/source/gantt-source-context'
import type { BaseRenderContext } from '@/components/gantt/renderers/base-renderer'
import type { Pairing, PairingItem, PairingFilters, PairingListQuery } from '@/types/pairing'
import { TEXT_COLOR_RED } from '@/components/gantt/gantt-constants'
import { VerticalSplitter } from '@/components/layout/vertical-splitter'

const PAIRING_JUMP_CONTEXT_DAYS = 2
const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Sortable pairing fields offered by the Sort dialog. Keys are the exact server
 * `sortBy` values (validated by the backend enum); pairing sorting is server-side
 * so the whole dataset is ordered before paging. `schStrDtUtc` is the default.
 */
const PAIRING_SORT_FIELDS: SortField[] = [
  { key: 'schStrDtUtc', label: 'Sch Start' },
  { key: 'pairingLabel', label: 'Pairing' },
  { key: 'fleet', label: 'Fleet' },
  { key: 'base', label: 'Base' },
  { key: 'tafb', label: 'TAFB' },
  { key: 'segCount', label: 'Segments' },
  { key: 'durationDays', label: 'Duration' },
]
const PAIRING_SORT_LABELS: Record<string, string> = Object.fromEntries(
  PAIRING_SORT_FIELDS.map((f) => [f.key, f.label]),
)
type PairingSortBy = NonNullable<PairingListQuery['sortBy']>
const DEFAULT_PAIRING_SORT_BY: PairingSortBy = 'schStrDtUtc'
const DEFAULT_PAIRING_SORT_ORDER: NonNullable<PairingListQuery['sortOrder']> = 'asc'

interface PairingOffscreenJumpHintProps {
  paneId: string
  items: PairingItem[]
  frozenRowCount: number
  scrollY: number
  containerRef: RefObject<HTMLDivElement | null>
  timezone: string
}

const formatPairingJumpDate = (date: Date, timezone: string): string => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const value = (type: string): string => parts.find((part) => part.type === type)?.value ?? ''
  return `${value('year')}-${value('month')}-${value('day')}`
}

const PairingOffscreenJumpHint = memo(({
  paneId,
  items,
  frozenRowCount,
  scrollY,
  containerRef,
  timezone,
}: PairingOffscreenJumpHintProps) => {
  const scrollX = useGanttViewStore((s) => s.scrollX)
  const pxPerHour = useGanttViewStore((s) => s.pxPerHour)
  const dateRangeStart = usePaneStore((s) => s.dateRange.start)
  const leftPanelWidth = usePaneStore((s) => s.leftPanelWidth)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })
  const hintRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const updateSize = (): void => setContainerSize({ width: el.clientWidth, height: el.clientHeight })
    updateSize()
    const resizeObserver = new ResizeObserver(updateSize)
    resizeObserver.observe(el)
    return () => resizeObserver.disconnect()
  }, [containerRef])

  const hints = useMemo(() => {
    if (items.length === 0) return []

    const timelineWidth = Math.max(0, containerSize.width - leftPanelWidth - SPLITTER_WIDTH)
    if (timelineWidth <= 0) return []

    const viewportStartX = scrollX
    const viewportEndX = scrollX + timelineWidth
    const visibleRowCount = Math.max(1, Math.ceil((containerSize.height - PAIRING_HEADER_HEIGHT) / SEGMENT_ROW_HEIGHT))
    const firstScrollableIndex = Math.min(items.length - 1, Math.max(frozenRowCount, Math.floor(scrollY / SEGMENT_ROW_HEIGHT) + frozenRowCount))
    const lastScrollableIndex = Math.min(items.length - 1, firstScrollableIndex + visibleRowCount)
    const candidateIndexes = [
      ...Array.from({ length: frozenRowCount }, (_, index) => index),
      ...Array.from(
        { length: Math.max(0, lastScrollableIndex - firstScrollableIndex + 1) },
        (_, index) => firstScrollableIndex + index,
      ),
    ]

    const nextHints: Array<{
      rowIndex: number
      top: number
      label: string
      targetX: number
      direction: 'left' | 'right'
    }> = []

    for (const rowIndex of candidateIndexes) {
      const item = items[rowIndex]
      if (!item?.pairing.schStrDtUtc) continue
      const start = parseIsoCached(item.pairing.schStrDtUtc)
      const startX = timeToX(start, dateRangeStart, pxPerHour)
      const end = item.pairing.schEndDtUtc ? parseIsoCached(item.pairing.schEndDtUtc) : start
      const endX = Math.max(timeToX(end, dateRangeStart, pxPerHour), startX + MIN_TASK_WIDTH)
      const rowDirection = endX < viewportStartX ? 'left' : startX >= viewportEndX ? 'right' : null
      if (!rowDirection) continue

      // Top is relative to the overlay container, which starts BELOW the 30px
      // header band — a partially scrolled row yields a negative top and gets
      // clipped by the container's overflow-hidden, exactly like canvas rows.
      const top = rowIndex < frozenRowCount
        ? rowIndex * SEGMENT_ROW_HEIGHT
        : rowIndex * SEGMENT_ROW_HEIGHT - scrollY
      const targetDate = new Date(start.getTime() - PAIRING_JUMP_CONTEXT_DAYS * MS_PER_DAY)
      const targetX = Math.max(0, timeToX(targetDate, dateRangeStart, pxPerHour))
      const dateLabel = formatPairingJumpDate(start, timezone)

      nextHints.push({
        rowIndex,
        top,
        label: rowDirection === 'left' ? `<< ${dateLabel}` : `${dateLabel} >>`,
        targetX,
        direction: rowDirection,
      })
    }

    return nextHints
  }, [containerSize, dateRangeStart, frozenRowCount, items, leftPanelWidth, pxPerHour, scrollX, scrollY, timezone])

  const handleClick = useCallback((targetX: number) => {
    useGanttViewStore.getState().setScrollX(targetX)
  }, [])

  const handleWheel = useCallback((event: WheelEvent) => {
    event.preventDefault()
    if (event.deltaX !== 0) {
      useGanttViewStore.getState().scroll(event.deltaX, 0)
    }

    if (event.deltaY !== 0) {
      const maxScrollY = Math.max(0, items.length * SEGMENT_ROW_HEIGHT - (containerSize.height - HEADER_HEIGHT))
      const currentScrollY = useLayoutStore.getState().panes.get(paneId)?.viewport?.scrollY ?? 0
      useLayoutStore.getState().setViewport(paneId, {
        scrollY: Math.max(0, Math.min(maxScrollY, currentScrollY + event.deltaY)),
      })
    }
  }, [containerSize.height, items.length, paneId])

  // React 19 registers JSX onWheel as a passive listener, which silently
  // ignores our preventDefault() and emits "Unable to preventDefault inside
  // passive event listener invocation" to the console. Use vanilla
  // addEventListener with { passive: false } so preventDefault actually fires.
  useEffect(() => {
    const node = hintRef.current
    if (!node) return
    node.addEventListener('wheel', handleWheel, { passive: false })
    return () => node.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  if (hints.length === 0) return null

  return (
    <div
      ref={hintRef}
      className="pointer-events-none absolute bottom-0 right-0 z-20 overflow-hidden"
      style={{
        // Start below the header band so hint rows never overlay the
        // condition-strip/header area (canvas paints drawHeaderBand over rows
        // scrolled into that band; this overlay must clip the same way).
        top: PAIRING_HEADER_HEIGHT,
        left: leftPanelWidth + SPLITTER_WIDTH,
      }}
      data-testid="pairing-offscreen-jump-hint"
    >
      {hints.map((hint) => (
        <button
          key={`${hint.rowIndex}-${hint.label}`}
          type="button"
          className={`pointer-events-auto absolute left-0 right-0 flex items-center border-b border-primary/20 bg-primary/5 px-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-primary/10 ${
            hint.direction === 'left' ? 'justify-start text-left' : 'justify-end text-right'
          }`}
          style={{ top: hint.top, height: SEGMENT_ROW_HEIGHT }}
          onClick={() => handleClick(hint.targetX)}
          aria-label={hint.label}
          title={hint.label}
          data-testid="pairing-offscreen-jump-button"
        >
          <span className="max-w-40 truncate rounded-sm bg-background/85 px-1.5 py-0.5 shadow-sm">
            {hint.label}
          </span>
        </button>
      ))}
    </div>
  )
})

interface PairingPaneProps {
  /** Unique pane instance ID (e.g., 'pairing-1', 'pairing-2') */
  paneId: string
  draggable?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onDragEnd?: () => void
  onClose?: () => void
}

/**
 * Pairing Pane component.
 * Displays pairings with left panel showing Fleet, BLH, and Composition.
 *
 * @param paneId - Unique pane instance ID (e.g., 'pairing-1', 'pairing-2')
 */
const PairingPaneImpl = ({ paneId, draggable, onDragStart, onDragEnd, onClose }: PairingPaneProps) => {
  const interactionRef = useRef<ReturnType<typeof createPaneInteractionHandler> | null>(null)
  const canvasContainerRef = useRef<HTMLDivElement>(null)
  const canvasElementRef = useRef<HTMLCanvasElement | null>(null)
  const crossPaneDrag = useCrossPaneDrag()
  const source = useGanttSource()
  const [rubberBand, setRubberBand] = useState<RubberBandRect | null>(null)
  const [quickFilter, setQuickFilter] = useState<QuickFilterState>(EMPTY_QUICK_FILTER)
  const [quickFilterOpen, setQuickFilterOpen] = useState(false)
  const [quickSearching, setQuickSearching] = useState(false)
  const [sortDialogOpen, setSortDialogOpen] = useState(false)

  // Get pane instance from layout store
  const pane = useLayoutStore((s) => s.panes.get(paneId))
  const grid  = useLayoutStore((s) => s.grid)

  // Derive legacy pane type for backward compat with child components
  const legacyPaneType = 'pairing' as const

  // Derive "Pairing Main" / "Pairing Sub" from grid row order — mirrors roster-pane pattern.
  // F54-P01: read pane types via getState() inside the memo (keyed on grid) instead of
  // subscribing to the whole `panes` Map. Pane composition/type only changes when the grid
  // changes; subscribing to `panes` re-rendered this wrapper on EVERY viewport write
  // (including a SIBLING roster pane's vertical scroll), which forced this pane's header
  // canvas to redraw — breaking pane-scoped scroll isolation.
  const pairingTitle = useMemo(() => {
    const panes = useLayoutStore.getState().panes
    const positioned: Array<{ id: string; row: number }> = []
    for (let row = 0; row < grid.length; row++) {
      for (let col = 0; col < (grid[row]?.length ?? 0); col++) {
        const id = grid[row]?.[col]
        if (id && panes.get(id)?.type === 'pairing') {
          positioned.push({ id, row })
        }
      }
    }
    positioned.sort((a, b) => a.row - b.row)
    const idx = positioned.findIndex((p) => p.id === paneId)
    if (idx === 0) return 'Pairing'
    if (idx === 1) return 'Pairing Sub'
    return 'Pairing'
  }, [paneId, grid])

  // Get viewport from pane instance (per-pane scroll state) — must use hook for re-render
  const scrollY = useLayoutStore((s) => s.panes.get(paneId)?.viewport?.scrollY ?? 0)

  // Store data
  const loading = usePairingStore((s) => s.loading)
  const pairingProgress = usePairingStore((s) => s.progress)
  const hasData = usePairingStore((s) => s.items.length > 0)
  const pairingItems = usePairingStore((s) => s.items)
  const loadingMore = usePairingStore((s) => s.loadingMore)
  // PaneToolbar data
  const unfilteredTotal = usePairingStore((s) => s.unfilteredTotal)
  const filteredTotal = usePairingStore((s) => s.total)
  // 全局筛选是否已应用（title 徽标在 ≡ total 与 🔽 filtered/total 之间切换）
  const globalFilterActive = useFilterStore((s) => !!s.appliedFilters && hasPairingFilterValues(s.appliedFilters.pairing))
  // 已应用的全局 pairing 筛选（Filter 弹窗 Apply 后的快照）——条件 chips 的数据源，
  // 与上面的 title 徽标同源，保证 chips 与 filtered/total 徽标永远一致。
  const appliedPairingFilter = useFilterStore((s) => s.appliedFilters?.pairing ?? null)
  const sessions = usePairingStore((s) => s.sessions)
  const sortBy = usePairingStore((s) => s.sortBy)
  const sortOrder = usePairingStore((s) => s.sortOrder)
  const applySort = usePairingStore((s) => s.applySort)
  const queryMode = usePairingStore((s) => s.queryMode)
  const getLoadedCount = usePairingStore((s) => s.getLoadedCount)
  const clearFilters = usePairingStore((s) => s.clearFilters)
  const removeFilter = usePairingStore((s) => s.removeFilter)

  // Filter key labels for display
  const FILTER_KEY_LABELS: Record<string, string> = {
    label: 'Label',
    fleet: 'Fleet',
    base: 'Base',
    division: 'Division',
    segFltNum: 'Flt#',
    depArp: 'Dep',
    isFull: 'Full',
  }

  // Build filter chips from sessions
  const filterChips = useMemo((): FilterChip[] => {
    return sessions.flatMap((session, sessionIndex) =>
      Object.entries(session.filters)
        .filter(([_, v]) => v !== undefined && v !== null && v !== '')
        .map(([key, value]) => ({
          sessionId: String(session.id),
          sessionIndex,
          key,
          value: String(value),
        })),
    )
  }, [sessions])

  // Global-filter chips: the base/fleet/division/depArp/isFull values applied via the
  // Filter dialog (same pattern as roster-pane). Removing a chip drops that value from
  // filter-store and re-applies all filters via the shared applyGanttFilters() path.
  const globalFilterChips = useMemo<GlobalFilterChip[]>(() => {
    const chips = buildGlobalFilterChips(
      appliedPairingFilter,
      [
        { dim: 'bases', label: 'Base' },
        { dim: 'fleets', label: 'Fleet' },
        { dim: 'ranks', label: 'Rank' },
        { dim: 'assignments', label: 'Type' },
        { dim: 'depArps', label: 'Dep' },
        { dim: 'pairingIds', label: 'Pairing ID' },
      ],
      (dim, value) => {
        const fs = useFilterStore.getState()
        fs.setPairingFilter({ [dim]: fs.pairing[dim].filter((v) => v !== value) })
        void applyGanttFilters()
      },
    )
    if (appliedPairingFilter && appliedPairingFilter.coverage.length > 0 && appliedPairingFilter.coverage.length < ALL_COVERAGE.length) {
      chips.push({
        id: `coverage:${appliedPairingFilter.coverage.join(',')}`,
        label: 'Coverage',
        value: appliedPairingFilter.coverage.map((c) => c[0].toUpperCase() + c.slice(1)).join(', '),
        onRemove: () => {
          useFilterStore.getState().setPairingFilter({ coverage: [...ALL_COVERAGE] })
          void applyGanttFilters()
        },
      })
    }
    return chips
  }, [appliedPairingFilter])

  const selectedPairingIds = useGanttViewStore((s) => s.selectedTaskIds)
  const hoveredPairingId = useGanttViewStore((s) => s.hoveredTaskId)
  const selectTask = useGanttViewStore((s) => s.selectTask)
  const selectTasks = useGanttViewStore((s) => s.selectTasks)
  const toggleTaskSelection = useGanttViewStore((s) => s.toggleTaskSelection)
  const clearSelection = useGanttViewStore((s) => s.clearSelection)
  const setHoveredTask = useGanttViewStore((s) => s.setHoveredTask)
  const scroll = useGanttViewStore((s) => s.scroll)
  const zoomIn = useGanttViewStore((s) => s.zoomIn)
  const zoomOut = useGanttViewStore((s) => s.zoomOut)

  // Timezone for time display
  const timezone = useTimezoneStore((s) => s.timezone)

  // Enhanced segment-hover flight info: reuse the Flight-pane formatter via shared stores.
  const flightItems = useFlightStore((s) => s.items)
  const zoneIdFor = useAirportTzStore((s) => s.zoneIdFor)
  const loadAirportTz = useAirportTzStore((s) => s.load)
  const compositionById = useFlightCompositionStore((s) => s.byId)
  const loadCompositions = useFlightCompositionStore((s) => s.loadFor)
  const referenceRanks = useReferenceStore((s) => s.ranks)
  const loadReferences = useReferenceStore((s) => s.load)
  useEffect(() => { void loadReferences() }, [loadReferences])
  const rankOrderMap = useMemo(() => buildRankOrderMap(referenceRanks), [referenceRanks])

  const flightById = useMemo(() => {
    const m = new Map<number, import('@/types').Flight>()
    for (const row of flightItems) for (const f of row.flights) m.set(f.id, f)
    return m
  }, [flightItems])

  useEffect(() => { void loadAirportTz() }, [loadAirportTz])
  useEffect(() => {
    const ids = pairingItems.flatMap((pi) => pi.segments?.map((s) => s.fltId).filter((x): x is number => x != null) ?? [])
    if (ids.length > 0) void loadCompositions(ids)
  }, [pairingItems, loadCompositions])

  const setScrollY = usePaneStore((s) => s.setScrollY)
  const dateRange = usePaneStore((s) => s.dateRange)
  const globalPairingFilter = useFilterStore((s) => s.pairing)
  const paneFloating = usePaneStore((s) => s.panes.find((p) => p.type === legacyPaneType)?.floating ?? false)
  const floatPane = usePaneStore((s) => s.floatPane)
  const dockPane = usePaneStore((s) => s.dockPane)
  const dropTargetRow = usePaneStore((s) => s.getDropTargetRow(legacyPaneType))
  const leftPanelWidth = usePaneStore((s) => s.leftPanelWidth)
  const sortColumn = usePaneStore((s) => s.getSortColumn(legacyPaneType))
  const sortDirection = usePaneStore((s) => s.getSortDirection(legacyPaneType))
  const setSortColumn = usePaneStore((s) => s.setSortColumn)
  const setSortCriteria = usePaneStore((s) => s.setSortCriteria)
  const frozenRowIds = usePaneStore((s) => s.getFrozenRowIds(legacyPaneType))
  const foundPairingIds = usePaneStore((s) => s.getFoundCrewIds(legacyPaneType))
  const selectedRowIds = usePaneStore((s) => s.getSelectedRowIds(legacyPaneType))
  const selectRow = usePaneStore((s) => s.selectRow)
  const toggleRowSelection = usePaneStore((s) => s.toggleRowSelection)
  const selectRowRange = usePaneStore((s) => s.selectRowRange)
  const unfreezeRow = usePaneStore((s) => s.unfreezeRow)
  const setStatusBarText = useUiStore((s) => s.setStatusBarText)

  // Sorted pairing items (preserving segments). Coverage is a HARD filter when narrowed
  // (Open/Partial/etc.) — unified with Scenario; Full/Over rows are hidden, not floated.
  // When ranks are set, coverage classification is rank-scoped.
  // Label search is a hard filter applied before sorting; found rows can still float.
  const coverageSel = globalPairingFilter.coverage
  // Pairing ID / Label / Rank HARD filters. Applied before coverage so all downstream
  // derivations (count badge, panel rows) see only the requested pairings.
  const pairingIdFilter = globalPairingFilter.pairingIds
  const pairingLabelFilter = globalPairingFilter.label
  const rankFilter = globalPairingFilter.ranks
  const idFilteredItems = useMemo(
    () => (pairingIdFilter.length === 0 && rankFilter.length === 0 && pairingLabelFilter.trim() === ''
      ? pairingItems
      : pairingItems.filter((pi) =>
        matchesPairingIdFilter(pi.pairing.id, pairingIdFilter) &&
        matchesPairingLabelFilter(pi.pairing.pairingLabel, pairingLabelFilter) &&
        pairingCompositionMatchesRank(pi.pairing.composition ?? [], rankFilter))),
    [pairingItems, pairingIdFilter, pairingLabelFilter, rankFilter],
  )
  // Coverage narrows when a strict subset of states is selected.
  const coverageActive = coverageSel.length > 0 && coverageSel.length < ALL_COVERAGE.length
  const coverageFilteredItems = useMemo(() => {
    if (!coverageActive) return idFilteredItems
    return idFilteredItems.filter((pi) =>
      coverageMatches(coverageSel, pi.pairing.composition ?? [], rankFilter))
  }, [idFilteredItems, coverageActive, coverageSel, rankFilter])

  const sortedPairingItems = useMemo(() => {
    const sorted = sortPairingRows(coverageFilteredItems, sortColumn, sortDirection)
    const foundSet = new Set(foundPairingIds)
    if (foundSet.size === 0) return sorted
    // Explicit found rows still float first; Filter Label itself is a hard filter upstream.
    const labelTier = sorted.filter((pi) => foundSet.has(String(pi.pairing.id)))
    const rest = sorted.filter((pi) => !foundSet.has(String(pi.pairing.id)))
    return labelTier.length === 0 ? sorted : [...labelTier, ...rest]
  }, [coverageFilteredItems, sortColumn, sortDirection, foundPairingIds])

  // Extract pairings for panel row data
  const pairings = useMemo(() => sortedPairingItems.map((pi) => pi.pairing), [sortedPairingItems])

  // Build panel row data from sorted pairing items (two-line layout)
  const panelRows = useMemo((): PanelRowData[] => {
    return sortedPairingItems.map((pi) => {
      const p = pi.pairing
      // Cred: sum duty_act_credited_minutes once per duty (field is duty-level, same across all segs in a duty)
      const seenDuties = new Set<number>()
      let totalCredMin = 0
      for (const seg of (pi.segments ?? [])) {
        if (!seenDuties.has(seg.dutySeq)) {
          seenDuties.add(seg.dutySeq)
          totalCredMin += seg.dutyActCreditedMinutes ? Number(seg.dutyActCreditedMinutes) : 0
        }
      }
      const cred = totalCredMin > 0 ? formatBlockMinutes(totalCredMin) : '-'
      return {
        rowId: String(p.id),
        values: {
          pairingId: p.pairingLabel || `P-${p.id}`,
          base: p.base ?? '',
          type: p.assignmentGroup ?? '',
          fleet: p.fleet ?? '',
          blh: p.blockMinutes ? formatBlockMinutes(p.blockMinutes) : '-',
          cred,
          composition: buildCompositionString(p, rankOrderMap),
        },
        compositionSegments: buildCompositionSegments(p, rankOrderMap),
        isFull: p.isFull,
      }
    })
  }, [sortedPairingItems, rankOrderMap])

  // Reorder: frozen rows first, then non-frozen
  const { reorderedPairingItems, reorderedPanelRows, frozenRowCount, selectedRowIndices } = useMemo(() => {
    const frozenSet = new Set(frozenRowIds)
    const selectedSet = new Set(selectedRowIds)
    const frozen: typeof sortedPairingItems = []
    const nonFrozen: typeof sortedPairingItems = []
    const frozenRows: PanelRowData[] = []
    const nonFrozenRows: PanelRowData[] = []

    for (let i = 0; i < sortedPairingItems.length; i++) {
      const item = sortedPairingItems[i]
      const row = panelRows[i]
      const id = String(item.pairing.id)
      if (frozenSet.has(id)) {
        frozen.push(item)
        if (row) frozenRows.push(row)
      } else {
        nonFrozen.push(item)
        if (row) nonFrozenRows.push(row)
      }
    }

    const items = [...frozen, ...nonFrozen]
    const rows = [...frozenRows, ...nonFrozenRows]

    const selIdx = new Set<number>()
    for (let i = 0; i < items.length; i++) {
      if (selectedSet.has(String(items[i].pairing.id))) selIdx.add(i)
    }

    return {
      reorderedPairingItems: items,
      reorderedPanelRows: rows,
      frozenRowCount: frozen.length,
      selectedRowIndices: selIdx,
    }
  }, [sortedPairingItems, panelRows, frozenRowIds, selectedRowIds])

  // Test introspection: publish the rendered pairing row order (no-op in prod build).
  useEffect(() => {
    publishPairingOrder(
      legacyPaneType,
      reorderedPairingItems.map((pi) => ({ id: String(pi.pairing.id), label: pi.pairing.pairingLabel ?? '' })),
    )
  }, [legacyPaneType, reorderedPairingItems])

  // ─── Stable ref for items (used in callbacks to avoid recreating them) ───
  const itemsRef = useRef(reorderedPairingItems)
  itemsRef.current = reorderedPairingItems

  // Target roster pane for "Find Crew": Pairing Sub → Roster Sub, else Roster Main.
  const targetRosterPaneRef = useRef<'main' | 'sub'>('main')
  targetRosterPaneRef.current = pairingTitle === 'Pairing Sub' ? 'sub' : 'main'

  // Refs for volatile data used in stable callbacks
  // F54-P03: scroll/zoom values are read fresh from the stores at event time instead of
  // ref-mirrored subscriptions — the pane no longer re-renders on every scrollX pixel.
  const dateRangeStartRef = useRef(dateRange.start)
  dateRangeStartRef.current = dateRange.start
  const frozenRowCountRef = useRef(frozenRowCount)
  frozenRowCountRef.current = frozenRowCount

  // ─── Auto-load more pairings when scrolling near bottom ───
  // Use getState() to read latest values and avoid triggering on stale state during re-renders
  useEffect(() => {
    // Skip if conditions not met - read fresh values from store to avoid stale closure issues
    const store = usePairingStore.getState()
    if (store.loadingMore || !store.getHasMore() || store.items.length === 0) return

    const containerHeight = canvasContainerRef.current?.clientHeight ?? 600
    const viewportHeight = containerHeight - HEADER_HEIGHT
    const contentHeight = store.items.length * SEGMENT_ROW_HEIGHT
    const maxScrollY = Math.max(0, contentHeight - viewportHeight)
    const threshold = maxScrollY - 10 * SEGMENT_ROW_HEIGHT

    // Only trigger if scrollY is near bottom (within threshold)
    // Use scrollY from layout-store viewport (already subscribed via hook)
    if (scrollY > threshold && scrollY > 0) {
      store.loadMore()
    }
  }, [scrollY])

  // ─── Quick filter: debounced server-side search ───────────────────────
  const prevQuickSearchRef = useRef('')
  useEffect(() => {
    const store = usePairingStore.getState()
    const search = quickFilter.search.trim()
    const prevSearch = prevQuickSearchRef.current
    prevQuickSearchRef.current = search
    if (!search) {
      // Restore the global-filter baseline only when CLEARING a previous quick
      // search. Running this on mount (or on dateRange / global-filter changes)
      // would duplicate the orchestrated loads from applyGanttFilters /
      // refreshAllPanes — and would break the Live empty start, where nothing
      // may load before the first filter apply.
      if (!prevSearch) return
      store.setQueryMode('replace')
      store.fetchPairings(dateRange, globalPairingFilter)
      setQuickSearching(false)
      return
    }

    setQuickSearching(true)
    const timer = setTimeout(async () => {
      store.setQueryMode('replace')
      await store.search({
        ...pairingFilterToListParams(globalPairingFilter),
        label: quickFilter.search.trim(),
      })
      setQuickSearching(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [quickFilter.search, dateRange, globalPairingFilter])

  // ─── Columns ─────────────────────────────────────────────────────────
  const columns = useColumnStore((s) => s.getVisibleColumns(legacyPaneType))
  const updateColumn = useColumnStore((s) => s.updateColumn)

  // V4-P02: build duty buckets once when reordered items change (avoids per-frame Map + sort)
  const dutyBuckets = useMemo(() => buildPairingDutyBuckets(reorderedPairingItems), [reorderedPairingItems])

  // ─── Render callback — uses items directly (segments already in store) ──
  const renderContent = useCallback((ctx: CanvasRenderingContext2D, base: BaseRenderContext) => {
    const pairingCtx: PairingRenderContext = {
      ...base,
      items: reorderedPairingItems,
      selectedPairingIds,
      hoveredPairingId,
      timezone,
      showSessionTags: sessions.length > 1,
      dutyBuckets,
    }
    renderPairingTasks(pairingCtx)

    // Draw loading indicator at bottom when loading more pairings
    if (loadingMore) {
      ctx.save()
      ctx.fillStyle = 'rgba(100, 100, 100, 0.06)'
      ctx.fillRect(0, base.canvasHeight - 24, base.canvasWidth, 24)
      ctx.fillStyle = '#888'
      ctx.font = '11px -apple-system, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.fillText('Loading more pairings...', base.canvasWidth / 2, base.canvasHeight - 4)
      ctx.restore()
    }
  }, [reorderedPairingItems, selectedPairingIds, hoveredPairingId, timezone, sessions.length, loadingMore, dutyBuckets])

  // Hit test — uses refs for volatile data
  const getHitTest = useCallback(() => {
    return (canvasX: number, canvasY: number): HitTestResult | null => {
      const { scrollX: sX, pxPerHour: pph } = useGanttViewStore.getState()
      const sY = useLayoutStore.getState().panes.get(paneId)?.viewport?.scrollY ?? 0
      const drStart = dateRangeStartRef.current
      const frc = frozenRowCountRef.current
      const items = itemsRef.current

      // Calculate row index and Y position (per pairing-renderer.ts logic)
      const relY = canvasY - PAIRING_HEADER_HEIGHT
      const frozenZone = frc * SEGMENT_ROW_HEIGHT
      let rowIndex: number
      let rowCanvasY: number  // top Y of this row on canvas

      if (frc > 0 && relY < frozenZone) {
        // Frozen row: doesn't scroll, positioned at top
        rowIndex = Math.floor(relY / SEGMENT_ROW_HEIGHT)
        rowCanvasY = PAIRING_HEADER_HEIGHT + rowIndex * SEGMENT_ROW_HEIGHT
      } else {
        // Scrollable row: offset by scrollY
        rowIndex = Math.floor((relY + sY) / SEGMENT_ROW_HEIGHT)
        rowCanvasY = PAIRING_HEADER_HEIGHT + rowIndex * SEGMENT_ROW_HEIGHT - sY
      }

      if (rowIndex < 0 || rowIndex >= items.length) return null

      const item = items[rowIndex]
      const pairing = item?.pairing
      const segments = item?.segments ?? []

      // Flight puck vertical position (centered in row, 20px height)
      const centerY = rowCanvasY + Math.floor(SEGMENT_ROW_HEIGHT / 2)
      const flightY = centerY - Math.floor(SEGMENT_FLIGHT_HEIGHT / 2)  // puck top edge

      const isOnFlightPuck = canvasY >= flightY && canvasY <= flightY + SEGMENT_FLIGHT_HEIGHT

      if (isOnFlightPuck) {
        for (const seg of segments) {
          if (!seg.schStrDtUtc || !seg.schEndDtUtc) continue
          const segStart = timeToX(parseIsoCached(seg.schStrDtUtc), drStart, pph) - sX
          const segEnd = timeToX(parseIsoCached(seg.schEndDtUtc), drStart, pph) - sX
          const segWidth = Math.max(segEnd - segStart, MIN_TASK_WIDTH)
          if (canvasX >= segStart && canvasX <= segStart + segWidth) {
            return {
              type: 'pairing',
              itemId: seg.id,
              rowIndex,
              rowId: String(pairing.id),
              pairingId: pairing.id,
              segmentId: seg.id,
            }
          }
        }
      }

      return {
        type: 'background',
        itemId: null,
        rowIndex,
        rowId: String(pairing.id),
      }
    }
  }, [paneId])

  // Interaction callbacks — stable, uses refs for volatile data
  const interactionCallbacks = useMemo((): PaneInteractionCallbacks => ({
    onItemClick: (hit, ctrlKey) => {
      if (hit.itemId !== null) {
        ctrlKey ? toggleTaskSelection(hit.itemId) : selectTask(hit.itemId)
      }
    },
    onItemDoubleClick: (hit) => {
      // Double-click a pairing (puck or its row) → open the Pairing Info popup.
      const pid = hit.pairingId ?? (hit.rowId ? Number(hit.rowId) : null)
      if (pid != null && !Number.isNaN(pid)) {
        useUiStore.getState().openPairingInfo(pid)
      }
    },
    onItemRightClick: (hit, clientX, clientY) => {
      // Mirror SharedPairingPane: pre-compute the vertical-scroll target for the
      // "Jump to this day's pairing" menu action. Converts the click's screen X to
      // canvas-relative X, then to a local-day timestamp, then finds the matching
      // pairing row (exact-midnight match, otherwise the latest-starting pairing of
      // an earlier day up to 365 days back). See findPairingStartingAtDay.
      let jumpToDayScrollY: number | null = null
      const canvas = canvasElementRef.current
      if (canvas) {
        const rect = canvas.getBoundingClientRect()
        const { scrollX: sx, pxPerHour: pph } = useGanttViewStore.getState()
        const { start: rangeStart } = usePaneStore.getState().dateRange
        const canvasX = clientX - rect.left
        const clickedTime = xToTime(canvasX + sx, rangeStart, pph)
        const clickedDayMs = startOfDay(clickedTime).getTime()
        const items = itemsRef.current
        const targetRowIndex = findPairingStartingAtDay(items, clickedDayMs)
        if (targetRowIndex >= 0) {
          const canvasH = rect.height
          const targetY = Math.max(0, targetRowIndex * SEGMENT_ROW_HEIGHT - PAIRING_HEADER_HEIGHT)
          const maxY = Math.max(0, items.length * SEGMENT_ROW_HEIGHT - canvasH + PAIRING_HEADER_HEIGHT)
          jumpToDayScrollY = Math.max(0, Math.min(maxY, targetY))
        }
      }
      if (hit.itemId !== null) {
        selectTask(hit.itemId)
        const item = itemsRef.current.find((pi) => pi.pairing.id === hit.pairingId)
        const seg = item?.segments?.find((s) => s.id === hit.itemId)
        const mockTask = {
          id: hit.itemId,
          pairingId: hit.pairingId,
          segmentId: hit.segmentId,
          findFltId: seg?.fltId ?? null,
          findTargetPane: targetRosterPaneRef.current,
        } as never
        useUiStore.getState().openContextMenu(clientX, clientY, mockTask, legacyPaneType, hit.rowIndex, undefined, jumpToDayScrollY)
      } else if (hit.rowIndex >= 0) {
        const mockTask = { id: -1 } as never
        useUiStore.getState().openContextMenu(clientX, clientY, mockTask, legacyPaneType, hit.rowIndex, undefined, jumpToDayScrollY)
      }
    },
    onItemHover: (hit, clientX, clientY) => {
      setHoveredTask(hit?.itemId ?? null, clientX, clientY)
      if (hit?.itemId && hit?.pairingId) {
        const item = itemsRef.current.find((pi) => pi.pairing.id === hit.pairingId)
        const p = item?.pairing
        const seg = item?.segments?.find((s) => s.id === hit.itemId)
        if (p && seg) {
          // Keep the Pairing #/Seg # prefix; enhance the flight portion via the shared Flight-pane formatter.
          const info = segmentFlightInfo(seg.fltId, {
            airline: seg.airline, fltNum: seg.fltNum, depArp: seg.depArp, arvArp: seg.arvArp,
            schDepDtUtc: seg.schStrDtUtc, schArvDtUtc: seg.schEndDtUtc, fleet: p.fleet,
          }, { ganttZoneId: timezone, zoneIdFor, compositionById, flightById })
          const flightPart = info ?? `${seg.fltNum ?? ''} ${seg.depArp ?? ''}-${seg.arvArp ?? ''}  |  ${seg.schStrDtUtc?.slice(11, 16) ?? ''} ~ ${seg.schEndDtUtc?.slice(11, 16) ?? ''}`
          // Pairing total credit (sum of duty credits, deduped by dutySeq) shown right after the
          // Pairing #, matching the Pairing Info dialog's "Total Credit"; omitted when no duty has credit.
          const credit = formatCreditMinutes(sumPairingCreditMinutes(item.segments ?? []))
          const head = credit ? `Pairing #${p.id}  ·  Credit ${credit}` : `Pairing #${p.id}`
          setStatusBarText(`${head}  ·  Seg #${seg.segSeq}  ·  ${flightPart}`)
        } else if (p) {
          setStatusBarText(`Pairing #${p.id}  |  ${p.fleet ?? ''}  |  ${p.schStrDtUtc?.slice(5, 16) ?? ''} ~ ${p.schEndDtUtc?.slice(11, 16) ?? ''}`)
        }
      } else {
        setStatusBarText('')
      }
    },
    onDragStart: (hit, clientX, clientY) => {
      if (!hit.pairingId || !crossPaneDrag) return
      const canvas = canvasElementRef.current
      if (!canvas) return
      crossPaneDrag.startDrag({
        paneType: legacyPaneType,
        itemId: hit.pairingId,
        itemType: 'pairing',
        sourceRowId: hit.rowId,
        startClientX: clientX,
        startClientY: clientY,
        sourceCanvasRect: canvas.getBoundingClientRect(),
      })
    },
    onDragMove: () => {},
    onDragEnd: () => {},
    onBackgroundClick: () => { clearSelection() },
    onScroll: (dx, dy) => {
      // F54-P01: horizontal pan affects shared scrollX → scroll() sets global dirty itself;
      // vertical-only wheel is pane-scoped — no global markDirty (all-pane redraw).
      if (dx !== 0) scroll(dx, 0)
      // Use getState() for immediate scroll update (no React re-render needed)
      const containerHeight = canvasContainerRef.current?.clientHeight ?? 600
      const items = itemsRef.current
      const maxScrollY = Math.max(0, items.length * SEGMENT_ROW_HEIGHT - (containerHeight - HEADER_HEIGHT))
      const currentScrollY = useLayoutStore.getState().panes.get(paneId)?.viewport?.scrollY ?? 0
      useLayoutStore.getState().setViewport(paneId, { scrollY: Math.max(0, Math.min(maxScrollY, currentScrollY + dy)) })
    },
    onZoom: (direction) => {
      if (direction === 'in') zoomIn()
      else zoomOut()
    },
    onRubberBandChange: (rect) => {
      setRubberBand(rect)
    },
    onRubberBandSelect: (x1, y1, x2, y2, additive) => {
      const { scrollX: sx, pxPerHour: pph } = useGanttViewStore.getState()
      const sy = useLayoutStore.getState().panes.get(paneId)?.viewport?.scrollY ?? 0
      const frc = frozenRowCountRef.current
      const { start } = usePaneStore.getState().dateRange
      const minY = Math.min(y1, y2)
      const maxY = Math.max(y1, y2)
      const absMinX = Math.min(x1, x2) + sx
      const absMaxX = Math.max(x1, x2) + sx
      const items = itemsRef.current
      const ids: number[] = []
      for (let ri = 0; ri < items.length; ri++) {
        // Row Y position on canvas (per pairing-renderer.ts logic)
        const rowCanvasY = ri < frc
          ? PAIRING_HEADER_HEIGHT + ri * SEGMENT_ROW_HEIGHT  // frozen: no scroll offset
          : PAIRING_HEADER_HEIGHT + ri * SEGMENT_ROW_HEIGHT - sy  // scrollable
        if (minY > rowCanvasY + SEGMENT_ROW_HEIGHT || maxY < rowCanvasY) continue
        const p = items[ri]?.pairing
        const pStart = timeToX(parseIsoCached(p.schStrDtUtc), start, pph)
        const pEnd = Math.max(timeToX(parseIsoCached(p.schEndDtUtc), start, pph), pStart + MIN_TASK_WIDTH)
        if (absMinX <= pEnd && absMaxX >= pStart) ids.push(p.id)
      }
      if (additive) {
        const existing = useGanttViewStore.getState().selectedTaskIds
        selectTasks([...existing, ...ids])
      } else {
        selectTasks(ids)
      }
      setRubberBand(null)
    },
  }), [selectTask, selectTasks, clearSelection, setHoveredTask, setStatusBarText, scroll, zoomIn, zoomOut, crossPaneDrag, legacyPaneType, paneId, timezone, zoneIdFor, compositionById, flightById])

  const handleCanvasReady = useCallback((canvas: HTMLCanvasElement) => {
    canvasElementRef.current = canvas
    const handler = createPaneInteractionHandler(legacyPaneType, getHitTest, interactionCallbacks)
    handler.attach(canvas)
    interactionRef.current = handler

    crossPaneDrag?.registerPane({
      paneType: legacyPaneType,
      getCanvasElement: () => canvasElementRef.current,
      getScrollY: () => useLayoutStore.getState().panes.get(paneId)?.viewport?.scrollY ?? 0,
      getRowCount: () => itemsRef.current.length,
      getRowId: (rowIndex) => itemsRef.current[rowIndex] ? String(itemsRef.current[rowIndex].pairing.id) : null,
    })
  }, [getHitTest, interactionCallbacks, crossPaneDrag, legacyPaneType])

  const handleCanvasDestroy = useCallback(() => {
    if (interactionRef.current) {
      interactionRef.current.detach()
      interactionRef.current = null
    }
    canvasElementRef.current = null
    crossPaneDrag?.unregisterPane(legacyPaneType)
  }, [crossPaneDrag, legacyPaneType])

  const handleColumnHeaderClick = useCallback((columnKey: string) => {
    setSortColumn(legacyPaneType, columnKey)
  }, [setSortColumn, legacyPaneType])

  const handleColumnWidthChange = useCallback((columnKey: string, newWidth: number) => {
    updateColumn(legacyPaneType, columnKey, { width: newWidth })
  }, [updateColumn, legacyPaneType])

  // Header wheel handler — use getState() to avoid double markDirty
  const handleHeaderWheel = useCallback((deltaY: number) => {
    const containerHeight = canvasContainerRef.current?.clientHeight ?? 600
    const items = itemsRef.current
    const maxScrollY = Math.max(0, items.length * SEGMENT_ROW_HEIGHT - (containerHeight - HEADER_HEIGHT))
    // Read current scroll directly from store (not React state) for immediate update
    const currentScrollY = useLayoutStore.getState().panes.get(paneId)?.viewport?.scrollY ?? 0
    // F54-P01: pane-scoped vertical scroll — no global markDirty.
    useLayoutStore.getState().setViewport(paneId, { scrollY: Math.max(0, Math.min(maxScrollY, currentScrollY + deltaY)) })
  }, [paneId])

  // F54-P04: stable callbacks + memoized chip array for the memoized PaneConditionStrip.
  const clearQuickSearch = useCallback(() => setQuickFilter((prev) => ({ ...prev, search: '' })), [])
  const clearQuickFrozen = useCallback(() => setQuickFilter((prev) => ({ ...prev, frozenOnly: false })), [])
  const quickFilterChips = useMemo(
    () => getQuickFilterChips(quickFilter, clearQuickSearch, clearQuickFrozen),
    [quickFilter, clearQuickSearch, clearQuickFrozen],
  )
  const handleQueryModeToggle = useCallback(() => {
    const s = usePairingStore.getState()
    s.setQueryMode(s.queryMode === 'replace' ? 'append' : 'replace')
  }, [])
  const handleQuickFilterToggle = useCallback(() => setQuickFilterOpen((o) => !o), [])
  const handleFilterOpen = useCallback(() => useShellStore.getState().openFilterDialog('pairing'), [])
  const handleRemoveFilter = useCallback(
    (sessionId: string, key: string) => removeFilter(Number(sessionId), key as keyof PairingFilters),
    [removeFilter],
  )

  // ── Dedicated pairing sort: the Sort dialog + chips drive the server-side
  // sortBy/sortOrder (whole dataset ordered before paging). Applying a sort also
  // clears any client-side header-click sort so the server order stays authoritative.
  const handleSortOpen = useCallback(() => setSortDialogOpen(true), [])
  const applyServerSort = useCallback(
    (nextSortBy: PairingSortBy, nextSortOrder: 'asc' | 'desc') => {
      setSortCriteria(legacyPaneType, [])
      void applySort(nextSortBy, nextSortOrder)
    },
    [applySort, setSortCriteria, legacyPaneType],
  )
  const handleSortApply = useCallback(
    (criteria: SortCriterion[]) => {
      const primary = criteria[0]
      if (!primary) {
        applyServerSort(DEFAULT_PAIRING_SORT_BY, DEFAULT_PAIRING_SORT_ORDER)
        return
      }
      applyServerSort(primary.column as PairingSortBy, primary.direction)
    },
    [applyServerSort],
  )
  const sortInitialCriteria = useMemo<SortCriterion[]>(
    () => [{ column: sortBy ?? DEFAULT_PAIRING_SORT_BY, direction: sortOrder ?? DEFAULT_PAIRING_SORT_ORDER }],
    [sortBy, sortOrder],
  )
  // Chip is shown only for a non-default sort (mirrors roster: default = no chip).
  // Closing it reverts to the default Sch Start ascending sort.
  const sortChips = useMemo<SortChip[]>(() => {
    const activeBy = sortBy ?? DEFAULT_PAIRING_SORT_BY
    const activeOrder = sortOrder ?? DEFAULT_PAIRING_SORT_ORDER
    if (activeBy === DEFAULT_PAIRING_SORT_BY && activeOrder === DEFAULT_PAIRING_SORT_ORDER) return []
    return [{
      key: activeBy,
      label: PAIRING_SORT_LABELS[activeBy] ?? activeBy,
      direction: activeOrder,
      onRemove: () => applyServerSort(DEFAULT_PAIRING_SORT_BY, DEFAULT_PAIRING_SORT_ORDER),
    }]
  }, [sortBy, sortOrder, applyServerSort])

  // Title badge: funnel when a server facet OR narrowed coverage is active.
  // Client hard filters (coverage / ranks / id / label) reshape the visible list after
  // the API total — use coverageFilteredItems.length so the numerator matches the pane
  // (loaded matching rows; API still has no rank/coverage facets).
  const clientHardFilterActive =
    coverageActive ||
    rankFilter.length > 0 ||
    pairingIdFilter.length > 0 ||
    pairingLabelFilter.trim() !== ''
  const badgeFilterActive = globalFilterActive || coverageActive
  const badgeFilteredTotal = clientHardFilterActive
    ? coverageFilteredItems.length
    : filteredTotal

  return (
    <div className="flex flex-1 flex-col overflow-hidden" data-testid="pairing-pane">
      <PaneToolbar
        paneType={legacyPaneType}
        title={pairingTitle}
        unfilteredTotal={unfilteredTotal}
        filteredTotal={badgeFilteredTotal}
        globalFilterActive={badgeFilterActive}
        loadedCount={getLoadedCount()}
        draggable={draggable}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      />
      <SortDialog
        open={sortDialogOpen}
        onOpenChange={setSortDialogOpen}
        paneLabel={pairingTitle}
        fields={PAIRING_SORT_FIELDS}
        initialCriteria={sortInitialCriteria}
        onApply={handleSortApply}
      />
      {quickFilterOpen && (
        <PaneQuickFilter
          value={quickFilter}
          onChange={setQuickFilter}
          searching={quickSearching}
        />
      )}
      <PaneLoadingBar progress={pairingProgress} />
      <div ref={canvasContainerRef} className="relative flex flex-1 overflow-hidden">
        <PaneConditionStrip
          paneType={legacyPaneType}
          filterChips={filterChips}
          globalFilterChips={globalFilterChips}
          sortChips={sortChips}
          quickFilterChips={quickFilterChips}
          queryMode={queryMode}
          onQueryModeToggle={handleQueryModeToggle}
          onFilterClick={handleFilterOpen}
          onSortClick={handleSortOpen}
          quickFilterOpen={quickFilterOpen}
          onQuickFilterToggle={handleQuickFilterToggle}
          onClearAll={clearFilters}
          onRemoveFilter={handleRemoveFilter}
          onResPairingClick={source?.pairing?.capabilities?.canCreateRes ? () => useResPlannerStore.getState().open() : undefined}
          onClose={onClose}
        />
        <PairingOffscreenJumpHint
          paneId={paneId}
          items={reorderedPairingItems}
          frozenRowCount={frozenRowCount}
          scrollY={scrollY}
          containerRef={canvasContainerRef}
          timezone={timezone}
        />
        {/* Accessibility mirror: distinct pairingLabel values in DOM so screen readers
            and Playwright tests can assert Canvas-rendered pairing labels without
            parsing pixel data. Visually hidden via sr-only (1×1px, clipped). */}
        <div
          aria-label="Loaded pairing labels"
          className="sr-only"
        >
          {[...new Set(pairings.map((p) => p.pairingLabel).filter(Boolean))].map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
        <div aria-label="Pairing compositions" className="sr-only" data-testid="pairing-composition-mirror">
          {reorderedPanelRows.map((row) => (
            <span key={row.rowId} data-testid={`pairing-comp-${row.rowId}`}>
              {(row.compositionSegments ?? []).map((s) => s.text).join('')}
            </span>
          ))}
        </div>
        <PaneHeaderCanvas
          paneId={paneId}
          paneType={legacyPaneType}
          leftPanelWidth={leftPanelWidth}
          columns={columns}
          rows={reorderedPanelRows}
          sortColumn={sortColumn}
          sortDirection={sortDirection}
          frozenRowCount={frozenRowCount}
          selectedRowIndices={selectedRowIndices}
          twoLineHeader={true}
          bottomHeaderLabel="Comp"
          twoLineRows={true}
          bottomRowKey="composition"
          onColumnHeaderClick={handleColumnHeaderClick}
          onColumnWidthChange={handleColumnWidthChange}
          onWheel={handleHeaderWheel}
          onRowClick={(ri, ctrlKey, shiftKey) => {
            const rowId = String(reorderedPairingItems[ri]?.pairing.id)
            if (!rowId) return
            const allIds = reorderedPairingItems.map((pi) => String(pi.pairing.id))
            if (shiftKey) selectRowRange(legacyPaneType, rowId, allIds)
            else if (ctrlKey) toggleRowSelection(legacyPaneType, rowId)
            else selectRow(legacyPaneType, rowId)
            useGanttViewStore.getState().markDirty()
          }}
          onUnfreezeRow={(rowId) => {
            unfreezeRow(legacyPaneType, rowId)
            useGanttViewStore.getState().markDirty()
          }}
          onRowRightClick={(ri, cx, cy) => {
            const mockTask = { id: -1 } as never
            useUiStore.getState().openContextMenu(cx, cy, mockTask, legacyPaneType, ri)
          }}
        />
        <VerticalSplitter />
        <PaneCanvas
          paneId={paneId}
          paneType={legacyPaneType}
          canvasTestId="pairing-canvas"
          totalRows={reorderedPairingItems.length}
          frozenRowCount={frozenRowCount}
          selectedRowIndices={selectedRowIndices}
          dropTargetRow={dropTargetRow}
          rowHeight={SEGMENT_ROW_HEIGHT}
          renderContent={renderContent}
          onCanvasReady={handleCanvasReady}
          onCanvasDestroy={handleCanvasDestroy}
          rubberBand={rubberBand}
        />
      </div>
    </div>
  )
}

/**
 * F54-P01: memoized so a parent re-render (the layout grid rebuilds its `panes` Map on every
 * viewport write — including a SIBLING roster/flight pane's pane-scoped vertical scroll) does
 * NOT cascade into this pane and force its header/content canvases to redraw. Props from
 * PaneWrapper (paneId + memoized drag handlers) are referentially stable, so memo holds across
 * sibling-scroll re-renders while this pane still re-renders normally on its own store updates.
 */
export const PairingPane = memo(PairingPaneImpl)
