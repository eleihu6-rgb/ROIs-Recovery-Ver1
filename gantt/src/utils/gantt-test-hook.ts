/**
 * Gantt 测试自省钩子（test introspection hook）
 *
 * 目的：Gantt 主体用 Canvas 渲染，DOM 上没有按对象的元素，Playwright 无法用
 * `toHaveCount` / `toContainText` 断言「画了哪些对象」。仅检查「canvas 有非空像素」
 * 属于 §No-Illusion 禁止的假象断言（画了东西 ≠ 画对了对象）。
 *
 * 本钩子在 **非生产构建**（`import.meta.env.PROD === false`）下把 `window.__ganttTest`
 * 暴露给测试，数据全部来自渲染所依据的同一份 store 状态 + Canvas 实际绘制回执
 * （`publishRenderStats`）。生产构建里 `installGanttTestHook()` 直接 return，钩子不会
 * 进入产物。
 *
 * 断言模型（避免假象）：
 *  - `counts()`        —— 各面板已加载对象数（store 真值）
 *  - `render()`        —— Canvas 每次成功绘制后回执的 totalRows / 绘制次数（证明确实画了）
 *  - `ready()`         —— 所有可见数据面板「对象已呈现给用户」（不在加载中 + 计数>0 + 已绘制）
 *  - `roster/pairings/flights()` —— 轻量对象列表，供「匹配筛选条件」断言
 */
import { useAuthStore } from '@/stores/auth-store'
import { useRosterStore } from '@/stores/roster-store'
import { useCrewMemoStore } from '@/stores/crew-memo-store'
import { usePairingStore } from '@/stores/pairing-store'
import { reloadPairingsAfterCommit, useDraftStore } from '@/stores/draft-store'
import { useFlightStore } from '@/stores/flight-store'
import { useCrewStore } from '@/stores/crew-store'
import { useGanttViewStore } from '@/stores/gantt-view-store'
import { useFilterStore } from '@/stores/filter-store'
import { useColumnStore } from '@/stores/column-store'
import { useLayoutStore } from '@/stores/layout-store'
import { usePaneStore, getPaneStore } from '@/stores/pane-store'
import {
  RESERVE_PUCK_COLOR,
  ROSTER_FLIGHT_BOTTOM,
  ROSTER_FLIGHT_TOP,
  isDeadheadRosterPuck,
  resolveSegmentDutyFill,
  type SegmentDutyFill,
} from '@/utils/puck-duty-color'
import { getFilterStore } from '@/stores/filter-store'
import { getScenarioGanttStore } from '@/stores/scenario-gantt-store'
import { getScenarioLayoutStore } from '@/stores/scenario-layout-store'
import { getScenarioRosterSelectionStore } from '@/stores/scenario-roster-selection-store'
import { getScenarioViolationStore } from '@/stores/scenario-violation-store'
import { useSessionViolationStore } from '@/stores/session-violation-store'
import { useRuleCheckStore } from '@/stores/rule-check-store'
import {
  resolveViolationViewBounds,
  violationOverlapsDisplayWindow,
} from '@/utils/violation-display-window'
import { buildScenarioRosterItems } from '@/components/scenario-gantt/build-scenario-roster-items'
import { buildRosterIndexes, timeToX } from '@/components/gantt/gantt-utils'
import { buildLiveViolationMapForTest } from '@/components/gantt/source/live-gantt-source'
import { isCrewBellOnlyRule } from '@/components/gantt/crew-bell-only-rules'
import type { AssignmentPatch, ScenarioGanttPairing, ScenarioGanttCompositionSlot } from '@/types/scenario-gantt'
import { buildEffectiveAssignments } from '@/components/scenario-gantt/build-scenario-roster-items'
import { computeScenarioPairingCompositions } from './scenario-composition-fill'
import { applyGanttFilters } from '@/utils/apply-filters'
import { findCrewToTop } from '@/utils/find-crew'
import { findPairingsByFlight } from '@/utils/bring-matches-to-top'
import { markPhase, resetPhaseMarks, allPhaseMarks, phasesRelative } from '@/utils/gantt-perf-marks'
import { isCrossDayLocal, useTimezoneStore } from '@/stores/timezone-store'
import { useUiStore } from '@/stores/ui-store'
import { useAirportTzStore } from '@/stores/airport-tz-store'
import { useFlightCompositionStore } from '@/stores/flight-composition-store'
import { formatFlightStatusLine } from '@/utils/format-flight-status-line'
import { formatGroundTaskStatusLine } from '@/utils/format-ground-task-status-line'
import { segmentFlightInfo, parseFlightLabel } from '@/utils/segment-flight-info'
import { formatCreditMinutes, sumPairingCreditMinutes } from '@/utils/format-credit'
import type { Flight, RosterItem } from '@/types'
import { HEADER_HEIGHT, ROW_HEIGHT, PAIRING_HEADER_HEIGHT, PAIRING_ROW_HEIGHT } from '@/components/gantt/gantt-constants'
import { sortFlightRows, sortPairingRows, reorderFrozenFirst, formatBlockMinutes } from '@/components/gantt/gantt-utils'
import { isOpenPartialCoverage, sumCoverageCredit } from '@/utils/pairing-credit'
import type { CoverageState } from '@/utils/pairing-coverage'
import { buildPairingDutyBuckets, groupSegmentsByDuty } from '@/components/gantt/renderers/pairing-renderer'

export interface PaneRenderStat {
  paneId: string
  paneType: string
  /** 本面板的数据行数（roster=机组行, pairing=配对行, flight=注册号行） */
  totalRows: number
  width: number
  height: number
  /** 累计成功绘制次数（每次 markClean 前 +1，证明 Canvas 真的画了） */
  renders: number
  ts: number
}

export interface GanttCounts {
  roster: number
  pairing: number
  /** flight 面板按注册号分组的行数 */
  flightRegistrations: number
  /** flight 面板展开后的航段（航班）总数 */
  flightLegs: number
}

export interface GanttLoading {
  roster: boolean
  pairing: boolean
  flight: boolean
  refreshing: boolean
}

export interface GanttTestApi {
  counts: () => GanttCounts
  loading: () => GanttLoading
  /** 当前布局里存在的面板实例 */
  panes: () => Array<{ id: string; type: string }>
  /** 去重后的可见面板类型 */
  paneTypes: () => string[]
  /** 当前布局网格（行 × 列，存 paneId 或 null）——验证面板是上下堆叠还是左右并排。 */
  grid: () => Array<Array<string | null>>
  /** Live layout row heights (`-1` = flex); for pane vertical-resize asserts. */
  rowHeights: () => number[]
  /** 所有可见数据面板都已把对象呈现给用户（不在加载中 + 计数>0 + 已绘制） */
  ready: () => boolean
  /** Canvas 实际绘制回执（按 paneId） */
  render: () => PaneRenderStat[]
  /** Loaded roster_flight ids that have a visible crew memo (each draws a note icon). */
  memoBadges: () => number[]
  /** Total visible crew memos loaded into the store. */
  memoCount: () => number
  roster: () => Array<Record<string, unknown>>
  patchRoster: (paneId: 'main' | 'sub', items: RosterItem[]) => void
  openGroundTaskEdit: (item: RosterItem, scenarioId?: number) => void
  openPairingInfo: (id: number) => void
  /** Open the Live roster ContextMenu for a pairing (pairing-pane shape) at a fixed screen point. */
  openLivePairingContextMenu: (pairingId: number) => void
  /** 首条 roster 对象的字段名集合（用于验证精简 DTO：保留项在、裁剪项不在）。 */
  rosterKeys: () => string[]
  /** Roster-main 列配置（key/label/visible）——验证 SEN 列存在与可见性。 */
  rosterColumns: () => Array<{ key: string; label: string; visible: boolean }>
  /** Pairing 列配置（key/label/visible）——验证 Base 列存在与可见性。 */
  pairingColumns: () => Array<{ key: string; label: string; visible: boolean }>
  /** 表头 canvas 实际绘制的列（key/label/width，按绘制顺序）——渲染级断言，区别于配置 pairingColumns()。 */
  renderedColumns: (paneType: string) => Array<{ key: string; label: string; width: number }>
  /** 表头 canvas 的像素宽度——用于断言某列未被裁出可视区。 */
  renderedHeaderWidth: (paneType: string) => number
  /** 表头 canvas 第 index 行实际绘制的单元格值（按列 key）。 */
  renderedRow: (paneType: string, index: number) => Record<string, string> | null
  /** Roster-main 左侧表头每行的 crewId + seniority 绘制值。 */
  rosterPanel: () => Array<{ crewId: string; seniority: string }>
  /** Roster-main 每行 crewId + 显示的 MCred 文本（"H:MM"）——验证 de-assign/add 后的实时积分。 */
  rosterMcred: () => Array<{ crewId: string; mcred: string }>
  /** Scenario-roster 每行 crewId + 显示的 MCred 文本（"H:MM"）——验证 Scenario 排序/显示。 */
  scenarioRosterMcred: () => Array<{ crewId: string; mcred: string }>
  /** Roster-main 每行全部七个 manday KPI（含 Tier-1 乐观增量）——验证 de-assign/add 后所有 KPI 实时更新。 */
  rosterPanelKpis: () => Array<{ crewId: string; mcred: string; mbh: string; ybh: string; mdo: string; ydo: string; mal: string; yal: string }>
  /** Current roster-period key used by the Live manday stats map. */
  crewStatsYearMonth: () => string | null
  /** Roster-main 每行 crewId + rank（按当前显示顺序）——用于验证默认排序（rank→crewId）。 */
  rosterPanelOrder: () => Array<{ crewId: string; rank: string }>
  /** Roster-main per-crew max violation severity — the value that drives the crew bell. */
  crewViolationSeverities: () => Array<{ crewId: string; severity: number }>
  /** Scenario-roster per-crew max violation severity — the value that drives the scenario crew bell. */
  scenarioCrewViolationSeverities: () => Array<{ crewId: string; severity: number }>
  /** Roster-main 每行 crewId → 失效点 ms（窗口内首个 rank/base 覆盖断档；红线探针）。 */
  rosterValidityBlocks: () => Array<{ crewId: string; blockMs: number }>
  /** Scenario-roster 每行 crewId → 失效点 ms（红线探针）。 */
  scenarioRosterValidityBlocks: () => Array<{ crewId: string; blockMs: number }>
  ruleGroupCodes: () => { toolbar: string }
  pairingPanelOrder: () => Array<{ id: string; label: string }>
  /** Transient "brought to top" (found) row ids for a pane — proves navi/locate actions. */
  foundIds: (paneType: 'roster-main' | 'roster-sub' | 'pairing' | 'flight') => string[]
  /** Show/hide a Live chrome pane (Locate Flight visibility gate). */
  setPaneVisible: (paneType: 'roster-main' | 'roster-sub' | 'pairing' | 'flight', visible: boolean) => void
  /** crew-store 中每个 crew 的原始 seniorityNum，用于交叉校验面板显示值。 */
  crewSeniority: () => Array<{ crewId: string; seniorityNum: string | null }>
  /** Active sort criteria (priority-ordered) for a roster pane. Default: roster-main. */
  rosterSort: (paneType?: 'roster-main' | 'roster-sub') => Array<{ column: string; direction: 'asc' | 'desc' }>
  /** Apply a crew base/rank/fleet/division filter (test setup) and re-run pane queries. */
  applyCrewFilter: (filter: { divisions?: string[]; bases?: string[]; ranks?: string[]; fleets?: string[] }) => Promise<void>
  /** The currently applied global crew filter (null when none is active). */
  activeCrewFilter: () => { divisions?: string[]; bases?: string[]; ranks?: string[]; fleets?: string[] } | null
  /** Apply a pairing base/fleet/division/depArp/isFull filter (test setup) and re-run pane queries. */
  applyPairingFilter: (filter: { bases?: string[]; fleets?: string[]; divisions?: string[]; ranks?: string[]; depArps?: string[]; isFull?: boolean | null; assignments?: string[]; coverage?: CoverageState[] }) => Promise<void>
  /** Apply a flight depArp/arvArp/fltNum/fleet/status filter (test setup) and re-run pane queries. */
  applyFlightFilter: (filter: { depArps?: string[]; arvArps?: string[]; fltNums?: string[]; fleets?: string[]; statuses?: string[] }) => Promise<void>
  pairings: () => Array<Record<string, unknown>>
  /**
   * Re-run the exact pairing reload that draft commit triggers after a pairing
   * op (reloadPairingsAfterCommit). Lets a regression test prove the reload stays
   * constrained to the applied filter without driving a full backend draft commit.
   */
  simulatePairingCommitReload: () => Promise<void>
  /** Committed pairing sort (server-side sortBy/sortOrder). */
  pairingSort: () => { sortBy: string; sortOrder: string }
  flights: () => Array<Record<string, unknown>>
  zoom: () => { pxPerHour: number; zoomMin: number; zoomMax: number; dirty: boolean; scrollX: number; viewportWidth: number; scrollWindowStartX: number; scrollWindowEndX: number | null }
  /** Per-scenario zoom state (drives the scenario canvas geometry) — for zoom-control assertions. */
  scenarioZoom: (scenarioId: number) => { pxPerHour: number; zoomMin: number; zoomMax: number; scrollX: number; viewportWidth: number; scrollWindowStartX: number; scrollWindowEndX: number | null }
  /** Per-scenario loaded canvas range — for lead-in/lead-out boundary assertions. */
  scenarioRange: (scenarioId: number) => { start: string; end: string }
  /**
   * How many times a source rebuilt its unified roster model (the single useMemo that
   * produces rows + panel rows + violation map + indexes). After P0, one dependency
   * change = one build (was 3× across useRows/usePanelRows/useViolationMap). A regression
   * that re-splits the model or adds a hot dependency (e.g. scrollX) makes this climb.
   * paneType: 'scenario-roster' | 'roster-main' | 'roster-sub'.
   */
  rosterModelBuilds: (paneType: string) => number
  /** Test-only horizontal scroll setter for deterministic UI feature assertions. */
  setScrollX: (x: number) => void
  timezone: () => { timezone: string; timezoneAirport: string }
  /** Hover a flight by id — builds the real status line from live stores and sets it. */
  hoverFlight: (fltId: number) => void
  /** Test-only: flat pairing segments (segId + flight fields) for hover assertions. */
  pairingSegments: () => Array<Record<string, unknown>>
  /** Hover a pairing segment by id — sets "Pairing #… · Seg #… · <flight info>". */
  hoverPairingSegment: (segId: number) => void
  /** Hover a roster flight task by id — sets "<crew> · <label> · <flight info>". */
  hoverRosterTask: (taskId: number) => void
  /** Set the gantt-selected timezone (drives status-line date #1). */
  setTimezone: (zoneId: string, airport: string) => void
  /** The airport's own IANA zoneId (status-line date #2 source), or undefined. */
  airportZone: (airport: string) => string | undefined
  /** 累计 gantt-view-store 写入次数（V4-P01 合并断言用）。 */
  viewStoreWrites: () => number
  dateRange: () => { start: string; end: string }
  /** Test-only range setter (setup precondition; replaces the removed toolbar date pickers). */
  setDateRange: (startIso: string, endIso: string) => Promise<void>
  filters: () => Record<string, unknown>
  selectedCrewCount: () => number
  /** True crew totals from crew-store (NOT page-capped like selectedCrewCount). */
  crewTotals: () => { total: number; unfilteredTotal: number }
  /** Pairing filtered/unfiltered totals — for pane count-badge asserts. */
  pairingTotals: () => { total: number; unfilteredTotal: number }
  /**
   * Open/partial coverage total credit (HH:MM) over loaded pairing rows, or null when
   * the Coverage filter is not narrowed to Open/Partial — for the open-credit badge assert.
   */
  pairingOpenCredit: () => string | null
  /** Flight filtered/unfiltered totals — for pane count-badge asserts. */
  flightTotals: () => {
    total: number
    unfilteredTotal: number
    registrationTotal: number
    unfilteredRegistrationTotal: number
  }
  /** Crew home bases (all date-effective records) per loaded crew — for filter-correctness asserts. */
  crewBases: () => string[][]
  /** P2-1: 首屏各阶段绝对时间戳（performance.now）。 */
  marks: () => Record<string, number>
  /** P2-1: 各阶段相对 gantt:open 的耗时（ms）；含 blankObjectTime。 */
  phases: () => Record<string, number>
  resetMarks: () => void
  /**
   * P1-2: 模拟指定类型面板的纵向滚动。与生产 scrollbar 处理路径一致——
   * 只更新该 pane 的 viewport.scrollY，**不**置全局 dirty；用于验证 pane-scoped
   * 重绘（被滚动的 pane 重绘、其它 pane 不重绘）。返回被滚动的 paneId 列表。
   */
  scrollPaneVertically: (paneTypePrefix: string, dy: number) => string[]
  paneScrollY: (paneTypePrefix: string) => number
  /** F54-P03/P04：pane chrome（toolbar/strip）React render body 执行计数。 */
  chromeCommits: () => Record<string, number>
  /**
   * V4-P03 像素等价回归用：第一条可见 flight 的几何探针。
   * 返回足以重现 msToX 几何的所有原始值，测试侧可用相同算术重算 x 并点击验证选中。
   */
  flightProbe: () => {
    id: number; schDepDtUtc: string; rowIndex: number; rowCenterY: number
    scrollX: number; pxPerHour: number; rangeStartIso: string
  } | null
  /** V4-P03：判断指定 id 的 flight 是否在当前选中集合中。 */
  isFlightSelected: (id: number) => boolean
  /** Current multi-select set (drives box-selection delete) — for e2e assertions. */
  selectedTaskIds: () => number[]
  /** Test driver: set the multi-select set directly (mirrors a finished box-drag). */
  selectRosterTasks: (ids: number[]) => void
  /** Current Live draft save state, for timing-sensitive save regressions. */
  draftState: () => { opCount: number; saving: boolean }
  /** Current Live draft operations, stripped to the payload sent on Save. */
  draftOps: () => Array<Record<string, unknown>>
  /** Live roster pane crew-row header selection (drives the left-panel row highlight). */
  liveRosterCrewRowIds: () => string[]
  /** Test driver: programmatically select a crew row in the Live roster pane. */
  setLiveRosterCrewRow: (crewId: string) => void
  /** Live pairing pane row selection (pairing header highlight). */
  livePairingRowIds: () => string[]
  /** Test driver: programmatically select a pairing row in the Live pairing pane. */
  setLivePairingRow: (pairingId: string) => void
  /** Scenario pairing pane ROW selection (header highlight, keyed by pairing id string). */
  scenarioPairingRowIds: (scenarioId: number) => string[]
  /** Scenario roster task selection set. */
  scenarioRosterTaskIds: (scenarioId: number) => number[]
  /** Test driver: programmatically select a pairing header row in a Scenario Pairing Pane. */
  setScenarioPairingRow: (scenarioId: number, pairingId: string) => void
  /** Test driver: force the idle session-timeout warning to appear (secondsLeft on countdown). */
  forceSessionTimeout: (secondsLeft?: number) => void
  /**
   * Geometry probe for the first visible roster puck that belongs to a pairing
   * (pairingId != null). Mirrors flightProbe/pairingProbe — returns the raw values
   * to recompute the segment's canvas (x, y) so a test can right-click the puck and
   * exercise the "Locate Pairing" context-menu action. Row order is read from the
   * pane's published render order, so rowIndex matches what base-renderer drew.
   */
  rosterProbe: () => {
    id: number; pairingId: number; crewId: string; schStrDtUtc: string; rowIndex: number
    scrollX: number; scrollY: number; pxPerHour: number; rangeStartIso: string; headerHeight: number; rowHeight: number
  } | null
  /** Like rosterProbe but only on a crew whose panel MCred > 0 (for credit-delta tests). */
  rosterProbeWithCredit: () => {
    id: number; pairingId: number; crewId: string; schStrDtUtc: string; rowIndex: number
    scrollX: number; scrollY: number; pxPerHour: number; rangeStartIso: string; headerHeight: number; rowHeight: number
  } | null
  /** Test-only: empty the pairing pane (force the off-screen "Locate Pairing" getDetail path). */
  clearPairingItems: () => void
  /**
   * V4-P02 geometry pin: first visible pairing segment probe.
   * Returns raw values needed to recompute msToX geometry on the test side.
   */
  pairingProbe: () => {
    segId: number; pairingId: number; fltId: number | null; schStrDtUtc: string; rowIndex: number; scrollX: number
    scrollY: number; pxPerHour: number; rangeStartIso: string; headerHeight: number; rowHeight: number
  } | null
  /** Clickable segment per distinct pairing for the first visible rows. */
  pairingProbes: (limit?: number) => Array<{
    segId: number; pairingId: number; fltId: number | null; schStrDtUtc: string; rowIndex: number
    scrollX: number; scrollY: number; pxPerHour: number; rangeStartIso: string; headerHeight: number; rowHeight: number
  }>
  /**
   * ALL visible segments per row (vs `pairingProbes` which returns one per row).
   * Used by tests that need to right-click a puck they have already discovered.
   */
  pairingVisibleSegments: (limit?: number) => Array<{
    segId: number; pairingId: number; fltId: number | null; schStrDtUtc: string; rowIndex: number
    scrollX: number; scrollY: number; pxPerHour: number; rangeStartIso: string; headerHeight: number; rowHeight: number
  }>
  /**
   * Read the pre-computed vertical-scroll target that SharedPairingPane /
   * Live PairingPane stashed on `ui-store.contextMenuJumpToDayScrollY` when the
   * right-click happened. Returns null when no menu is open or the right-clicked
   * X did not match any loaded pairing within 365 days of lookback.
   */
  pairingJumpToDayScrollY: () => number | null
  /** V4-P02: true if the pairing segment id is in the current selectedTaskIds set. */
  isPairingSegSelected: (id: number) => boolean
  /**
   * V4-P02: compare groupSegmentsByDuty (live) vs buildPairingDutyBuckets (memoized)
   * for the first 20 pairing items. Returns { compared, mismatches }.
   */
  comparePairingBuckets20: () => { compared: number; mismatches: unknown[] }
  /** V4-P04: pure function pass-through — for DST boundary assertions. */
  isCrossDayLocal: (dep: string, arv: string, zone: string) => boolean
  /**
   * V4-P08: trigger N cross-macrotask scenario store writes with DISTINCT values,
   * forcing N independent React commits. Each write sets scrollX to a unique value
   * (0, 7, 14, ... then restores to 0), chained via setTimeout(0) so React cannot
   * batch them together. Returns a Promise that resolves to the actual write count
   * after the final timeout fires.
   *
   * Pre-fix (bare useEffect): canvas draws once per React commit → delta ≈ N.
   * Post-fix (RAF): first commit schedules RAF; subsequent commits within the same
   * animation frame are no-ops (rafRef guard) → delta << N.
   *
   * @param scenarioId - the active scenario store id (default 8 for demo env)
   * @param steps - number of writes including the final restore (default 24)
   */
  scenarioRedrawBurst: (scenarioId?: number, steps?: number) => Promise<number>
  /** P3-Task4: per-scenario optimistic patch set (assert a roster edit applied). */
  scenarioPendingChanges: (scenarioId: number) => AssignmentPatch[]
  /** Per-scenario pane vertical scroll offset (default pane id 'roster-1'). */
  scenarioPaneScrollY: (scenarioId: number, paneId?: string) => number
  /** P3-Task4: per-scenario violation keys (assert pre-check produced badges). */
  scenarioViolationKeys: (scenarioId: number) => string[]
  /** Flattened LIVE display violations (what the crew bell + tooltip render) — for e2e assertions. */
  liveViolations: () => Array<{
    pairingId: number
    crewId?: string
    ruleCode: string
    severity: number
    message: string
    windowStartDt?: string | null
    windowEndDt?: string | null
    startDt?: string | null
    endDt?: string | null
  }>
  /**
   * Live roster-task puck severity map (same builder as canvas ! badges).
   * Crew-bell-only rules (7505) are excluded — used to prove they do not paint pucks.
   */
  livePuckViolationSeverities: () => Array<{ taskId: number; crewId: string; pairingId: number | null; severity: number }>
  /** True when every 7505-only (crew,pairing) has no puck badge on that crew's tasks for that pairing. */
  live7505HasNoPuckBadge: () => boolean
  /** Test setup: inject persisted display violations for a crew-owned pairing (merges into displayViolations). */
  setPersistedViolations: (
    crewId: string,
    pairingId: number,
    violations: Array<{
      ruleCode: string
      ruleInstance?: string
      ruleName?: string
      passed?: boolean
      severity: number
      message: string
      actualValue?: number
      limitValue?: number
      unit?: string
    }>,
  ) => void
  /**
   * Test setup: replace the entire persisted map (same path as a successful GET /api/violations
   * after a toolbar date-range change). Empty list clears all persisted bells.
   */
  replacePersistedViolations: (
    entries: Array<{
      crewId: string
      pairingId: number
      violations: Array<{
        ruleCode: string
        ruleInstance?: string
        ruleName?: string
        passed?: boolean
        severity: number
        message: string
        actualValue?: number
        limitValue?: number
        unit?: string
      }>
    }>,
  ) => void
  /**
   * Pure display-window math used by Live GET /api/violations (official RP preferred over
   * padded dateRange; no ±1 month expand). Returns whether fixed June 7504 / July 1001 overlap.
   */
  violationQueryWindowForTest: (
    dateStartIso: string,
    dateEndIso: string,
    rpStartMs: number,
    rpEndMs: number,
  ) => {
    startMonth: number
    endMonth: number
    june7504Overlaps: boolean
    july1001Overlaps: boolean
  }
  /** Scenario roster summary — crew rows + each crew's total credit hours (drives the MCred column). For DB-source render assertions. */
  scenarioRoster: (scenarioId: number) => { dataSource: string; crew: Array<{ crewId: string; rank: string; mCredHours: number }> } | null
  /** Scenario standby (SBY) roster pucks — each standby item's drawn LABEL plus its leading token
   *  (`code`, the puck's center text). Proves standby renders the real code (PRAM/PRPM) instead of the
   *  generic group 'SBY'. Built from the same buildScenarioRosterItems the canvas consumes. */
  scenarioStandbyPucks: (scenarioId: number) => Array<{ crewId: string; assignmentGroup: string; label: string; code: string }> | null
  /** Scenario non-flying ground pucks (pairingId null) — roster item label the renderer draws
   *  (prefers groundItems.label over assignment, matching Live DO→GDO / MLOA display). */
  scenarioGroundPucks: (scenarioId: number) => Array<{ crewId: string; assignmentGroup: string; assignment: string; label: string }> | null
  /** Scenario roster pucks + whether the renderer draws the ⚡ optimizer badge (flash = source==='CR'); PA pre-assignment must be flash=false. */
  scenarioRosterFlash: (scenarioId: number, crewId?: string) => Array<{ crewId: string; assignmentGroup: string; assignment: string; source: string | null; flash: boolean }> | null
  /** P3-Task4: canvas-local (x,y)+ids of a removable scenario-roster pairing puck (optionally pinned to a pairingId).
   *  Pass wantPairingId === null to find the first ground task (pairingId null). */
  scenarioRosterPuck: (scenarioId: number, wantPairingId?: number | null, paneId?: string) => { x: number; y: number; pairingId: number | null; crewId: string; itemId: number } | null
  /** P3.5-Task2: canvas-local (x,y)+id of a scenario FLIGHT puck (optionally pinned to a flight id). */
  scenarioFlightPuck: (scenarioId: number, wantFlightId?: number) => { x: number; y: number; flightId: number; fltNum: string } | null
  /** P3.6-Task2: canvas-local (x,y)+ids of a scenario PAIRING segment puck (optionally pinned to a pairing id). */
  scenarioPairingPuck: (scenarioId: number, wantPairingId?: number, paneId?: string) => { x: number; y: number; pairingId: number; segId: number; fltId: number | null } | null
  /** P3.6-Task2: the cross-pane "found" (brought-to-top) row ids for a scenario pane (by paneId). */
  scenarioFoundIds: (scenarioId: number, paneId: string) => string[]
  /** P3.7: the scenario pairing pane's selected segment ids (drives the dashed selection box). */
  scenarioPairingSelection: (scenarioId: number, paneId?: string) => number[]
  /** Pairing objects in the scenario gantt store (id + base + label) — for Base column assertions. */
  scenarioPairings: (scenarioId: number) => Array<{ id: number; base: string; label: string | null; composition: Array<{ rank: string; plan: number; fill: number }> }> | null
  /**
   * Segment-mode FLY/Reserve fill the Pairing + Roster renderers share.
   * Used to assert FLY stays blue and Reserve stays light green across panes.
   */
  segmentDutyFill: (
    assignmentGroup: string | null,
    assignment: string | null,
    isDeadhead?: boolean,
  ) => SegmentDutyFill & { flyTop?: string; flyBottom?: string; reserveColor?: string }
  isDeadheadRosterPuck: (item: {
    segAssignment?: string | null
    assignmentGroup?: string | null
    assignment?: string | null
  }) => boolean
  /** Invoke "Find Crew by Flight" directly (bypasses the flaky pairing-canvas right-click). */
  findCrewByFlight: (fltId: number) => Promise<void>
  /** Invoke "Find Pairing by Flight" directly (bypasses the flaky pairing-canvas right-click). */
  findPairingsByFlight: (fltId: number) => Promise<void>
}

declare global {
  interface Window {
    __ganttTest?: GanttTestApi
  }
}

// ── V4-P01: gantt-view-store 写入计数 ────────────────────────────────────────
let viewStoreWriteCount = 0

// ── Canvas 绘制回执 ──────────────────────────────────────────────────────────
const renderStats = new Map<string, PaneRenderStat>()

// ── Pane chrome（PaneToolbar / PaneConditionStrip）React 渲染计数 ─────────────
// F54-P03/P04 verify：「纯滚动不应重渲染 pane chrome」。memo 化后这些组件在滚动
// 期间不应再执行 render body；e2e 通过该计数断言（替代手工 React Profiler）。
const chromeCommits = new Map<string, number>()

/** 由 chrome 组件在 render body 顶部调用；生产构建下 no-op。 */
export const publishChromeCommit = (name: string): void => {
  if (import.meta.env.PROD) return
  chromeCommits.set(name, (chromeCommits.get(name) ?? 0) + 1)
}

// ── Panel-row 绘制回执（左侧表头列值；按 paneType 存最新一份）─────────────────
const panelRowsByPane = new Map<string, Array<Record<string, string>>>()

/** 由 RosterPane 在 panelRows 变化时调用；生产构建下 no-op。 */
export const publishPanelRows = (
  paneType: string,
  rows: Array<Record<string, string>>,
): void => {
  if (import.meta.env.PROD) return
  panelRowsByPane.set(paneType, rows)
}

// ── 失效红线回执（crewId → 窗口内首个 rank/base 覆盖断档时刻 ms；按 paneType 存最新一份）──
const validityBlocksByPane = new Map<string, Array<{ crewId: string; blockMs: number }>>()

/** 由 RosterPane 在 crewValidityBlock 变化时调用；生产构建下 no-op。 */
export const publishValidityBlocks = (
  paneType: string,
  blocks: Array<{ crewId: string; blockMs: number }>,
): void => {
  if (import.meta.env.PROD) return
  validityBlocksByPane.set(paneType, blocks)
}

// ── Header-canvas 实际绘制回执（画了哪些列 + 每行单元格值 + canvas 像素宽度）──────
// 与 publishPanelRows（上游组件发布）不同，这里由 PaneHeaderCanvas.render() 在绘制点发布，
// 反映「真正画到 canvas 上」的 visibleColumns 与 rows.values（fillText 的输入），而非
// column-store 配置——让「某列确实被渲染出来」可在无 DOM 的 Canvas 上断言（§No-Illusion）。
interface HeaderRenderReceipt {
  width: number
  columns: Array<{ key: string; label: string; width: number }>
  rows: Array<Record<string, string>>
}
const headerRenderByPane = new Map<string, HeaderRenderReceipt>()

/** 由 PaneHeaderCanvas.render() 在每次绘制后调用；生产构建下 no-op。 */
export const publishHeaderRender = (paneType: string, data: HeaderRenderReceipt): void => {
  if (import.meta.env.PROD) return
  headerRenderByPane.set(paneType, data)
}

// ── Roster-model build counter (dev-only) ────────────────────────────────────
// Bumped once each time a source rebuilds its unified roster model (the single
// useMemo that produces rows + panel rows + violation map + indexes). Proves the
// P0 collapse: one build per dependency change instead of the old 3× (one per
// useRows/usePanelRows/useViolationMap). A regression that re-splits the model or
// adds a hot dependency (e.g. scrollX) shows up as the count climbing on scroll.
const rosterModelBuilds = new Map<string, number>()

/** Called by a source inside its roster-model useMemo; no-op in prod. */
export const bumpRosterModelBuild = (paneType: string): void => {
  if (import.meta.env.PROD) return
  rosterModelBuilds.set(paneType, (rosterModelBuilds.get(paneType) ?? 0) + 1)
}

const rosterModelBuildCount = (paneType: string): number =>
  rosterModelBuilds.get(paneType) ?? 0

// ── Pairing pane rendered row order (id + label, top-to-bottom) ───────────────
const pairingOrderByPane = new Map<string, Array<{ id: string; label: string }>>()

/** Published by PairingPane when its displayed row order changes; no-op in prod. */
export const publishPairingOrder = (
  paneType: string,
  rows: Array<{ id: string; label: string }>,
): void => {
  if (import.meta.env.PROD) return
  pairingOrderByPane.set(paneType, rows)
}

// ── Scenario pairing-pane selection (local pane state, keyed by scenarioId:paneId) ──
// The scenario pairing pane holds its selected segment ids in LOCAL React state (not a
// store), so it publishes the set here on change. Lets an e2e observe selection after a
// real puck click (P3.7 — dashed selection box regression).
const scenarioPairingSelByPane = new Map<string, number[]>()

/** Published by ScenarioPairingPane when its local selectedPairingIds changes; no-op in prod. */
export const publishScenarioPairingSelection = (
  scenarioId: number,
  paneId: string,
  segmentIds: number[],
): void => {
  if (import.meta.env.PROD) return
  scenarioPairingSelByPane.set(`${scenarioId}:${paneId}`, segmentIds)
}

/**
 * 由 PaneCanvas 在每次成功绘制（markClean 之前）调用。
 * 生产构建下直接 no-op（与 installGanttTestHook 同一守卫，调用方无需再判环境）。
 */
export const publishRenderStats = (
  paneId: string,
  data: { paneType: string; totalRows: number; width: number; height: number },
): void => {
  if (import.meta.env.PROD) return
  const prev = renderStats.get(paneId)
  renderStats.set(paneId, {
    paneId,
    paneType: data.paneType,
    totalRows: data.totalRows,
    width: data.width,
    height: data.height,
    renders: (prev?.renders ?? 0) + 1,
    ts: globalThis.performance?.now?.() ?? 0,
  })
  // P2-1: 首次画出 roster 行 → 记录首屏完成时刻。
  if (data.totalRows > 0 && data.paneType.startsWith('roster')) markPhase('roster:first-canvas-painted')
}

// ── 取数辅助 ────────────────────────────────────────────────────────────────
const counts = (): GanttCounts => ({
  roster: useRosterStore.getState().main.rosterItems.length,
  pairing: usePairingStore.getState().items.length,
  flightRegistrations: useFlightStore.getState().items.length,
  flightLegs: useFlightStore.getState().flightTotal,
})

/** Loaded roster_flight ids that carry a memo (each draws a note icon). */
const memoBadges = (): number[] => {
  const withMemo = useCrewMemoStore.getState().memosByRosterId
  const loaded = new Set(useRosterStore.getState().main.rosterItems.map((i) => i.id))
  return [...withMemo.keys()].filter((id) => loaded.has(id))
}

const memoCount = (): number => {
  let n = 0
  for (const list of useCrewMemoStore.getState().memosByCrew.values()) n += list.length
  return n
}

const loading = (): GanttLoading => ({
  roster: useRosterStore.getState().main.loading,
  pairing: usePairingStore.getState().loading,
  flight: useFlightStore.getState().loading,
  refreshing: useGanttViewStore.getState().refreshing,
})

const paneTypes = (): string[] => [
  ...new Set([...useLayoutStore.getState().panes.values()].map((p) => p.type)),
]

const renderList = (): PaneRenderStat[] => [...renderStats.values()]

/**
 * 「所有对象都已呈现给用户」：
 * 1) 没有任何面板在加载中（含全局 refreshing）
 * 2) 每个可见数据面板的 store 计数 > 0
 * 3) 每个可见数据面板至少成功绘制过一次且绘制行数 > 0（Canvas 真值，非像素猜测）
 */
const ready = (): boolean => {
  const l = loading()
  if (l.roster || l.pairing || l.flight || l.refreshing) return false

  const types = new Set(paneTypes())
  const c = counts()
  if (types.has('roster') && c.roster === 0) return false
  if (types.has('pairing') && c.pairing === 0) return false
  if (types.has('flight') && c.flightRegistrations === 0) return false

  // 每个可见面板都必须有一条「绘制行数 > 0」的回执。
  // 渲染回执的 paneType 可能更细（如 'roster-main'），按前缀匹配布局类型（如 'roster'）。
  for (const type of types) {
    const stat = renderList().find((s) => s.paneType === type || s.paneType.startsWith(type))
    if (!stat || stat.totalRows <= 0 || stat.renders <= 0) return false
  }
  return true
}

const roster = (): Array<Record<string, unknown>> =>
  useRosterStore.getState().main.rosterItems.map((i) => ({
    id: i.id,
    crewId: i.crewId,
    base: i.base,
    depArp: i.depArp ?? null,
    arvArp: i.arvArp ?? null,
    division: i.division,
    flightActingRank: i.flightActingRank,
    rosterActingRank: i.rosterActingRank,
    activeRank: i.activeRank,
    pairingId: i.pairingId,
    segSeq: i.segSeq,
    dutySeq: i.dutySeq,
    pairingInterfaceId: i.pairingInterfaceId ?? null,
    assignmentGroup: i.assignmentGroup,
    schCreditedMinutes: i.schCreditedMinutes,
    actCreditedMinutes: i.actCreditedMinutes,
    dutyActCreditedMinutes: i.dutyActCreditedMinutes,
    dpMin: i.dpMin ?? null,
    fltId: i.fltId,
    label: i.label,
    assignment: i.assignment,
    mbh: i.mbh,
    ybh: i.ybh,
    start: i.schStrDtUtc,
    end: i.schEndDtUtc,
  }))

const rosterKeys = (): string[] => {
  const first = useRosterStore.getState().main.rosterItems[0]
  return first ? Object.keys(first) : []
}

const rosterColumns = (): Array<{ key: string; label: string; visible: boolean }> =>
  useColumnStore.getState().getColumns('roster-main').map((c) => ({
    key: c.key,
    label: c.label,
    visible: c.visible,
  }))

const pairingColumns = (): Array<{ key: string; label: string; visible: boolean }> =>
  useColumnStore.getState().getColumns('pairing').map((c) => ({
    key: c.key,
    label: c.label,
    visible: c.visible,
  }))

// ── Render-level accessors (what the Canvas actually drew, not store config) ──
const renderedColumns = (paneType: string): Array<{ key: string; label: string; width: number }> =>
  (headerRenderByPane.get(paneType)?.columns ?? []).map((c) => ({ ...c }))

const renderedHeaderWidth = (paneType: string): number =>
  headerRenderByPane.get(paneType)?.width ?? 0

const renderedRow = (paneType: string, index: number): Record<string, string> | null =>
  headerRenderByPane.get(paneType)?.rows?.[index] ?? null

const rosterPanel = (): Array<{ crewId: string; seniority: string }> =>
  (panelRowsByPane.get('roster-main') ?? []).map((v) => ({
    crewId: String(v.crewId ?? ''),
    seniority: String(v.seniority ?? ''),
  }))

const rosterMcred = (): Array<{ crewId: string; mcred: string }> =>
  (panelRowsByPane.get('roster-main') ?? []).map((v) => ({
    crewId: String(v.crewId ?? ''),
    mcred: String(v.mcred ?? ''),
  }))

const scenarioRosterMcred = (): Array<{ crewId: string; mcred: string }> =>
  (panelRowsByPane.get('scenario-roster') ?? []).map((v) => ({
    crewId: String(v.crewId ?? ''),
    mcred: String(v.mcred ?? ''),
  }))

/** All seven manday KPI cells as displayed in the roster panel (with Tier-1 optimistic deltas). */
const rosterPanelKpis = (): Array<{
  crewId: string; mcred: string; mbh: string; ybh: string; mdo: string; ydo: string; mal: string; yal: string
}> =>
  (panelRowsByPane.get('roster-main') ?? []).map((v) => ({
    crewId: String(v.crewId ?? ''),
    mcred: String(v.mcred ?? ''),
    mbh: String(v.mbh ?? ''),
    ybh: String(v.ybh ?? ''),
    mdo: String(v.mdo ?? ''),
    ydo: String(v.ydo ?? ''),
    mal: String(v.mal ?? ''),
    yal: String(v.yal ?? ''),
  }))

const rosterPanelOrder = (): Array<{ crewId: string; rank: string }> =>
  (panelRowsByPane.get('roster-main') ?? []).map((v) => ({
    crewId: String(v.crewId ?? ''),
    rank: String(v.rank ?? ''),
  }))

/** Per-crew validity block (ms) for the roster-main pane — the red-line probe. */
const rosterValidityBlocks = (): Array<{ crewId: string; blockMs: number }> =>
  validityBlocksByPane.get('roster-main') ?? []

/** Per-crew validity block (ms) for the scenario-roster pane — the red-line probe. */
const scenarioRosterValidityBlocks = (): Array<{ crewId: string; blockMs: number }> =>
  validityBlocksByPane.get('scenario-roster') ?? []

/**
 * Per-crew max violation severity for the roster-main left panel — the exact value that
 * drives the canvas crew BELL (drawCrewViolationIndicator). severity > 0 ⇒ a bell is drawn.
 */
const crewViolationSeverities = (): Array<{ crewId: string; severity: number }> =>
  (panelRowsByPane.get('roster-main') ?? []).map((v) => ({
    crewId: String(v.crewId ?? ''),
    severity: Number(v.maxViolationSeverity ?? 0),
  }))

/**
 * Per-crew max violation severity for the SCENARIO roster left panel — the exact value that
 * drives the scenario crew BELL (drawCrewViolationIndicator). Published by scenario-roster-pane
 * under the 'scenario-roster' pane key. severity > 0 ⇒ a bell is drawn.
 */
const scenarioCrewViolationSeverities = (): Array<{ crewId: string; severity: number }> =>
  (panelRowsByPane.get('scenario-roster') ?? []).map((v) => ({
    crewId: String(v.crewId ?? ''),
    severity: Number(v.maxViolationSeverity ?? 0),
  }))

/** The rule-group state that drives the persisted-violation fetch.
 *  `toolbar` = useRuleCheckStore.ruleGroupCode (what the planner selects, the single source
 *  of truth for the live bell/Alert Center — a RULE workset id since Model B was dropped). */
const ruleGroupCodes = (): { toolbar: string } => ({
  toolbar: useRuleCheckStore.getState().ruleGroupCode,
})

/** Pairing pane displayed row order (top-to-bottom): pairing id + label. */
const pairingPanelOrder = (): Array<{ id: string; label: string }> =>
  pairingOrderByPane.get('pairing') ?? []

/** Transient "found" (brought-to-top) row ids for a pane — proves navi/locate effects. */
const foundIds = (
  paneType: 'roster-main' | 'roster-sub' | 'pairing' | 'flight',
): string[] => usePaneStore.getState().getFoundCrewIds(paneType)

/** Test driver: show/hide a Live chrome pane (Locate Flight gate). */
const setPaneVisible = (paneType: 'roster-main' | 'roster-sub' | 'pairing' | 'flight', visible: boolean): void => {
  usePaneStore.getState().setVisible(paneType, visible)
}

const crewSeniority = (): Array<{ crewId: string; seniorityNum: string | null }> =>
  useCrewStore.getState().items.map((i) => ({
    crewId: i.crew.crewId,
    seniorityNum: i.crew.seniorityNum ?? null,
  }))

const rosterSort = (
  paneType: 'roster-main' | 'roster-sub' = 'roster-main',
): Array<{ column: string; direction: 'asc' | 'desc' }> =>
  usePaneStore.getState().getSortCriteria(paneType).map((c) => ({ column: c.column, direction: c.direction }))

type CrewFilterInput = { divisions?: string[]; bases?: string[]; ranks?: string[]; fleets?: string[] }

/** Apply a crew base/rank/fleet/division filter (test setup) and re-run pane queries. */
const applyCrewFilter = async (filter: CrewFilterInput): Promise<void> => {
  useFilterStore.getState().setCrewFilter(filter)
  await applyGanttFilters()
}

/** The currently applied global crew filter (null when none is active). */
const activeCrewFilter = (): CrewFilterInput | null => {
  const f = useCrewStore.getState().activeGlobalFilter
  if (!f) return null
  return { divisions: f.divisions, bases: f.bases, ranks: f.ranks, fleets: f.fleets }
}

type PairingFilterInput = { bases?: string[]; fleets?: string[]; divisions?: string[]; ranks?: string[]; depArps?: string[]; isFull?: boolean | null; assignments?: string[]; coverage?: CoverageState[] }

/** Apply a pairing base/fleet/division/depArp/isFull filter (test setup) and re-run pane queries. */
const applyPairingFilter = async (filter: PairingFilterInput): Promise<void> => {
  useFilterStore.getState().setPairingFilter(filter)
  await applyGanttFilters()
}

type FlightFilterInput = { depArps?: string[]; arvArps?: string[]; fltNums?: string[]; fleets?: string[]; statuses?: string[] }

/** Apply a flight depArp/arvArp/fltNum/fleet/status filter (test setup) and re-run pane queries. */
const applyFlightFilter = async (filter: FlightFilterInput): Promise<void> => {
  useFilterStore.getState().setFlightFilter(filter)
  await applyGanttFilters()
}

const pairings = (): Array<Record<string, unknown>> =>
  usePairingStore.getState().items.map((item) => {
    const p = item.pairing as unknown as Record<string, unknown>
    const composition = Array.isArray(p.composition)
      ? (p.composition as Array<{ rank?: string | null; plan?: number; fill?: number }>).map((s) => ({
          rank: s.rank ?? null,
          plan: s.plan ?? 0,
          fill: s.fill ?? 0,
        }))
      : []
    return {
      id: p.id,
      base: p.base ?? null,
      fleet: p.fleet ?? null,
      division: p.division ?? null,
      assignment: p.assignment ?? null,
      depArp: p.depArp ?? null,
      isFull: p.isFull ?? null,
      composition,
      compLen: composition.length,
      start: p.schStrDtUtc ?? null,
      end: p.schEndDtUtc ?? null,
      sessionTags: item.sessionTags,
    }
  })

/** Test-only: empty the pairing pane (force the off-screen "Locate Pairing" getDetail path). */
const clearPairingItems = (): void => {
  usePairingStore.getState().clearFilters()
  useGanttViewStore.getState().markDirty()
}

const pairingSort = (): { sortBy: string; sortOrder: string } => {
  const s = usePairingStore.getState()
  return { sortBy: s.sortBy ?? 'schStrDtUtc', sortOrder: s.sortOrder ?? 'asc' }
}

const flights = (): Array<Record<string, unknown>> =>
  useFlightStore.getState().items.flatMap((it) => {
    const legs = (it.flights as unknown as Record<string, unknown>[] | undefined) ?? []
    return legs.map((f) => ({
      id: f.id,
      registration: it.registration,
      fleet: it.fleet,
      fltNum: f.fltNum ?? null,
      depArp: f.depArp ?? null,
      arvArp: f.arvArp ?? null,
      start: f.schDepDtUtc ?? null,
      end: f.schArvDtUtc ?? null,
    }))
  })

const zoom = (): { pxPerHour: number; zoomMin: number; zoomMax: number; dirty: boolean; scrollX: number; viewportWidth: number; scrollWindowStartX: number; scrollWindowEndX: number | null } => {
  const s = useGanttViewStore.getState()
  return {
    pxPerHour: s.pxPerHour,
    zoomMin: s.zoomMin,
    zoomMax: s.zoomMax,
    dirty: s.dirty,
    scrollX: s.scrollX,
    viewportWidth: s.viewportWidth,
    scrollWindowStartX: s.scrollWindowStartX,
    scrollWindowEndX: s.scrollWindowEndX,
  }
}

const setScrollX = (x: number): void => {
  useGanttViewStore.getState().setScrollX(x)
}

/** Per-scenario zoom state — proves the scenario zoom buttons changed the canvas geometry. */
const scenarioZoom = (scenarioId: number): { pxPerHour: number; zoomMin: number; zoomMax: number; scrollX: number; viewportWidth: number; scrollWindowStartX: number; scrollWindowEndX: number | null } => {
  const s = getScenarioGanttStore(scenarioId).getState()
  return {
    pxPerHour: s.pxPerHour,
    zoomMin: s.zoomMin,
    zoomMax: s.zoomMax,
    scrollX: s.scrollX,
    viewportWidth: s.viewportWidth,
    scrollWindowStartX: s.scrollWindowStartX,
    scrollWindowEndX: s.scrollWindowEndX,
  }
}

const scenarioRange = (scenarioId: number): { start: string; end: string } => {
  const data = getScenarioGanttStore(scenarioId).getState().data
  return {
    start: data?.strDtLoc ?? '',
    end: data?.endDtLoc ?? '',
  }
}

const timezone = (): { timezone: string; timezoneAirport: string } => {
  const s = useTimezoneStore.getState()
  return { timezone: s.timezone, timezoneAirport: s.timezoneAirport }
}

// Hover a flight by id: builds the real status line from live stores and sets it.
const hoverFlight = (fltId: number): void => {
  const flight = useFlightStore.getState().items.flatMap((it) => it.flights).find((f) => f.id === fltId)
  if (!flight) return
  const { timezone: zone } = useTimezoneStore.getState()
  const zoneIdFor = useAirportTzStore.getState().zoneIdFor
  const composition = useFlightCompositionStore.getState().byId[fltId]
  useUiStore.getState().setStatusBarText(formatFlightStatusLine({
    flight,
    ganttZoneId: zone,
    depLocalZoneId: zoneIdFor(flight.depArp),
    arvLocalZoneId: zoneIdFor(flight.arvArp),
    composition,
  }))
}

// Test-only: flat list of pairing segments (id + flight fields) for hover assertions.
const pairingSegments = (): Array<Record<string, unknown>> =>
  usePairingStore.getState().items.flatMap((pi) =>
    (pi.segments ?? []).map((s) => ({
      segId: s.id, pairingId: pi.pairing.id, segSeq: s.segSeq,
      fltId: s.fltId, fltNum: s.fltNum, depArp: s.depArp, arvArp: s.arvArp,
      pairingCreditMin: sumPairingCreditMinutes(pi.segments ?? []),
    })))

// Shared store context for segment-hover info (mirrors what the panes pass).
const segmentCtx = () => {
  const flightById = new Map<number, Flight>()
  for (const row of useFlightStore.getState().items) for (const f of row.flights) flightById.set(f.id, f)
  return {
    ganttZoneId: useTimezoneStore.getState().timezone,
    zoneIdFor: useAirportTzStore.getState().zoneIdFor,
    compositionById: useFlightCompositionStore.getState().byId,
    flightById,
  }
}

// Hover a pairing segment by id: builds "Pairing #… · Seg #… · <flight info>" via the shared util.
const hoverPairingSegment = (segId: number): void => {
  for (const pi of usePairingStore.getState().items) {
    const seg = pi.segments?.find((s) => s.id === segId)
    if (!seg) continue
    const info = segmentFlightInfo(seg.fltId, {
      airline: seg.airline, fltNum: seg.fltNum, depArp: seg.depArp, arvArp: seg.arvArp,
      schDepDtUtc: seg.schStrDtUtc, schArvDtUtc: seg.schEndDtUtc, fleet: pi.pairing.fleet,
    }, segmentCtx())
    const credit = formatCreditMinutes(sumPairingCreditMinutes(pi.segments ?? []))
    const head = credit ? `Pairing #${pi.pairing.id}  ·  Credit ${credit}` : `Pairing #${pi.pairing.id}`
    useUiStore.getState().setStatusBarText(`${head}  ·  Seg #${seg.segSeq}  ·  ${info ?? ''}`)
    return
  }
}

// Hover a roster task by id (mirrors the pane): flight rows → "<crew> · <flight info>" via the
// label parse; non-flight rows → "<crew> · <label> · <sch time range>".
const hoverRosterTask = (taskId: number): void => {
  const r = useRosterStore.getState()
  const task = [...r.main.rosterItems, ...r.sub.rosterItems].find((t) => t.id === taskId)
  if (!task) return
  const parsed = parseFlightLabel(task.label)
  const info = parsed && task.schStrDtUtc && task.schEndDtUtc
    ? segmentFlightInfo(task.fltId, { ...parsed, schDepDtUtc: task.schStrDtUtc, schArvDtUtc: task.schEndDtUtc }, segmentCtx())
    : null
  if (info) {
    const pairSeg = task.pairingId != null
      ? `Pairing #${task.pairingId}${task.segSeq != null ? `  Seg #${task.segSeq}` : ''}`
      : ''
    const credit = formatCreditMinutes(task.dutyActCreditedMinutes)
    const meta = [pairSeg, credit ? `Credit ${credit}` : ''].filter(Boolean).join('  ·  ')
    useUiStore.getState().setStatusBarText([task.crewId, meta, info].filter(Boolean).join('  ·  '))
  } else {
    const time = task.schStrDtUtc && task.schEndDtUtc
      ? `${task.schStrDtUtc.slice(5, 16)} ~ ${task.schEndDtUtc.slice(11, 16)}`
      : ''
    const crewPart = task.pairingId == null ? `${task.crewId} #${task.id}` : task.crewId
    if (task.pairingId == null) {
      useUiStore.getState().setStatusBarText(formatGroundTaskStatusLine(task, { zoneIdForBase: useAirportTzStore.getState().zoneIdFor }))
    } else {
      useUiStore.getState().setStatusBarText(`${crewPart}  ·  ${task.assignment ?? task.assignmentGroup}  ·  ${time}`)
    }
  }
}

// Set the gantt-selected timezone (drives date #1 in the status line).
const setTimezone = (zoneId: string, airport: string): void => {
  useTimezoneStore.getState().setTimezone(zoneId, airport)
}

// The airport's own IANA zoneId (date #2 source), or undefined.
const airportZone = (airport: string): string | undefined =>
  useAirportTzStore.getState().zoneIdFor(airport)

const dateRange = (): { start: string; end: string } => {
  const { start, end } = useFilterStore.getState().dateRange
  return { start: start.toISOString(), end: end.toISOString() }
}

const crewStatsYearMonth = (): string | null => useCrewStore.getState().crewStatsYearMonth

/**
 * Test-only range setter (replaces the removed toolbar date pickers as a setup
 * precondition for rule/alert tests). Sets filterStore.dateRange and re-applies.
 * NOT a user action — the feature under test is still driven through the real UI.
 */
const setDateRange = async (startIso: string, endIso: string): Promise<void> => {
  useFilterStore.getState().setDateRange(new Date(startIso), new Date(endIso))
  await applyGanttFilters()
}

const filters = (): Record<string, unknown> => {
  const s = useFilterStore.getState()
  return {
    crew: s.crew,
    pairing: s.pairing,
    flight: s.flight,
    applied: s.appliedFilters,
    activeCount: s.activeFilterCount(),
  }
}

const selectedCrewCount = (): number => useCrewStore.getState().selectedCrewIds.length

/** True crew totals from crew-store (NOT page-capped like selectedCrewCount). */
const crewTotals = (): { total: number; unfilteredTotal: number } => {
  const s = useCrewStore.getState()
  return { total: s.total, unfilteredTotal: s.unfilteredTotal }
}

/** Pairing filtered/unfiltered totals — for pane count-badge asserts. */
const pairingTotals = (): { total: number; unfilteredTotal: number } => {
  const s = usePairingStore.getState()
  return { total: s.total, unfilteredTotal: s.unfilteredTotal }
}

/** Open/partial coverage total credit (HH:MM) over loaded rows — for the open-credit badge. */
const pairingOpenCredit = (): string | null => {
  const pairing = useFilterStore.getState().pairing
  if (!isOpenPartialCoverage(pairing.coverage)) return null
  return formatBlockMinutes(
    sumCoverageCredit(usePairingStore.getState().items, pairing.coverage, pairing.ranks),
  )
}

/** Flight filtered/unfiltered leg totals — for pane count-badge asserts (not RegNo rows). */
const flightTotals = (): {
  total: number
  unfilteredTotal: number
  registrationTotal: number
  unfilteredRegistrationTotal: number
} => {
  const s = useFlightStore.getState()
  return {
    total: s.flightTotal,
    unfilteredTotal: s.unfilteredFlightTotal,
    registrationTotal: s.total,
    unfilteredRegistrationTotal: s.unfilteredTotal,
  }
}

/** Crew home bases (all date-effective records) per loaded crew — for filter-correctness asserts. */
const crewBases = (): string[][] =>
  useCrewStore.getState().items.map((i) => (i.crew.bases ?? []).map((b) => b.base))

const scrollPaneVertically = (paneTypePrefix: string, dy: number): string[] => {
  const layout = useLayoutStore.getState()
  const scrolled: string[] = []
  for (const p of layout.panes.values()) {
    if (p.type === paneTypePrefix || p.type.startsWith(paneTypePrefix)) {
      const cur = p.viewport?.scrollY ?? 0
      layout.setViewport(p.id, { scrollY: Math.max(0, cur + dy) })
      scrolled.push(p.id)
    }
  }
  return scrolled
}

const paneScrollY = (paneTypePrefix: string): number => {
  for (const p of useLayoutStore.getState().panes.values()) {
    if (p.type === paneTypePrefix || p.type.startsWith(paneTypePrefix)) {
      return p.viewport?.scrollY ?? 0
    }
  }
  return 0
}

/**
 * V4-P03: 第一条可见 flight 的几何探针。
 * 从 store 直接读取所有原始值，测试侧可用 msToX 算术重算 x 并点击验证选中。
 *
 * Row ordering replicates flight-pane.tsx exactly:
 *   1. Sort flightItems by sortColumn/sortDirection (source of truth: flight-pane.tsx sortedFlightRows)
 *   2. Reorder: frozen rows first, then non-frozen (source of truth: flight-pane.tsx reorderedFlightRows)
 *
 * Row geometry replicates base-renderer.ts rowY() exactly:
 *   - Scrollable rows: HEADER_HEIGHT + rowIndex * ROW_HEIGHT - scrollY
 *   (rowIndex is the FULL index in the reordered array, matching what the renderer uses)
 */
const flightProbe = (): {
  id: number; schDepDtUtc: string; rowIndex: number; rowCenterY: number
  scrollX: number; pxPerHour: number; rangeStartIso: string
} | null => {
  const flightItems = useFlightStore.getState().items
  if (!flightItems.length) return null

  // Get flight pane scrollY from layout-store (flight pane id starts with 'flight')
  let flightScrollY = 0
  for (const p of useLayoutStore.getState().panes.values()) {
    if (p.type === 'flight') {
      flightScrollY = p.viewport?.scrollY ?? 0
      break
    }
  }

  const viewState = useGanttViewStore.getState()
  const { scrollX, pxPerHour } = viewState
  const rangeStartIso = usePaneStore.getState().dateRange.start.toISOString()
  const rangeStartMs = new Date(rangeStartIso).getTime()

  // Sort and reorder using the same shared helpers as flight-pane.tsx
  const sortColumn = usePaneStore.getState().getSortColumn('flight')
  const sortDirection = usePaneStore.getState().getSortDirection('flight')
  const sortedItems = sortFlightRows(flightItems, sortColumn, sortDirection)

  const frozenRowIds = usePaneStore.getState().getFrozenRowIds('flight')
  const { frozen, nonFrozen } = reorderFrozenFirst(sortedItems, frozenRowIds)
  const orderedRows = [...frozen, ...nonFrozen]
  const frozenRowCount = frozen.length

  // Scan non-frozen rows for a flight whose rendered x is within [20, 600] on canvas
  for (let idx = 0; idx < orderedRows.length - frozenRowCount; idx++) {
    const rowIndex = idx + frozenRowCount
    const row = orderedRows[rowIndex]
    if (!row) continue
    for (const flight of row.flights) {
      if (!flight.schDepDtUtc) continue
      const depMs = new Date(
        flight.schDepDtUtc.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(flight.schDepDtUtc)
          ? flight.schDepDtUtc
          : flight.schDepDtUtc + 'Z'
      ).getTime()
      const x = (Math.trunc((depMs - rangeStartMs) / 60_000) / 60) * pxPerHour - scrollX
      if (x >= 20 && x <= 600) {
        // ── Issue A fix: match base-renderer.ts rowY() scrollable branch exactly ──
        // base-renderer.ts rowY() line ~61: HEADER_HEIGHT + rowIndex * ROW_HEIGHT - scrollY
        // rowIndex is the full index in the reordered array (not offset by frozenRowCount).
        const rowScreenY = HEADER_HEIGHT + rowIndex * ROW_HEIGHT - flightScrollY
        const rowCenterY = rowScreenY + ROW_HEIGHT / 2
        return {
          id: flight.id,
          schDepDtUtc: flight.schDepDtUtc,
          rowIndex,
          rowCenterY,
          scrollX,
          pxPerHour,
          rangeStartIso,
        }
      }
    }
  }
  return null
}

/** V4-P03: 指定 id 的 flight 是否在当前选中集合中（selectedTaskIds 为 flight 选中源）。 */
const isFlightSelected = (id: number): boolean =>
  useGanttViewStore.getState().selectedTaskIds.has(id)

/** Current multi-select set (drives box-selection delete) — for e2e assertions. */
const selectedTaskIds = (): number[] => [...useGanttViewStore.getState().selectedTaskIds]

/** Test driver: set the multi-select set directly (mirrors a finished box-drag). */
const selectRosterTasks = (ids: number[]): void =>
  useGanttViewStore.getState().selectTasks(ids)

const draftState = (): { opCount: number; saving: boolean } => {
  const draft = useDraftStore.getState()
  return { opCount: draft.operations.length, saving: draft.saving }
}

const draftOps = (): Array<Record<string, unknown>> =>
  useDraftStore.getState().operations.map((operation) => operation.op as unknown as Record<string, unknown>)

const liveRosterCrewRowIds = (): string[] =>
  getPaneStore('live').getState().getSelectedRowIds('roster-main')

const setLiveRosterCrewRow = (crewId: string): void =>
  getPaneStore('live').getState().selectRow('roster-main', crewId)

const livePairingRowIds = (): string[] =>
  getPaneStore('live').getState().getSelectedRowIds('pairing')

const setLivePairingRow = (pairingId: string): void =>
  getPaneStore('live').getState().selectRow('pairing', pairingId)

const scenarioPairingRowIds = (scenarioId: number): string[] =>
  getPaneStore(scenarioId).getState().getSelectedRowIds('scenario-pairing')

const scenarioRosterTaskIds = (scenarioId: number): number[] =>
  [...getScenarioRosterSelectionStore(scenarioId).getState().selectedTaskIds]

const setScenarioPairingRow = (scenarioId: number, pairingId: string): void =>
  getPaneStore(scenarioId).getState().selectRow('scenario-pairing', pairingId)

/**
 * Test driver: force the idle session-timeout warning to appear (it is otherwise only
 * raised by a 1-hour inactivity timer, which is impractical to drive in e2e). Sets the
 * same auth-store state the real idle check sets, with the given seconds left on the
 * countdown (default 180s = the production 3-minute window).
 */
const forceSessionTimeout = (secondsLeft = 180): void =>
  useAuthStore.setState({ showTimeoutWarning: true, warningExpiresAt: Date.now() + secondsLeft * 1000 })

/**
 * First visible roster puck that belongs to a pairing — for the "Locate Pairing"
 * context-menu action. Row index comes from the pane's PUBLISHED render order
 * (panelRowsByPane 'roster-main'), the same crew order base-renderer drew, so the
 * geometry matches exactly without re-deriving the float/freeze/sort ordering here.
 * Geometry mirrors flightProbe (shared base-renderer rowY: HEADER_HEIGHT + rowIndex *
 * ROW_HEIGHT - scrollY); x is the segment's schStrDtUtc mapped through msToX.
 */
interface RosterPuckProbe {
  id: number; pairingId: number; crewId: string; schStrDtUtc: string; rowIndex: number
  scrollX: number; scrollY: number; pxPerHour: number; rangeStartIso: string; headerHeight: number; rowHeight: number
}

/** Parse a panel "H:MM" credit cell to minutes (0 for empty / unparseable). */
const panelMcredMinutes = (row: Record<string, string>): number => {
  const v = String(row.mcred ?? '')
  const m = /^(\d+):(\d{2})$/.exec(v)
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0
}

const findRosterPuck = (
  rowAllowed: (row: Record<string, string>) => boolean,
  itemAllowed: (it: { dutyActCreditedMinutes?: string | null }) => boolean = () => true,
): RosterPuckProbe | null => {
  const order = panelRowsByPane.get('roster-main') ?? []
  if (!order.length) return null

  let rosterScrollY = 0
  for (const p of useLayoutStore.getState().panes.values()) {
    if (p.type === 'roster') { rosterScrollY = p.viewport?.scrollY ?? 0; break }
  }

  const { scrollX, pxPerHour } = useGanttViewStore.getState()
  const rangeStartIso = usePaneStore.getState().dateRange.start.toISOString()
  const rangeStartMs = new Date(rangeStartIso).getTime()
  const rosterItems = useRosterStore.getState().main.rosterItems

  // Walk crew rows in RENDERED top-to-bottom order so the first match sits near the
  // top of the canvas (small rowIndex → visible y). For each crew row, take its first
  // pairing puck whose computed x lands in the visible window.
  for (let rowIndex = 0; rowIndex < order.length; rowIndex++) {
    const row = order[rowIndex]
    const cid = String(row.crewId ?? '')
    if (!cid || !rowAllowed(row)) continue
    for (const it of rosterItems) {
      if (String(it.crewId) !== cid || it.pairingId == null || !it.schStrDtUtc) continue
      if (!itemAllowed(it)) continue
      const iso = it.schStrDtUtc
      const ms = new Date(iso.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso + 'Z').getTime()
      const x = (Math.trunc((ms - rangeStartMs) / 60_000) / 60) * pxPerHour - scrollX
      if (x >= 20 && x <= 600) {
        return {
          id: it.id,
          pairingId: it.pairingId,
          crewId: cid,
          schStrDtUtc: it.schStrDtUtc,
          rowIndex,
          scrollX,
          scrollY: rosterScrollY,
          pxPerHour,
          rangeStartIso,
          headerHeight: HEADER_HEIGHT,
          rowHeight: ROW_HEIGHT,
        }
      }
    }
  }
  return null
}

/** First visible flying puck on ANY crew (Locate-Pairing harness). */
const rosterProbe = (): RosterPuckProbe | null => findRosterPuck(() => true)

/** First visible flying puck whose PAIRING carries credit (`dutyActCreditedMinutes > 0`) on a crew
 *  with panel MCred > 0 — for credit-delta tests that need a de-assign to produce a real numeric
 *  change. Robust against demo crews/pairings whose credit was drained by prior saved de-assigns. */
const rosterProbeWithCredit = (): RosterPuckProbe | null =>
  findRosterPuck(
    (row) => panelMcredMinutes(row) > 0,
    (it) => it.dutyActCreditedMinutes != null && Number(it.dutyActCreditedMinutes) > 0,
  )

/**
 * V4-P02: first visible pairing segment probe.
 *
 * Row ordering replicates pairing-pane.tsx exactly:
 *   1. Sort pairingItems by sortColumn/sortDirection (source of truth: pairing-pane.tsx sortedPairingItems)
 *   2. Reorder: frozen rows first, then non-frozen (source of truth: pairing-pane.tsx reorderedPairingItems)
 *
 * Row geometry replicates pairing-renderer.ts rowY() exactly for non-frozen rows:
 *   PAIRING_HEADER_HEIGHT + rowIndex * PAIRING_ROW_HEIGHT - scrollY
 * (rowIndex is the FULL index in the reordered array)
 */
const pairingProbe = (): {
  segId: number; pairingId: number; fltId: number | null; schStrDtUtc: string; rowIndex: number; scrollX: number
  scrollY: number; pxPerHour: number; rangeStartIso: string; headerHeight: number; rowHeight: number
} | null => {
  const pairingItems = usePairingStore.getState().items
  if (!pairingItems.length) return null

  // Get pairing pane scrollY from layout-store (pairing pane id starts with 'pairing')
  let pairingScrollY = 0
  for (const p of useLayoutStore.getState().panes.values()) {
    if (p.type === 'pairing') {
      pairingScrollY = p.viewport?.scrollY ?? 0
      break
    }
  }

  const viewState = useGanttViewStore.getState()
  const { scrollX, pxPerHour } = viewState
  const rangeStartIso = usePaneStore.getState().dateRange.start.toISOString()
  const rangeStartMs = new Date(rangeStartIso).getTime()

  // Replicate sortedPairingItems logic from pairing-pane.tsx
  const sortColumn = usePaneStore.getState().getSortColumn('pairing')
  const sortDirection = usePaneStore.getState().getSortDirection('pairing')
  const sortedItems = sortPairingRows(pairingItems, sortColumn, sortDirection)

  // Replicate reorderedPairingItems logic from pairing-pane.tsx
  const frozenRowIds = usePaneStore.getState().getFrozenRowIds('pairing')
  const frozenSet = new Set(frozenRowIds)
  const frozen: typeof sortedItems = []
  const nonFrozen: typeof sortedItems = []
  for (const item of sortedItems) {
    if (frozenSet.has(String(item.pairing.id))) frozen.push(item)
    else nonFrozen.push(item)
  }
  const orderedItems = [...frozen, ...nonFrozen]
  const frozenRowCount = frozen.length

  // Scan non-frozen rows for a clickable segment. Prefer a flight segment
  // (fltId != null, wider window so "Find Crew by Flight" is exercisable); fall
  // back to the first segment in [20, 600] (parity with earlier behavior).
  const segX = (iso: string): number => {
    const ms = new Date(
      iso.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso + 'Z'
    ).getTime()
    return (Math.trunc((ms - rangeStartMs) / 60_000) / 60) * pxPerHour - scrollX
  }
  const make = (item: typeof orderedItems[number], seg: typeof item.segments[number], rowIndex: number) => ({
    segId: seg.id,
    pairingId: item.pairing.id,
    fltId: seg.fltId,
    schStrDtUtc: seg.schStrDtUtc,
    rowIndex,
    scrollX,
    scrollY: pairingScrollY,
    pxPerHour,
    rangeStartIso,
    headerHeight: PAIRING_HEADER_HEIGHT,
    rowHeight: PAIRING_ROW_HEIGHT,
  })

  let fallback: ReturnType<typeof make> | null = null
  let bestFlight: ReturnType<typeof make> | null = null
  let bestFlightX = Infinity
  for (let idx = 0; idx < orderedItems.length - frozenRowCount; idx++) {
    const rowIndex = idx + frozenRowCount
    const item = orderedItems[rowIndex]
    if (!item) continue
    for (const seg of item.segments) {
      if (!seg.schStrDtUtc) continue
      const x = segX(seg.schStrDtUtc)
      if (seg.fltId != null && x >= 20 && x < bestFlightX) {
        bestFlight = make(item, seg, rowIndex)
        bestFlightX = x
      }
      if (!fallback && x >= 20 && x <= 600) {
        fallback = make(item, seg, rowIndex)
      }
    }
  }
  // Prefer the left-most flight segment (so "Find Crew by Flight" is exercisable).
  return bestFlight ?? fallback
}

/**
 * Clickable segment per distinct pairing for the first visible rows — one entry
 * each, using the first segment whose computed x lands in [20, 600]. Lets tests
 * exercise "Find Crew" across multiple pairings (e.g. accumulation).
 */
const pairingProbes = (limit = 12): Array<{
  segId: number; pairingId: number; fltId: number | null; schStrDtUtc: string; rowIndex: number
  scrollX: number; scrollY: number; pxPerHour: number; rangeStartIso: string; headerHeight: number; rowHeight: number
}> => {
  const pairingItems = usePairingStore.getState().items
  if (!pairingItems.length) return []

  let pairingScrollY = 0
  for (const p of useLayoutStore.getState().panes.values()) {
    if (p.type === 'pairing') { pairingScrollY = p.viewport?.scrollY ?? 0; break }
  }
  const viewState = useGanttViewStore.getState()
  const { scrollX, pxPerHour } = viewState
  const rangeStartIso = usePaneStore.getState().dateRange.start.toISOString()
  const rangeStartMs = new Date(rangeStartIso).getTime()
  const sortColumn = usePaneStore.getState().getSortColumn('pairing')
  const sortDirection = usePaneStore.getState().getSortDirection('pairing')
  const sortedItems = sortPairingRows(pairingItems, sortColumn, sortDirection)
  const frozenSet = new Set(usePaneStore.getState().getFrozenRowIds('pairing'))
  const frozen: typeof sortedItems = []
  const nonFrozen: typeof sortedItems = []
  for (const item of sortedItems) {
    if (frozenSet.has(String(item.pairing.id))) frozen.push(item)
    else nonFrozen.push(item)
  }
  const orderedItems = [...frozen, ...nonFrozen]

  const out: ReturnType<typeof pairingProbes> = []
  for (let rowIndex = 0; rowIndex < orderedItems.length && out.length < limit; rowIndex++) {
    const item = orderedItems[rowIndex]
    if (!item) continue
    for (const seg of item.segments) {
      if (!seg.schStrDtUtc) continue
      const iso = seg.schStrDtUtc
      const ms = new Date(iso.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso + 'Z').getTime()
      const x = (Math.trunc((ms - rangeStartMs) / 60_000) / 60) * pxPerHour - scrollX
      if (x >= 20 && x <= 2000) {
        out.push({
          segId: seg.id, pairingId: item.pairing.id, fltId: seg.fltId, schStrDtUtc: seg.schStrDtUtc, rowIndex,
          scrollX, scrollY: pairingScrollY, pxPerHour, rangeStartIso,
          headerHeight: PAIRING_HEADER_HEIGHT, rowHeight: PAIRING_ROW_HEIGHT,
        })
        break
      }
    }
  }
  return out
}

/** V4-P05: a probe that includes ALL visible segments per row (not just the first
 *  one with x in [20, 2000]). Lets tests click on whichever segment actually lands
 *  under the cursor when the pairing's earliest qualifying segment is far away. */
const pairingVisibleSegments = (limit = 2000): Array<{
  segId: number; pairingId: number; fltId: number | null; schStrDtUtc: string; rowIndex: number
  scrollX: number; scrollY: number; pxPerHour: number; rangeStartIso: string; headerHeight: number; rowHeight: number
}> => {
  const pairingItems = usePairingStore.getState().items
  if (!pairingItems.length) return []

  let pairingScrollY = 0
  for (const p of useLayoutStore.getState().panes.values()) {
    if (p.type === 'pairing') { pairingScrollY = p.viewport?.scrollY ?? 0; break }
  }
  const viewState = useGanttViewStore.getState()
  const { scrollX, pxPerHour } = viewState
  const rangeStartIso = usePaneStore.getState().dateRange.start.toISOString()
  const rangeStartMs = new Date(rangeStartIso).getTime()
  const sortColumn = usePaneStore.getState().getSortColumn('pairing')
  const sortDirection = usePaneStore.getState().getSortDirection('pairing')
  const sortedItems = sortPairingRows(pairingItems, sortColumn, sortDirection)
  const frozenSet = new Set(usePaneStore.getState().getFrozenRowIds('pairing'))
  const frozen: typeof sortedItems = []
  const nonFrozen: typeof sortedItems = []
  for (const item of sortedItems) {
    if (frozenSet.has(String(item.pairing.id))) frozen.push(item)
    else nonFrozen.push(item)
  }
  const orderedItems = [...frozen, ...nonFrozen]

  const out: ReturnType<typeof pairingVisibleSegments> = []
  for (let rowIndex = 0; rowIndex < orderedItems.length && out.length < limit; rowIndex++) {
    const item = orderedItems[rowIndex]
    if (!item) continue
    for (const seg of item.segments) {
      if (!seg.schStrDtUtc) continue
      const iso = seg.schStrDtUtc
      const ms = new Date(iso.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso + 'Z').getTime()
      const x = (Math.trunc((ms - rangeStartMs) / 60_000) / 60) * pxPerHour - scrollX
      if (x >= 0 && x <= 4000) {
        out.push({
          segId: seg.id, pairingId: item.pairing.id, fltId: seg.fltId, schStrDtUtc: seg.schStrDtUtc, rowIndex,
          scrollX, scrollY: pairingScrollY, pxPerHour, rangeStartIso,
          headerHeight: PAIRING_HEADER_HEIGHT, rowHeight: PAIRING_ROW_HEIGHT,
        })
      }
    }
  }
  return out
}

/** V4-P02: true if the pairing segment id is in the current selectedTaskIds set. */
const isPairingSegSelected = (id: number): boolean =>
  useGanttViewStore.getState().selectedTaskIds.has(id)

/**
 * V4-P02: compare groupSegmentsByDuty (live) vs buildPairingDutyBuckets (memoized)
 * for the first 20 pairing items. The equivalence that matters:
 *   buildPairingDutyBuckets(items).get(id) deep-equals groupSegmentsByDuty(item.segments)
 * checked as [dutySeq, segmentIds[]] shape.
 */
const comparePairingBuckets20 = (): { compared: number; mismatches: unknown[] } => {
  const allItems = usePairingStore.getState().items
  const items20 = allItems.slice(0, 20)
  const buckets = buildPairingDutyBuckets(items20)
  const mismatches: unknown[] = []

  for (const item of items20) {
    const id = item.pairing.id
    const fromBucket = buckets.get(id) ?? []
    const fromLive = groupSegmentsByDuty(item.segments)

    const bucketShape = fromBucket.map((d) => ({ dutySeq: d.dutySeq, segIds: d.segments.map((s) => s.id) }))
    const liveShape = fromLive.map((d) => ({ dutySeq: d.dutySeq, segIds: d.segments.map((s) => s.id) }))

    if (JSON.stringify(bucketShape) !== JSON.stringify(liveShape)) {
      mismatches.push({ pairingId: id, bucket: bucketShape, live: liveShape })
    }
  }

  return { compared: items20.length, mismatches }
}

/**
 * V4-P08: Force N cross-macrotask scenario-gantt-store writes with DISTINCT
 * scrollX values, producing N independent React commits. Each write is chained
 * via setTimeout(0) so React's automatic batching cannot merge them.
 *
 * Writes (steps total):
 *   7, 14, 21, ... (steps-1)*7, then restore to 0
 *
 * Every write is distinct from the previous one, so Zustand never deduplicates
 * (shallow equality would only skip identical consecutive values). The initial
 * scrollX=0 is left alone — the first write is 7, guaranteeing a real state
 * change.
 *
 * Returns a Promise that resolves to the total number of writes after all
 * timeouts have fired.
 */
const scenarioRedrawBurst = (scenarioId = 8, steps = 24): Promise<number> => {
  return new Promise<number>((resolve) => {
    const store = getScenarioGanttStore(scenarioId).getState()
    const STRIDE = 7
    let writes = 0

    const chain = (step: number): void => {
      if (step >= steps) {
        resolve(writes)
        return
      }
      // Writes: step 0 → 7, step 1 → 14, ..., step (steps-2) → (steps-1)*7, step (steps-1) → restore to 0
      const value = step < steps - 1 ? (step + 1) * STRIDE : 0
      store.setScrollX(value)
      writes += 1
      setTimeout(() => chain(step + 1), 0)
    }

    chain(0)
  })
}

// ── Scenario roster edit probes (P3-Task4) ──────────────────────────────────
// These read the LIVE per-scenario stores (gantt + layout + violation) so an e2e
// can drive the REAL right-click/save edit pipeline deterministically without
// replicating render geometry in the test. The puck probe returns canvas-local
// (x, y) for the first removable pairing puck — the test adds the canvas's
// bounding rect and dispatches a real `mousedown` (button 2), which the pane's
// own interaction handler hit-tests and routes to the edit controller.

/** The per-scenario optimistic patch set (pendingChanges) — assert the edit applied. */
const scenarioPendingChanges = (scenarioId: number): AssignmentPatch[] =>
  [...getScenarioGanttStore(scenarioId).getState().pendingChanges]

/** Per-scenario pane vertical scroll offset (store truth) — proves wheel-clamp behavior. */
const scenarioPaneScrollY = (scenarioId: number, paneId = 'roster-1'): number =>
  getScenarioLayoutStore(scenarioId).getState().panes.get(paneId)?.scrollY ?? 0

/** Per-scenario violation keys (`${targetType}:${targetId}`) — assert pre-check produced badges. */
const scenarioViolationKeys = (scenarioId: number): string[] =>
  [...getScenarioViolationStore(scenarioId).getState().violations.keys()]

/** Flattened LIVE display violations (what the crew bell + tooltip render) — for e2e assertions. */
const liveViolations = (): Array<{
  pairingId: number
  crewId?: string
  ruleCode: string
  severity: number
  message: string
  windowStartDt?: string | null
  windowEndDt?: string | null
  startDt?: string | null
  endDt?: string | null
}> => {
  const out: ReturnType<GanttTestApi['liveViolations']> = []
  for (const [pairingId, viols] of useSessionViolationStore.getState().displayViolations) {
    for (const v of viols) {
      out.push({
        pairingId,
        crewId: v.crewId,
        ruleCode: v.ruleCode,
        severity: v.severity,
        message: v.message,
        windowStartDt: v.windowStartDt,
        windowEndDt: v.windowEndDt,
        startDt: v.startDt,
        endDt: v.endDt,
      })
    }
  }
  return out
}

/** Same puck severity map the Live roster canvas uses for “!” badges (excludes crew-bell-only rules). */
const livePuckViolationSeverities = (): Array<{
  taskId: number; crewId: string; pairingId: number | null; severity: number
}> => {
  const items = useRosterStore.getState().main.rosterItems
  const { itemsByPairingId, taskById } = buildRosterIndexes(items)
  const itemsByCrew = new Map<string, RosterItem[]>()
  for (const it of items) {
    const bucket = itemsByCrew.get(it.crewId) ?? []
    bucket.push(it)
    itemsByCrew.set(it.crewId, bucket)
  }
  const map = buildLiveViolationMapForTest(
    useRuleCheckStore.getState().violations,
    useSessionViolationStore.getState().displayViolations,
    itemsByPairingId,
    itemsByCrew,
  )
  const out: Array<{ taskId: number; crewId: string; pairingId: number | null; severity: number }> = []
  for (const [taskId, severity] of map) {
    const task = taskById.get(taskId)
    if (!task || severity <= 0) continue
    out.push({ taskId, crewId: task.crewId, pairingId: task.pairingId, severity })
  }
  return out
}

/**
 * For every (crew, pairing) that has a 7505 display violation and no other non-crew-bell-only
 * failed violation on that same pairing for that crew, assert the puck map has no badge on
 * that crew's tasks for that pairing.
 */
const live7505HasNoPuckBadge = (): boolean => {
  const display = useSessionViolationStore.getState().displayViolations
  const puck = new Map(livePuckViolationSeverities().map((r) => [`${r.crewId}|${r.pairingId}`, r.severity]))
  for (const [pairingId, viols] of display) {
    const failed = viols.filter((v) => !v.passed)
    const byCrew = new Map<string, typeof failed>()
    for (const v of failed) {
      if (!v.crewId) continue
      const list = byCrew.get(v.crewId) ?? []
      list.push(v)
      byCrew.set(v.crewId, list)
    }
    for (const [crewId, crewViols] of byCrew) {
      const has7505 = crewViols.some((v) => v.ruleCode === '7505')
      if (!has7505) continue
      const hasOtherPuckRule = crewViols.some((v) => !isCrewBellOnlyRule(v.ruleCode))
      if (hasOtherPuckRule) continue
      if ((puck.get(`${crewId}|${pairingId}`) ?? 0) > 0) return false
    }
  }
  return true
}

/**
 * Canvas-local (x, y) of the first removable pairing puck in the scenario roster
 * pane, plus its pairingId/crewId. Mirrors the pane's crew ordering (default
 * seniority asc → crewId, frozen rows first) and the shared geometry
 * (timeToX for x; HEADER_HEIGHT + rowIndex*ROW_HEIGHT - scrollY for the row
 * center). Returns null when no removable pairing puck is on-screen.
 */
/**
 * Scenario roster summary for render assertions: the crew rows the pane shows plus
 * each crew's total credit hours (sum of monthly crewStats.credit ÷ 60 — the value
 * the MCred column renders). Source-agnostic, so it proves a DB-sourced payload
 * (dataSource:'db') reached the store and carries crewStats.
 */
const scenarioRoster = (
  scenarioId: number,
): { dataSource: string; crew: Array<{ crewId: string; rank: string; mCredHours: number }> } | null => {
  const data = getScenarioGanttStore(scenarioId).getState().data
  if (!data) return null
  const crew = data.crew.map((c) => {
    const months = data.crewStats[c.crewId] ?? {}
    const creditMin = Object.values(months).reduce((sum, m) => sum + (m.credit ?? 0), 0)
    return { crewId: c.crewId, rank: c.rank, mCredHours: creditMin / 60 }
  })
  return { dataSource: data.dataSource, crew }
}

/**
 * Scenario standby (SBY) roster pucks — the standby items the roster pane draws, each with the
 * exact LABEL the renderer consumes and its leading token (`code`). The roster renderer's puck
 * center text = parseFlightLabel(label).fltNum = the label's first space-delimited token, so
 * `code` is precisely what the user reads on a standby puck. Before the SBY-association fix the
 * standby stayed a generic ground item (code 'SBY'); after it, it carries the real PRAM/PRPM code.
 * Built from the same buildScenarioRosterItems the canvas uses (§No-Illusion — store truth, not pixels).
 */
const scenarioStandbyPucks = (
  scenarioId: number,
): Array<{ crewId: string; assignmentGroup: string; label: string; code: string }> | null => {
  const store = getScenarioGanttStore(scenarioId).getState()
  const data = store.data
  if (!data) return null
  const pairingMap = new Map((data.pairings ?? []).map((p) => [p.pairingId, p]))
  const built = buildScenarioRosterItems({
    crew: data.crew,
    pairingMap,
    assignments: data.assignments ?? [],
    pairingSegments: data.pairingSegments ?? [],
    groundItems: data.groundItems ?? [],
    pendingChanges: store.pendingChanges,
  })
  return built.items
    .filter((it) => it.assignmentGroup === 'SBY')
    .map((it) => {
      const label = it.label ?? ''
      return { crewId: it.crewId, assignmentGroup: it.assignmentGroup, label, code: label.split(' ')[0] }
    })
}

/** Ground (pairing-less) roster pucks — proves Live label (GDO) beats generic assignment (DO). */
const scenarioGroundPucks = (
  scenarioId: number,
): Array<{ crewId: string; assignmentGroup: string; assignment: string; label: string }> | null => {
  const store = getScenarioGanttStore(scenarioId).getState()
  const data = store.data
  if (!data) return null
  const pairingMap = new Map((data.pairings ?? []).map((p) => [p.pairingId, p]))
  const built = buildScenarioRosterItems({
    crew: data.crew,
    pairingMap,
    assignments: data.assignments ?? [],
    pairingSegments: data.pairingSegments ?? [],
    groundItems: data.groundItems ?? [],
    pendingChanges: store.pendingChanges,
  })
  return built.items
    .filter((it) => it.pairingId == null)
    .map((it) => ({
      crewId: it.crewId,
      assignmentGroup: it.assignmentGroup,
      assignment: it.assignment ?? '',
      label: it.label ?? '',
    }))
}

/**
 * Scenario roster pucks tagged with whether the renderer would draw the ⚡ "optimizer-placed"
 * badge. The roster renderer draws ⚡ iff `task.source === 'CR'` (roster-renderer.ts); duties
 * carried over from the live roster (pre-assignment / lead-in: leave, days off, ILL) are
 * `source==='PA'` and must render iconless. Built from the same buildScenarioRosterItems the
 * canvas consumes (§No-Illusion — store truth, not pixels). Optionally narrowed to one crew.
 * Regression target: after a solver run, a pre-assigned (PA) crew's duties must have flash=false.
 */
const scenarioRosterFlash = (
  scenarioId: number,
  crewId?: string,
): Array<{ crewId: string; assignmentGroup: string; assignment: string; source: string | null; flash: boolean }> | null => {
  const store = getScenarioGanttStore(scenarioId).getState()
  const data = store.data
  if (!data) return null
  const pairingMap = new Map((data.pairings ?? []).map((p) => [p.pairingId, p]))
  const built = buildScenarioRosterItems({
    crew: data.crew,
    pairingMap,
    assignments: data.assignments ?? [],
    pairingSegments: data.pairingSegments ?? [],
    groundItems: data.groundItems ?? [],
    pendingChanges: store.pendingChanges,
  })
  return built.items
    .filter((it) => (crewId ? it.crewId === crewId : true))
    .map((it) => ({
      crewId: it.crewId,
      assignmentGroup: it.assignmentGroup,
      assignment: it.assignment ?? '',
      source: it.source ?? null,
      flash: it.source === 'CR',
    }))
}

const scenarioRosterPuck = (
  scenarioId: number,
  wantPairingId?: number | null,
  paneId = 'roster-1',
): { x: number; y: number; pairingId: number | null; crewId: string; itemId: number } | null => {
  const store = getScenarioGanttStore(scenarioId).getState()
  const data = store.data
  if (!data) return null

  const layout = getScenarioLayoutStore(scenarioId).getState()
  const pane = layout.panes.get(paneId)
  const scrollY = pane?.scrollY ?? 0
  const frozenSet = new Set(pane?.frozenCrewIds ?? [])

  // Crew filter + ordering: mirrors scenario-roster-pane.filteredCrew / orderedCrew exactly.
  // Read from the shared context filter-store (not the old scenario-gantt-store.crewFilter).
  const f = getFilterStore(scenarioId).getState().crew
  const filtered = data.crew.filter((c) => {
    if (f.divisions.length > 0 && !f.divisions.includes(c.division)) return false
    if (f.bases.length > 0 && !f.bases.includes(c.base)) return false
    if (f.ranks.length > 0 && !f.ranks.includes(c.rank)) return false
    // crewIds: substring match (any id must match)
    if ((f.crewIds?.length ?? 0) > 0 &&
        !f.crewIds!.some((id) => c.crewId.toLowerCase().includes(id.toLowerCase()))) return false
    // fleets: scenario crew has no fleet field → no-op
    return true
  })
  // Sort: read multi-key criteria from the per-scenario pane-store.
  const sortCriteria = getPaneStore(scenarioId).getState().getSortCriteria('scenario-roster')
  const crewSortValue = (c: typeof filtered[number], key: string): string => {
    if (key === 'seniorityNum') return c.seniorityNum !== null ? String(c.seniorityNum) : ''
    if (key === 'crewId') return c.crewId
    if (key === 'rank')   return c.rank
    if (key === 'base')   return c.base
    return ''
  }
  const defaultSort = (a: typeof filtered[number], b: typeof filtered[number]): number => {
    const na = a.seniorityNum !== null ? Number(a.seniorityNum) : Infinity
    const nb = b.seniorityNum !== null ? Number(b.seniorityNum) : Infinity
    if (na !== nb) return na - nb
    return a.crewId.localeCompare(b.crewId)
  }
  filtered.sort((a, b) => {
    if (sortCriteria.length === 0) return defaultSort(a, b)
    for (const { column, direction } of sortCriteria) {
      const va = crewSortValue(a, column)
      const vb = crewSortValue(b, column)
      const na = Number(va)
      const nb = Number(vb)
      const numeric = va !== '' && vb !== '' && !isNaN(na) && !isNaN(nb)
      const cmp = numeric ? na - nb : va.localeCompare(vb)
      if (cmp !== 0) return direction === 'asc' ? cmp : -cmp
    }
    return defaultSort(a, b)
  })
  const frozen = filtered.filter((c) => frozenSet.has(c.crewId))
  const scrollable = filtered.filter((c) => !frozenSet.has(c.crewId))
  const orderedCrew = [...frozen, ...scrollable]
  const crewIds = orderedCrew.map((c) => c.crewId)

  const pairingMap = new Map((data.pairings ?? []).map((p) => [p.pairingId, p]))
  const built = buildScenarioRosterItems({
    crew: orderedCrew,
    pairingMap,
    assignments: data.assignments ?? [],
    pairingSegments: data.pairingSegments ?? [],
    groundItems: data.groundItems ?? [],
    pendingChanges: store.pendingChanges,
  })

  const rangeStart = new Date(data.strDtLoc)
  const pxPerHour = store.pxPerHour
  const scrollX = store.scrollX

  for (let rowIndex = 0; rowIndex < crewIds.length; rowIndex++) {
    const cid = crewIds[rowIndex]
    for (const it of built.itemsByCrew.get(cid) ?? []) {
      if (!it.schStrDtUtc || !it.schEndDtUtc) continue
      // wantPairingId === null → first ground task; undefined → first pairing; number → that pairing
      if (wantPairingId === null) {
        if (it.pairingId != null) continue
      } else {
        if (it.pairingId == null) continue
        if (wantPairingId != null && it.pairingId !== wantPairingId) continue
      }
      const taskX = timeToX(it.schStrDtUtc, rangeStart, pxPerHour)
      const taskEndX = timeToX(it.schEndDtUtc, rangeStart, pxPerHour)
      // Canvas-local x: subtract horizontal scroll; aim a few px into the puck.
      const x = taskX - scrollX + Math.min(6, Math.max(2, (taskEndX - taskX) / 2))
      const y = HEADER_HEIGHT + rowIndex * ROW_HEIGHT - scrollY + ROW_HEIGHT / 2
      if (x < 2) continue // puck scrolled off the left edge
      return { x, y, pairingId: it.pairingId, crewId: cid, itemId: it.id }
    }
  }
  return null
}

/**
 * P3.5-Task2: canvas-local (x,y)+id of a scenario FLIGHT puck.
 *
 * Replicates the scenario flight pane's row grouping/ordering (group by
 * `${fleet}__${register}`, group keys sorted asc, flights within a group sorted
 * by schDepDtUtc) and the shared flight geometry (timeToX for x; the flight pane
 * hit-test uses rowIndex = floor((canvasY - HEADER_HEIGHT + scrollY)/ROW_HEIGHT),
 * so a row's screen center = HEADER_HEIGHT + rowIndex*ROW_HEIGHT - scrollY +
 * ROW_HEIGHT/2). Returns null when no flight puck is on-screen.
 */
const scenarioFlightPuck = (
  scenarioId: number,
  wantFlightId?: number,
  paneId = 'flight-1',
): { x: number; y: number; flightId: number; fltNum: string } | null => {
  const store = getScenarioGanttStore(scenarioId).getState()
  const data = store.data
  if (!data) return null

  const layout = getScenarioLayoutStore(scenarioId).getState()
  const scrollY = layout.panes.get(paneId)?.scrollY ?? 0

  const flights = data.flights ?? []
  // Group by fleet+register exactly like buildFlightItems in scenario-flight-pane.
  const groups = new Map<string, typeof flights>()
  for (const f of flights) {
    const key = `${f.fleet}__${f.register ?? '__fleet__'}`
    const list = groups.get(key) ?? []
    list.push(f)
    groups.set(key, list)
  }
  const rows = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, gs]) => [...gs].sort((a, b) => a.schDepDtUtc.localeCompare(b.schDepDtUtc)))

  const rangeStart = new Date(data.strDtLoc)
  const pxPerHour = store.pxPerHour
  const scrollX = store.scrollX

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    for (const f of rows[rowIndex]) {
      if (wantFlightId != null && f.id !== wantFlightId) continue
      const blockX = timeToX(new Date(f.schDepDtUtc), rangeStart, pxPerHour)
      const blockEndX = timeToX(new Date(f.schArvDtUtc), rangeStart, pxPerHour)
      const x = blockX - scrollX + Math.min(6, Math.max(2, (blockEndX - blockX) / 2))
      const y = HEADER_HEIGHT + rowIndex * ROW_HEIGHT - scrollY + ROW_HEIGHT / 2
      if (x < 2) continue // puck scrolled off the left edge
      return { x, y, flightId: f.id, fltNum: f.fltNum }
    }
  }
  return null
}

/**
 * P3.6-Task2: canvas-local (x, y) + ids of a scenario PAIRING segment puck.
 *
 * Replicates the scenario pairing pane's row ordering (buildPairingItems sorts pairings
 * by schStrDtUtc asc; the pairing pane floats foundCrewIds to top but a probe taken before
 * any find action sees the plain sort) and the pane's hit-test geometry (rowCanvasY =
 * PAIRING_HEADER_HEIGHT + rowIndex*PAIRING_ROW_HEIGHT - scrollY; the puck sits on the
 * segment's schStrDtUtc mapped via timeToX). Returns null when no puck is on-screen.
 */
const scenarioPairingPuck = (
  scenarioId: number,
  wantPairingId?: number,
  paneId = 'pairing-1',
): { x: number; y: number; pairingId: number; segId: number; fltId: number | null } | null => {
  const store = getScenarioGanttStore(scenarioId).getState()
  const data = store.data
  if (!data) return null

  const layout = getScenarioLayoutStore(scenarioId).getState()
  const scrollY = layout.panes.get(paneId)?.scrollY ?? 0

  // Replicate buildPairingItems: pairings sorted by schStrDtUtc; segments sorted by
  // dutySeq then segSeq; segment ids assigned sequentially (idCounter from 1) across pairings.
  const segsByPairing = new Map<number, typeof data.pairingSegments>()
  for (const seg of data.pairingSegments) {
    const list = segsByPairing.get(seg.pairingId) ?? []
    list.push(seg)
    segsByPairing.set(seg.pairingId, list)
  }
  const sortedPairings = [...data.pairings].sort((a, b) => a.schStrDtUtc.localeCompare(b.schStrDtUtc))

  const rangeStart = new Date(data.strDtLoc)
  const pxPerHour = store.pxPerHour
  const scrollX = store.scrollX

  let idCounter = 1
  for (let rowIndex = 0; rowIndex < sortedPairings.length; rowIndex++) {
    const p = sortedPairings[rowIndex]
    const segs = (segsByPairing.get(p.pairingId) ?? [])
      .slice()
      .sort((a, b) => (a.dutySeq !== b.dutySeq ? a.dutySeq - b.dutySeq : a.segSeq - b.segSeq))
    const rowCenterY = PAIRING_HEADER_HEIGHT + rowIndex * PAIRING_ROW_HEIGHT - scrollY + Math.floor(PAIRING_ROW_HEIGHT / 2)
    for (const seg of segs) {
      const segId = idCounter++
      if (wantPairingId != null && p.pairingId !== wantPairingId) continue
      if (!seg.schStrDtUtc || !seg.schEndDtUtc) continue
      const blockX = timeToX(new Date(seg.schStrDtUtc), rangeStart, pxPerHour)
      const blockEndX = timeToX(new Date(seg.schEndDtUtc), rangeStart, pxPerHour)
      const x = blockX - scrollX + Math.min(6, Math.max(2, (blockEndX - blockX) / 2))
      if (x < 2) continue // scrolled off the left edge
      return { x, y: rowCenterY, pairingId: p.pairingId, segId, fltId: seg.fltId }
    }
  }
  return null
}

/** P3.6-Task2: the cross-pane "found" (brought-to-top) row ids for a scenario pane (by paneId). */
const scenarioFoundIds = (scenarioId: number, paneId: string): string[] =>
  [...(getScenarioLayoutStore(scenarioId).getState().panes.get(paneId)?.foundCrewIds ?? [])]

/**
 * P3.7: the scenario pairing pane's currently-selected segment ids (the LOCAL state the
 * renderer checks via segments.some(s => selectedPairingIds.has(s.id)) to draw the dashed
 * selection box). Non-empty after a puck click; empty after a background click.
 */
const scenarioPairingSelection = (scenarioId: number, paneId = 'pairing-1'): number[] =>
  [...(scenarioPairingSelByPane.get(`${scenarioId}:${paneId}`) ?? [])]

/** Pairing objects in the scenario gantt store (id + base + label) — for Base column assertions. */
const scenarioPairings = (
  scenarioId: number,
): Array<{ id: number; base: string; label: string | null; composition: Array<{ rank: string; plan: number; fill: number }> }> | null => {
  const data = getScenarioGanttStore(scenarioId).getState().data
  if (!data) return null
  // Local fill (base assignments + pendingChanges) — mirrors buildPairingItems so the probe
  // reflects what the pairing pane actually renders after roster edits.
  const effective = buildEffectiveAssignments(data.assignments, getScenarioGanttStore(scenarioId).getState().pendingChanges)
  const fillByPairing = computeScenarioPairingCompositions(effective, data.crew, data.pairings)
  return (data.pairings as ScenarioGanttPairing[]).map((p) => ({
    id: p.pairingId,
    base: p.base,
    label: p.pairingLabel,
    composition: fillByPairing.get(p.pairingId) ?? (p.compositions as ScenarioGanttCompositionSlot[]).map((c) => ({ rank: c.rank, plan: c.plan, fill: c.fill })),
  }))
}

/**
 * 安装 `window.__ganttTest`。生产构建中默认跳过；
 * 当 VITE_TEST_HOOK=true 时（如 UAT 测试环境）允许生产构建开启钩子。
 */
export const installGanttTestHook = (): void => {
  if (typeof window === 'undefined') return
  if (import.meta.env.PROD && !import.meta.env.VITE_TEST_HOOK) return

  // Count only scroll-position writes (scrollX changed) so that
  // markDirty / markClean canvas-render cycles do not pollute the coalescing assertion.
  let _prevScrollX = useGanttViewStore.getState().scrollX
  useGanttViewStore.subscribe((s) => {
    if (s.scrollX !== _prevScrollX) {
      _prevScrollX = s.scrollX
      viewStoreWriteCount += 1
    }
  })

  window.__ganttTest = {
    counts,
    loading,
    panes: () => [...useLayoutStore.getState().panes.values()].map((p) => ({ id: p.id, type: p.type })),
    paneTypes,
    grid: () => useLayoutStore.getState().grid.map((row) => [...row]),
    rowHeights: () => [...useLayoutStore.getState().rowHeights],
    ready,
    render: renderList,
    memoBadges,
    memoCount,
    roster,
    patchRoster: (paneId: 'main' | 'sub', items: RosterItem[]) => useRosterStore.getState().patchItems(paneId, items),
    openGroundTaskEdit: (item: RosterItem, scenarioId?: number) =>
      useUiStore.getState().openGroundTaskEdit(item, scenarioId),
    openPairingInfo: (id: number) => useUiStore.getState().openPairingInfo(id),
    openLivePairingContextMenu: (pairingId: number) => {
      const stub = {
        id: pairingId,
        crewId: '',
        pairingId,
        ver: 0,
        base: '',
        label: null,
        assignmentGroup: 'FLT',
        assignment: null,
        role: null,
        subRole: null,
        source: null,
        isRequested: 0,
        isSwapped: 0,
        preference: null,
        comments: null,
        score: null,
        workingHour: null,
        schStrDtUtc: null,
        schEndDtUtc: null,
        actStrDtUtc: null,
        actEndDtUtc: null,
        fltId: null,
        fltDt: null,
        dutySeq: null,
        segSeq: null,
        division: null,
        flightActingRank: '',
        rosterActingRank: null,
        activeRank: null,
        position: null,
      } as RosterItem
      useUiStore.getState().openContextMenu(160, 160, stub, 'pairing')
    },
    rosterKeys,
    rosterColumns,
    pairingColumns,
    renderedColumns,
    renderedHeaderWidth,
    renderedRow,
    rosterPanel,
    rosterMcred,
    scenarioRosterMcred,
    rosterPanelKpis,
    crewStatsYearMonth,
    rosterPanelOrder,
    crewViolationSeverities,
    scenarioCrewViolationSeverities,
    rosterValidityBlocks,
    scenarioRosterValidityBlocks,
    ruleGroupCodes,
    pairingPanelOrder,
    foundIds,
    setPaneVisible,
    crewSeniority,
    rosterSort,
    applyCrewFilter,
    activeCrewFilter,
    applyPairingFilter,
    applyFlightFilter,
    pairings,
    simulatePairingCommitReload: reloadPairingsAfterCommit,
    pairingSort,
    flights,
    zoom,
    scenarioZoom,
    scenarioRange,
    rosterModelBuilds: rosterModelBuildCount,
    setScrollX,
    pairingJumpToDayScrollY: () => useUiStore.getState().contextMenuJumpToDayScrollY,
    timezone,
    hoverFlight,
    pairingSegments,
    hoverPairingSegment,
    hoverRosterTask,
    setTimezone,
    airportZone,
    viewStoreWrites: () => viewStoreWriteCount,
    dateRange,
    setDateRange,
    filters,
    selectedCrewCount,
    crewTotals,
    pairingTotals,
    pairingOpenCredit,
    flightTotals,
    crewBases,
    marks: allPhaseMarks,
    phases: phasesRelative,
    resetMarks: resetPhaseMarks,
    scrollPaneVertically,
    paneScrollY,
    chromeCommits: () => Object.fromEntries(chromeCommits),
    flightProbe,
    isFlightSelected,
    rosterProbe,
    rosterProbeWithCredit,
    selectedTaskIds,
    selectRosterTasks,
    draftState,
    draftOps,
    liveRosterCrewRowIds,
    setLiveRosterCrewRow,
    livePairingRowIds,
    setLivePairingRow,
    scenarioPairingRowIds,
    scenarioRosterTaskIds,
    setScenarioPairingRow,
    forceSessionTimeout,
    clearPairingItems,
    pairingProbe,
    pairingProbes,
    pairingVisibleSegments,
    isPairingSegSelected,
    comparePairingBuckets20,
    isCrossDayLocal,
    scenarioRedrawBurst,
    // Direct invocation of the "by Flight" actions (bypasses the flaky pairing-canvas
    // right-click) so e2e can assert their effect deterministically.
    findCrewByFlight: (fltId: number) => findCrewToTop('flight', fltId, 'main'),
    findPairingsByFlight: (fltId: number) => findPairingsByFlight(fltId),
    scenarioPendingChanges,
    scenarioPaneScrollY,
    scenarioViolationKeys,
    liveViolations,
    livePuckViolationSeverities,
    live7505HasNoPuckBadge,
    setPersistedViolations: (crewId, pairingId, violations) => {
      useSessionViolationStore.getState().setPersistedViolations(
        crewId,
        pairingId,
        violations.map((v) => ({
          ruleCode: v.ruleCode,
          ruleInstance: v.ruleInstance ?? '001',
          ruleName: v.ruleName ?? v.ruleCode,
          passed: v.passed ?? false,
          severity: v.severity,
          message: v.message,
          actualValue: v.actualValue ?? 0,
          limitValue: v.limitValue ?? 0,
          unit: v.unit ?? '',
        })),
      )
    },
    replacePersistedViolations: (entries) => {
      useSessionViolationStore.getState().replacePersistedViolations(
        entries.map(({ crewId, pairingId, violations }) => ({
          crewId,
          pairingId,
          violations: violations.map((v) => ({
            ruleCode: v.ruleCode,
            ruleInstance: v.ruleInstance ?? '001',
            ruleName: v.ruleName ?? v.ruleCode,
            passed: v.passed ?? false,
            severity: v.severity,
            message: v.message,
            actualValue: v.actualValue ?? 0,
            limitValue: v.limitValue ?? 0,
            unit: v.unit ?? '',
          })),
        })),
      )
    },
    violationQueryWindowForTest: (dateStartIso, dateEndIso, rpStartMs, rpEndMs) => {
      const view = resolveViolationViewBounds(
        { start: new Date(dateStartIso), end: new Date(dateEndIso) },
        { startMs: rpStartMs, endMs: rpEndMs },
      )
      const june7504Overlaps = violationOverlapsDisplayWindow(
        {
          start_dt: '2026-06-11T12:03:00.000Z',
          end_dt: '2026-06-12T00:30:00.000Z',
          window_start_dt: null,
          window_end_dt: null,
        },
        view.start,
        view.end,
      )
      const july1001Overlaps = violationOverlapsDisplayWindow(
        {
          start_dt: '2026-07-03T07:01:00.000Z',
          end_dt: '2026-07-03T20:31:00.000Z',
          window_start_dt: null,
          window_end_dt: null,
        },
        view.start,
        view.end,
      )
      return {
        startMonth: view.start.getMonth() + 1,
        endMonth: view.end.getMonth() + 1,
        june7504Overlaps,
        july1001Overlaps,
      }
    },
    scenarioRoster,
    scenarioStandbyPucks,
    scenarioGroundPucks,
    scenarioRosterFlash,
    scenarioRosterPuck,
    scenarioFlightPuck,
    scenarioPairingPuck,
    scenarioFoundIds,
    scenarioPairingSelection,
    scenarioPairings,
    segmentDutyFill: (assignmentGroup, assignment, isDeadhead = false) => {
      const fill = resolveSegmentDutyFill({ assignmentGroup, assignment, isDeadhead })
      return {
        ...fill,
        flyTop: ROSTER_FLIGHT_TOP,
        flyBottom: ROSTER_FLIGHT_BOTTOM,
        reserveColor: RESERVE_PUCK_COLOR,
      }
    },
    isDeadheadRosterPuck: (item: {
      segAssignment?: string | null
      assignmentGroup?: string | null
      assignment?: string | null
    }) => isDeadheadRosterPuck(item),
  }
}
