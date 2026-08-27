// gantt/src/components/panes/shared/roster-pane.tsx
//
// SharedRosterPane — unified roster pane for Scenario (Phase R1/R2) and Live (Phase R3).
//
// Placement rationale:
//   This component imports stores directly (useTimezoneStore, useColumnStore, the
//   per-context filter / pane / layout stores) for context-agnostic UI chrome. The
//   no-store-imports guard scans components/gantt/ only, so placing this under
//   components/panes/shared/ keeps the guard green (same as SharedFlightPane /
//   SharedPairingPane). All roster-data + interaction concerns flow through
//   source.roster.
//
// Invariant: this component is ONLY mounted when `source.roster` is defined. The
//   parent (ScenarioRosterPane / RosterPane) ensures this; the non-null assertion on
//   `source.roster!.*` enforces the contract without making hooks conditional.
//
// Chrome split (mirrors SharedFlightPane): the toolbar + splitter are injected as
// render-props by the wrapper; the quick-filter / condition-strip / filter-dialog /
// sort-dialog chrome lives HERE (context-agnostic, driven by the per-context stores).
//
// Live additions are OPTIONAL and gated. Scenario passes none of them, so the scenario
// render path is byte-identical to before. The Live wrapper supplies `liveChrome` (which
// imports the Live stores it needs) + the source's optional overlays (locks, session tags).

import { useRef, useCallback, useMemo, useState, useEffect } from 'react'
import { renderRosterTasks, buildRosterRenderBuckets, buildRosterLaneItemLayout } from '@/components/gantt/renderers/roster-renderer'
import type { RosterRenderContext } from '@/components/gantt/renderers/roster-renderer'
import type { BaseRenderContext } from '@/components/gantt/renderers/base-renderer'
import type { PaneInteractionCallbacks, RubberBandRect } from '@/components/gantt/interactions/base-interaction'
import { clampRosterScrollY } from '@/components/gantt/gantt-utils'
import { createPaneInteractionHandler } from '@/components/gantt/interactions/base-interaction'
import { useGanttSource } from '@/components/gantt/source/gantt-source-context'
import { EMPTY_LOCK_MAP, EMPTY_SESSION_TAGS } from '@/components/gantt/source/gantt-pane-source'
import { useTimezoneStore } from '@/stores/timezone-store'
import { useColumnStore } from '@/stores/column-store'
import { getFilterStore } from '@/stores/filter-store'
import { getPaneStore } from '@/stores/pane-store'
import { getScenarioLayoutStore } from '@/stores/scenario-layout-store'
import { getScenarioRosterSelectionStore } from '@/stores/scenario-roster-selection-store'
import { getScenarioViolationStore } from '@/stores/scenario-violation-store'
import { useSessionViolationStore } from '@/stores/session-violation-store'
import { getScenarioGanttStore } from '@/stores/scenario-gantt-store'
import { PaneHeaderCanvas } from '@/components/gantt/pane-header-canvas'
import { PaneCanvas } from '@/components/gantt/pane-canvas'
import { PaneConditionStrip } from '@/components/panes/pane-condition-strip'
import { ViolationListDialog } from '@/components/panes/violation-list-dialog'
import { QualityAnalysisDialog } from '@/components/panes/quality-analysis-dialog'
import { PaneQuickFilter, EMPTY_QUICK_FILTER, getQuickFilterChips } from '@/components/panes/pane-quick-filter'
import type { QuickFilterState } from '@/components/panes/pane-quick-filter'
import { buildGlobalFilterChips } from '@/utils/global-filter-chips'
import { FilterDialog } from '@/components/layout/filter-dialog'
import { SortDialog, type SortField } from '@/components/panes/sort-dialog'
import type { FilterChip, GlobalFilterChip, SortChip } from '@/components/panes/pane-toolbar'
import { publishPanelRows, publishValidityBlocks } from '@/utils/gantt-test-hook'
import { useCrewMemoStore } from '@/stores/crew-memo-store'
import { useUiStore } from '@/stores/ui-store'
import { useGanttViewStore } from '@/stores/gantt-view-store'
import type { GanttContextId } from '@/types/gantt-context'
import type { RosterItem } from '@/types'

/**
 * Live-only chrome bundle. Scenario omits this entirely (render path unchanged). The Live
 * wrapper builds it from the Live stores (sessions / shell dialog / violations / etc.) and
 * passes it down. Everything here is rendered only when defined.
 */
export interface LiveRosterChrome {
  /** PaneLoadingBar slot (rendered after the toolbar). */
  loadingBar?: React.ReactNode
  /** Session-derived filter chips (crew query sessions). */
  filterChips?: FilterChip[]
  /** Query mode toggle (replace / append). */
  queryMode?: 'replace' | 'append'
  onQueryModeToggle?: () => void
  /** Remove a single session filter chip. */
  onRemoveFilter?: (sessionId: string, key: string) => void
  /** Open the GLOBAL filter dialog (shell-store) instead of the local FilterDialog. */
  onFilterClick?: () => void
  /** Global filter chips (overrides the scenario crew-filter chips). */
  globalFilterChips?: GlobalFilterChip[]
  /** Clear-all handler (overrides the scenario clearAllFilters). */
  onClearAll?: () => void
  /** Quick-filter: show the "frozen only" toggle (Live). */
  showFrozenQuickFilter?: boolean
  frozenLabel?: string
  quickFilterPlaceholder?: string
  /** Whether more crew is loading (draws the bottom "Loading more crew..." indicator). */
  loadingMore?: boolean
  /** Enable rubber-band box selection on the canvas. */
  enableRubberBand?: boolean
  /** Header right-click on a data row (context menu). Receives the resolved crewId. */
  onHeaderRowRightClick?: (rowIndex: number, crewId: string, clientX: number, clientY: number) => void
  /** Hover over a row's violation indicator. */
  onViolationHover?: (rowId: string | null, clientX: number, clientY: number) => void
  /** Sort fields for the SortDialog (Live derives them from columns). */
  sortFields?: SortField[]
  /** Sort chip labels (Live derives them from the column labels). */
  sortChips?: SortChip[]
  /** Drop-target row index (cross-pane drag indicator). */
  dropTargetRow?: number
  /** Open Live roster bulk-delete dialog. */
  onRosterBulkDeleteClick?: () => void
  rosterBulkDeleteDisabled?: boolean
  rosterBulkDeleteIcon?: React.ReactNode
  rosterBulkDeleteTitle?: string
}

interface SharedRosterPaneProps {
  /** The pane instance ID used for per-pane scroll / frozen / found state. */
  paneId: string
  /**
   * Context identity: a scenarioId (number) for scenario views, or 'live' for the
   * live gantt. Drives the per-context filter / pane / layout stores, the test-hook
   * pane key, and deep-link actions.
   */
  contextId: GanttContextId
  /** Width of the left header/crew panel. */
  leftPanelWidth: number
  /** Optional close handler for the pane condition strip. */
  onClose?: () => void
  /** Toolbar render-prop — called with the live (filtered) row count. */
  toolbar?: (rowCount: number) => React.ReactNode
  /** Splitter slot — rendered between PaneHeaderCanvas and PaneCanvas. */
  splitter?: React.ReactNode
  /** Override the canvas data-testid (default: "scenario-roster-canvas"). */
  canvasTestId?: string
  /**
   * Live pane type ('roster-main' | 'roster-sub'). When provided, drives the column /
   * pane / test-hook keys (otherwise scenario keys are used). Required for Live.
   */
  livePaneType?: 'roster-main' | 'roster-sub'
  /** Live-only chrome bundle. Scenario omits this (render path unchanged). */
  liveChrome?: LiveRosterChrome
}

const SORT_LABELS: Record<string, string> = {
  seniorityNum: 'Seniority', crewId: 'Crew ID', rank: 'Rank', base: 'Base',
}

/**
 * Shared roster pane for Scenario Gantt (Phase R1/R2) and Live (Phase R3).
 *
 * Invariant: source.roster is always defined when this component is mounted.
 * All hook methods on source.roster are called unconditionally (React rules).
 */
export const SharedRosterPane = ({
  paneId,
  contextId,
  leftPanelWidth,
  onClose,
  toolbar,
  splitter,
  canvasTestId = 'scenario-roster-canvas',
  livePaneType,
  liveChrome,
}: SharedRosterPaneProps) => {
  const source = useGanttSource()
  const roster = source.roster!
  const isLive = livePaneType !== undefined

  // ── Source data — ONE unified roster model (P0: built once per dependency change,
  //    replaces the old useRows / usePanelRows / useViolationMap trio) ─────────────
  const model = roster.useRosterModel()
  const { crewIds: sourceCrewIds, items, itemsByCrew, frozenRowCount: sourceFrozenRowCount } = model
  const sourcePanelRows = model.panelRows
  const violationMap = model.violationMap

  // Crew memos (note icons) — keyed by the roster_flight id each memo anchors to.
  const memosByRosterId = useCrewMemoStore((s) => s.memosByRosterId)
  const memoRosterIds = useMemo(() => new Set(memosByRosterId.keys()), [memosByRosterId])
  const columns = roster.useColumns()
  const selectedTaskIds = roster.useSelectedTaskIds()
  const selectedCrewIds = roster.useSelectedCrewIds()
  // Optional Live overlays — call through stable optional members (constant per source
  // instance; live-vs-scenario is fixed at mount, so the ?.() is not a conditional hook).
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const lockMap = roster.useLockMap ? roster.useLockMap() : EMPTY_LOCK_MAP
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const sessionTags = roster.useSessionTags ? roster.useSessionTags() : EMPTY_SESSION_TAGS
  const showSessionTags = roster.showSessionTags ?? false
  // Legality Alert Center — shared bell (in PaneConditionStrip) + ViolationListDialog. Both
  // Live and Scenario implement useAlertCenter, so it is effectively always present; the
  // optional guard keeps the type honest and mirrors the lock/session-tags overlay pattern.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const alertCenter = roster.useAlertCenter ? roster.useAlertCenter() : null
  // Quality Analyzer — scenario-only (Live source omits useQualityAnalysis, so the button
  // never renders in Live). Fixed at mount per source instance, so the ?.() is not conditional.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const qualityAnalysis = roster.useQualityAnalysis ? roster.useQualityAnalysis() : null
  const qualityData = qualityAnalysis?.data ?? null
  // Legality Recheck — scenario-only (Live omits useLegalityRecheck; its recheck is in the top
  // sub-toolbar). Renders the Recheck button in this pane's condition strip (§Pane-Toolbar-Home).
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const legalityRecheck = roster.useLegalityRecheck ? roster.useLegalityRecheck() : null

  // ── Context resolution: scenario vs live ────────────────────────────────────
  const scenarioId = typeof contextId === 'number' ? contextId : undefined
  // Pane key (column store + render dispatch + test hook): scenario uses 'scenario-roster',
  // live uses the legacyPaneType the source is bound to.
  const paneType = livePaneType ?? 'scenario-roster'
  const testPaneType = paneType

  const timezone = useTimezoneStore((s) => s.timezone)

  // ── Local UI chrome state ───────────────────────────────────────────────────
  const [quickFilterOpen, setQuickFilterOpen] = useState(false)
  const [filterDialogOpen, setFilterDialogOpen] = useState(false)
  const [sortDialogOpen, setSortDialogOpen] = useState(false)
  const [alertCenterOpen, setAlertCenterOpen] = useState(false)
  const [qualityOpen, setQualityOpen] = useState(false)
  const [qualityIssueCount, setQualityIssueCount] = useState(0)
  const [crewBellCrewId, setCrewBellCrewId] = useState<string | null>(null)
  const [overlapLanes, setOverlapLanes] = useState(false)
  // Per-crew bell popup: violations filtered to the clicked crew.
  const crewBellRows = useMemo(
    () => alertCenter?.rows.filter((r) => r.crewId === crewBellCrewId) ?? [],
    [alertCenter?.rows, crewBellCrewId],
  )
  const [rubberBand, setRubberBand] = useState<RubberBandRect | null>(null)
  // Live quick-filter is local component state (search + frozenOnly). Scenario mirrors the
  // quick-filter to the roster selection store so the source applies the same crew filter.
  const [liveQuickFilter, setLiveQuickFilter] = useState<QuickFilterState>(EMPTY_QUICK_FILTER)
  const setHoveredCrew = useGanttViewStore((s) => s.setHoveredCrew)

  // Per-context filter store (crew dimension) — drives the FilterDialog chips.
  const useContextFilterStore = getFilterStore(contextId)
  const crewFilter = useContextFilterStore((s) => s.crew)
  const setCrewFilter = useContextFilterStore((s) => s.setCrewFilter)

  // Per-context pane-store: sort persists across tab suspend.
  const useContextPaneStore = getPaneStore(contextId)
  const sortCriteria = useContextPaneStore((s) => s.getSortCriteria(paneType))
  const setSortCriteria = useContextPaneStore((s) => s.setSortCriteria)
  const removeSortCriterion = useContextPaneStore((s) => s.removeSortCriterion)
  const sortColumn = sortCriteria[0]?.column ?? null
  const sortDirection = sortCriteria[0]?.direction ?? 'asc'

  // Quick-filter search lives in the roster selection store (scenario) so the source's
  // useRows/usePanelRows apply the same crew filter the canvas renders. Live keeps it in
  // local state and applies it in this component (the live branch is fixed at mount).
  const useRosterSelectionStore = scenarioId !== undefined ? getScenarioRosterSelectionStore(scenarioId) : null
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const storeSearch = useRosterSelectionStore ? useRosterSelectionStore((s) => s.search) : ''

  // Resolved quick-filter state (live: local; scenario: store-backed search).
  const quickFilter = useMemo<QuickFilterState>(
    () => (isLive ? liveQuickFilter : { ...EMPTY_QUICK_FILTER, search: storeSearch }),
    [isLive, liveQuickFilter, storeSearch],
  )
  const setQuickFilter = useCallback((next: QuickFilterState | ((p: QuickFilterState) => QuickFilterState)) => {
    if (isLive) { setLiveQuickFilter(next); return }
    const resolved = typeof next === 'function' ? next(quickFilter) : next
    if (scenarioId !== undefined) {
      getScenarioRosterSelectionStore(scenarioId).getState().setSearch(resolved.search)
    }
  }, [isLive, quickFilter, scenarioId])

  // ── Live client-side quick-filter (search + frozenOnly) applied on the source list ──
  // Scenario: search is already applied inside the source; pass rows through unchanged.
  const { crewIds, panelRows, frozenRowCount } = useMemo(() => {
    if (!isLive) {
      return { crewIds: sourceCrewIds, panelRows: sourcePanelRows, frozenRowCount: sourceFrozenRowCount }
    }
    let rows = sourcePanelRows
    const frozenSet = new Set(sourcePanelRows.filter((_, i) => i < sourceFrozenRowCount).map((r) => r.rowId))
    if (liveQuickFilter.frozenOnly) {
      rows = rows.filter((r) => frozenSet.has(r.rowId))
    }
    const q = liveQuickFilter.search.trim().toLowerCase()
    if (q) {
      rows = rows.filter((r) => {
        const v = r.values
        return (
          r.rowId.toLowerCase().includes(q) ||
          String(v.rank ?? '').toLowerCase().includes(q) ||
          String(v.base ?? '').toLowerCase().includes(q) ||
          String(v.fleet ?? '').toLowerCase().includes(q) ||
          String(v.crewName ?? '').toLowerCase().includes(q)
        )
      })
    }
    const ids = rows.map((r) => r.rowId)
    const fc = rows.filter((r) => frozenSet.has(r.rowId)).length
    return { crewIds: ids, panelRows: rows, frozenRowCount: fc }
  }, [isLive, sourceCrewIds, sourcePanelRows, sourceFrozenRowCount, liveQuickFilter])

  // Build items + itemsByCrew restricted to the rendered (post-quick-filter) crew set so the
  // canvas + hit-test only see painted crew. For scenario this is the full source set.
  const { renderItems, renderItemsByCrew } = useMemo(() => {
    if (!isLive || (liveQuickFilter.search.trim() === '' && !liveQuickFilter.frozenOnly)) {
      return { renderItems: items, renderItemsByCrew: itemsByCrew }
    }
    const idSet = new Set(crewIds)
    const ibc = new Map<string, RosterItem[]>()
    const flat: RosterItem[] = []
    for (const cid of crewIds) {
      const bucket = itemsByCrew.get(cid)
      if (bucket) { ibc.set(cid, bucket); for (const it of bucket) flat.push(it) }
    }
    return { renderItems: flat, renderItemsByCrew: ibc }
  }, [isLive, items, itemsByCrew, crewIds, liveQuickFilter])

  const renderBuckets = useMemo(() => buildRosterRenderBuckets(renderItemsByCrew), [renderItemsByCrew])
  const laneLayoutByTaskId = useMemo(
    () => (overlapLanes ? buildRosterLaneItemLayout(renderBuckets) : undefined),
    [overlapLanes, renderBuckets],
  )

  // Feed the rendered list back to the source so its event-time hit-test / drop refs match.
  useEffect(() => {
    roster.setRenderedRows?.({ crewIds, items: renderItems, itemsByCrew: renderItemsByCrew, frozenRowCount, laneLayoutByTaskId })
  }, [roster, crewIds, renderItems, renderItemsByCrew, frozenRowCount, laneLayoutByTaskId])

  // Crew memos — fetched AFTER first paint (this effect runs once crew rows exist),
  // scoped to the loaded crew set + current date range (§First-Paint). Re-runs when
  // the date range changes or refreshNonce bumps (e.g. after R'Bot writes a plan).
  const memoRefreshNonce = useCrewMemoStore((s) => s.refreshNonce)
  const memoDateRange = useContextFilterStore((s) => s.dateRange)
  const memoCrewKey = useMemo(() => crewIds.join('\0'), [crewIds])
  const memoRangeKey = `${memoDateRange.start.toISOString()}:${memoDateRange.end.toISOString()}`
  useEffect(() => {
    if (crewIds.length === 0) return
    void useCrewMemoStore.getState().fetchForCrew(
      crewIds,
      memoDateRange.start.toISOString(),
      memoDateRange.end.toISOString(),
    )
  }, [memoCrewKey, memoRangeKey, memoRefreshNonce])

  const attachedCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const interactionRef = useRef<ReturnType<typeof createPaneInteractionHandler> | null>(null)
  const crewIdsRef = useRef<string[]>([])
  crewIdsRef.current = crewIds

  // ── Selected crew → row indices (left-panel highlight) ──────────────────────
  const selectedRowIndices = useMemo(() => {
    const s = new Set<number>()
    panelRows.forEach((r, i) => { if (selectedCrewIds.has(r.rowId)) s.add(i) })
    return s
  }, [panelRows, selectedCrewIds])

  // ── Filter chrome ───────────────────────────────────────────────────────────
  const clearAllFilters = useCallback(() => {
    setCrewFilter({ divisions: [], bases: [], ranks: [], fleets: [], crewIds: [] })
  }, [setCrewFilter])

  // F54-P04: stable callbacks for the memoized PaneConditionStrip. The component body
  // re-renders on every visible-day change (usePanelRows subscribes to a day-bucketed
  // scroll timestamp), so inline arrows would break the strip's memo and re-render its
  // chrome on horizontal scroll. Wrapping them keeps the strip inert during scroll.
  const handleQuickFilterToggle = useCallback(() => setQuickFilterOpen((o) => !o), [])
  const handleSortOpen = useCallback(() => setSortDialogOpen(true), [])
  const handleAlertCenterOpen = useCallback(() => setAlertCenterOpen(true), [])
  const handleCrewBellClick = useCallback((rowId: string) => {
    if (!alertCenter) return
    const hasViolations = alertCenter.rows.some((r) => r.crewId === rowId)
    if (hasViolations) {
      setCrewBellCrewId(rowId)
    } else {
      // Stale bell: canvas shows severity > 0 but the persisted legality store has no
      // violations for this crew. Re-fetch to re-sync, then open the full Alert Center
      // so the user sees the updated state (bells will clear if legality returns 0).
      alertCenter.onScan()
      setAlertCenterOpen(true)
    }
  }, [alertCenter])
  const handleViolationHover = useCallback((rowId: string | null, cx: number, cy: number) => {
    setHoveredCrew(rowId, cx, cy)
  }, [setHoveredCrew])
  const handleQualityOpen = useCallback(() => setQualityOpen(true), [])
  const handleOverlapLanesToggle = useCallback(() => setOverlapLanes((v) => !v), [])

  // Bring a crew to the top of the roster — same gesture as an Alert Center row click. Routed
  // through the source capability so Live and Scenario share one path (§Gantt-Unify).
  const handleQualityCrewClick = useCallback(
    (crewId: string) => roster.bringCrewToTop(crewId),
    [roster],
  )
  const handleLocalFilterOpen = useCallback(() => setFilterDialogOpen(true), [])
  const onFilterClickResolved = liveChrome?.onFilterClick ?? handleLocalFilterOpen

  const scenarioGlobalFilterChips = useMemo<GlobalFilterChip[]>(() =>
    buildGlobalFilterChips(
      crewFilter,
      [
        { dim: 'divisions' as const, label: 'Division' },
        { dim: 'bases' as const, label: 'Base' },
        { dim: 'ranks' as const, label: 'Rank' },
        { dim: 'crewIds' as const, label: 'Crew ID' },
      ],
      (dim, value) => {
        setCrewFilter({ [dim]: (crewFilter[dim] as string[]).filter((v) => v !== value) })
      },
    ),
  [crewFilter, setCrewFilter])

  // Live overrides the global-filter chips + clear-all (it uses crew-store.activeGlobalFilter).
  const globalFilterChips = liveChrome?.globalFilterChips ?? scenarioGlobalFilterChips
  const onClearAllResolved = liveChrome?.onClearAll ?? clearAllFilters

  // Scenario sort fields derive from the SAME visible columns the user sees (like Live), so the
  // SortDialog offers every sortable column — including computed stats such as MCred — and each
  // field key matches the panel value key the shared comparator sorts by (§Gantt-Unify).
  const scenarioSortFields = useMemo<SortField[]>(
    () => columns.map((c) => ({ key: c.key, label: c.label })),
    [columns],
  )
  const sortFields = liveChrome?.sortFields ?? scenarioSortFields

  const scenarioSortChips = useMemo<SortChip[]>(() =>
    sortCriteria.map((c) => ({
      key: c.column,
      label: columns.find((col) => col.key === c.column)?.label ?? SORT_LABELS[c.column] ?? c.column,
      direction: c.direction,
      onRemove: () => removeSortCriterion(paneType, c.column),
    })),
  [sortCriteria, removeSortCriterion, paneType, columns])
  const sortChips = liveChrome?.sortChips ?? scenarioSortChips

  const quickFilterChips = useMemo(
    () => getQuickFilterChips(quickFilter,
      () => setQuickFilter((prev) => ({ ...prev, search: '' })),
      () => setQuickFilter((prev) => ({ ...prev, frozenOnly: false })),
    ),
    [quickFilter, setQuickFilter],
  )

  // Header column sort click: set sort + clear the cross-pane "found" float (scenario).
  const handleSort = useCallback((key: string) => {
    if (scenarioId !== undefined) {
      getScenarioLayoutStore(scenarioId).getState().clearFoundCrewIds(paneId)
    }
    getPaneStore(contextId).getState().setSortColumn(paneType, key)
  }, [scenarioId, paneId, contextId, paneType])

  const updateColumn = useColumnStore((s) => s.updateColumn)
  const handleColumnWidthChange = useCallback((key: string, width: number) => {
    updateColumn(paneType, key, { width })
  }, [updateColumn, paneType])

  // ── Unfreeze a left-panel row ────────────────────────────────────────────────
  const handleUnfreezeRow = useCallback((crewId: string) => {
    if (isLive) {
      getPaneStore(contextId).getState().unfreezeRow(paneType, crewId)
      return
    }
    if (scenarioId === undefined) return
    const st = getScenarioLayoutStore(scenarioId).getState()
    const cur = st.panes.get(paneId)?.frozenCrewIds ?? []
    st.setFrozenCrewIds(paneId, cur.filter((id) => id !== crewId))
  }, [isLive, contextId, paneType, scenarioId, paneId])

  const handleScenarioHeaderRowRightClick = useCallback((rowIndex: number, cx: number, cy: number) => {
    if (scenarioId === undefined) return
    const crewId = panelRows[rowIndex]?.rowId
    if (!crewId) return
    if (!selectedCrewIds.has(crewId)) {
      roster.selectCrewRow(crewId, 'single', panelRows.map((r) => r.rowId))
    }
    const mockTask = { id: -1, crewId, pairingId: null } as never
    useUiStore.getState().openContextMenu(cx, cy, mockTask, 'scenario-roster', rowIndex, scenarioId)
  }, [scenarioId, panelRows, selectedCrewIds, roster])

  // ── Render callback — roster tasks via the shared renderer ──────────────────
  const loadingMore = liveChrome?.loadingMore ?? false
  const renderContent = useCallback((ctx: CanvasRenderingContext2D, base: BaseRenderContext) => {
    const rc: RosterRenderContext = {
      ...base,
      crewIds,
      items: renderItems,
      itemsByCrew: renderItemsByCrew,
      renderBuckets,
      overlapLanes,
      selectedTaskIds: selectedTaskIds as Set<number>,
      hoveredTaskId: null,        // no hover-driven task highlight (matches the old fork)
      violationMap,
      memoRosterIds,
      lockMap,
      timezone,
      crewSessionTags: sessionTags,
      showSessionTags,
      crewValidityBlock: model.crewValidityBlock,
    }
    renderRosterTasks(rc)

    if (loadingMore) {
      ctx.save()
      ctx.fillStyle = 'rgba(100, 100, 100, 0.06)'
      ctx.fillRect(0, base.canvasHeight - 24, base.canvasWidth, 24)
      ctx.fillStyle = '#888'
      ctx.font = '11px -apple-system, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.fillText('Loading more crew...', base.canvasWidth / 2, base.canvasHeight - 4)
      ctx.restore()
    }
  }, [crewIds, renderItems, renderItemsByCrew, renderBuckets, overlapLanes, selectedTaskIds, violationMap, memoRosterIds, lockMap, timezone, sessionTags, showSessionTags, loadingMore, model.crewValidityBlock])

  // ── Interaction handler — hit-test + callbacks from the source ──────────────
  const getHitTest = roster.getHitTest
  const sourceInteractionCallbacks = roster.useInteractionCallbacks()
  // Default on: Live sets liveChrome.enableRubberBand; Scenario omits liveChrome and
  // still gets the overlay. The shared component owns the rect; sources supply select.
  const enableRubberBand = liveChrome?.enableRubberBand ?? true
  const interactionCallbacks = useMemo(() => {
    if (!enableRubberBand) return sourceInteractionCallbacks
    const base = sourceInteractionCallbacks
    return {
      ...base,
      onRubberBandChange: (rect: RubberBandRect | null) => setRubberBand(rect),
      onRubberBandSelect: (x1: number, y1: number, x2: number, y2: number, additive: boolean) => {
        base.onRubberBandSelect?.(x1, y1, x2, y2, additive)
        setRubberBand(null)
      },
    }
  }, [sourceInteractionCallbacks, enableRubberBand])

  // Stable wrappers: PaneCanvas keeps one attach for the canvas lifetime; callbacks
  // must not close over a stale selection snapshot from first ready.
  const interactionCallbacksRef = useRef(interactionCallbacks)
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

  const registerPaneRef = useRef(roster.registerPane)
  const unregisterPaneRef = useRef(roster.unregisterPane)
  registerPaneRef.current = roster.registerPane
  unregisterPaneRef.current = roster.unregisterPane
  const sourceRef = useRef(source)
  sourceRef.current = source

  const handleCanvasReady = useCallback((canvas: HTMLCanvasElement) => {
    attachedCanvasRef.current = canvas
    const handler = createPaneInteractionHandler(paneType, stableGetHitTest, stableInteractionCallbacks)
    handler.attach(canvas)
    interactionRef.current = handler
    registerPaneRef.current?.({
      getCanvasElement: () => attachedCanvasRef.current,
      getScrollY: () => sourceRef.current.getScrollY(paneId),
      getRowCount: () => crewIdsRef.current.length,
      getRowId: (rowIndex) => crewIdsRef.current[rowIndex] ?? null,
    })
  }, [paneType, stableGetHitTest, stableInteractionCallbacks, paneId])

  const handleCanvasDestroy = useCallback(() => {
    interactionRef.current?.detach()
    interactionRef.current = null
    attachedCanvasRef.current = null
    unregisterPaneRef.current?.()
  }, [])

  // ── Test introspection: publish the rendered left-panel rows (no-op in prod) ──
  useEffect(() => {
    publishPanelRows(
      testPaneType,
      panelRows.map((r) => ({
        ...(r.values as Record<string, string>),
        maxViolationSeverity: String(r.maxViolationSeverity ?? 0),
      })),
    )
  }, [panelRows, testPaneType])

  // ── Test introspection: publish the per-crew validity block (red-line probe, no-op in prod) ──
  useEffect(() => {
    publishValidityBlocks(
      testPaneType,
      Array.from(model.crewValidityBlock, ([crewId, blockMs]) => ({ crewId, blockMs })),
    )
  }, [model.crewValidityBlock, testPaneType])

  // ── Pre-check effect (scenario): re-run rule engine on pending-change mutations ──
  const itemsRef = useRef(items)
  itemsRef.current = items
  const pendingChanges = useScenarioPendingChanges(scenarioId)
  useEffect(() => {
    if (scenarioId === undefined) return
    if (pendingChanges.length === 0) {
      getScenarioViolationStore(scenarioId).getState().resetToPersisted()
      // Drop draft-preview Min-GDO rows from the shared session store (checkLiveDraftLegality
      // syncs 7505/7507 there). Otherwise crew-bell tooltips keep a stale soft hit after Save.
      useSessionViolationStore.getState().clearSessionViolationsByRuleCodes(['7505', '7507'])
      return
    }
    const affected = new Set<string>()
    for (const p of pendingChanges) {
      affected.add(p.crewId)
      if (p.toCrewId) affected.add(p.toCrewId)
    }
    const crewList = [...affected]
    if (crewList.length === 0) return
    void getScenarioViolationStore(scenarioId).getState().runPreCheck(crewList, itemsRef.current)
  }, [pendingChanges, scenarioId])

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {toolbar?.(panelRows.length)}
      {liveChrome?.loadingBar}
      {alertCenter && (
        <ViolationListDialog
          open={alertCenterOpen}
          onClose={() => setAlertCenterOpen(false)}
          rows={alertCenter.rows}
          onCrewClick={roster.bringCrewToTop}
          recheckInfo={alertCenter.recheckInfo}
        />
      )}
      {alertCenter && crewBellCrewId !== null && (
        <ViolationListDialog
          open={crewBellCrewId !== null}
          onClose={() => setCrewBellCrewId(null)}
          rows={crewBellRows}
          onCrewClick={roster.bringCrewToTop}
          recheckInfo={alertCenter.recheckInfo}
        />
      )}
      {qualityAnalysis && (
        <QualityAnalysisDialog
          open={qualityOpen}
          onClose={() => setQualityOpen(false)}
          data={qualityData}
          onCrewClick={handleQualityCrewClick}
          onQualityIssueCount={setQualityIssueCount}
        />
      )}
      {quickFilterOpen && (
        <PaneQuickFilter
          value={quickFilter}
          onChange={setQuickFilter}
          placeholder={liveChrome?.quickFilterPlaceholder ?? 'Search crew…'}
          showFrozen={liveChrome?.showFrozenQuickFilter}
          frozenLabel={liveChrome?.frozenLabel}
        />
      )}
      <SortDialog
        open={sortDialogOpen}
        onOpenChange={setSortDialogOpen}
        paneLabel={isLive ? (livePaneType === 'roster-main' ? 'Roster' : 'Roster Sub') : 'Scenario Roster'}
        fields={sortFields}
        initialCriteria={sortCriteria}
        onApply={(criteria) => setSortCriteria(paneType, criteria)}
      />
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <PaneConditionStrip
          paneType={paneType}
          leftPanelWidth={leftPanelWidth}
          filterChips={liveChrome?.filterChips}
          globalFilterChips={globalFilterChips}
          sortChips={sortChips}
          quickFilterChips={quickFilterChips}
          queryMode={liveChrome?.queryMode}
          onQueryModeToggle={liveChrome?.onQueryModeToggle}
          quickFilterOpen={quickFilterOpen}
          onQuickFilterToggle={handleQuickFilterToggle}
          onFilterClick={onFilterClickResolved}
          onSortClick={handleSortOpen}
          onClearAll={onClearAllResolved}
          onRemoveFilter={liveChrome?.onRemoveFilter}
          onViolationsClick={alertCenter ? handleAlertCenterOpen : undefined}
          violationCount={alertCenter ? alertCenter.rows.length : undefined}
          onQualityClick={qualityAnalysis ? handleQualityOpen : undefined}
          qualityIssueCount={qualityAnalysis ? qualityIssueCount : undefined}
          onRecheck={legalityRecheck ? legalityRecheck.onRecheck : undefined}
          recheckComputing={legalityRecheck ? legalityRecheck.computing : undefined}
          recheckStale={legalityRecheck ? legalityRecheck.paramsStale : undefined}
          recheckStuck={legalityRecheck ? legalityRecheck.stuck : undefined}
          overlapLanes={overlapLanes}
          onOverlapLanesToggle={handleOverlapLanesToggle}
          onRosterBulkDeleteClick={liveChrome?.onRosterBulkDeleteClick}
          rosterBulkDeleteDisabled={liveChrome?.rosterBulkDeleteDisabled}
          rosterBulkDeleteIcon={liveChrome?.rosterBulkDeleteIcon}
          rosterBulkDeleteTitle={liveChrome?.rosterBulkDeleteTitle}
          onClose={onClose}
        />
        {!isLive && (
          <FilterDialog
            open={filterDialogOpen}
            contextId={contextId}
            initialTab="crew"
            onClose={() => setFilterDialogOpen(false)}
            onApply={() => {}}
          />
        )}
        <PaneHeaderCanvas
          paneId={paneId}
          paneType={paneType}
          columns={columns}
          rows={panelRows}
          frozenRowCount={frozenRowCount}
          selectedRowIndices={selectedRowIndices}
          sortColumn={sortColumn}
          sortDirection={sortDirection}
          leftPanelWidth={leftPanelWidth}
          bottomRowKey="crewName"
          onColumnHeaderClick={handleSort}
          onColumnWidthChange={handleColumnWidthChange}
          onWheel={(deltaY) => {
            const cur = source.getScrollY(paneId)
            const containerHeight = attachedCanvasRef.current?.clientHeight ?? 600
            source.setScrollY(paneId, clampRosterScrollY(cur + deltaY, crewIds.length, containerHeight))
          }}
          onRowClick={(rowIndex, ctrl, shift) => {
            const crewId = panelRows[rowIndex]?.rowId
            if (crewId) roster.selectCrewRow(crewId, ctrl ? 'toggle' : shift ? 'range' : 'single', panelRows.map((r) => r.rowId))
          }}
          onRowDoubleClick={(rowIndex) => {
            const crewId = panelRows[rowIndex]?.rowId
            if (crewId) useUiStore.getState().openCrewInfo(crewId)
          }}
          onRowRightClick={
            liveChrome?.onHeaderRowRightClick
              ? (rowIndex, cx, cy) =>
                  liveChrome.onHeaderRowRightClick!(rowIndex, panelRows[rowIndex]?.rowId ?? '', cx, cy)
              : isLive ? undefined : handleScenarioHeaderRowRightClick
          }
          onUnfreezeRow={(rowId) => handleUnfreezeRow(rowId)}
          onViolationHover={liveChrome?.onViolationHover ?? handleViolationHover}
          onViolationClick={alertCenter ? handleCrewBellClick : undefined}
        />
        {splitter}
        <PaneCanvas
          paneId={paneId}
          paneType={paneType}
          canvasTestId={canvasTestId}
          totalRows={crewIds.length}
          frozenRowCount={frozenRowCount}
          dropTargetRow={liveChrome?.dropTargetRow ?? -1}
          selectedRowIndices={selectedRowIndices}
          renderContent={renderContent}
          onCanvasReady={handleCanvasReady}
          onCanvasDestroy={handleCanvasDestroy}
          rubberBand={enableRubberBand ? rubberBand : undefined}
        />
      </div>
    </div>
  )
}

// ── Local helpers ─────────────────────────────────────────────────────────────

/** Subscribe to scenario pending changes (empty array for live). */
function useScenarioPendingChanges(scenarioId: number | undefined) {
  const useStore = scenarioId !== undefined ? getScenarioGanttStore(scenarioId) : null
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useStore ? useStore((s) => s.pendingChanges) : EMPTY_PENDING
}
const EMPTY_PENDING: never[] = []
