import { useRef, useEffect, useCallback, useState } from 'react'
import { useCanvasResize } from '@/hooks/use-canvas-resize'
import { useGanttViewStore, cancelPendingScroll } from '@/stores/gantt-view-store'
import { usePaneStore } from '@/stores/pane-store'
import { useFilterStore } from '@/stores/filter-store'
import { useTimezoneStore } from '@/stores/timezone-store'
import { useUiStore } from '@/stores/ui-store'
import { drawTimelineHeader } from './renderers/base-renderer'
import type { MonthLabelHit } from './renderers/base-renderer'
import { calendarDateInTimeZone, calendarDateToUtcMidnight, endOfCalendarDayUtc, xToTime } from './gantt-utils'
import type { BaseRenderContext } from './renderers/base-renderer'
import { TimeAxisRpMenu } from './time-axis-rp-menu'
import type { RosterPeriodOption } from '@/services/roster-period-api'
import { useRosterPeriodStore } from '@/stores/roster-period-store'
import { differenceInHours } from 'date-fns'

interface TimeAxisProps {
  /** Extra classes for the container (e.g. flex sizing when embedded in a toolbar row). */
  className?: string
  /** Test ID for the container element */
  testId?: string
}

/**
 * Shared time axis with:
 * - Canvas rendering (date/month labels + grid lines)
 * - Right-click menu (zoom to month)
 * - Left-click drag selection (zoom to selected time range)
 */
export const TimeAxis = ({ className, testId }: TimeAxisProps = {}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const { canvasRef, size } = useCanvasResize(containerRef)
  const rafRef = useRef<number>(0)
  // F54-P05: per-axis month-label hit regions (each pane toolbar has its own TimeAxis;
  // a module-global array would be owned by whichever axis drew last)
  const monthLabelHitsRef = useRef<MonthLabelHit[]>([])

  const pxPerHour = useGanttViewStore((s) => s.pxPerHour)
  const scrollX = useGanttViewStore((s) => s.scrollX)
  const dirty = useGanttViewStore((s) => s.dirty)
  const setViewportWidth = useGanttViewStore((s) => s.setViewportWidth)
  const setContentHours = useGanttViewStore((s) => s.setContentHours)
  const dateRange = usePaneStore((s) => s.dateRange)
  const timezone = useTimezoneStore((s) => s.timezone)
  const rosterPeriods = useRosterPeriodStore((s) => s.items)
  const openDayStatistics = useUiStore((s) => s.openGanttDayStatistics)

  // Right-click menu
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 })
  const [menuDate, setMenuDate] = useState<string | null>(null)

  // Drag selection state
  const [dragging, setDragging] = useState(false)
  const [dragStart, setDragStart] = useState(0)
  const [dragEnd, setDragEnd] = useState(0)

  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || size.width === 0 || size.height === 0) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    ctx.save()
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, size.width, size.height)

    const baseCtx: BaseRenderContext = {
      ctx, dpr,
      canvasWidth: size.width,
      canvasHeight: size.height,
      scrollX, scrollY: 0, pxPerHour,
      rangeStart: dateRange.start,
      rangeEnd: dateRange.end,
      timezone,
      rosterPeriods,
      totalRows: 0, dropTargetRow: -1, frozenRowCount: 0, selectedRowIndices: new Set<number>(),
      headerHeight: size.height,
    }

    drawTimelineHeader(baseCtx, monthLabelHitsRef.current)

    ctx.restore()
  }, [canvasRef, size, scrollX, pxPerHour, dateRange, timezone, rosterPeriods])

  // Always-latest render reference so a pending RAF uses the newest closure.
  const renderRef = useRef(render)
  renderRef.current = render

  // Redraw when visual inputs change (render identity: scrollX/zoom/range/timezone/size)
  // or while dirty is set (global repaint requests, e.g. theme switch). Skipping the
  // dirty→false edge (markClean fires after every canvas render) halves axis redraws —
  // with one axis per pane toolbar that waste multiplies by pane count.
  // Same discipline as PaneCanvas: do NOT cancel the pending RAF in the effect cleanup —
  // a dirty flip from another canvas's markClean would cancel it before it fires.
  // Cancel only on unmount.
  const lastScheduledRenderRef = useRef<typeof render | null>(null)
  useEffect(() => {
    const renderChanged = lastScheduledRenderRef.current !== render
    if (!dirty && !renderChanged) return
    lastScheduledRenderRef.current = render
    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0
        renderRef.current()
      })
    }
  }, [render, dirty])

  // Publish the measured timeline width so zoom-bounds + fit-to-range use the real
  // axis width (not the window-innerWidth estimate, which over-counts app chrome).
  useEffect(() => {
    if (size.width > 0) setViewportWidth(size.width)
  }, [size.width, setViewportWidth])

  // Publish the rendered date-range span (hours) so the store can clamp horizontal
  // scroll to the content's right edge — same dateRange the canvas draws with, so the
  // clamp can never disagree with what's painted.
  useEffect(() => {
    setContentHours((dateRange.end.getTime() - dateRange.start.getTime()) / 3_600_000)
  }, [dateRange.start, dateRange.end, setContentHours])

  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        // Reset so a StrictMode remount (cleanup + re-run) can schedule again —
        // a stale non-zero id would permanently block the !rafRef.current guard.
        rafRef.current = 0
      }
      // Force the remounted effect to treat the render as unscheduled.
      lastScheduledRenderRef.current = null
    }
  }, [])

  // ── Drag selection handlers ──

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    if (e.detail > 1) return
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const localX = e.clientX - rect.left

    // Elsewhere → start drag selection
    setDragStart(localX)
    setDragEnd(localX)
    setDragging(true)
  }, [])

  /** Timeline header uses the same neutral cursor for labels and day cells. */
  const handleMouseHover = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect || !containerRef.current) return
    containerRef.current.style.cursor = 'default'
  }, [])

  useEffect(() => {
    if (!dragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      setDragEnd(e.clientX - rect.left)
    }

    const handleMouseUp = (e: MouseEvent) => {
      setDragging(false)

      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const endX = e.clientX - rect.left
      const dragDist = Math.abs(endX - dragStart)
      if (dragDist < 10) return

      const store = useGanttViewStore.getState()
      const paneStore = usePaneStore.getState()
      const rangeStart = paneStore.dateRange.start
      const viewportWidth = rect.width

      if (endX >= dragStart) {
        // ── Drag right → Zoom In to selected range ──
        const left = Math.max(0, dragStart)
        const right = Math.min(rect.width, endX)

        const timeStart = xToTime(left + store.scrollX, rangeStart, store.pxPerHour)
        const timeEnd = xToTime(right + store.scrollX, rangeStart, store.pxPerHour)
        const hours = differenceInHours(timeEnd, timeStart)
        if (hours < 1) return

        const newPxPerHour = Math.max(store.zoomMin, Math.min(store.zoomMax, viewportWidth / hours))
        const offsetHours = Math.max(0, differenceInHours(timeStart, rangeStart))
        const newScrollX = Math.max(0, offsetHours * newPxPerHour)

        cancelPendingScroll()
        useGanttViewStore.setState((state) => ({
          pxPerHour: newPxPerHour,
          scrollX: Math.min(
            Math.max(0, newScrollX),
            Math.max(0, state.contentHours * newPxPerHour - viewportWidth),
          ),
          // Manual zoom changes the coordinate system. Any RP navigation window
          // stored in old pixels is no longer valid for scrollbar geometry.
          scrollWindowStartX: 0,
          scrollWindowEndX: null,
          dirty: true,
          dirtyEpoch: state.dirtyEpoch + 1,
        }))
      } else {
        // ── Drag left → Zoom Out proportionally ──
        // Drag distance as ratio of viewport → zoom out by that factor
        const ratio = 1 + (dragDist / viewportWidth) * 3 // 3x multiplier for responsiveness
        const newPxPerHour = Math.max(store.zoomMin, store.pxPerHour / ratio)

        // Keep view center stable
        const viewCenter = store.scrollX + viewportWidth / 2
        const newScrollX = newPxPerHour <= store.zoomMin * 1.05
          ? 0
          : Math.max(0, viewCenter * (newPxPerHour / store.pxPerHour) - viewportWidth / 2)

        cancelPendingScroll()
        useGanttViewStore.setState((state) => ({
          pxPerHour: newPxPerHour,
          scrollX: Math.min(
            Math.max(0, newScrollX),
            Math.max(0, state.contentHours * newPxPerHour - viewportWidth),
          ),
          scrollWindowStartX: 0,
          scrollWindowEndX: null,
          dirty: true,
          dirtyEpoch: state.dirtyEpoch + 1,
        }))
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [dragging, dragStart])

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const store = useGanttViewStore.getState()
    const time = xToTime(e.clientX - rect.left + store.scrollX, dateRange.start, store.pxPerHour)
    openDayStatistics(calendarDateInTimeZone(time, timezone))
  }, [dateRange.start, openDayStatistics, timezone])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const store = useGanttViewStore.getState()
    const time = xToTime(e.clientX - rect.left + store.scrollX, dateRange.start, store.pxPerHour)
    setMenuDate(calendarDateInTimeZone(time, timezone))
    setMenuPos({ x: e.clientX, y: e.clientY })
    setMenuOpen(true)
  }, [dateRange.start, timezone])

  // GO TO RPDate is viewport-only. Do not widen dateRange or apply filters here:
  // backend loads are reserved for RP range selection and explicit filter apply.
  const handleSelectRp = useCallback((rp: RosterPeriodOption) => {
    const rpStartMs = calendarDateToUtcMidnight(rp.rpStart, timezone).getTime()
    const rpEndMs = endOfCalendarDayUtc(rp.rpEnd, timezone).getTime()
    const rangeStart = useFilterStore.getState().dateRange.start
    useGanttViewStore.getState().zoomToRp(rpStartMs, rpEndMs, rangeStart, size.width > 0 ? size.width : undefined)
  }, [size.width, timezone])

  // Selection overlay coordinates
  const selLeft = Math.min(dragStart, dragEnd)
  const selWidth = Math.abs(dragEnd - dragStart)

  return (
    <>
      <div
        ref={containerRef}
        className={['relative overflow-hidden', className ?? 'shrink-0'].join(' ')}
        data-testid={testId}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseHover}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
      >
        <canvas ref={canvasRef} className="absolute inset-0" />

        {/* Drag selection overlay */}
        {dragging && selWidth > 2 && (
          <div
            className="pointer-events-none absolute top-0 bottom-0 border-x border-primary/60 bg-primary/15"
            style={{ left: selLeft, width: selWidth }}
          >
            {/* Edge indicators */}
            <div className="absolute left-0 top-0 bottom-0 w-px bg-primary/80" />
            <div className="absolute right-0 top-0 bottom-0 w-px bg-primary/80" />
          </div>
        )}
      </div>

      <TimeAxisRpMenu
        open={menuOpen}
        x={menuPos.x}
        y={menuPos.y}
        windowStart={dateRange.start.getTime()}
        windowEnd={dateRange.end.getTime()}
        onSelectRp={handleSelectRp}
        onOpenDailyStatistics={() => {
          if (menuDate) openDayStatistics(menuDate)
        }}
        onClose={() => setMenuOpen(false)}
      />
    </>
  )
}
