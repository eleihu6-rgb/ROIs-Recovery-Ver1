import { create } from 'zustand'
import { addDays, differenceInDays } from 'date-fns'
import { useTimezoneStore } from './timezone-store'
import { calendarDateToUtcMidnight } from '@/components/gantt/gantt-utils'
import { useRosterStore } from './roster-store'
import { usePairingStore } from './pairing-store'
import { useFlightStore } from './flight-store'
import { useCrewStore } from './crew-store'
import { useFilterStore } from './filter-store'
import { useLayoutStore } from './layout-store'
import { useRuleCheckStore } from './rule-check-store'
import { ganttApi } from '@/services/gantt-api'
import { rosterApi } from '@/services/roster-api'
import type { RosterItem } from '@/types'
import { markPhase } from '@/utils/gantt-perf-marks'
import { batchProgresses } from '@/utils/batch-progress'

// ── V4-P01: RAF-coalesced horizontal scroll ─────────────────────────────────
// 高频输入（pane wheel 的 scroll(dx,dy)、横向滚动条拖拽/滚轮）先累积进 pending，
// 每帧仅一次 RAF flush 写 store；程序化跳转（setScrollX / zoom）保持立即写入，
// 并先取消 pending，避免上一帧残留输入覆盖跳转结果。
let pendingDx = 0
let pendingDy = 0
let pendingAbsX: number | null = null
let scrollFlushRaf = 0

/** Drop queued high-frequency scroll input (call before any programmatic scroll/zoom jump). */
export const cancelPendingScroll = (): void => {
  pendingDx = 0
  pendingDy = 0
  pendingAbsX = null
  if (scrollFlushRaf) {
    cancelAnimationFrame(scrollFlushRaf)
    scrollFlushRaf = 0
  }
}

/**
 * Max horizontal scroll (px) so the viewport's right edge never passes the content's
 * right edge (rangeEnd). Past that edge the body still paints its full-width horizontal
 * row separators while the date header has no day labels and the vertical day columns
 * stop — the "grid prints but no timeline date on the right" bug. Returns Infinity until
 * BOTH the content span and the viewport width are known, so we never clamp to 0 before
 * measurement. `contentHours` is the rendered date-range span in hours, fed from the same
 * pane-store.dateRange the canvas draws with (see TimeAxis).
 */
interface HorizontalScrollBounds {
  contentHours: number
  pxPerHour: number
  viewportWidth: number
  scrollWindowStartX?: number
  scrollWindowEndX?: number | null
}

const maxScrollXFor = (s: HorizontalScrollBounds): number => {
  if (s.contentHours <= 0 || s.viewportWidth <= 0) return Number.POSITIVE_INFINITY
  const contentMax = Math.max(0, s.contentHours * s.pxPerHour - s.viewportWidth)
  const windowMax = s.scrollWindowEndX != null ? Math.max(0, s.scrollWindowEndX - s.viewportWidth) : contentMax
  return Math.max(minScrollXFor(s), Math.min(contentMax, windowMax))
}

const minScrollXFor = (s: { scrollWindowStartX?: number }): number => Math.max(0, s.scrollWindowStartX ?? 0)

const clampScrollXFor = (s: HorizontalScrollBounds, x: number): number =>
  Math.min(maxScrollXFor(s), Math.max(minScrollXFor(s), x))

const flushScroll = (): void => {
  scrollFlushRaf = 0
  const absX = pendingAbsX
  const dx = pendingDx
  const dy = pendingDy
  pendingAbsX = null
  pendingDx = 0
  pendingDy = 0
  useGanttViewStore.setState((state) => ({
    // Upper clamp here covers BOTH high-frequency paths: pane/scrollbar wheel (dx) and
    // scrollbar thumb drag (absX via setScrollXCoalesced). Without it, trackpad/wheel
    // overscroll sailed past the last day into blank space.
    scrollX: clampScrollXFor(state, (absX !== null ? absX : state.scrollX) + dx),
    scrollY: Math.max(0, state.scrollY + dy),
    dirty: true,
    dirtyEpoch: state.dirtyEpoch + 1,
  }))
}

const scheduleScrollFlush = (): void => {
  if (!scrollFlushRaf) scrollFlushRaf = requestAnimationFrame(flushScroll)
}

/** 与 roster-api 一致的 UTC 日期格式化（不要用 utils/date 的本地版，避免窗口错位）。 */
const toYmd = (d: Date): string => d.toISOString().slice(0, 10)

/** Zoom step multiplier per click (2x = ~10 steps from 1 hour to 3 months) */
const ZOOM_STEP = 2
const MONTH_VIEWPORT_ANCHOR_BIAS_MS = 60_000
const HOUR_MS = 3_600_000

/**
 * 渐进式加载首屏窗口天数（P1-3）。打开 Gantt 时默认日期范围可达 ~91 天，但默认缩放下
 * 仅可见 ~6 天。先只加载首屏窗口（rangeStart 起 N 天）让 roster 快速呈现，其余在后台
 * 用 appendRoster 追加合并。超过该天数才走渐进式；否则一次性加载。
 */
/** First roster window = the visible calendar MONTH of the range start (NOT a fixed 14
 *  days — a fixed window shrinks the roster on date changes / fallback paths). Mirrors
 *  apply-filters.daysToEndOfMonth. */
const daysToEndOfMonth = (start: Date): number => {
  const eom = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0))
  return Math.max(1, Math.round((eom.getTime() - start.getTime()) / 86_400_000) + 1)
}

interface GanttViewStore {
  /**
   * Pixels per hour — the continuous zoom value.
   * Higher = more zoomed in (blocks are wider).
   */
  pxPerHour: number

  /** Min pxPerHour — full date range fills viewport */
  zoomMin: number
  /** Max pxPerHour — 1 day fills viewport */
  zoomMax: number

  /** Horizontal scroll offset in pixels */
  scrollX: number
  scrollWindowStartX: number
  scrollWindowEndX: number | null

  /**
   * Measured timeline viewport width in px (the visible axis/canvas width, excluding
   * the frozen left columns). Written by the TimeAxis on resize. 0 until first measured.
   * Used for an EXACT fit-to-range — the window-innerWidth estimate over-counts app
   * chrome (left icon rail, scrollbar) and clips the range's tail days.
   */
  viewportWidth: number

  /**
   * Rendered date-range span in hours (pane-store.dateRange end−start). Drives the
   * horizontal max-scroll clamp (contentWidth = contentHours × pxPerHour). 0 until the
   * TimeAxis publishes it; while 0 the clamp is disabled (no upper bound).
   */
  contentHours: number

  /** Vertical scroll offset in pixels — per-pane scroll is managed by pane components */
  scrollY: number

  /** Selected task IDs (across all panes) */
  selectedTaskIds: Set<number>

  /** Hovered task ID (for tooltip / status bar) */
  hoveredTaskId: number | null

  /** Hovered crew ID — set when hovering violation indicator on left panel header */
  hoveredCrewId: string | null

  /** Mouse position for floating tooltip (client coords) */
  hoverPosition: { x: number; y: number }

  /** Whether the canvas needs a redraw */
  dirty: boolean

  /**
   * Monotonic dirty counter — incremented at EVERY site that sets `dirty: true`,
   * never decremented (markClean leaves it untouched). Edge-detecting consumers
   * (e.g. PaneCanvas via the Live source's useDirtySignal) get exactly ONE change
   * per dirty cycle, instead of the 0→1→0 double-edge a `dirty ? 1 : 0` mapping
   * produced (the 1→0 clean transition triggered a second, idempotent redraw).
   */
  dirtyEpoch: number

  /** Set zoom bounds (called when viewport/date range changes) */
  setZoomBounds: (min: number, max: number) => void
  /** Zoom in by one step (x1.4) */
  zoomIn: () => void
  /** Zoom out by one step (/1.4) */
  zoomOut: () => void

  setScrollX: (x: number) => void
  setScrollWindow: (startX: number, endX: number | null) => void
  clearScrollWindow: () => void
  /** Record the measured timeline viewport width (px). No-op when unchanged. Re-clamps scrollX. */
  setViewportWidth: (width: number) => void
  /** Record the rendered date-range span (hours) for the max-scroll clamp. Re-clamps scrollX. */
  setContentHours: (hours: number) => void
  /** Fit the whole selected date range into the viewport: zoom so it fills exactly, scroll to start. */
  fitToRange: () => void
  /** First-open default: fit the first calendar month of the range to the viewport (scroll to start). */
  fitToFirstMonth: () => void
  /** Coalesced absolute target for high-frequency input (scrollbar thumb drag). */
  setScrollXCoalesced: (x: number) => void
  setScrollY: (y: number) => void
  scroll: (dx: number, dy: number) => void

  selectTask: (taskId: number) => void
  toggleTaskSelection: (taskId: number) => void
  selectTasks: (taskIds: number[]) => void
  clearSelection: () => void

  setHoveredTask: (taskId: number | null, clientX?: number, clientY?: number) => void
  setHoveredCrew: (crewId: string | null, clientX?: number, clientY?: number) => void

  /**
   * Zoom to fit a specific month in the viewport, scrolling to its start.
   * Month boundaries are evaluated on the DISPLAY-timezone calendar (same as the
   * day grid). viewportWidth = the actual canvas width in px; callers that own a
   * measured axis/canvas width must pass it — the window-based fallback
   * overestimates and clips the month's tail days.
   */
  zoomToMonth: (year: number, month: number, rangeStart: Date, viewportWidth?: number) => void
  zoomToRp: (rpStartMs: number, rpEndMs: number, rangeStart: Date, viewportWidth?: number) => void

  markDirty: () => void
  markClean: () => void

  /** Whether all panes are currently being refreshed */
  refreshing: boolean
  /**
   * P0-3 唯一首屏 roster 加载入口：渐进式（先首屏窗口、后台追加），所有刷新路径都应走它，
   * 避免有的流程（如 Filter-dialog Apply、再次筛选）绕过渐进式而全量拉取。
   */
  loadRosterProgressive: (
    crewIds: string[],
    dateRange: { start: Date; end: Date },
    firstWindowDays?: number,
    append?: boolean,
  ) => Promise<void>
  /** roster 按 crew 分批并发加载，每批完成更新 main.progress（0-100）。单轮全量，无 phase-2 重复。 */
  loadRosterBatched: (crewIds: string[], dateRange: { start: Date; end: Date }, startProgress?: number) => Promise<void>
  /** 首屏 bootstrap：一次取 slim crew + 首屏窗口 roster，省 crew→roster 串行往返；失败回退渐进式。 */
  loadFromBootstrap: (
    dateRange: { start: Date; end: Date },
    opts?: { pageSize?: number; rosterWindowDays?: number; skipAppend?: boolean },
  ) => Promise<void>
  /** Fetch fresh data for all visible panes (explicit refresh) */
  refreshAllPanes: () => Promise<void>
  /** Fetch fresh roster data only, without touching pairing/flight panes */
  refreshRosterPane: () => Promise<void>
  /** Fetch data for a specific pane type only (skip if already loaded) */
  fetchPaneData: (paneType: 'roster' | 'pairing' | 'flight') => Promise<void>
}

export const useGanttViewStore = create<GanttViewStore>((set, get) => ({
  pxPerHour: 7,
  zoomMin: 7,
  zoomMax: 50,
  scrollX: 0,
  scrollWindowStartX: 0,
  scrollWindowEndX: null,
  scrollY: 0,
  viewportWidth: 0,
  contentHours: 0,
  selectedTaskIds: new Set(),
  hoveredTaskId: null,
  hoveredCrewId: null,
  hoverPosition: { x: 0, y: 0 },
  dirty: true,
  dirtyEpoch: 0,

  setZoomBounds: (min, max) => {
    const { pxPerHour, zoomMin: oldMin, zoomMax: oldMax } = get()
    // Only snap to new min on very first call (before any zoom bounds have been set)
    const isFirstCall = oldMin === 7 && oldMax === 50
    // Also snap if current zoom is at previous min (user is zoomed all the way out)
    const atMin = pxPerHour <= oldMin * 1.01
    const shouldSnap = isFirstCall ? false : atMin
    const clamped = shouldSnap ? min : Math.max(min, Math.min(max, pxPerHour))
    set((s) => ({ zoomMin: min, zoomMax: max, pxPerHour: clamped, dirty: true, dirtyEpoch: s.dirtyEpoch + 1 }))
  },

  zoomIn: () => {
    cancelPendingScroll()
    const { pxPerHour, scrollX, zoomMax } = get()
    const next = Math.min(zoomMax, pxPerHour * ZOOM_STEP)
    // Keep view center stable: adjust scrollX proportionally
    const ratio = next / pxPerHour
    const viewCenter = scrollX + (window.innerWidth - 262) / 2
    const state = get()
    const newScrollX = clampScrollXFor({ ...state, pxPerHour: next }, viewCenter * ratio - (window.innerWidth - 262) / 2)
    set((s) => ({ pxPerHour: next, scrollX: newScrollX, dirty: true, dirtyEpoch: s.dirtyEpoch + 1 }))
  },

  zoomOut: () => {
    cancelPendingScroll()
    const { pxPerHour, scrollX, zoomMin } = get()
    let next = pxPerHour / ZOOM_STEP
    if (next < zoomMin * 1.05) next = zoomMin
    if (next <= zoomMin * 1.01) {
      // At minimum: snap + scroll to 0
      set((s) => ({ pxPerHour: next, scrollX: minScrollXFor(s), dirty: true, dirtyEpoch: s.dirtyEpoch + 1 }))
    } else {
      // Keep view center stable. Zooming out shrinks pxPerHour → maxScrollX drops, so a
      // view that was pinned to the right edge would otherwise spill past the last day.
      const ratio = next / pxPerHour
      const viewCenter = scrollX + (window.innerWidth - 262) / 2
      const state = get()
      const newScrollX = clampScrollXFor({ ...state, pxPerHour: next }, viewCenter * ratio - (window.innerWidth - 262) / 2)
      set((s) => ({ pxPerHour: next, scrollX: newScrollX, dirty: true, dirtyEpoch: s.dirtyEpoch + 1 }))
    }
  },

  setScrollX: (x) => {
    // Immediate programmatic jump (track click, tests, goto). Cancel queued
    // input so a pending flush cannot overwrite this position.
    // (for high-frequency input use scroll() / setScrollXCoalesced instead)
    cancelPendingScroll()
    const s = get()
    set({ scrollX: clampScrollXFor(s, x), dirty: true, dirtyEpoch: s.dirtyEpoch + 1 })
  },

  setScrollWindow: (startX, endX) => {
    cancelPendingScroll()
    set((s) => {
      const next = {
        ...s,
        scrollWindowStartX: Math.max(0, startX),
        scrollWindowEndX: endX == null ? null : Math.max(Math.max(0, startX), endX),
      }
      return {
        scrollWindowStartX: next.scrollWindowStartX,
        scrollWindowEndX: next.scrollWindowEndX,
        scrollX: clampScrollXFor(next, s.scrollX),
        dirty: true,
        dirtyEpoch: s.dirtyEpoch + 1,
      }
    })
  },

  clearScrollWindow: () => {
    cancelPendingScroll()
    set((s) => ({
      scrollWindowStartX: 0,
      scrollWindowEndX: null,
      scrollX: clampScrollXFor({ ...s, scrollWindowStartX: 0, scrollWindowEndX: null }, s.scrollX),
      dirty: true,
      dirtyEpoch: s.dirtyEpoch + 1,
    }))
  },

  setViewportWidth: (width) => {
    const s = get()
    if (width <= 0 || width === s.viewportWidth) return
    // A wider viewport shrinks maxScrollX; re-clamp so a now-too-large scrollX can't
    // leave blank space (no date header / day grid) past the content end.
    set({ viewportWidth: width, scrollX: clampScrollXFor({ ...s, viewportWidth: width }, s.scrollX) })
  },

  setContentHours: (hours) => {
    const h = Math.max(0, hours)
    const s = get()
    if (h === s.contentHours) return
    // Shrinking the date range shrinks maxScrollX; re-clamp the stored scrollX so the
    // right edge snaps back onto the last day instead of stranding the view past it.
    set({ contentHours: h, scrollX: clampScrollXFor({ ...s, contentHours: h }, s.scrollX), dirty: true, dirtyEpoch: s.dirtyEpoch + 1 })
  },

  fitToRange: () => {
    // Show the whole selected period at once: choose pxPerHour so the full range
    // fills the timeline exactly (content width = viewportWidth), and reset scroll
    // to the start — left edge = start date, right edge = end date. Uses the MEASURED
    // viewport width (exact hours) so no tail days get clipped; falls back to the
    // window estimate before the axis has been measured.
    cancelPendingScroll()
    const { zoomMax, viewportWidth } = get()
    const { dateRange } = useFilterStore.getState()
    const totalHours = Math.max(1, (dateRange.end.getTime() - dateRange.start.getTime()) / 3_600_000)
    const width = viewportWidth > 0 ? viewportWidth : window.innerWidth - 262
    const fitPx = width / totalHours
    set((s) => ({ pxPerHour: Math.min(zoomMax, fitPx), scrollX: 0, scrollWindowStartX: 0, scrollWindowEndX: null, dirty: true, dirtyEpoch: s.dirtyEpoch + 1 }))
  },

  fitToFirstMonth: () => {
    // First-open default: fill the viewport with the FIRST calendar month of the
    // range (left edge = the 1st, right edge = the last day of that month) instead
    // of the previous ~6-day default zoom — the rest of the range stays scroll-right.
    // Delegates to zoomToMonth (display-tz month math) with the measured axis width.
    const { dateRange } = useFilterStore.getState()
    const tz = useTimezoneStore.getState().timezone
    // Calendar year/month (display tz) containing the range start = the first month.
    const [year, month] = new Intl.DateTimeFormat('en-CA', { timeZone: tz })
      .format(dateRange.start)
      .split('-')
      .map(Number)
    get().zoomToMonth(year, month - 1, dateRange.start, get().viewportWidth || undefined)
  },

  setScrollXCoalesced: (x) => {
    // Lower-clamp here; the upper clamp (maxScrollX) is applied in flushScroll against
    // the live state, so it stays correct even if zoom/range change before the flush.
    pendingAbsX = Math.max(minScrollXFor(useGanttViewStore.getState()), x)
    pendingDx = 0
    scheduleScrollFlush()
  },

  setScrollY: (y) => {
    set((s) => ({ scrollY: Math.max(0, y), dirty: true, dirtyEpoch: s.dirtyEpoch + 1 }))
  },

  scroll: (dx, dy) => {
    pendingDx += dx
    pendingDy += dy
    scheduleScrollFlush()
  },

  selectTask: (taskId) => {
    set((s) => ({ selectedTaskIds: new Set([taskId]), dirty: true, dirtyEpoch: s.dirtyEpoch + 1 }))
  },

  toggleTaskSelection: (taskId) => {
    set((state) => {
      const next = new Set(state.selectedTaskIds)
      if (next.has(taskId)) {
        next.delete(taskId)
      } else {
        next.add(taskId)
      }
      return { selectedTaskIds: next, dirty: true, dirtyEpoch: state.dirtyEpoch + 1 }
    })
  },

  selectTasks: (taskIds) => {
    set((s) => ({ selectedTaskIds: new Set(taskIds), dirty: true, dirtyEpoch: s.dirtyEpoch + 1 }))
  },

  clearSelection: () => {
    set((s) => ({ selectedTaskIds: new Set(), dirty: true, dirtyEpoch: s.dirtyEpoch + 1 }))
  },

  setHoveredTask: (taskId, clientX, clientY) => {
    const state = get()
    const hasPos = clientX !== undefined && clientY !== undefined
    // QW5: 悬停目标未变（仍是同一 task、且非机组悬停）时，Canvas 高亮无需重绘——
    // 只更新浮动 tooltip 的位置，不置 dirty，避免每次 mousemove 触发整面板重绘。
    if (state.hoveredTaskId === taskId && state.hoveredCrewId === null) {
      if (hasPos) set({ hoverPosition: { x: clientX, y: clientY } })
      return
    }
    const update: Partial<GanttViewStore> = { hoveredTaskId: taskId, hoveredCrewId: null, dirty: true, dirtyEpoch: state.dirtyEpoch + 1 }
    if (hasPos) {
      update.hoverPosition = { x: clientX, y: clientY }
    }
    set(update)
  },

  setHoveredCrew: (crewId, clientX, clientY) => {
    const state = get()
    const hasPos = clientX !== undefined && clientY !== undefined
    // QW5（同 setHoveredTask）：悬停目标未变时不置 dirty，避免左侧表头每次 mousemove
    // 触发全部面板重绘；只更新浮动 tooltip 位置。
    if (state.hoveredCrewId === crewId && state.hoveredTaskId === null) {
      if (hasPos) set({ hoverPosition: { x: clientX, y: clientY } })
      return
    }
    const update: Partial<GanttViewStore> = { hoveredCrewId: crewId, hoveredTaskId: null, dirty: true, dirtyEpoch: state.dirtyEpoch + 1 }
    if (hasPos) {
      update.hoverPosition = { x: clientX, y: clientY }
    }
    set(update)
  },

  zoomToMonth: (year, month, rangeStart, viewportWidth) => {
    cancelPendingScroll()
    const { zoomMin, zoomMax } = get()
    const tz = useTimezoneStore.getState().timezone
    const pad2 = (n: number): string => String(n).padStart(2, '0')
    // Display-tz month boundaries (month is 0-based): [1st 00:00, next month 1st 00:00)
    const monthStart = calendarDateToUtcMidnight(`${year}-${pad2(month + 1)}-01`, tz)
    const nextFirst = month === 11 ? `${year + 1}-01-01` : `${year}-${pad2(month + 2)}-01`
    const monthEnd = calendarDateToUtcMidnight(nextFirst, tz)
    const anchorMs = monthStart.getTime() + MONTH_VIEWPORT_ANCHOR_BIAS_MS
    // Exact (possibly fractional with DST) — use a 00:01 anchor so month-scoped
    // header stats cannot resolve to the previous month at the boundary.
    const hours = Math.max(1, (monthEnd.getTime() - anchorMs) / 3_600_000)
    const width = viewportWidth ?? window.innerWidth - 262
    const newPxPerHour = Math.max(zoomMin, Math.min(zoomMax, width / hours))
    const offsetHours = Math.max(0, (anchorMs - rangeStart.getTime()) / 3_600_000)
    const windowStartX = offsetHours * newPxPerHour
    const windowEndX = windowStartX + hours * newPxPerHour
    // Last month can extend past rangeEnd; clamp so the view doesn't land beyond the data.
    // `width` is the resolved axis width (param or window fallback) — reuse it for the clamp.
    const scrollX = clampScrollXFor({
      ...get(),
      pxPerHour: newPxPerHour,
      viewportWidth: width,
      scrollWindowStartX: windowStartX,
      scrollWindowEndX: windowEndX,
    }, windowStartX)

    set((s) => ({
      pxPerHour: newPxPerHour,
      scrollX,
      scrollWindowStartX: windowStartX,
      scrollWindowEndX: windowEndX,
      dirty: true,
      dirtyEpoch: s.dirtyEpoch + 1,
    }))
  },

  // Zoom to the intersection of the RP and the already-loaded Gantt range.
  // Navigation must never widen the backend range; the scrollbar continues to
  // represent the complete loaded range.
  zoomToRp: (rpStartMs, rpEndMs, rangeStart, viewportWidth) => {
    cancelPendingScroll()
    const { zoomMin, zoomMax } = get()
    const rangeStartMs = rangeStart.getTime()
    const loadedHours = get().contentHours
    const loadedEndMs = rangeStartMs + Math.max(0, loadedHours) * HOUR_MS
    const visibleStartMs = Math.max(rpStartMs, rangeStartMs)
    const visibleEndMs = loadedHours > 0 ? Math.min(rpEndMs, loadedEndMs) : rpEndMs
    const anchorMs = visibleStartMs
    const hours = Math.max(1, (visibleEndMs - visibleStartMs) / HOUR_MS)
    const width = viewportWidth ?? window.innerWidth - 262
    const newPxPerHour = Math.max(zoomMin, Math.min(zoomMax, width / hours))
    const anchorX = Math.max(0, (anchorMs - rangeStartMs) / HOUR_MS) * newPxPerHour
    const scrollWindowStartX = 0
    const scrollWindowEndX = loadedHours > 0 ? loadedHours * newPxPerHour : null
    const nextState = { ...get(), pxPerHour: newPxPerHour, viewportWidth: width, scrollWindowStartX, scrollWindowEndX }
    const scrollX = clampScrollXFor(nextState, anchorX)
    set((s) => ({
      pxPerHour: newPxPerHour,
      scrollX,
      scrollWindowStartX,
      scrollWindowEndX,
      dirty: true,
      dirtyEpoch: s.dirtyEpoch + 1,
    }))
  },

  markDirty: () => set((s) => ({ dirty: true, dirtyEpoch: s.dirtyEpoch + 1 })),
  markClean: () => set({ dirty: false }),

  refreshing: false,

  fetchPaneData: async (paneType: 'roster' | 'pairing' | 'flight') => {
    const { selectedCrewIds } = useCrewStore.getState()
    const { dateRange, pairing: pairingFilter, flight: flightFilter, appliedFilters } = useFilterStore.getState()

    // Live 空启动：首次 Filter Apply 之前不拉任何数据 —— 新增面板先以空面板
    // 挂载，首次 Apply 会按可见面板类型统一拉取（applyGanttFilters）。
    if (appliedFilters === null) return

    switch (paneType) {
      case 'roster':
        // Roster needs selected crews
        if (selectedCrewIds.length > 0) {
          // Skip if already loaded
          const rosterStore = useRosterStore.getState()
          if (rosterStore.main.baseItems.length === 0) {
            await rosterStore.fetchRoster('main', selectedCrewIds, dateRange)
          }
        }
        break
      case 'pairing':
        // Skip if already loaded
        const pairingStore = usePairingStore.getState()
        if (pairingStore.items.length === 0) {
          await pairingStore.fetchPairings(dateRange, pairingFilter)
        }
        break
      case 'flight':
        // Skip if already loaded
        const flightStore = useFlightStore.getState()
        if (flightStore.items.length === 0) {
          await flightStore.fetchFlights(dateRange, flightFilter)
        }
        break
    }
    get().markDirty()
  },

  refreshRosterPane: async () => {
    const { selectedCrewIds } = useCrewStore.getState()
    const { dateRange } = useFilterStore.getState()
    if (selectedCrewIds.length === 0) return
    await useRosterStore.getState().fetchRoster('main', selectedCrewIds, dateRange)
    get().markDirty()
    setTimeout(() => {
      const items = useRosterStore.getState().main.rosterItems
      if (items.length > 0) {
        useRuleCheckStore.getState().checkCrews(selectedCrewIds, items)
      }
    }, 500)
  },

  refreshAllPanes: async () => {
    set({ refreshing: true })
    try {
      const { selectedCrewIds } = useCrewStore.getState()
      const { dateRange, pairing: pairingFilter, flight: flightFilter } = useFilterStore.getState()
      const panes = useLayoutStore.getState().panes
      const visibleTypes = new Set<string>()
      for (const [, pane] of panes) visibleTypes.add(pane.type)

      // 首屏：roster 走渐进式（快速首屏 + 后台追加）。
      if (visibleTypes.has('roster') && selectedCrewIds.length > 0) {
        await get().loadRosterProgressive(selectedCrewIds, dateRange)
      }

      // P1-1：pairing / flight / 规则检查推迟到 roster 首屏之后再发起，避免与首屏争用
      // 网络与主线程。用 requestIdleCallback（无则退化为 setTimeout）。
      const followups = async () => {
        if (visibleTypes.has('pairing')) {
          await usePairingStore.getState().fetchPairings(dateRange, pairingFilter)
        }
        if (visibleTypes.has('flight')) {
          await useFlightStore.getState().fetchFlights(dateRange, flightFilter)
        }
        get().markDirty()
        const items = useRosterStore.getState().main.rosterItems
        if (items.length > 0) {
          markPhase('rule-check:first-start')
          useRuleCheckStore.getState().checkCrews(selectedCrewIds, items)
        }
      }
      const ric = (globalThis as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback
      if (ric) ric(() => { void followups() })
      else setTimeout(() => { void followups() }, 0)
    } finally {
      set({ refreshing: false })
    }
  },

  loadRosterProgressive: async (crewIds, dateRange, firstWindowDays, append = false) => {
    const rosterStore = useRosterStore.getState()
    if (crewIds.length === 0) {
      await rosterStore.fetchRoster('main', [], dateRange)
      return
    }
    // Default first window = the visible MONTH (never a fixed 14 days — that shrinks the
    // roster on any path that doesn't pass an explicit window).
    const fw = firstWindowDays ?? daysToEndOfMonth(dateRange.start)
    // append=true → MERGE the first window onto what's already shown (phase-2 keeps the
    // phase-1 first-paint rows in place, no replace/flicker). append=false → fresh replace.
    const loadFirstWindow = append ? rosterStore.appendRoster : rosterStore.fetchRoster
    const spanDays = differenceInDays(dateRange.end, dateRange.start)
    markPhase('roster:first-request:start')
    if (spanDays > fw) {
      // First window paints fast; the rest is background-appended (full range preserved).
      // The window must not be SMALLER than what's already shown (e.g. the windowed
      // first-paint loaded the full month) — otherwise the roster visibly shrinks.
      const narrowEnd = addDays(dateRange.start, fw)
      await loadFirstWindow('main', crewIds, { start: dateRange.start, end: narrowEnd })
      markPhase('roster:first-request:end')
      get().markDirty()
      void rosterStore.appendRoster('main', crewIds, { start: addDays(narrowEnd, 1), end: dateRange.end })
    } else {
      await loadFirstWindow('main', crewIds, dateRange)
      markPhase('roster:first-request:end')
      get().markDirty()
    }
  },

  // 单轮全量 roster 分批并发加载：按 crew 拆批，用 rosterApi.getView 并发拉取（不经
  // appendRoster 的共享 abort/seq 机制——那为 loadMore 设计，并发会互相丢批），合并后
  // 一次性 setMainRoster（replace，无重复）。每批完成更新 main.progress（0-100）。
  loadRosterBatched: async (crewIds, dateRange, startProgress = 0) => {
    // ~103 crew/batch keeps each response ~15-20MB — large batches (205 crew × wide
    // range = ~35MB) time out/fail under concurrent axios requests, dropping whole crews.
    const BATCH = 103
    const batches: string[][] = []
    for (let i = 0; i < crewIds.length; i += BATCH) batches.push(crewIds.slice(i, i + BATCH))
    if (batches.length === 0) {
      useRosterStore.setState((s) => ({ main: { ...s.main, progress: null } }))
      return
    }
    // Show the bar immediately. startProgress carries the crew-phase progress (0-15) so
    // the bar keeps moving instead of resetting to 0 when the roster batches begin.
    useRosterStore.setState((s) => ({ main: { ...s.main, progress: startProgress } }))
    // During the batched load, hold fullyLoaded=false so use-gantt-viewport's loadMore
    // append never races the batches.
    useCrewStore.getState().markPartiallyLoaded()
    const formatDate = (d: Date): string => d.toISOString().slice(0, 10)
    const startYmd = formatDate(dateRange.start)
    const endYmd = formatDate(dateRange.end)
    // Crew phase already advanced the bar to `startProgress` (0-15); roster batches push
    // it from there to 100 based on completed batches (proportional to crew count).
    markPhase('roster:first-request:start')
    // Recursive half-split fallback: a batch that fails (large payload, transient network,
    // server hiccup) is split in half and retried — never silently drop a whole crew set.
    // Mirrors connector-server's upstream-fetch degradation (10-day windows → halve on error).
    const fetchChunk = async (chunk: string[]): Promise<RosterItem[]> => {
      try {
        return await rosterApi.getView(chunk, startYmd, endYmd)
      } catch (err) {
        if (chunk.length <= 1) {
          console.warn('[GanttView] roster chunk permanently failed:', err)
          return []
        }
        const mid = Math.ceil(chunk.length / 2)
        const [left, right] = await Promise.all([fetchChunk(chunk.slice(0, mid)), fetchChunk(chunk.slice(mid))])
        return [...left, ...right]
      }
    }
    let completed = 0
    const settled = await Promise.allSettled(
      batches.map(async (batch) => {
        const items = await fetchChunk(batch)
        // Monotonic progress: count completed batches (concurrent completion order
        // varies, so indexing by batch would make the bar jump backwards).
        completed += 1
        const pct = startProgress + (completed / batches.length) * (100 - startProgress)
        useRosterStore.setState((s) => ({ main: { ...s.main, progress: Math.round(pct) } }))
        return items
      }),
    )
    const merged = new Map<number, RosterItem>()
    for (const result of settled) {
      if (result.status === 'fulfilled') {
        for (const item of result.value) merged.set(item.id, item)
      } else {
        console.warn('[GanttView] roster batch permanently failed:', result.reason)
      }
    }
    useRosterStore.getState().setMainRoster([...merged.values()])
    markPhase('roster:first-request:end')
    useRosterStore.setState((s) => ({ main: { ...s.main, progress: null } }))
    useCrewStore.getState().markFullyLoaded()
    get().markDirty()
  },

  loadFromBootstrap: async (dateRange, opts) => {
    const crewStore = useCrewStore.getState()
    const rosterStore = useRosterStore.getState()
    // pageSize=0 = full slim crew; >0 = windowed first page (first N crew, server-sorted).
    const pageSize = opts?.pageSize ?? 0
    const windowDays = opts?.rosterWindowDays ?? daysToEndOfMonth(dateRange.start)
    try {
      markPhase('bootstrap:start')
      const data = await ganttApi.bootstrap({
        startDate: toYmd(dateRange.start),
        endDate: toYmd(dateRange.end),
        pageSize,
        // Windowed first page (pageSize>0): sort by RANK so the first N crew == the roster
        // pane's displayed top rows (it sorts rank→crewId). Otherwise the pane re-sorts when
        // the full set loads and high-rank crew jump to the top without roster ("shrink").
        sortBy: pageSize > 0 ? 'rank' : crewStore.sortBy,
        sortOrder: pageSize > 0 ? 'asc' : crewStore.sortOrder,
        rosterWindowDays: windowDays,
      })
      // crew + first-window roster in one round-trip
      crewStore.applyCrewListResult(data.crew)
      rosterStore.setMainRoster(data.roster)
      markPhase('roster:first-request:end')
      get().markDirty()
      // Background-append the rest of the window's days for the loaded crew — UNLESS the
      // caller will reload the full roster itself (windowed first-paint → skipAppend).
      const spanDays = differenceInDays(dateRange.end, dateRange.start)
      if (!opts?.skipAppend && spanDays > windowDays) {
        const narrowEnd = addDays(dateRange.start, windowDays)
        const crewIds = data.crew.items.map((c) => c.crewId)
        void rosterStore.appendRoster('main', crewIds, { start: addDays(narrowEnd, 1), end: dateRange.end })
      }
    } catch (err) {
      // 任意失败回退到成熟路径（crew → 渐进式 roster），保证首屏不被 bootstrap 拖垮。
      console.error('[GanttView] bootstrap failed, falling back to progressive load:', err)
      await crewStore.fetchCrews()
      await get().loadRosterProgressive(useCrewStore.getState().selectedCrewIds, dateRange)
    }
  },
}))
