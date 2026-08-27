// gantt/src/components/gantt/source/gantt-pane-source.ts
import type { PanelRowData } from '@/components/gantt/pane-header-canvas'
import type { ColumnConfig } from '@/types/column'
import type { RuleViolation, PreCheckResult } from '@/types/rule-check'
import type { RosterItem } from '@/types'
import type { FlightItem, FlightCompositionStatus } from '@/types/flight'
import type { PairingItem } from '@/types/pairing'
import type { HitTestFn, PaneInteractionCallbacks } from '@/components/gantt/interactions/base-interaction'
import type { CrewViolationRow } from '@/components/panes/violation-list-dialog'
import type { ScenarioGanttData } from '@/types/scenario-gantt'
import type { RosterLaneHitLayout } from '@/components/gantt/gantt-utils'
import type { RosterPeriodOption } from '@/services/roster-period-api'

/**
 * Recheck-status line rendered inside the shared ViolationListDialog (informational, next to
 * the violation list). 'live' shows the global Live group's background-recheck status (existing
 * LegalityRecheckIndicator behavior). 'scenario' shows THIS scenario's own persisted legality
 * status — status/computedAt/errorText come straight from the scenario violation store, so the
 * dialog never shows an unrelated Live group's state when opened from a Scenario (that mismatch
 * previously read as "Recheck failed" for a scenario whose own recheck had actually succeeded).
 */
export type RecheckIndicatorInfo =
  | { type: 'live'; groupCode: string }
  | {
      type: 'scenario'
      status: 'PENDING' | 'COMPUTING' | 'READY' | 'FAILED' | null
      computedAt: string | null
      errorText: string | null
      paramsStale: boolean
      /** True once the current run has been COMPUTING/PENDING longer than expected. */
      stuck: boolean
    }

/** 场景类型可见 pane 与可编辑内容（P2 起由后端下发；P0 仅定义类型，统一为只读默认）。 */
export interface GanttCapabilities {
  panes: Array<'roster' | 'pairing' | 'flight'>
  defaultPanes: Array<'roster' | 'pairing' | 'flight'>
  roster: { canAssign: boolean; canRemove: boolean; canReassign: boolean }
  pairing: { canEditSegments: boolean }
}

/**
 * Stable empty overlay singletons — shared by both source adapters and the shared
 * roster pane. Neither the scenario roster (no locks/session tags) nor an unlocked
 * Live roster carries overlays; returning these frozen singletons keeps the canvas
 * render input ref-stable. Defined once here (the interface module both adapters and
 * the shared pane already import) to avoid a backwards shared-component → adapter import.
 */
export const EMPTY_LOCK_MAP: Map<number, 'mine' | 'other'> = new Map()
export const EMPTY_SESSION_TAGS: Map<string, number[]> = new Map()

/** 只读默认能力：所有编辑关闭，三 pane 可见（Live 默认）。 */
export const READ_ONLY_CAPABILITIES: GanttCapabilities = {
  panes: ['roster', 'pairing', 'flight'],
  defaultPanes: ['roster', 'pairing', 'flight'],
  roster: { canAssign: false, canRemove: false, canReassign: false },
  pairing: { canEditSegments: false },
}

/** 编辑控制器（P3 接线；P0 仅占位）。 */
export interface GanttEditController {
  execute: (op: GanttEditOp) => Promise<void>
}

export type GanttEditOp =
  | { type: 'roster-assign'; pairingId: number; toCrewId: string }
  | { type: 'roster-remove'; pairingId: number; crewId: string }
  | { type: 'roster-reassign'; pairingId: number; fromCrewId: string; toCrewId: string }
  | { type: 'pairing-add-segment'; pairingId: number; segment: unknown }
  | { type: 'pairing-remove-segment'; pairingId: number; segmentId: number }

/** 违规数据源（P3 接线）。 */
export interface GanttViolationSource {
  /** Subscribe to violations for a target. IS a React hook — call unconditionally. */
  useViolations: (targetType: 'roster' | 'pairing' | 'crew', targetId: string) => RuleViolation[]
  /** Run a pre-check against simulated items; writes results into the violation store. */
  runPreCheck: (
    affectedCrewIds: string[],
    simulated: RosterItem[],
    current?: RosterItem[],
  ) => Promise<PreCheckResult>
}

/**
 * 统一数据源：共享展示组件只通过此抽象读取 viewport / timezone。
 * viewport 用按需订阅 selector hook（契合 ref-based RAF 渲染，避免过度重渲染）。
 * Live 与 Scenario 各自提供实现；差异不再以 override props 表达。
 */
export interface GanttPaneSource {
  mode: 'live' | 'scenario'
  // ── viewport ──
  useScrollX: () => number
  useScrollY: (paneId: string) => number
  setScrollY: (paneId: string, n: number) => void
  /** Synchronous fresh read of scrollX at event/RAF time (bypasses React batching staleness). NOT a hook. */
  getScrollX: () => number
  /** Synchronous fresh read of a pane's scrollY at event/RAF time. NOT a hook. */
  getScrollY: (paneId: string) => number
  usePxPerHour: () => number
  useRange: () => { start: Date; end: Date }
  useTimezone: () => string
  /** React hook for the cached RP calendar used by shared timeline rendering. */
  useRosterPeriods: () => RosterPeriodOption[]
  /** 返回一个随重绘触发变化的信号；Live 用全局 dirty 计数，Scenario 用自增信号。 */
  useDirtySignal: () => number
  markClean: () => void
  // ── capabilities（P0 固定 READ_ONLY_CAPABILITIES，P2 起按场景）──
  capabilities: GanttCapabilities
  // ── 可选能力（P3 接线；P0 恒为 undefined）──
  edit?: GanttEditController
  violations?: GanttViolationSource
  // ── per-pane flight accessor (Phase 5A; Live leaves this undefined until Phase 5B) ──
  flight?: FlightPaneSource
  // ── per-pane pairing accessor (Phase 5B-1; Live leaves this undefined until Phase 5B-2) ──
  pairing?: PairingPaneSource
  // ── per-pane roster accessor (Phase R1; both contexts implement) ──
  roster?: RosterPaneSource
}

/**
 * Per-pane roster data accessor — supplied by the source implementation so a shared
 * RosterPane component can read crew rows + roster task items + interaction wiring without
 * knowing whether it renders Live or Scenario. Mirrors Flight/PairingPaneSource.
 *
 * All `use*` members ARE React hooks — call them unconditionally. The shared component
 * derives render buckets from `useRows().itemsByCrew` (a pure transform), so the source
 * does not return them. Live-only overlays (locks, session tags) are OPTIONAL — Scenario
 * omits them and the shared component renders without that decoration.
 */
/**
 * The unified roster model — built ONCE per dependency change by the source adapter
 * (one useMemo) and consumed by SharedRosterPane. Replaces the old useRows /
 * usePanelRows / useViolationMap trio, each of which independently re-ran the (expensive)
 * crew-order + roster-item + violation-map build. Carries the canvas inputs, the left-panel
 * rows, the puck-badge violation map, and the O(1) lookup indexes for both businesses.
 */
export interface RosterModel {
  /** Ordered crew ids (frozen → found → rest). */
  crewIds: string[]
  /** Flat roster task items for the canvas. */
  items: RosterItem[]
  /** crewId → that crew's roster items (canvas render buckets + crew-scoped lookups). */
  itemsByCrew: Map<string, RosterItem[]>
  /** Left-panel rows (incl. maxViolationSeverity + optional lockStatus) for PaneHeaderCanvas. */
  panelRows: PanelRowData[]
  /** taskId → max violation severity, for canvas puck badges. */
  violationMap: Map<number, number>
  /** crewId → max severity, for left-panel crew bells independent of task puck badges. */
  crewViolationSeverityMap: Map<string, number>
  /** Count of frozen (pinned-to-top) rows. */
  frozenRowCount: number
  /** taskId → item — O(1) hit-test / click / right-click / hover lookup. */
  taskById: Map<number, RosterItem>
  /** pairingId → items — O(1) pairing-violation expansion + pairing-group selection. */
  itemsByPairingId: Map<number, RosterItem[]>
  /** crewId → 窗口内首个 rank/base 覆盖断档时刻（ms）；仅含需要画红线的机组。 */
  crewValidityBlock: Map<string, number>
}

export interface RosterPaneSource {
  /**
   * React hook — the single memoized roster model (rows + panel rows + violation map +
   * lookup indexes), built once per dependency change. The sole roster-data hook the
   * shared component calls; both Live and Scenario adapters implement it identically-shaped.
   */
  useRosterModel: () => RosterModel
  /** React hook — the visible columns for this roster pane (context-keyed column store). */
  useColumns: () => ColumnConfig[]

  capabilities: { canAssign: boolean; canRemove: boolean; canReassign: boolean }

  // ── Selection ──────────────────────────────────────────────────────────────
  /** React hook — selected crew row ids (drives left-panel row highlight). */
  useSelectedCrewIds: () => ReadonlySet<string>
  /** React hook — selected roster task ids (drives canvas puck highlight). */
  useSelectedTaskIds: () => ReadonlySet<number>
  /** Imperative: left-panel crew row click (single / ctrl-toggle / shift-range over orderedIds). */
  selectCrewRow: (crewId: string, mode: 'single' | 'toggle' | 'range', orderedIds: string[]) => void
  /**
   * Imperative: float one crew to the TOP of this roster pane and scroll it into view, so the
   * planner can inspect that crew's roster. Backs the Alert Center / Quality dialog "click a row
   * → bring its crew up" gesture. Both contexts implement it through their own found-tier
   * mechanism (Live: pane-store.foundCrewIds via bringCrewIdsToTop; Scenario: scenario-layout
   * found ids), so the shared UI never branches on live-vs-scenario.
   */
  bringCrewToTop: (crewId: string) => void

  // ── Interaction (canvas) ─────────────────────────────────────────────────────
  /** Returns a hit-test fn reading fresh scroll/zoom/range at event time (NOT a hook). */
  getHitTest: () => HitTestFn
  /** React hook — the canvas interaction callbacks (click/hover/drag/scroll/zoom) for this context. */
  useInteractionCallbacks: () => PaneInteractionCallbacks

  // ── Optional Legality Alert Center (both contexts; shared pane renders bell + dialog) ──
  /**
   * React hook — the loaded legality violations for this roster context plus a force-rescan
   * handler. When defined, SharedRosterPane renders the shared Alert Center bell (in the
   * PaneConditionStrip action cluster) and the shared ViolationListDialog. Live and Scenario
   * each supply their own rows through their adapter (Live: session/rule violations; Scenario:
   * persisted Rust legality); the bell + dialog code path is identical for both — there is no
   * second placement. Undefined → the pane has no violation surface (no bell).
   */
  useAlertCenter?: () => { rows: CrewViolationRow[]; onScan: () => void; recheckInfo: RecheckIndicatorInfo }

  // ── Optional Scenario-only Quality Analyzer (Live omits → no toolbar button) ──
  /**
   * React hook — per-crew roster-quality rows computed from the loaded scenario
   * optimization result (credit breakdown + extensible quality findings such as
   * standalone RES). When defined, SharedRosterPane renders the Quality Analyzer
   * toolbar button + dialog. ONLY the scenario source implements it; Live leaves it
   * undefined, so the button never appears in Live (the request scopes this to
   * scenarios). Computed lazily (cheap, in-memory) so it never affects §First-Paint.
   */
  useQualityAnalysis?: () => { data: ScenarioGanttData | null }

  // ── Optional legality recheck control (pane-toolbar button; §Pane-Toolbar-Home) ──
  /**
   * React hook — a manual "Recheck" action for the roster pane's condition-strip toolbar
   * (next to the Alert Center bell). Returns `onRecheck` (force a legality recompute + reload),
   * `computing` (recheck in flight → disable + spin), and `paramsStale` (rule params changed
   * since last check → badge/tint on the button). When defined, SharedRosterPane renders the
   * shared Recheck button in the pane toolbar — NEVER in its own row (gantt/CLAUDE.md
   * §Pane-Toolbar-Home). Scenario implements it (persisted Rust legality); Live omits it (its
   * recheck lives in the top sub-toolbar), so the button never appears in Live.
   */
  useLegalityRecheck?: () => { onRecheck: () => void; computing: boolean; paramsStale: boolean; stuck: boolean }

  // ── Optional Live-only overlays (Scenario omits → shared component skips) ─────
  /** React hook — taskId → lock state for puck lock badges. */
  useLockMap?: () => Map<number, 'mine' | 'other'>
  /** React hook — crewId → session-tag ids (Live session-edit colouring). */
  useSessionTags?: () => Map<string, number[]>
  /** Whether session tags should render (Live true; scenario undefined/false). */
  showSessionTags?: boolean

  // ── Optional cross-pane drop registration (both contexts when a DragProvider is present) ──
  registerPane?: (reg: Omit<import('@/components/gantt/interactions/drag-handler').PaneRegistration, 'paneType'>) => void
  unregisterPane?: () => void

  /**
   * Optional (Live only): feed back the FINAL rendered crew order after the shared
   * component applies its client-side quick-filter (search / frozenOnly). The Live
   * pipeline applies sort/found/frozen in the source, but the quick-filter is local
   * component state; this keeps the source's event-time hit-test / drop refs aligned
   * with what is actually painted. Scenario omits this (no quick-filter divergence —
   * search is already applied inside the source).
   */
  setRenderedRows?: (rows: {
    crewIds: string[]
    items: RosterItem[]
    itemsByCrew: Map<string, RosterItem[]>
    frozenRowCount: number
    laneLayoutByTaskId?: Map<number, RosterLaneHitLayout>
  }) => void
}

/**
 * Per-pane flight data accessor — supplied by the source implementation so a
 * shared FlightPane component can read rows + interaction capabilities without
 * knowing whether it is rendering Live or Scenario data.
 *
 * All `use*` members ARE React hooks — call them unconditionally.
 * Quick-search text filtering is applied by the shared component on top of the
 * rows returned here; source implementations return pre-filtered (by the shared
 * FlightFilter) but not quick-search-filtered rows.
 */
export interface FlightPaneSource {
  /**
   * React hook — returns filtered FlightItem rows (shared FlightFilter applied;
   * quick-search NOT applied) and the per-flight composition status map used by
   * the renderer to colour pucks.
   */
  useRows: () => { rows: FlightItem[]; compositionStatusMap: Map<number, FlightCompositionStatus> }

  capabilities: {
    canDrag: boolean
    canRubberBand: boolean
    tracksHover: boolean
    lazyLoads: boolean
  }

  // ── Selection (hook + imperative) ───────────────────────────────────────────
  /** React hook — returns the current selection set (stable reference when unchanged). */
  useSelectedIds: () => ReadonlySet<number>
  /** Imperative: set (replace), toggle, or clear selection for a single flight. */
  select: (id: number, mode: 'set' | 'toggle' | 'clear') => void
  /** Imperative: replace selection with a batch (rubber-band / range). */
  selectMany: (ids: number[]) => void

  // ── Hover ───────────────────────────────────────────────────────────────────
  /** React hook — currently hovered flight id, or null (scenario: always null). */
  useHoveredId: () => number | null
  /** Imperative: set hovered flight (scenario: no-op). */
  setHovered: (id: number | null, clientX?: number, clientY?: number) => void

  // ── Geometry (for hit-testing; avoids coupling the component to a concrete store) ──
  /** Returns current pxPerHour without subscribing (read at event time). */
  getPxPerHour: () => number
  /** Returns the range start Date without subscribing (read at event time). */
  getRangeStart: () => Date

  // ── Optional capabilities (Live only) ───────────────────────────────────────
  /** Cross-pane drag to roster canvas (Live only; undefined for scenario). */
  startDragToRoster?: (source: import('@/components/gantt/interactions/drag-handler').DragSource) => void
  /** Trigger lazy-load of next page when scrolled to bottom (Live only; undefined for scenario). */
  loadMore?: () => void

  // ── Scroll / zoom (Live only; scenario: no-op or undefined) ─────────────
  /** Horizontal pan: move shared gantt scrollX by dx pixels (Live: gantt-view-store.scroll). */
  scrollByX?: (dx: number) => void
  /** Zoom in (Live: gantt-view-store.zoomIn). */
  zoomIn?: () => void
  /** Zoom out (Live: gantt-view-store.zoomOut). */
  zoomOut?: () => void

  // ── Rich status line (Live + Scenario via source adapters) ───────────────
  /**
   * Build the status-bar line for a hovered flight (source adapter: TZ + composition).
   * Falls back to a simple "fltNum · dep → arv · times" string when undefined.
   */
  formatStatusLine?: (flightId: number) => string

  // ── Cross-pane drag registration (Live only) ──────────────────────────────
  /**
   * Register the flight pane canvas with the cross-pane drag handler.
   * Shape matches PaneRegistration minus paneType (source sets it to 'flight').
   */
  registerPane?: (reg: Omit<import('@/components/gantt/interactions/drag-handler').PaneRegistration, 'paneType'>) => void
  /** Unregister the flight pane from the cross-pane drag handler. */
  unregisterPane?: () => void

  // ── Row selection / freezing ──────────────────────────────────────────────
  /**
   * React hook — returns the set of selected row IDs (registration strings) for the
   * flight pane. Used by PaneHeaderCanvas and PaneCanvas to highlight selected rows.
   */
  useSelectedRowIds?: () => ReadonlySet<string>
  /**
   * React hook — count of frozen (pinned-to-top) rows. The source's useRows already
   * reorders frozen rows first; this drives PaneHeaderCanvas/PaneCanvas frozenRowCount.
   */
  useFrozenRowCount?: () => number
  /** Imperative: replace the row selection with a single row. */
  selectRow?: (rowId: string) => void
  /** Imperative: toggle a single row in the selection. */
  toggleRowSelection?: (rowId: string) => void
  /** Imperative: extend row selection to a range ending at rowId, given all row ids in order. */
  selectRowRange?: (rowId: string, allRowIds: string[]) => void
  /** Imperative: unfreeze (unpin) a frozen row. */
  unfreezeRow?: (rowId: string) => void
  /** Imperative: mark the gantt canvas dirty so a row-selection/freeze change repaints. */
  markDirty?: () => void

  // ── Filter application (Live only) ────────────────────────────────────────
  /**
   * Called after a global filter chip is removed (i.e. after setFlightFilter is called).
   * Live: calls applyGanttFilters() to re-fetch data and update the appliedFilters snapshot.
   * Scenario: undefined (filtering is client-side, already reactive).
   */
  applyFilterChange?: () => void
}

/**
 * Per-pane pairing data accessor — supplied by the source implementation so a
 * shared PairingPane component can read rows + interaction capabilities without
 * knowing whether it is rendering Live or Scenario data. Mirrors FlightPaneSource.
 *
 * All `use*` members ARE React hooks — call them unconditionally.
 * Selection ids are SEGMENT ids (a pairing's dashed box lights when any of its
 * segments is selected). Quick-search text filtering is applied by the shared
 * component on top of the rows returned here; the source returns rows already
 * filtered by the shared PairingFilter, found-floated, and SORTED.
 */
export interface PairingPaneSource {
  /** React hook — returns PairingItem rows (shared PairingFilter applied + found-floated + sorted; quick-search NOT applied). */
  useRows: () => { rows: PairingItem[] }

  capabilities: {
    canDrag: boolean
    canRubberBand: boolean
    tracksHover: boolean
    lazyLoads: boolean
    /** Live-only: show the RES Pairing Creator button in the pane toolbar. Scenario leaves this undefined. */
    canCreateRes?: boolean
  }

  // ── Selection (SEGMENT ids; hook + imperative) ───────────────────────────────
  /** React hook — returns the current segment-id selection set (stable reference when unchanged). */
  useSelectedIds: () => ReadonlySet<number>
  /** Imperative: set (replace), toggle, or clear selection for a single segment. */
  select: (id: number, mode: 'set' | 'toggle' | 'clear') => void
  /** Imperative: replace selection with a batch. */
  selectMany: (ids: number[]) => void

  // ── Hover ───────────────────────────────────────────────────────────────────
  /** React hook — currently hovered segment id, or null (scenario: always null). */
  useHoveredId: () => number | null
  /** Imperative: set hovered segment (scenario: no-op). */
  setHovered: (id: number | null, clientX?: number, clientY?: number) => void

  // ── Geometry (for hit-testing; read at event time, no subscription) ──────────
  getPxPerHour: () => number
  getRangeStart: () => Date

  // ── Sort (both contexts; header-click toggle) ────────────────────────────────
  /** React hook — current primary sort column, or null. */
  useSortColumn: () => string | null
  /** React hook — current primary sort direction. */
  useSortDirection: () => 'asc' | 'desc'
  /** Imperative: header-click sort — replace criteria with a single toggled key. */
  setSort: (column: string) => void

  // ── Optional capabilities ────────────────────────────────────────────────────
  /**
   * Cross-pane drag (assign-pairing → roster). Scenario DEFINES this (via crossPaneDrag)
   * when a DragProvider is present; Live will define it in Phase 5B-2.
   */
  startDrag?: (source: import('@/components/gantt/interactions/drag-handler').DragSource) => void
  /** Trigger lazy-load of next page (Live only; undefined for scenario). */
  loadMore?: () => void
  /** Horizontal pan by dx pixels (Live only; scenario: undefined). */
  scrollByX?: (dx: number) => void
  /** Zoom in (Live only). */
  zoomIn?: () => void
  /** Zoom out (Live only). */
  zoomOut?: () => void
  /** Rich status-bar line for a hovered segment (Live and Scenario can provide this via source adapters). */
  formatStatusLine?: (segmentId: number) => string
  /** Register the pairing pane canvas with the cross-pane drag handler (Live only). */
  registerPane?: (reg: Omit<import('@/components/gantt/interactions/drag-handler').PaneRegistration, 'paneType'>) => void
  /** Unregister the pairing pane from the cross-pane drag handler (Live only). */
  unregisterPane?: () => void
  /** Re-fetch after a global filter chip is removed (Live only; scenario: undefined). */
  applyFilterChange?: () => void

  // ── Row selection (Live only) ─────────────────────────────────────────────
  /**
   * React hook — returns the set of selected ROW ids (pairing-id strings) for the
   * pairing pane left panel. Used by PaneHeaderCanvas + PaneCanvas to highlight rows.
   */
  useSelectedRowIds?: () => ReadonlySet<string>
  /**
   * React hook — count of frozen (pinned-to-top) rows. The source's useRows already
   * reorders frozen rows first; this drives PaneHeaderCanvas/PaneCanvas frozenRowCount.
   * Undefined / 0 for scenario.
   */
  useFrozenRowCount?: () => number
  /** Imperative: replace the row selection with a single row. */
  selectRow?: (rowId: string) => void
  /** Imperative: toggle a single row in the selection. */
  toggleRowSelection?: (rowId: string) => void
  /** Imperative: extend the row selection to a range ending at rowId, given all row ids in order. */
  selectRowRange?: (rowId: string, allRowIds: string[]) => void
  /** Imperative: unfreeze (unpin) a frozen row (Live only). */
  unfreezeRow?: (rowId: string) => void
  /** Imperative: mark the gantt canvas dirty so a row-selection/freeze change repaints (Live only). */
  markDirty?: () => void
}

/** 供 source 复用的 pane 数据形状（P1 起 roster 也走此抽象；P0 暂不强制 data 部分）。 */
export interface GanttPaneData {
  rows: PanelRowData[]
  columns: ColumnConfig[]
  frozenRowCount: number
}
