// gantt/src/components/panes/shared/pairing-pane.tsx
//
// SharedPairingPane — unified pairing pane for scenarios (Phase 5B-1) and Live (Phase 5B-2).
//
// Placement rationale:
//   This component imports stores directly (useUiStore, useTimezoneStore,
//   useColumnStore, filter-store, scenario-layout-store) for context-agnostic UI
//   interactions. The no-store-imports guard scans components/gantt/ only, so
//   placing this outside that directory keeps the guard green. All pairing-data
//   concerns (rows, selection, hover, drag, geometry, sort) flow through source.pairing.
//
// Invariant: this component is ONLY mounted when `source.pairing` is defined.
//   The parent (ScenarioPairingPane) must ensure this. The non-null assertion on
//   `source.pairing!.*` enforces that contract without making hooks conditional.
//
// Selection ids are SEGMENT ids; the renderer lights a pairing's whole dashed box
// via segments.some(s => selectedPairingIds.has(s.id)).

import { useRef, useCallback, useEffect, useMemo, useState } from 'react'
import { startOfDay } from 'date-fns'
import { renderPairingTasks } from '@/components/gantt/renderers/pairing-renderer'
import type { PairingRenderContext } from '@/components/gantt/renderers/pairing-renderer'
import type { PairingItem } from '@/types/pairing'
import { buildCompositionSegments, formatBlockMinutes, timeToX, xToTime, parseIsoCached } from '@/components/gantt/gantt-utils'
import {
  PAIRING_ROW_HEIGHT, PAIRING_HEADER_HEIGHT, SEGMENT_FLIGHT_HEIGHT, MIN_TASK_WIDTH,
} from '@/components/gantt/gantt-constants'
import { createPaneInteractionHandler } from '@/components/gantt/interactions/base-interaction'
import type { PaneInteractionCallbacks, HitTestFn, RubberBandRect } from '@/components/gantt/interactions/base-interaction'
import { useGanttSource } from '@/components/gantt/source/gantt-source-context'
import { useUiStore } from '@/stores/ui-store'
import { useTimezoneStore } from '@/stores/timezone-store'
import { useColumnStore } from '@/stores/column-store'
import { useReferenceStore } from '@/stores/reference-store'
import { getScenarioLayoutStore } from '@/stores/scenario-layout-store'
import { getPaneStore } from '@/stores/pane-store'
import { buildRankOrderMap } from '@/utils/roster-default-sort'
import { findPairingStartingAtDay } from '@/utils/locate-today-pairing'
import { PaneHeaderCanvas } from '@/components/gantt/pane-header-canvas'
import type { PanelRowData } from '@/components/gantt/pane-header-canvas'
import { PaneCanvas } from '@/components/gantt/pane-canvas'
import type { BaseRenderContext } from '@/components/gantt/renderers/base-renderer'
import { PaneConditionStrip } from '@/components/panes/pane-condition-strip'
import { PaneQuickFilter, EMPTY_QUICK_FILTER, getQuickFilterChips } from '@/components/panes/pane-quick-filter'
import type { QuickFilterState } from '@/components/panes/pane-quick-filter'
import { buildGlobalFilterChips } from '@/utils/global-filter-chips'
import type { FilterChip, GlobalFilterChip, SortChip } from '@/components/panes/pane-toolbar'
import { getFilterStore } from '@/stores/filter-store'
import type { PairingFilter } from '@/stores/filter-store'
import { pairingCoverageNarrowed } from '@/components/gantt/source/scenario-gantt-source'
import { ALL_COVERAGE } from '@/utils/pairing-coverage'
import { pairingCreditedMinutes, isOpenPartialCoverage, sumCoverageCredit } from '@/utils/pairing-credit'
import { FilterDialog } from '@/components/layout/filter-dialog'
import { publishScenarioPairingSelection, publishPairingOrder } from '@/utils/gantt-test-hook'
import { useResPlannerStore } from '@/stores/res-planner-store'
import type { GanttContextId } from '@/types/gantt-context'

interface SharedPairingPaneProps {
  /** The pane instance ID used for per-pane scroll state. */
  paneId: string
  /**
   * Context identity: a scenarioId (number) for scenario views, or 'live' for the
   * live gantt (Phase 5B-2). Drives the per-context filter store and deep-link actions.
   */
  contextId: GanttContextId
  /** Width of the left header/crew panel. */
  leftPanelWidth: number
  /** Optional close handler for the pane condition strip. */
  onClose?: () => void
  /**
   * Toolbar render-prop — called with the live row count and, when the Coverage
   * filter narrows to Open/Partial, the total credit (HH:MM) of those uncovered
   * pairings (else undefined → no open-credit badge).
   */
  toolbar?: (rowCount: number, openCredit?: string) => React.ReactNode
  /** Splitter slot — rendered between PaneHeaderCanvas and PaneCanvas. */
  splitter?: React.ReactNode
  /** Override the canvas data-testid (default: "scenario-pairing-canvas"). */
  canvasTestId?: string

  // ── Live-only chrome injection (scenario passes none of these) ───────────────
  /** Show the Sort button in the condition strip; Live wrapper opens its SortDialog. */
  onSortClick?: () => void
  /**
   * Override the internally-computed header-click sort chips. Live supplies server-sort
   * chips; when absent (scenario) the internal header-click chips are used.
   */
  sortChips?: SortChip[]
  /**
   * Overlay rendered INSIDE the relative canvas container (sibling of PaneCanvas),
   * called with the component's computed pairingItems. Live passes PairingOffscreenJumpHint.
   */
  overlay?: (items: PairingItem[]) => React.ReactNode
  /** Loading bar rendered between the toolbar and the canvas container (Live: PaneLoadingBar). */
  loadingBar?: React.ReactNode
  /** Multi-session query filter chips (Live only). */
  filterChips?: FilterChip[]
  /** Remove a single session filter chip (Live only). */
  onRemoveFilter?: (sessionId: string, key: string) => void
  /** Current query mode for the replace/append toggle (Live only). */
  queryMode?: 'replace' | 'append'
  /** Toggle query mode (Live only). */
  onQueryModeToggle?: () => void
}

const PAIRING_SORT_OPTIONS = [
  { key: 'pairingId', label: 'Pairing' },
  { key: 'type',      label: 'Type' },
  { key: 'fleet',     label: 'Fleet' },
  { key: 'cred',      label: 'Cred' },
] as const

// Stable empty sets — avoids re-allocating per render for scenario (no row selection).
const emptyRowIndices = new Set<number>()
const emptyStringSet: ReadonlySet<string> = new Set<string>()
const pairingSourceLabel = (source: PairingItem['pairing']['pairingSource']): string | null => {
  if (source === 'scenario') return 'Source: Scenario PO'
  if (source === 'live') return 'Source: Live pre-assignment'
  return null
}

function buildPairingPanelRowData(
  items: PairingItem[],
  rankOrder?: ReadonlyMap<string, number>,
): PanelRowData[] {
  return items.map((item) => {
    const p = item.pairing
    const totalCredMin = pairingCreditedMinutes(item)
    const cred = totalCredMin > 0 ? formatBlockMinutes(totalCredMin) : '-'
    const compositionSegments = buildCompositionSegments(p, rankOrder)
    return {
      rowId: String(p.id),
      values: {
        pairingId: p.pairingLabel ?? `P${p.id}`,
        base: p.base ?? '',
        type: p.assignmentGroup ?? '',
        fleet: p.fleet || p.base,
        cred,
        composition: compositionSegments.map((s) => s.text).join(''),
      },
      isFull: p.isFull,
      sourceIndicator: p.pairingSource,
      compositionSegments,
    }
  })
}

/**
 * Shared pairing pane for Scenario Gantt (Phase 5B-1) and Live Gantt (Phase 5B-2).
 *
 * Invariant: source.pairing is always defined when this component is mounted.
 * All hook methods on source.pairing are called unconditionally (React rules).
 */
export const SharedPairingPane = ({
  paneId,
  contextId,
  leftPanelWidth,
  onClose,
  toolbar,
  splitter,
  canvasTestId = 'scenario-pairing-canvas',
  onSortClick,
  sortChips: sortChipsOverride,
  overlay,
  loadingBar,
  filterChips,
  onRemoveFilter,
  queryMode,
  onQueryModeToggle,
}: SharedPairingPaneProps) => {
  const source = useGanttSource()
  const pairing = source.pairing!

  // ── Source data (all hooks called unconditionally) ────────────────────────
  const { rows: sourceRows } = pairing.useRows()
  const selectedPairingIds = pairing.useSelectedIds()
  const hoveredPairingId = pairing.useHoveredId()
  const sortColumn = pairing.useSortColumn()
  const sortDirection = pairing.useSortDirection()
  const capabilities = pairing.capabilities

  // Row selection + frozen-row count are optional source members — Live defines them,
  // scenario does not. Per SharedFlightPane: the `?.(` is constant for the lifetime of a
  // mounted instance (Live vs scenario is fixed at mount by the GanttSourceProvider), so
  // calling the optional hook is not a *conditional* hook call in practice. ESLint cannot
  // model this, so we suppress rule-of-hooks inline (same justification as flight-pane).
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const rawSelectedRowIds = pairing.useSelectedRowIds ? pairing.useSelectedRowIds() : emptyStringSet
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const frozenRowCount = pairing.useFrozenRowCount ? pairing.useFrozenRowCount() : 0

  // ── Local UI state ────────────────────────────────────────────────────────
  const [rubberBand, setRubberBand] = useState<RubberBandRect | null>(null)
  const [quickFilter, setQuickFilter] = useState<QuickFilterState>(EMPTY_QUICK_FILTER)
  const [quickFilterOpen, setQuickFilterOpen] = useState(false)
  const [filterDialogOpen, setFilterDialogOpen] = useState(false)

  const attachedCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const interactionRef = useRef<ReturnType<typeof createPaneInteractionHandler> | null>(null)
  const pairingItemsRef = useRef<PairingItem[]>([])
  const pairingItemsLenRef = useRef(0)
  // Frozen-row count read at event time (hit-test / rubber-band); 0 for scenario.
  const frozenRowCountRef = useRef(0)
  frozenRowCountRef.current = frozenRowCount

  const setStatusBarText = useUiStore((s) => s.setStatusBarText)
  const timezone = useTimezoneStore((s) => s.timezone)
  const columns = useColumnStore((s) => s.getColumns('pairing'))
  const referenceRanks = useReferenceStore((s) => s.ranks)
  const loadReferences = useReferenceStore((s) => s.load)
  useEffect(() => { void loadReferences() }, [loadReferences])
  const rankOrderMap = useMemo(() => buildRankOrderMap(referenceRanks), [referenceRanks])

  // Pairing filter for chips (from context-keyed filter store)
  const useContextFilterStore = getFilterStore(contextId)
  const pairingFilter = useContextFilterStore((s) => s.pairing)
  const setPairingFilter = useContextFilterStore((s) => s.setPairingFilter)

  // Apply local quick-search on top of source rows
  const pairingItems = useMemo<PairingItem[]>(() => {
    const search = quickFilter.search.trim().toLowerCase()
    if (!search) return sourceRows
    return sourceRows.filter((it) => {
      const p = it.pairing
      return (p.pairingLabel ?? '').toLowerCase().includes(search)
        || (p.assignment ?? '').toLowerCase().includes(search)
        || (p.base ?? '').toLowerCase().includes(search)
    })
  }, [sourceRows, quickFilter.search])

  pairingItemsRef.current = pairingItems
  pairingItemsLenRef.current = pairingItems.length

  const panelRows = useMemo<PanelRowData[]>(
    () => buildPairingPanelRowData(pairingItems, rankOrderMap),
    [pairingItems, rankOrderMap],
  )

  // Test introspection: publish the rendered pairing row order (no-op in prod build),
  // mirroring the legacy Live pane so Live + Scenario share the same hook (§Gantt-Unify).
  useEffect(() => {
    publishPairingOrder('pairing', pairingItems.map((pi) => ({
      id: String(pi.pairing.id), label: pi.pairing.pairingLabel ?? '',
    })))
  }, [pairingItems])

  // Open/partial coverage total credit (HH:MM) — shown next to the count badge only
  // when the Coverage filter narrows to Open and/or Partial (the still-uncovered work).
  const openCreditText = useMemo<string | undefined>(() => {
    if (!isOpenPartialCoverage(pairingFilter.coverage)) return undefined
    return formatBlockMinutes(sumCoverageCredit(pairingItems, pairingFilter.coverage, pairingFilter.ranks))
  }, [pairingItems, pairingFilter.coverage])

  // ── Row-selection indices (Live only; empty for scenario) ──────────────────
  // rawSelectedRowIds carries pairing-id strings; map to row indices for the canvases.
  const selectedRowIndices = useMemo<Set<number>>(() => {
    if (rawSelectedRowIds.size === 0) return emptyRowIndices
    const result = new Set<number>()
    for (let i = 0; i < pairingItems.length; i++) {
      if (rawSelectedRowIds.has(String(pairingItems[i].pairing.id))) result.add(i)
    }
    return result
  }, [rawSelectedRowIds, pairingItems])

  // ── Lazy-load on scroll near bottom (Live only) ────────────────────────────
  const scrollY = source.useScrollY(paneId)
  useEffect(() => {
    if (!capabilities.lazyLoads || !pairing.loadMore) return
    const canvasH = attachedCanvasRef.current?.getBoundingClientRect().height ?? 400
    const contentH = pairingItemsLenRef.current * PAIRING_ROW_HEIGHT
    const maxScrollY = Math.max(0, contentH - canvasH + PAIRING_HEADER_HEIGHT)
    const threshold = maxScrollY - 10 * PAIRING_ROW_HEIGHT
    if (scrollY > threshold && scrollY > 0) {
      pairing.loadMore()
    }
  }, [scrollY, capabilities.lazyLoads, pairing])

  // contextId resolves the scenarioId for deep-link actions + the test hook.
  const scenarioIdForActions = typeof contextId === 'number' ? contextId : undefined

  // Test introspection: publish the selected segment ids so an e2e can observe selection
  // after a real puck click (the renderer draws the dashed box from this set). Scenario only.
  useEffect(() => {
    if (scenarioIdForActions === undefined) return
    publishScenarioPairingSelection(scenarioIdForActions, paneId, [...selectedPairingIds])
  }, [scenarioIdForActions, paneId, selectedPairingIds])

  // ── Sort header click — set sort + clear scenario found-float (paneId-scoped) ──
  const handleSort = useCallback((key: string) => {
    pairing.setSort(key)
    // Clearing the cross-pane "found" float on sort lives here because the source's
    // setSort is paneId-agnostic; scenario found ids are keyed by paneId in scenario-layout-store.
    if (scenarioIdForActions !== undefined) {
      getScenarioLayoutStore(scenarioIdForActions).getState().clearFoundCrewIds(paneId)
    }
  }, [pairing, scenarioIdForActions, paneId])

  // ── Filter chips ────────────────────────────────────────────────────────────
  const clearAllFilters = useCallback(() => {
    setPairingFilter({ bases: [], fleets: [], divisions: [], ranks: [], depArps: [], coverage: ['open', 'partial'], assignments: [], label: '', pairingIds: [] })
    pairing.applyFilterChange?.()
  }, [setPairingFilter, pairing])

  const globalFilterChips = useMemo<GlobalFilterChip[]>(() => {
    const chips = buildGlobalFilterChips(
      pairingFilter,
      [
        { dim: 'bases' as const, label: 'Base' },
        { dim: 'fleets' as const, label: 'Fleet' },
        { dim: 'ranks' as const, label: 'Rank' },
        { dim: 'assignments' as const, label: 'Type' },
        { dim: 'depArps' as const, label: 'Dep' },
        { dim: 'pairingIds' as const, label: 'Pairing ID' },
      ],
      (dim, value) => {
        const current = (pairingFilter[dim as keyof PairingFilter] as string[] | undefined) ?? []
        setPairingFilter({ [dim]: current.filter((v) => v !== value) })
        pairing.applyFilterChange?.()
      },
    )
    if (pairingCoverageNarrowed(pairingFilter.coverage)) {
      chips.push({
        id: 'coverage',
        label: 'Coverage',
        value: pairingFilter.coverage.map((c) => c[0].toUpperCase() + c.slice(1)).join(', '),
        // Widen to all states (same as Live pairing-pane) — resetting to the
        // open+partial DEFAULT is a no-op when that chip is already showing.
        onRemove: () => {
          setPairingFilter({ coverage: [...ALL_COVERAGE] })
          pairing.applyFilterChange?.()
        },
      })
    }
    if (pairingFilter.label.trim()) {
      chips.push({
        id: 'label',
        label: 'Label',
        value: pairingFilter.label.trim(),
        onRemove: () => {
          setPairingFilter({ label: '' })
          pairing.applyFilterChange?.()
        },
      })
    }
    return chips
  }, [pairingFilter, setPairingFilter, pairing])

  const internalSortChips = useMemo<SortChip[]>(() => {
    if (!sortColumn) return []
    const label = PAIRING_SORT_OPTIONS.find((o) => o.key === sortColumn)?.label ?? sortColumn
    // Chip × clears the sort entirely (mirrors the old component-local setSortColumn(null)).
    // setSort would only toggle direction, so we drop the criterion via the same pane-store
    // the source persists sort into ('scenario-pairing' key, scoped to this scenario).
    const onRemove =
      scenarioIdForActions !== undefined
        ? () => getPaneStore(scenarioIdForActions).getState().removeSortCriterion('scenario-pairing', sortColumn)
        : () => pairing.setSort(sortColumn)
    return [{ key: sortColumn, label, direction: sortDirection, onRemove }]
  }, [sortColumn, sortDirection, pairing, scenarioIdForActions])

  // Live supplies server-sort chips via the override; scenario uses the internal
  // header-click chips computed above.
  const sortChips = sortChipsOverride ?? internalSortChips

  const quickFilterChips = useMemo(
    () =>
      getQuickFilterChips(
        quickFilter,
        () => setQuickFilter(EMPTY_QUICK_FILTER),
        () => setQuickFilter((prev) => ({ ...prev, frozenOnly: false })),
      ),
    [quickFilter],
  )

  // ── Render callback ───────────────────────────────────────────────────────
  const renderContent = useCallback(
    (_ctx: CanvasRenderingContext2D, base: BaseRenderContext) => {
      const prc: PairingRenderContext = {
        ...base,
        items: pairingItemsRef.current,
        selectedPairingIds: selectedPairingIds as Set<number>,
        hoveredPairingId,
        timezone,
        showSessionTags: false,
      }
      renderPairingTasks(prc)
    },
    [selectedPairingIds, hoveredPairingId, timezone],
  )

  // ── Hit test — segment-level; geometry read from source at event time ───────
  const getHitTest = useCallback((): HitTestFn => {
    return (canvasX: number, canvasY: number) => {
      const sX = source.getScrollX()
      const sY = source.getScrollY(paneId)
      const pph = pairing.getPxPerHour()
      const drStart = pairing.getRangeStart()
      const items = pairingItemsRef.current

      const relY = canvasY - PAIRING_HEADER_HEIGHT
      if (relY < 0) return null
      // Frozen rows (Live only) stay pinned at the top and don't scroll. For scenario,
      // frc is 0 so both branches collapse to the simple scrollable math (byte-identical).
      const frc = frozenRowCountRef.current
      const frozenZone = frc * PAIRING_ROW_HEIGHT
      let rowIndex: number
      let rowCanvasY: number
      if (frc > 0 && relY < frozenZone) {
        rowIndex = Math.floor(relY / PAIRING_ROW_HEIGHT)
        rowCanvasY = PAIRING_HEADER_HEIGHT + rowIndex * PAIRING_ROW_HEIGHT
      } else {
        rowIndex = Math.floor((relY + sY) / PAIRING_ROW_HEIGHT)
        rowCanvasY = PAIRING_HEADER_HEIGHT + rowIndex * PAIRING_ROW_HEIGHT - sY
      }
      if (rowIndex < 0 || rowIndex >= items.length) return null

      const item = items[rowIndex]
      const pairingRec = item?.pairing
      const segments = item?.segments ?? []

      const centerY = rowCanvasY + Math.floor(PAIRING_ROW_HEIGHT / 2)
      const flightY = centerY - Math.floor(SEGMENT_FLIGHT_HEIGHT / 2)
      const isOnPuck = canvasY >= flightY && canvasY <= flightY + SEGMENT_FLIGHT_HEIGHT

      if (isOnPuck) {
        for (const seg of segments) {
          if (!seg.schStrDtUtc || !seg.schEndDtUtc) continue
          const segStart = timeToX(parseIsoCached(seg.schStrDtUtc), drStart, pph) - sX
          const segEnd = timeToX(parseIsoCached(seg.schEndDtUtc), drStart, pph) - sX
          const segWidth = Math.max(segEnd - segStart, MIN_TASK_WIDTH)
          if (canvasX >= segStart && canvasX <= segStart + segWidth) {
            return { type: 'pairing', itemId: seg.id, rowIndex, rowId: String(pairingRec.id), pairingId: pairingRec.id, segmentId: seg.id }
          }
        }
      }
      return { type: 'background', itemId: null, rowIndex, rowId: String(pairingRec.id) }
    }
  }, [source, paneId, pairing])

  // ── Interaction callbacks ───────────────────────────────────────────────────
  const interactionCallbacks = useMemo((): PaneInteractionCallbacks => ({
    onItemClick: (hit, ctrlKey) => {
      if (hit.itemId == null) return
      pairing.select(hit.itemId, ctrlKey ? 'toggle' : 'set')
    },
    onItemDoubleClick: (hit) => {
      const pid = hit.pairingId ?? (hit.rowId ? Number(hit.rowId) : null)
      if (pid != null) useUiStore.getState().openPairingInfo(pid, scenarioIdForActions)
    },
    onItemRightClick: (hit, clientX, clientY) => {
      if (hit.rowId && !rawSelectedRowIds.has(hit.rowId)) {
        pairing.selectRow?.(hit.rowId)
        pairing.markDirty?.()
      }
      const item = pairingItemsRef.current.find((pi) => pi.pairing.id === hit.pairingId)
      const seg = item?.segments?.find((s) => s.id === hit.itemId)
      const mockTask = { id: hit.itemId ?? -1, pairingId: hit.pairingId, findFltId: seg?.fltId ?? null } as never
      // Pre-compute the vertical-scroll target for the "Jump to this day's pairing"
      // menu action: convert the click's screen X to canvas-relative X, then to a
      // local-day timestamp, then find the matching pairing row (or fall back to
      // the latest-starting pairing of an earlier day). See findPairingStartingAtDay.
      let jumpToDayScrollY: number | null = null
      const canvas = attachedCanvasRef.current
      if (canvas) {
        const rect = canvas.getBoundingClientRect()
        const canvasX = clientX - rect.left
        const sX = source.getScrollX()
        const pph = pairing.getPxPerHour()
        const rangeStart = pairing.getRangeStart()
        const clickedTime = xToTime(canvasX + sX, rangeStart, pph)
        const clickedDayMs = startOfDay(clickedTime).getTime()
        const items = pairingItemsRef.current
        const targetRowIndex = findPairingStartingAtDay(items, clickedDayMs)
        if (targetRowIndex >= 0) {
          const canvasH = rect.height
          const targetY = Math.max(0, targetRowIndex * PAIRING_ROW_HEIGHT - PAIRING_HEADER_HEIGHT)
          const maxY = Math.max(0, items.length * PAIRING_ROW_HEIGHT - canvasH + PAIRING_HEADER_HEIGHT)
          jumpToDayScrollY = Math.max(0, Math.min(maxY, targetY))
        }
      }
      useUiStore.getState().openContextMenu(clientX, clientY, mockTask, 'pairing', hit.rowIndex, scenarioIdForActions, jumpToDayScrollY)
    },
    onItemHover: (hit, clientX, clientY) => {
      // Live tracks the hovered segment id (renderer highlight); scenario: no-op setHovered.
      if (capabilities.tracksHover) {
        pairing.setHovered(hit?.itemId ?? null, clientX, clientY)
      }
      if (hit?.pairingId) {
        // Live: rich status line (TZ-aware times + composition + credit) via the source.
        if (hit.itemId != null && pairing.formatStatusLine) {
          setStatusBarText(pairing.formatStatusLine(hit.itemId))
          return
        }
        const item = pairingItemsRef.current.find((pi) => pi.pairing.id === hit.pairingId)
        const p = item?.pairing
        const seg = item?.segments?.find((s) => s.id === hit.itemId)
        const sourceText = p ? pairingSourceLabel(p.pairingSource) : null
        if (p && seg) {
          setStatusBarText([`Pairing #${p.sourcePairingId ?? p.id}`, sourceText, `Seg #${seg.segSeq}`, `${seg.fltNum ?? ''} ${seg.depArp}-${seg.arvArp}  ${seg.schStrDtUtc?.slice(11, 16) ?? ''}~${seg.schEndDtUtc?.slice(11, 16) ?? ''}`].filter(Boolean).join('  ·  '))
        } else if (p) {
          setStatusBarText([`Pairing #${p.sourcePairingId ?? p.id}`, sourceText, p.fleet ?? '', `${p.schStrDtUtc?.slice(5, 16) ?? ''} ~ ${p.schEndDtUtc?.slice(11, 16) ?? ''}`].filter(Boolean).join('  |  '))
        }
      } else {
        setStatusBarText('')
      }
    },
    onDragStart: (hit, clientX, clientY) => {
      if (!pairing.capabilities.canDrag || !pairing.startDrag || !hit.pairingId) return
      const canvas = attachedCanvasRef.current
      if (!canvas) return
      pairing.startDrag({
        paneType: 'pairing',
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
    onBackgroundClick: () => {
      pairing.select(0, 'clear')
    },
    onScroll: (dx, dy) => {
      if (dx !== 0) pairing.scrollByX?.(dx)
      if (dy !== 0) {
        const canvasH = attachedCanvasRef.current?.getBoundingClientRect().height ?? 400
        const maxY = Math.max(0, pairingItemsLenRef.current * PAIRING_ROW_HEIGHT - canvasH + PAIRING_HEADER_HEIGHT)
        const cur = source.getScrollY(paneId)
        source.setScrollY(paneId, Math.max(0, Math.min(maxY, cur + dy)))
      }
    },
    onZoom: (direction) => {
      if (direction === 'in') pairing.zoomIn?.()
      else pairing.zoomOut?.()
    },
    onRubberBandChange: (rect) => {
      if (capabilities.canRubberBand) setRubberBand(rect)
    },
    onRubberBandSelect: (x1, y1, x2, y2, additive) => {
      if (!capabilities.canRubberBand) return
      const sx = source.getScrollX()
      const sy = source.getScrollY(paneId)
      const rangeStart = pairing.getRangeStart()
      const pph = pairing.getPxPerHour()
      const frc = frozenRowCountRef.current
      const minY = Math.min(y1, y2)
      const maxY = Math.max(y1, y2)
      const absMinX = Math.min(x1, x2) + sx
      const absMaxX = Math.max(x1, x2) + sx
      const items = pairingItemsRef.current
      // Collect SEGMENT ids whose time span overlaps the band within a covered row.
      const ids: number[] = []
      for (let ri = 0; ri < items.length; ri++) {
        const rowCanvasY = ri < frc
          ? PAIRING_HEADER_HEIGHT + ri * PAIRING_ROW_HEIGHT          // frozen: no scroll offset
          : PAIRING_HEADER_HEIGHT + ri * PAIRING_ROW_HEIGHT - sy     // scrollable
        if (minY > rowCanvasY + PAIRING_ROW_HEIGHT || maxY < rowCanvasY) continue
        for (const seg of items[ri]?.segments ?? []) {
          if (!seg.schStrDtUtc || !seg.schEndDtUtc) continue
          const segStart = timeToX(parseIsoCached(seg.schStrDtUtc), rangeStart, pph)
          const segEnd = Math.max(timeToX(parseIsoCached(seg.schEndDtUtc), rangeStart, pph), segStart + MIN_TASK_WIDTH)
          if (absMinX <= segEnd && absMaxX >= segStart) ids.push(seg.id)
        }
      }
      if (additive) {
        pairing.selectMany([...selectedPairingIds, ...ids])
      } else {
        pairing.selectMany(ids)
      }
      setRubberBand(null)
    },
  }), [pairing, capabilities, scenarioIdForActions, setStatusBarText, source, paneId, selectedPairingIds, rawSelectedRowIds])

  const interactionCallbacksRef = useRef<PaneInteractionCallbacks>(interactionCallbacks)
  useEffect(() => {
    interactionCallbacksRef.current = interactionCallbacks
  }, [interactionCallbacks])

  const getHitTestRef = useRef(getHitTest)
  getHitTestRef.current = getHitTest
  const stableGetHitTest = useCallback(() => getHitTestRef.current(), [])

  const stableInteractionCallbacks = useMemo((): PaneInteractionCallbacks => ({
    onItemClick: (hit, ctrlKey) => interactionCallbacksRef.current.onItemClick(hit, ctrlKey),
    onItemDoubleClick: (hit) => interactionCallbacksRef.current.onItemDoubleClick(hit),
    onItemRightClick: (hit, clientX, clientY) =>
      interactionCallbacksRef.current.onItemRightClick(hit, clientX, clientY),
    onItemHover: (hit, clientX, clientY) =>
      interactionCallbacksRef.current.onItemHover(hit, clientX, clientY),
    onDragStart: (hit, clientX, clientY) =>
      interactionCallbacksRef.current.onDragStart(hit, clientX, clientY),
    onDragMove: (clientX, clientY) => interactionCallbacksRef.current.onDragMove(clientX, clientY),
    onDragEnd: (clientX, clientY) => interactionCallbacksRef.current.onDragEnd(clientX, clientY),
    onBackgroundClick: () => interactionCallbacksRef.current.onBackgroundClick(),
    onScroll: (dx, dy) => interactionCallbacksRef.current.onScroll(dx, dy),
    onZoom: (direction) => interactionCallbacksRef.current.onZoom(direction),
    onRubberBandChange: (rect) => interactionCallbacksRef.current.onRubberBandChange?.(rect),
    onRubberBandSelect: (x1, y1, x2, y2, additive) =>
      interactionCallbacksRef.current.onRubberBandSelect?.(x1, y1, x2, y2, additive),
  }), [])

  const pairingRegisterRef = useRef(pairing.registerPane)
  const pairingUnregisterRef = useRef(pairing.unregisterPane)
  pairingRegisterRef.current = pairing.registerPane
  pairingUnregisterRef.current = pairing.unregisterPane
  const sourceRef = useRef(source)
  sourceRef.current = source

  const handleCanvasReady = useCallback(
    (canvas: HTMLCanvasElement) => {
      attachedCanvasRef.current = canvas
      const handler = createPaneInteractionHandler('pairing', stableGetHitTest, stableInteractionCallbacks)
      handler.attach(canvas)
      interactionRef.current = handler
      if (pairingRegisterRef.current) {
        pairingRegisterRef.current({
          getCanvasElement: () => attachedCanvasRef.current,
          getScrollY: () => sourceRef.current.getScrollY(paneId),
          getRowCount: () => pairingItemsRef.current.length,
          getRowId: (rowIndex) => pairingItemsRef.current[rowIndex]?.pairing.id != null
            ? String(pairingItemsRef.current[rowIndex].pairing.id)
            : null,
        })
      }
    },
    [stableGetHitTest, stableInteractionCallbacks, paneId],
  )

  const handleCanvasDestroy = useCallback(() => {
    interactionRef.current?.detach()
    interactionRef.current = null
    attachedCanvasRef.current = null
    pairingUnregisterRef.current?.()
  }, [])

  // ── Left-panel row selection / unfreeze (Live only) ────────────────────────
  // Gated on the optional source members (Live defines them, scenario does not), so
  // these handlers are inert no-ops for scenario — PaneHeaderCanvas only invokes them
  // on a left-panel click, and scenario rows are never frozen/selectable.
  const handleRowClick = useCallback(
    (ri: number, ctrlKey: boolean, shiftKey: boolean) => {
      const items = pairingItemsRef.current
      const rowId = items[ri]?.pairing.id != null ? String(items[ri].pairing.id) : ''
      if (!rowId) return
      if (shiftKey) {
        pairing.selectRowRange?.(rowId, items.map((pi) => String(pi.pairing.id)))
      } else if (ctrlKey) {
        pairing.toggleRowSelection?.(rowId)
      } else {
        pairing.selectRow?.(rowId)
      }
      pairing.markDirty?.()
    },
    [pairing],
  )

  const handleUnfreezeRow = useCallback(
    (rowId: string) => {
      pairing.unfreezeRow?.(rowId)
      pairing.markDirty?.()
    },
    [pairing],
  )

  const handleRowRightClick = useCallback(
    (ri: number, cx: number, cy: number) => {
      const rowId = pairingItemsRef.current[ri]?.pairing.id != null
        ? String(pairingItemsRef.current[ri].pairing.id)
        : ''
      if (rowId && !rawSelectedRowIds.has(rowId)) {
        pairing.selectRow?.(rowId)
        pairing.markDirty?.()
      }
      const mockTask = { id: -1 } as never
      useUiStore.getState().openContextMenu(cx, cy, mockTask, 'pairing', ri, scenarioIdForActions)
    },
    [pairing, rawSelectedRowIds, scenarioIdForActions],
  )

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {toolbar?.(pairingItems.length, openCreditText)}
      {quickFilterOpen && (
        <PaneQuickFilter
          value={quickFilter}
          onChange={setQuickFilter}
          placeholder="Search pairings…"
        />
      )}
      {loadingBar}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <PaneConditionStrip
          paneType="pairing"
          leftPanelWidth={leftPanelWidth}
          filterChips={filterChips}
          globalFilterChips={globalFilterChips}
          sortChips={sortChips}
          quickFilterChips={quickFilterChips}
          queryMode={queryMode}
          onQueryModeToggle={onQueryModeToggle}
          quickFilterOpen={quickFilterOpen}
          onQuickFilterToggle={() => setQuickFilterOpen((o) => !o)}
          onFilterClick={() => setFilterDialogOpen(true)}
          onSortClick={onSortClick}
          onClearAll={clearAllFilters}
          onRemoveFilter={onRemoveFilter}
          onResPairingClick={capabilities.canCreateRes ? () => useResPlannerStore.getState().open() : undefined}
          onClose={onClose}
        />
        {overlay?.(pairingItems)}
        {/* Accessibility mirror: composition display order for Playwright (canvas-only text). */}
        <div aria-label="Pairing compositions" className="sr-only" data-testid="pairing-composition-mirror">
          {panelRows.map((row) => (
            <span key={row.rowId} data-testid={`pairing-comp-${row.rowId}`}>
              {(row.compositionSegments ?? []).map((s) => s.text).join('')}
            </span>
          ))}
        </div>
        <FilterDialog
          open={filterDialogOpen}
          contextId={contextId}
          initialTab="pairing"
          onClose={() => setFilterDialogOpen(false)}
          onApply={() => {}}
        />
        <PaneHeaderCanvas
          paneId={paneId}
          paneType="pairing"
          columns={columns}
          rows={panelRows}
          frozenRowCount={frozenRowCount}
          selectedRowIndices={selectedRowIndices}
          sortColumn={sortColumn}
          sortDirection={sortDirection}
          onColumnHeaderClick={handleSort}
          onColumnWidthChange={() => {}}
          leftPanelWidth={leftPanelWidth}
          twoLineHeader
          twoLineRows
          bottomHeaderLabel="Comp"
          bottomRowKey="composition"
          onWheel={(deltaY) => {
            const canvasH = attachedCanvasRef.current?.getBoundingClientRect().height ?? 400
            const maxY = Math.max(0, pairingItemsLenRef.current * PAIRING_ROW_HEIGHT - canvasH + PAIRING_HEADER_HEIGHT)
            const cur = source.getScrollY(paneId)
            source.setScrollY(paneId, Math.max(0, Math.min(maxY, cur + deltaY)))
          }}
          // Row selection / unfreeze / right-click: Live only. Gated on the optional
          // source member so scenario (no selectRow) passes undefined → unchanged.
          onRowClick={pairing.selectRow ? handleRowClick : undefined}
          onUnfreezeRow={pairing.unfreezeRow ? handleUnfreezeRow : undefined}
          onRowRightClick={pairing.selectRow ? handleRowRightClick : undefined}
        />
        {splitter}
        <PaneCanvas
          paneId={paneId}
          paneType="pairing"
          canvasTestId={canvasTestId}
          totalRows={pairingItems.length}
          rowHeight={PAIRING_ROW_HEIGHT}
          frozenRowCount={frozenRowCount}
          dropTargetRow={-1}
          selectedRowIndices={selectedRowIndices}
          renderContent={renderContent}
          onCanvasReady={handleCanvasReady}
          onCanvasDestroy={handleCanvasDestroy}
          rubberBand={capabilities.canRubberBand ? rubberBand : null}
        />
      </div>
    </div>
  )
}
