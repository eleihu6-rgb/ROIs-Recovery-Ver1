// gantt/src/components/scenario-gantt/scenario-time-axis.tsx
// Mirrors Live Gantt's TimeAxis — double-click reset, drag-to-zoom, right-click month menu.
import { useRef, useEffect, useCallback, useState } from 'react'
import { useCanvasResize } from '@/hooks/use-canvas-resize'
import { getScenarioGanttStore } from '@/stores/scenario-gantt-store'
import { useTimezoneStore } from '@/stores/timezone-store'
import { drawTimelineHeader } from '@/components/gantt/renderers/base-renderer'
import type { MonthLabelHit, BaseRenderContext } from '@/components/gantt/renderers/base-renderer'
import { calendarDateInTimeZone, calendarDateToUtcMidnight, endOfCalendarDayUtc, xToTime } from '@/components/gantt/gantt-utils'
import { differenceInHours } from 'date-fns'
import { TimeAxisRpMenu } from '@/components/gantt/time-axis-rp-menu'
import type { RosterPeriodOption } from '@/services/roster-period-api'
import { useRosterPeriodStore } from '@/stores/roster-period-store'
import { useUiStore } from '@/stores/ui-store'

interface ScenarioTimeAxisProps {
  scenarioId: number
  className?: string
}

export const ScenarioTimeAxis = ({ scenarioId, className }: ScenarioTimeAxisProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const { canvasRef, size } = useCanvasResize(containerRef)
  const rafRef = useRef<number>(0)
  const monthLabelHitsRef = useRef<MonthLabelHit[]>([])

  const useStore = getScenarioGanttStore(scenarioId)
  const pxPerHour = useStore((s) => s.pxPerHour)
  const scrollX = useStore((s) => s.scrollX)
  const data = useStore((s) => s.data)
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

  const rangeStart = data ? new Date(data.strDtLoc) : new Date()
  const rangeEnd = data ? new Date(data.endDtLoc) : new Date()

  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || size.width === 0 || size.height === 0 || !data) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    ctx.save()
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, size.width, size.height)

    const rc: BaseRenderContext = {
      ctx, dpr,
      canvasWidth: size.width,
      canvasHeight: size.height,
      scrollX, scrollY: 0, pxPerHour,
      rangeStart,
      rangeEnd,
      timezone,
      rosterPeriods,
      totalRows: 0, dropTargetRow: -1, frozenRowCount: 0,
      selectedRowIndices: new Set<number>(),
      headerHeight: size.height,
    }

    drawTimelineHeader(rc, monthLabelHitsRef.current)
    ctx.restore()
  }, [canvasRef, size, scrollX, pxPerHour, data, timezone, rangeStart, rangeEnd, rosterPeriods])

  const renderRef = useRef(render)
  useEffect(() => { renderRef.current = render }, [render])

  useEffect(() => {
    rafRef.current = requestAnimationFrame(() => renderRef.current())
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
  }, [render, size])

  // ── Month-label hit testing ──

  // ── Mouse handlers ──

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

      const store = getScenarioGanttStore(scenarioId).getState()
      const viewportWidth = rect.width

      if (endX >= dragStart) {
        // Drag right → zoom in to selected range
        const left = Math.max(0, dragStart)
        const right = Math.min(rect.width, endX)

        const timeStart = xToTime(left + store.scrollX, rangeStart, store.pxPerHour)
        const timeEnd = xToTime(right + store.scrollX, rangeStart, store.pxPerHour)
        const hours = differenceInHours(timeEnd, timeStart)
        if (hours < 1) return

        const newPxPerHour = Math.max(store.zoomMin, Math.min(store.zoomMax, viewportWidth / hours))
        const offsetHours = Math.max(0, differenceInHours(timeStart, rangeStart))
        const newScrollX = Math.max(0, offsetHours * newPxPerHour)

        getScenarioGanttStore(scenarioId).setState({
          pxPerHour: newPxPerHour,
          scrollX: Math.min(
            Math.max(0, newScrollX),
            Math.max(0, ((rangeEnd.getTime() - rangeStart.getTime()) / 3_600_000) * newPxPerHour - viewportWidth),
          ),
          scrollWindowStartX: 0,
          scrollWindowEndX: null,
        })
      } else {
        // Drag left → zoom out proportionally
        const ratio = 1 + (dragDist / viewportWidth) * 3
        const newPxPerHour = Math.max(store.zoomMin, store.pxPerHour / ratio)

        const viewCenter = store.scrollX + viewportWidth / 2
        const newScrollX = newPxPerHour <= store.zoomMin * 1.05
          ? 0
          : Math.max(0, viewCenter * (newPxPerHour / store.pxPerHour) - viewportWidth / 2)

        getScenarioGanttStore(scenarioId).setState({
          pxPerHour: newPxPerHour,
          scrollX: Math.min(
            Math.max(0, newScrollX),
            Math.max(0, ((rangeEnd.getTime() - rangeStart.getTime()) / 3_600_000) * newPxPerHour - viewportWidth),
          ),
          scrollWindowStartX: 0,
          scrollWindowEndX: null,
        })
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [dragging, dragStart, scenarioId, rangeStart, rangeEnd])

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const store = getScenarioGanttStore(scenarioId).getState()
    const time = xToTime(e.clientX - rect.left + store.scrollX, rangeStart, store.pxPerHour)
    openDayStatistics(calendarDateInTimeZone(time, timezone), scenarioId)
  }, [openDayStatistics, rangeStart, scenarioId, timezone])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const store = getScenarioGanttStore(scenarioId).getState()
    const time = xToTime(e.clientX - rect.left + store.scrollX, rangeStart, store.pxPerHour)
    setMenuDate(calendarDateInTimeZone(time, timezone))
    setMenuPos({ x: e.clientX, y: e.clientY })
    setMenuOpen(true)
  }, [rangeStart, scenarioId, timezone])

  // GO TO RPDate: zoom the scenario viewport to the RP's [rp_start, rp_end].
  // Scenario range is fixed by the scenario definition — no window widening.
  const handleSelectRp = useCallback((rp: RosterPeriodOption) => {
    const rpStartMs = calendarDateToUtcMidnight(rp.rpStart, timezone).getTime()
    const rpEndMs = endOfCalendarDayUtc(rp.rpEnd, timezone).getTime()
    const store = getScenarioGanttStore(scenarioId)
    store.getState().zoomToRp(rpStartMs, rpEndMs, rangeStart, size.width > 0 ? size.width : undefined)
  }, [scenarioId, rangeStart, size.width, timezone])

  // Selection overlay
  const selLeft = Math.min(dragStart, dragEnd)
  const selWidth = Math.abs(dragEnd - dragStart)

  return (
    <>
      <div
        ref={containerRef}
        className={['relative overflow-hidden', className ?? 'shrink-0'].join(' ')}
        data-testid="sg-time-axis"
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
            <div className="absolute left-0 top-0 bottom-0 w-px bg-primary/80" />
            <div className="absolute right-0 top-0 bottom-0 w-px bg-primary/80" />
          </div>
        )}
      </div>

      <TimeAxisRpMenu
        open={menuOpen}
        x={menuPos.x}
        y={menuPos.y}
        windowStart={rangeStart.getTime()}
        windowEnd={rangeEnd.getTime()}
        onSelectRp={handleSelectRp}
        onOpenDailyStatistics={() => {
          if (menuDate) openDayStatistics(menuDate, scenarioId)
        }}
        onClose={() => setMenuOpen(false)}
      />
    </>
  )
}
