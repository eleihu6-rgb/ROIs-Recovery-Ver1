import { useRef, useEffect, useCallback, useState, useMemo } from 'react'
import { formatUiDate } from '@rois/ui'
import { useCanvasResize } from '@/hooks/use-canvas-resize'
import { useGanttViewStore } from '@/stores/gantt-view-store'
import { usePaneStore } from '@/stores/pane-store'
import { useSummaryStore } from '@/stores/summary-store'
import { renderSummaryBar } from '@/components/gantt/renderers/summary-renderer'
import type { DaySummary, SummaryRenderContext } from '@/components/gantt/renderers/summary-renderer'
import { SUMMARY_BAR_HEIGHT, SPLITTER_WIDTH } from '@/components/gantt/gantt-constants'

interface SummaryPopup {
  x: number
  y: number
  summary: DaySummary
}

/**
 * Summary bar component rendered above all panes.
 * Shows per-day stacked columns colored by assignment group percentages.
 * Clicking a day opens a popup with detailed tree statistics.
 */
export const SummaryBar = () => {
  const containerRef = useRef<HTMLDivElement>(null)
  const { canvasRef, size } = useCanvasResize(containerRef)
  const rafRef = useRef<number>(0)
  const [popup, setPopup] = useState<SummaryPopup | null>(null)

  const pxPerHour = useGanttViewStore((s) => s.pxPerHour)
  const scrollX = useGanttViewStore((s) => s.scrollX)
  const dirty = useGanttViewStore((s) => s.dirty)
  const dateRange = usePaneStore((s) => s.dateRange)
  const leftPanelWidth = usePaneStore((s) => s.leftPanelWidth)

  // Get summary data from summary store (return stable reference)
  const dailySummaries = useSummaryStore((s) => s.dailySummaries)
  const summaries = useMemo((): DaySummary[] => {
    const arr: DaySummary[] = []
    for (const [, v] of dailySummaries) {
      arr.push(v as unknown as DaySummary)
    }
    return arr
  }, [dailySummaries])

  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || size.width === 0 || size.height === 0) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    ctx.save()
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, size.width, size.height)

    const summaryCtx: SummaryRenderContext = {
      ctx,
      dpr,
      canvasWidth: size.width,
      scrollX,
      pxPerHour,
      rangeStart: dateRange.start,
      rangeEnd: dateRange.end,
      summaries,
    }

    renderSummaryBar(summaryCtx)

    ctx.restore()
  }, [canvasRef, size, scrollX, pxPerHour, dateRange, summaries])

  useEffect(() => {
    if (!dirty) return
    rafRef.current = requestAnimationFrame(render)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [dirty, render])

  // Click handler for opening day details popup
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const handleClick = (e: MouseEvent) => {
      // TODO: determine which day was clicked and show popup
      // For now, close any open popup on click
      setPopup(null)
    }

    canvas.addEventListener('click', handleClick)
    return () => canvas.removeEventListener('click', handleClick)
  }, [canvasRef])

  return (
    <div className="relative shrink-0 border-b" style={{ height: SUMMARY_BAR_HEIGHT }}>
      <div className="flex h-full">
        {/* Left spacer to align with pane left panels */}
        <div className="shrink-0" style={{ width: leftPanelWidth + SPLITTER_WIDTH, display: 'flex' }}>
          <div className="flex flex-1 items-center px-2 bg-card">
            <span className="text-xs font-semibold text-muted-foreground">
              Summary
            </span>
          </div>
          <div className="bg-border" style={{ width: 2, flexShrink: 0 }} />
        </div>
        {/* Canvas area */}
        <div ref={containerRef} className="relative flex-1 overflow-hidden">
          <canvas ref={canvasRef} className="absolute inset-0" />
        </div>
      </div>

      {/* Day detail popup */}
      {popup && (
        <div
          className="absolute z-50 rounded border bg-popover p-3 text-sm shadow-lg"
          style={{ left: popup.x, top: popup.y }}
        >
          <div className="mb-1 font-semibold">
            {formatUiDate(popup.summary.date)}
          </div>
          <div className="text-xs text-muted-foreground">
            Total Crews: {popup.summary.totalCrews}
          </div>
          <div className="mt-2 space-y-1">
            {Object.entries(popup.summary.counts).map(([group, count]) => (
              <div key={group} className="flex justify-between text-xs">
                <span>{group}</span>
                <span>{count}</span>
              </div>
            ))}
          </div>
          <button
            className="mt-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setPopup(null)}
          >
            Close
          </button>
        </div>
      )}
    </div>
  )
}
