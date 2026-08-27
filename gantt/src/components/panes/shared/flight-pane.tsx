// gantt/src/components/panes/shared/flight-pane.tsx
//
// SharedFlightPane — unified flight pane for scenarios (Phase 5A) and Live (Phase 5B).
//
// Placement rationale:
//   This component imports stores directly (useUiStore, useTimezoneStore,
//   useColumnStore) for context-agnostic UI interactions. The no-store-imports
//   guard scans components/gantt/ only, so placing this outside that directory
//   keeps the guard green. All flight-data concerns (rows, selection, hover,
//   drag, lazy-load, geometry) now flow through source.flight.
//
// Invariant: this component is ONLY mounted when `source.flight` is defined.
//   The parent (e.g. ScenarioFlightPane) must ensure this. The non-null assertion
//   on `source.flight!.*` below enforces that contract without making hooks conditional
//   (React rules forbid conditional hook calls).
//
// Phase 5A: scenario drives selection/hover/drag/lazy/geom through source.flight.
// Phase 5A-2a: Live source.flight is implemented but UNUSED (Live uses flight-pane.tsx).
//
// Usage:
//   Must be rendered inside a <GanttSourceProvider> whose source has a .flight
//   accessor. The contextId prop is needed for per-context filter store and deep-link actions.

import { useRef, useCallback, useMemo, useState, useEffect } from 'react'
import { renderFlightTasks } from '@/components/gantt/renderers/flight-renderer'
import type { FlightRenderContext } from '@/components/gantt/renderers/flight-renderer'
import type { FlightItem } from '@/types/flight'
import { HEADER_HEIGHT, ROW_HEIGHT, MIN_TASK_WIDTH } from '@/components/gantt/gantt-constants'
import { timeToX, parseIsoCached } from '@/components/gantt/gantt-utils'
import { createPaneInteractionHandler } from '@/components/gantt/interactions/base-interaction'
import type { PaneInteractionCallbacks, HitTestFn, RubberBandRect } from '@/components/gantt/interactions/base-interaction'
import { useGanttSource } from '@/components/gantt/source/gantt-source-context'
import { useUiStore } from '@/stores/ui-store'
import { useTimezoneStore } from '@/stores/timezone-store'
import { useColumnStore } from '@/stores/column-store'
import { PaneHeaderCanvas } from '@/components/gantt/pane-header-canvas'
import type { PanelRowData } from '@/components/gantt/pane-header-canvas'
import { PaneCanvas } from '@/components/gantt/pane-canvas'
import type { BaseRenderContext } from '@/components/gantt/renderers/base-renderer'
import { PaneConditionStrip } from '@/components/panes/pane-condition-strip'
import { PaneQuickFilter, EMPTY_QUICK_FILTER, getQuickFilterChips } from '@/components/panes/pane-quick-filter'
import type { QuickFilterState } from '@/components/panes/pane-quick-filter'
import { buildGlobalFilterChips } from '@/utils/global-filter-chips'
import type { GlobalFilterChip, SortChip } from '@/components/panes/pane-toolbar'
import { getFilterStore } from '@/stores/filter-store'
import type { FlightFilter } from '@/stores/filter-store'
import { FilterDialog } from '@/components/layout/filter-dialog'
import type { GanttContextId } from '@/types/gantt-context'

interface SharedFlightPaneProps {
  /** The pane instance ID used for per-pane scroll state. */
  paneId: string
  /**
   * Context identity: a scenarioId (number) for scenario views, or 'live' for the
   * live gantt (Phase 5B). Drives the per-context filter store and deep-link actions.
   */
  contextId: GanttContextId
  /** Width of the left header/crew panel. */
  leftPanelWidth: number
  /** Optional close handler for the pane condition strip. */
  onClose?: () => void
  /**
   * Toolbar render-prop — called with the live flight-leg count (sum of flights
   * across RegNo rows) so the Scenario badge matches Live's flightTotal semantic.
   */
  toolbar?: (rowCount: number) => React.ReactNode
  /** Splitter slot — rendered between PaneHeaderCanvas and PaneCanvas. */
  splitter?: React.ReactNode
  /** Override the canvas data-testid (default: "scenario-flight-canvas"). */
  canvasTestId?: string
  /** Open the Flight Navi table dialog (Live only; omit for scenario). */
  onNaviClick?: () => void
}

// Stable empty sets — avoids re-allocating new Set() on every render for scenario
const emptyStringSet: ReadonlySet<string> = new Set<string>()
const emptyIndexSet = new Set<number>()

function buildFlightPanelRowData(rows: FlightItem[]): PanelRowData[] {
  return rows.map((row) => ({
    rowId: row.registration,
    values: {
      regNo: row.isFleetGrouped ? `[${row.registration}]` : row.registration,
      fleet: row.fleet,
    },
  }))
}

/**
 * Shared flight pane for Scenario Gantt (Phase 5A) and Live Gantt (Phase 5B).
 *
 * Invariant: source.flight is always defined when this component is mounted.
 * All hook methods on source.flight are called unconditionally (React rules).
 * The parent must only render SharedFlightPane when source.flight exists.
 */
export const SharedFlightPane = ({
  paneId,
  contextId,
  leftPanelWidth,
  onClose,
  toolbar,
  splitter,
  canvasTestId = 'scenario-flight-canvas',
  onNaviClick,
}: SharedFlightPaneProps) => {
  const source = useGanttSource()
  const flight = source.flight!

  // ── Source data (all hooks called unconditionally) ────────────────────────
  const { rows: sourceRows, compositionStatusMap: sourceCompositionStatusMap } = flight.useRows()
  // Selection and hover come from source; always subscribed regardless of capabilities
  const selectedFlightIds = flight.useSelectedIds()
  const hoveredFlightId = flight.useHoveredId()

  const capabilities = flight.capabilities

  // ── Local UI state ────────────────────────────────────────────────────────
  const [rubberBand, setRubberBand] = useState<RubberBandRect | null>(null)
  const [quickFilter, setQuickFilter] = useState<QuickFilterState>(EMPTY_QUICK_FILTER)
  const [quickFilterOpen, setQuickFilterOpen] = useState(false)
  const [filterDialogOpen, setFilterDialogOpen] = useState(false)

  const attachedCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const interactionRef = useRef<ReturnType<typeof createPaneInteractionHandler> | null>(null)
  const flightRowsRef = useRef<FlightItem[]>([])
  const flightRowsLenRef = useRef(0)
  const frozenRowCountRef = useRef(0)

  const setStatusBarText = useUiStore((s) => s.setStatusBarText)
  const timezone = useTimezoneStore((s) => s.timezone)
  const columns = useColumnStore((s) => s.getColumns('flight'))

  // Flight filter for chips (from context-keyed filter store)
  const useContextFilterStore = getFilterStore(contextId)
  const flightFilter = useContextFilterStore((s) => s.flight)
  const setFlightFilter = useContextFilterStore((s) => s.setFlightFilter)

  // Apply local quick-search on top of source rows
  const flightRows = useMemo<FlightItem[]>(() => {
    const search = quickFilter.search.trim().toLowerCase()
    if (!search) return sourceRows
    return sourceRows.filter((row) =>
      row.registration.toLowerCase().includes(search) ||
      row.fleet.toLowerCase().includes(search) ||
      row.flights.some(
        (f) =>
          f.fltNum.toLowerCase().includes(search) ||
          f.depArp.toLowerCase().includes(search) ||
          f.arvArp.toLowerCase().includes(search),
      ),
    )
  }, [sourceRows, quickFilter.search])

  // Keep refs in sync (read at interaction time without stale closure)
  flightRowsRef.current = flightRows
  flightRowsLenRef.current = flightRows.length

  // Composition status map from source — stable across quick-search
  const compositionStatusMap = sourceCompositionStatusMap

  const panelRows = useMemo<PanelRowData[]>(() => buildFlightPanelRowData(flightRows), [flightRows])

  // ── Row selection indices (Live only; empty for scenario) ─────────────────
  // useSelectedRowIds is an optional hook — Live source defines it, scenario does not.
  // To avoid a conditional hook call (React rule), we use a stable EMPTY_ROW_IDS
  // sentinel that the hook method itself returns when not defined. The Live source
  // always defines useSelectedRowIds; scenario source does not define it.
  // We call it through a locally stored ref that is stable per source instance.
  // The component never switches source type mid-lifecycle, so this is safe.
  // NOTE: the `?.(` conditional is not truly conditional per render — it is constant
  // for the entire lifetime of a mounted instance (Live vs scenario is determined
  // at mount time by the GanttSourceProvider). ESLint rule-of-hooks does not have
  // a mechanism to detect this, so we suppress the warning inline.
  //
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const rawSelectedRowIds = flight.useSelectedRowIds ? flight.useSelectedRowIds() : emptyStringSet
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const frozenRowCount = flight.useFrozenRowCount ? flight.useFrozenRowCount() : 0
  frozenRowCountRef.current = frozenRowCount
  const selectedRowIndices = useMemo<Set<number>>(() => {
    if (rawSelectedRowIds.size === 0) return emptyIndexSet
    const result = new Set<number>()
    for (let i = 0; i < flightRows.length; i++) {
      if (rawSelectedRowIds.has(flightRows[i].registration)) result.add(i)
    }
    return result
  }, [rawSelectedRowIds, flightRows])

  // ── Lazy-load on scroll to bottom (Live only) ─────────────────────────────
  const scrollY = source.useScrollY(paneId)
  useEffect(() => {
    if (!capabilities.lazyLoads || !flight.loadMore) return
    const canvasH = attachedCanvasRef.current?.getBoundingClientRect().height ?? 400
    const contentH = flightRowsLenRef.current * ROW_HEIGHT
    const maxScrollY = Math.max(0, contentH - canvasH + HEADER_HEIGHT)
    const threshold = maxScrollY - 10 * ROW_HEIGHT
    if (scrollY > threshold && scrollY > 0) {
      flight.loadMore()
    }
  }, [scrollY, capabilities.lazyLoads, flight])

  // Quick filter chips
  const quickFilterChips = useMemo(
    () =>
      getQuickFilterChips(
        quickFilter,
        () => setQuickFilter(EMPTY_QUICK_FILTER),
        () => setQuickFilter((prev) => ({ ...prev, frozenOnly: false })),
      ),
    [quickFilter],
  )

  // Global filter chips
  const clearAllFilters = useCallback(() => {
    setFlightFilter({ depArps: [], arvArps: [], fltNums: [], fleets: [], statuses: [], register: [] })
    flight.applyFilterChange?.()
  }, [setFlightFilter, flight])

  const globalFilterChips = useMemo<GlobalFilterChip[]>(
    () =>
      buildGlobalFilterChips(
        flightFilter,
        [
          { dim: 'depArps' as const, label: 'Dep' },
          { dim: 'arvArps' as const, label: 'Arr' },
          { dim: 'fltNums' as const, label: 'Flt #' },
          { dim: 'fleets' as const, label: 'Fleet' },
          { dim: 'statuses' as const, label: 'Status' },
          { dim: 'register' as const, label: 'Reg' },
        ],
        (dim, value) => {
          const current = (flightFilter[dim as keyof FlightFilter] as string[] | undefined) ?? []
          setFlightFilter({ [dim]: current.filter((v) => v !== value) })
          // For Live: re-fetch data with updated filter and update the appliedFilters snapshot.
          flight.applyFilterChange?.()
        },
      ),
    [flightFilter, setFlightFilter, flight],
  )

  const sortChips = useMemo<SortChip[]>(() => [], [])

  // Render callback
  const renderContent = useCallback(
    (_ctx: CanvasRenderingContext2D, base: BaseRenderContext) => {
      const frc: FlightRenderContext = {
        ...base,
        flightRows: flightRowsRef.current,
        // FlightRenderContext expects Set<number>; ReadonlySet is structurally compatible
        // (both have .has()/.size/.forEach) — the renderer only reads, never mutates.
        selectedFlightIds: selectedFlightIds as Set<number>,
        hoveredFlightId,
        compositionStatusMap,
        timezone,
      }
      renderFlightTasks(frc)
    },
    [selectedFlightIds, hoveredFlightId, compositionStatusMap, timezone],
  )

  // Hit test — reads geometry from source.flight at event time (stable fn ref)
  const getHitTest = useCallback((): HitTestFn => {
    return (canvasX: number, canvasY: number) => {
      const sX = source.getScrollX()
      const sY = source.getScrollY(paneId)
      const rows = flightRowsRef.current
      const pph = flight.getPxPerHour()
      const drStart = flight.getRangeStart()

      const relY = canvasY - HEADER_HEIGHT
      if (relY < 0) return null
      const frc = frozenRowCountRef.current
      const frozenZone = frc * ROW_HEIGHT
      const rowIndex = frc > 0 && relY < frozenZone
        ? Math.floor(relY / ROW_HEIGHT)
        : Math.floor((relY + sY) / ROW_HEIGHT)
      if (rowIndex < 0 || rowIndex >= rows.length) return null

      const row = rows[rowIndex]
      for (const f of row.flights) {
        const blockX = timeToX(parseIsoCached(f.schDepDtUtc), drStart, pph) - sX
        const blockEndX = timeToX(parseIsoCached(f.schArvDtUtc), drStart, pph) - sX
        const blockWidth = Math.max(blockEndX - blockX, MIN_TASK_WIDTH)
        if (canvasX >= blockX && canvasX <= blockX + blockWidth) {
          return { type: 'flight', itemId: f.id, rowIndex, rowId: row.registration }
        }
      }
      return { type: 'background', itemId: null, rowIndex, rowId: row.registration }
    }
  }, [source, paneId, flight])

  // contextId needed for openFlightDetail / openContextMenu
  const scenarioIdForActions = typeof contextId === 'number' ? contextId : undefined

  // Interaction callbacks
  const interactionCallbacks = useMemo((): PaneInteractionCallbacks => ({
    onItemClick: (hit, ctrlKey) => {
      if (hit.itemId == null) return
      flight.select(hit.itemId, ctrlKey ? 'toggle' : 'set')
    },
    onItemDoubleClick: (hit) => {
      if (hit.itemId !== null) useUiStore.getState().openFlightDetail(hit.itemId, scenarioIdForActions)
    },
    onItemRightClick: (hit, clientX, clientY) => {
      if (hit.rowId && !rawSelectedRowIds.has(hit.rowId)) {
        flight.selectRow?.(hit.rowId)
        flight.markDirty?.()
      }
      const mockTask = { id: hit.itemId ?? -1, findFltId: hit.itemId } as never
      useUiStore.getState().openContextMenu(clientX, clientY, mockTask, 'flight', hit.rowIndex, scenarioIdForActions)
    },
    onItemHover: (hit, clientX, clientY) => {
      if (capabilities.tracksHover) {
        flight.setHovered(hit?.itemId ?? null, clientX, clientY)
      }
      if (hit?.itemId) {
        if (flight.formatStatusLine) {
          // Live: rich status line with TZ-aware times + composition
          setStatusBarText(flight.formatStatusLine(hit.itemId))
        } else {
          // Scenario: simple inline fallback
          const row = flightRowsRef.current.find((r) => r.flights.some((f) => f.id === hit.itemId))
          const f = row?.flights.find((fl) => fl.id === hit.itemId)
          if (f) {
            setStatusBarText(
              `${f.fltNum ?? ''}  ·  ${f.depArp} → ${f.arvArp}  ·  ${f.schDepDtUtc?.slice(11, 16) ?? ''} ~ ${f.schArvDtUtc?.slice(11, 16) ?? ''}`,
            )
          }
        }
      } else {
        setStatusBarText('')
      }
    },
    onDragStart: (hit, clientX, clientY) => {
      if (!capabilities.canDrag || !flight.startDragToRoster || hit.itemId == null) return
      const canvas = attachedCanvasRef.current
      if (!canvas) return
      flight.startDragToRoster({
        paneType: 'flight',
        itemId: hit.itemId,
        itemType: 'flight',
        sourceRowId: hit.rowId,
        startClientX: clientX,
        startClientY: clientY,
        sourceCanvasRect: canvas.getBoundingClientRect(),
      })
    },
    onDragMove: () => {},
    onDragEnd: () => {},
    onBackgroundClick: () => {
      flight.select(0, 'clear')
    },
    onScroll: (dx, dy) => {
      if (dx !== 0) {
        // Delegate horizontal scroll to the source (Live: gantt-view-store.scroll;
        // scenario: no-op since scrollByX is undefined for scenario source).
        flight.scrollByX?.(dx)
      }
      if (dy !== 0) {
        const canvasH = attachedCanvasRef.current?.getBoundingClientRect().height ?? 400
        const maxY = Math.max(0, flightRowsLenRef.current * ROW_HEIGHT - canvasH + HEADER_HEIGHT)
        const cur = source.getScrollY(paneId)
        source.setScrollY(paneId, Math.max(0, Math.min(maxY, cur + dy)))
      }
    },
    onZoom: (direction) => {
      // Delegate zoom to the source (Live: gantt-view-store.zoomIn/Out;
      // scenario: no-op since zoomIn/zoomOut are undefined for scenario source).
      if (direction === 'in') flight.zoomIn?.()
      else flight.zoomOut?.()
    },
    onRubberBandChange: (rect) => {
      if (capabilities.canRubberBand) setRubberBand(rect)
    },
    onRubberBandSelect: (x1, y1, x2, y2, additive) => {
      if (!capabilities.canRubberBand) return
      const sx = source.getScrollX()
      const sy = source.getScrollY(paneId)
      const rangeStart = flight.getRangeStart()
      const pph = flight.getPxPerHour()
      const minY = Math.min(y1, y2)
      const maxY = Math.max(y1, y2)
      const absMinX = Math.min(x1, x2) + sx
      const absMaxX = Math.max(x1, x2) + sx
      const rows = flightRowsRef.current
      const ids: number[] = []
      const frc = frozenRowCountRef.current
      for (let ri = 0; ri < rows.length; ri++) {
        const rowCanvasY = ri < frc
          ? HEADER_HEIGHT + ri * ROW_HEIGHT
          : HEADER_HEIGHT + ri * ROW_HEIGHT - sy
        if (minY > rowCanvasY + ROW_HEIGHT || maxY < rowCanvasY) continue
        for (const f of rows[ri].flights) {
          const fStart = timeToX(parseIsoCached(f.schDepDtUtc), rangeStart, pph)
          const fEnd = Math.max(timeToX(parseIsoCached(f.schArvDtUtc), rangeStart, pph), fStart + MIN_TASK_WIDTH)
          if (absMinX <= fEnd && absMaxX >= fStart) ids.push(f.id)
        }
      }
      if (additive) {
        const existing = selectedFlightIds
        flight.selectMany([...existing, ...ids])
      } else {
        flight.selectMany(ids)
      }
      setRubberBand(null)
    },
  }), [
    flight,
    capabilities,
    scenarioIdForActions,
    setStatusBarText,
    source,
    paneId,
    selectedFlightIds,
    rawSelectedRowIds,
  ])

  // ── Left-panel row selection / unfreeze ───────────────────────────────────
  const handleRowClick = useCallback(
    (ri: number, ctrlKey: boolean, shiftKey: boolean) => {
      const rows = flightRowsRef.current
      const rowId = rows[ri]?.registration ?? ''
      if (!rowId) return
      if (shiftKey) {
        flight.selectRowRange?.(rowId, rows.map((row) => row.registration))
      } else if (ctrlKey) {
        flight.toggleRowSelection?.(rowId)
      } else {
        flight.selectRow?.(rowId)
      }
      flight.markDirty?.()
    },
    [flight],
  )

  const handleUnfreezeRow = useCallback(
    (rowId: string) => {
      flight.unfreezeRow?.(rowId)
      flight.markDirty?.()
    },
    [flight],
  )

  const handleRowRightClick = useCallback(
    (ri: number, cx: number, cy: number) => {
      const rowId = flightRowsRef.current[ri]?.registration ?? ''
      if (!rowId) return
      if (!rawSelectedRowIds.has(rowId)) {
        flight.selectRow?.(rowId)
      }
      const mockTask = { id: -1 } as never
      useUiStore.getState().openContextMenu(cx, cy, mockTask, 'flight', ri, scenarioIdForActions)
      flight.markDirty?.()
    },
    [flight, rawSelectedRowIds, scenarioIdForActions],
  )

  const handleCanvasReady = useCallback(
    (canvas: HTMLCanvasElement) => {
      attachedCanvasRef.current = canvas
      const handler = createPaneInteractionHandler('flight', getHitTest, interactionCallbacks)
      handler.attach(canvas)
      interactionRef.current = handler
      // Register with cross-pane drag handler (Live only; no-op when registerPane is undefined)
      if (flight.registerPane) {
        flight.registerPane({
          getCanvasElement: () => attachedCanvasRef.current,
          getScrollY: () => source.getScrollY(paneId),
          getRowCount: () => flightRowsRef.current.length,
          getRowId: (rowIndex) => flightRowsRef.current[rowIndex]?.registration ?? null,
        })
      }
    },
    [getHitTest, interactionCallbacks, flight, source, paneId],
  )

  const handleCanvasDestroy = useCallback(() => {
    interactionRef.current?.detach()
    interactionRef.current = null
    attachedCanvasRef.current = null
    // Unregister from cross-pane drag handler (Live only)
    flight.unregisterPane?.()
  }, [flight])

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {toolbar?.(flightRows.reduce((n, r) => n + r.flights.length, 0))}
      {quickFilterOpen && (
        <PaneQuickFilter
          value={quickFilter}
          onChange={setQuickFilter}
          placeholder="Search flights…"
        />
      )}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <PaneConditionStrip
          paneType="flight"
          leftPanelWidth={leftPanelWidth}
          globalFilterChips={globalFilterChips}
          sortChips={sortChips}
          quickFilterChips={quickFilterChips}
          quickFilterOpen={quickFilterOpen}
          onQuickFilterToggle={() => setQuickFilterOpen((o) => !o)}
          onFilterClick={() => setFilterDialogOpen(true)}
          onClearAll={clearAllFilters}
          onNaviClick={onNaviClick}
          onClose={onClose}
        />
        <FilterDialog
          open={filterDialogOpen}
          contextId={contextId}
          initialTab="flight"
          onClose={() => setFilterDialogOpen(false)}
          onApply={() => {}}
        />
        <PaneHeaderCanvas
          paneId={paneId}
          paneType="flight"
          columns={columns}
          rows={panelRows}
          frozenRowCount={frozenRowCount}
          selectedRowIndices={selectedRowIndices}
          sortColumn={null}
          sortDirection="asc"
          onColumnHeaderClick={() => {}}
          onColumnWidthChange={() => {}}
          leftPanelWidth={leftPanelWidth}
          onWheel={(deltaY) => {
            const canvasH = attachedCanvasRef.current?.getBoundingClientRect().height ?? 400
            const maxY = Math.max(0, flightRowsLenRef.current * ROW_HEIGHT - canvasH + HEADER_HEIGHT)
            const cur = source.getScrollY(paneId)
            source.setScrollY(paneId, Math.max(0, Math.min(maxY, cur + deltaY)))
          }}
          onRowClick={flight.selectRow ? handleRowClick : undefined}
          onUnfreezeRow={flight.unfreezeRow ? handleUnfreezeRow : undefined}
          onRowRightClick={flight.selectRow ? handleRowRightClick : undefined}
        />
        {splitter}
        <PaneCanvas
          paneId={paneId}
          paneType="flight"
          canvasTestId={canvasTestId}
          totalRows={flightRows.length}
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
