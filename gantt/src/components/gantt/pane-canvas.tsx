import { useRef, useEffect, useCallback, useState } from 'react'
import { useCanvasResize } from '@/hooks/use-canvas-resize'
import { useGanttSource } from './source/gantt-source-context'
import { renderBase, drawFrozenOverlay, drawHeaderBand } from './renderers/base-renderer'
import type { BaseRenderContext } from './renderers/base-renderer'
import type { PaneType } from '@/types/pane'
import { ROW_HEIGHT, HEADER_HEIGHT, PAIRING_HEADER_HEIGHT } from './gantt-constants'
import type { RubberBandRect } from './interactions/base-interaction'
import { publishRenderStats } from '@/utils/gantt-test-hook'

interface PaneCanvasProps {
  /** Unique pane instance ID (e.g., 'roster-1', 'pairing-2') */
  paneId: string
  /** Legacy pane type for backward compat with base renderer */
  paneType: PaneType
  /** Test ID for the canvas element */
  canvasTestId?: string
  /** Total number of data rows in this pane */
  totalRows: number
  /** Number of frozen rows at top */
  frozenRowCount: number
  /** Current drop-target row index (-1 for none) */
  dropTargetRow: number
  /** Set of selected row indices (for highlight) */
  selectedRowIndices: Set<number>
  /** Row height in pixels for scrollbar geometry (defaults to ROW_HEIGHT) */
  rowHeight?: number
  /** Pane-specific render callback invoked after the base layers are drawn */
  renderContent: (ctx: CanvasRenderingContext2D, base: BaseRenderContext) => void
  /** Called when canvas element is ready (for interaction handler attachment) */
  onCanvasReady?: (canvas: HTMLCanvasElement) => void
  /** Called when canvas element is removed */
  onCanvasDestroy?: () => void
  /** Current rubber-band selection rectangle (null = not active) */
  rubberBand?: RubberBandRect | null
}

/**
 * Generic Pane Canvas component.
 * Renders the shared base layers (background, grid, time axis, drop target)
 * then delegates to a pane-specific render callback for task/block content.
 *
 * Includes interactive scrollbar overlay for click/drag scrolling.
 * Uses paneId for independent scroll state per pane instance.
 */
export const PaneCanvas = ({
  paneId,
  paneType,
  canvasTestId,
  totalRows,
  frozenRowCount,
  dropTargetRow,
  selectedRowIndices,
  rowHeight = ROW_HEIGHT,
  renderContent,
  onCanvasReady,
  onCanvasDestroy,
  rubberBand,
}: PaneCanvasProps) => {
  // 统一数据源：viewport / timezone / dirty 信号一律从此读取，禁止直连 store。
  const source = useGanttSource()
  const scrollX = source.useScrollX()
  const scrollY = source.useScrollY(paneId)
  const pxPerHour = source.usePxPerHour()
  const { start: rangeStart, end: rangeEnd } = source.useRange()
  const timezone = source.useTimezone()
  const rosterPeriods = source.useRosterPeriods()
  const dirtySignal = source.useDirtySignal()

  const containerRef = useRef<HTMLDivElement>(null)
  const { canvasRef, size } = useCanvasResize(containerRef)
  const rafRef = useRef<number>(0)
  const lastScheduledRenderRef = useRef<(() => void) | null>(null)
  const [isDraggingScrollbar, setIsDraggingScrollbar] = useState(false)
  const scrollbarDragStartY = useRef<number>(0)
  const scrollbarDragStartScrollY = useRef<number>(0)
  const canvasReadyRef = useRef<HTMLCanvasElement | null>(null) // Track which canvas was initialized
  // Keep ready/destroy identities out of the effect deps: parents recreate these
  // callbacks often (selection, model rebuild). Re-running cleanup would detach
  // document-level pending drag and unregister cross-pane drop targets mid-gesture.
  const onCanvasReadyRef = useRef(onCanvasReady)
  const onCanvasDestroyRef = useRef(onCanvasDestroy)
  onCanvasReadyRef.current = onCanvasReady
  onCanvasDestroyRef.current = onCanvasDestroy

  // Use refs to cache values and avoid unnecessary re-renders
  const scrollYRef = useRef<number>(0)
  // P1-2：本 pane 上次已渲染的 scrollY，用于判定纵向滚动是否需要重绘（pane-scoped dirty）
  const lastRenderedScrollYRef = useRef<number>(0)
  const pxPerHourRef = useRef<number>(0)
  const rangeStartRef = useRef<Date>(new Date())
  const rangeEndRef = useRef<Date>(new Date())

  // Determine header height based on pane type (component-level for use in interactions)
  const headerHeight = paneType === 'pairing' ? PAIRING_HEADER_HEIGHT : HEADER_HEIGHT

  // Update refs when values change (for stable render function). Values now come
  // straight from the injected source — no more override-vs-store ternaries.
  useEffect(() => {
    scrollYRef.current = scrollY
    pxPerHourRef.current = pxPerHour
    rangeStartRef.current = rangeStart
    rangeEndRef.current = rangeEnd
  }, [scrollX, scrollY, pxPerHour, rangeStart, rangeEnd])

  // Re-clamp this pane's stored scrollY whenever the viewport height or row count changes
  // (e.g. a sibling pane closes and this pane GROWS). Wheel handlers only clamp scrollY to
  // maxScroll at scroll time, using the viewport height *then*; when the viewport later grows,
  // a now-too-large scrollY scrolls content past the end and leaves a blank gap below the last
  // row. Clamp here so content always fills the viewport. Same maxScroll basis as the scrollbar
  // geometry above (size.height - HEADER_HEIGHT).
  useEffect(() => {
    if (size.height <= 0) return
    const maxScroll = Math.max(0, totalRows * rowHeight - (size.height - headerHeight))
    const currentScrollY = source.getScrollY(paneId)
    if (currentScrollY > maxScroll) {
      source.setScrollY(paneId, maxScroll)
    }
  }, [size.height, totalRows, rowHeight, headerHeight, paneId, source])

  // Calculate scrollbar geometry - reads scrollY fresh via source.getScrollY(paneId)
  // (synchronous store getState() read) to avoid stale-ref hit-test mismatches
  const getScrollbarGeometry = useCallback(() => {
    const contentHeight = totalRows * rowHeight
    const viewportHeight = size.height - headerHeight
    if (contentHeight <= viewportHeight || viewportHeight <= 0) {
      return null
    }
    const scrollbarTrackHeight = viewportHeight
    const scrollbarHeight = Math.max(20, scrollbarTrackHeight * (viewportHeight / contentHeight))
    const maxScroll = contentHeight - viewportHeight
    const currentScrollY = source.getScrollY(paneId)
    const scrollRatio = maxScroll > 0 ? currentScrollY / maxScroll : 0
    const scrollbarY = headerHeight + scrollRatio * (scrollbarTrackHeight - scrollbarHeight)
    return {
      trackTop: headerHeight,
      trackHeight: scrollbarTrackHeight,
      thumbTop: scrollbarY,
      thumbHeight: scrollbarHeight,
      maxScroll,
    }
  }, [totalRows, size.height, rowHeight, headerHeight, paneId, source])

  // Stable render function using refs
  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || size.width === 0 || size.height === 0) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1

    // Read latest scroll values fresh at RAF execution time (bypasses React batching
    // staleness). These go through the source's synchronous getters (store getState() under
    // the hood) so the values are as current as the original direct-store reads were.
    const latestScrollY = source.getScrollY(paneId)
    const latestScrollX = source.getScrollX()

    const baseCtx: BaseRenderContext = {
      ctx,
      dpr,
      canvasWidth: size.width,
      canvasHeight: size.height,
      scrollX: latestScrollX,
      scrollY: latestScrollY,
      pxPerHour: pxPerHourRef.current,
      rangeStart: rangeStartRef.current,
      rangeEnd: rangeEndRef.current,
      timezone,
      rosterPeriods,
      totalRows,
      dropTargetRow,
      frozenRowCount,
      selectedRowIndices,
      headerHeight,
      rowHeight,
    }

    ctx.save()
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, size.width, size.height)

    // Render shared base layers (background, grid, highlights) FIRST
    renderBase(baseCtx)

    // Render pane-specific content (tasks) — only for non-frozen rows
    renderContent(ctx, baseCtx)

    // Re-draw frozen zone overlay (blank, no tasks — just pinned indicator)
    drawFrozenOverlay(baseCtx)

    // Draw the blank header band at top (timeline lives in the pane title row;
    // the DOM condition strip overlays this band)
    drawHeaderBand(baseCtx)

    ctx.restore()

    // 测试自省回执：记录本次实际绘制（生产构建下 publishRenderStats 自身 no-op）。
    publishRenderStats(paneId, {
      paneType,
      totalRows,
      width: size.width,
      height: size.height,
    })

    // Clear the source's dirty state (Live: store markClean; Scenario: no-op).
    source.markClean()
  }, [
    paneId,
    canvasRef, size, paneType, totalRows, dropTargetRow, frozenRowCount,
    selectedRowIndices, renderContent, source, rosterPeriods, timezone,
  ])

  // Always-latest render reference so a pending RAF uses the newest closure.
  const renderRef = useRef(render)
  renderRef.current = render

  // RAF rendering — schedule one RAF per dirty transition. We intentionally do
  // NOT cancel the RAF in the effect cleanup: the header canvas shares the same
  // `dirty` flag and its own render calls markClean(), which would otherwise
  // cancel our pending RAF before it fires. Canceling only happens on unmount.
  const lastDirtySignalRef = useRef<number | undefined>(undefined)
  useEffect(() => {
    // 共享重绘信号变化（缩放/横向滚动/选中/数据/zoom 等，由 source 统一抽象）→ 重绘；
    // 本 pane 自身 scrollY 变化（纵向滚动）→ 仅本 pane 重绘。
    const scrollYChanged = scrollY !== lastRenderedScrollYRef.current
    const renderChanged = render !== lastScheduledRenderRef.current
    const signalChanged = dirtySignal !== lastDirtySignalRef.current
    if ((signalChanged || scrollYChanged || renderChanged) && !rafRef.current) {
      lastScheduledRenderRef.current = render
      lastDirtySignalRef.current = dirtySignal
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0
        lastRenderedScrollYRef.current = scrollYRef.current
        renderRef.current()
      })
    }
  }, [render, scrollY, dirtySignal])

  // Initial render when size changes — same scheduling discipline.
  useEffect(() => {
    if (size.width > 0 && size.height > 0 && !rafRef.current) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0
        renderRef.current()
      })
    }
  }, [size, render])

  // Cancel any pending RAF only on unmount.
  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = 0
      }
    }
  }, [])

  // Notify parent when canvas is ready/destroyed — once per canvas instance / size gate.
  // Callbacks are read from refs so parent identity churn does not detach interactions.
  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas && size.width > 0 && canvasReadyRef.current !== canvas) {
      if (canvasReadyRef.current && onCanvasDestroyRef.current) {
        onCanvasDestroyRef.current()
      }
      canvasReadyRef.current = canvas
      onCanvasReadyRef.current?.(canvas)
    }
    return () => {
      if (onCanvasDestroyRef.current && canvasReadyRef.current) {
        onCanvasDestroyRef.current()
        canvasReadyRef.current = null
      }
    }
  }, [canvasRef, size.width])

  // Permanent native contextmenu suppression on the canvas DOM element.
  // Independent of the interaction handler attach/detach lifecycle so it
  // survives every re-attach and React-fast-refresh edge case.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || size.width === 0) return
    const prevent = (e: Event) => e.preventDefault()
    canvas.addEventListener('contextmenu', prevent)
    return () => canvas.removeEventListener('contextmenu', prevent)
  }, [canvasRef, size.width])

  // Scrollbar interaction handlers
  const handleScrollbarMouseDown = useCallback((e: React.MouseEvent) => {
    const geom = getScrollbarGeometry()
    if (!geom) return

    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return

    const localY = e.clientY - rect.top
    const thumbBottom = geom.thumbTop + geom.thumbHeight

    // Get current scrollY fresh from the source (synchronous store read)
    const currentScrollY = source.getScrollY(paneId)

    // Check if click is on the scrollbar thumb
    if (localY >= geom.thumbTop && localY <= thumbBottom) {
      // Drag thumb
      setIsDraggingScrollbar(true)
      scrollbarDragStartY.current = e.clientY
      scrollbarDragStartScrollY.current = currentScrollY
    } else if (localY >= geom.trackTop && localY <= geom.trackTop + geom.trackHeight) {
      // Click/drag on track: jump to the clicked position, then keep dragging so the
      // user can scroll continuously by holding the track (not just a one-shot jump).
      const clickRatio = (localY - geom.trackTop) / geom.trackHeight
      const newScrollY = Math.max(0, Math.round(clickRatio * geom.maxScroll))
      // P1-2（ver3）：纵向滚动是每个 pane 独立的（scrollY 由 source 管理），
      // 不再置全局 dirty（会让所有 pane 重绘）；本 pane 通过订阅自身 scrollY 重绘。
      source.setScrollY(paneId, newScrollY)
      // Enter drag mode anchored at the clicked scroll position so a subsequent
      // mousemove drags continuously from here (thumb stays under the cursor).
      setIsDraggingScrollbar(true)
      scrollbarDragStartY.current = e.clientY
      scrollbarDragStartScrollY.current = newScrollY
    }
  }, [getScrollbarGeometry, paneId, source])

  const handleScrollbarMouseMove = useCallback((e: MouseEvent) => {
    if (!isDraggingScrollbar) return

    const geom = getScrollbarGeometry()
    if (!geom) return

    const deltaY = e.clientY - scrollbarDragStartY.current
    const scrollDelta = (deltaY / geom.trackHeight) * geom.maxScroll
    const newScrollY = Math.round(Math.max(0, Math.min(geom.maxScroll, scrollbarDragStartScrollY.current + scrollDelta)))
    source.setScrollY(paneId, newScrollY)
  }, [isDraggingScrollbar, getScrollbarGeometry, paneId, source])

  const handleScrollbarMouseUp = useCallback(() => {
    setIsDraggingScrollbar(false)
  }, [])

  // Scrollbar wheel handler - scroll when wheeling over scrollbar area
  const handleScrollbarWheel = useCallback((e: React.WheelEvent) => {
    const geom = getScrollbarGeometry()
    if (!geom) return

    // Get fresh scrollY from the source (synchronous store read)
    const currentScrollY = source.getScrollY(paneId)

    // Scroll by delta amount
    const newScrollY = Math.round(Math.max(0, Math.min(geom.maxScroll, currentScrollY + e.deltaY)))
    source.setScrollY(paneId, newScrollY)
  }, [getScrollbarGeometry, paneId, source])

  // Bind/unbind document-level mouse handlers when dragging
  useEffect(() => {
    if (isDraggingScrollbar) {
      document.addEventListener('mousemove', handleScrollbarMouseMove)
      document.addEventListener('mouseup', handleScrollbarMouseUp)
      return () => {
        document.removeEventListener('mousemove', handleScrollbarMouseMove)
        document.removeEventListener('mouseup', handleScrollbarMouseUp)
      }
    }
  }, [isDraggingScrollbar, handleScrollbarMouseMove, handleScrollbarMouseUp])

  // Render scrollbar overlay
  const scrollbarGeom = getScrollbarGeometry()

  return (
    <div
      ref={containerRef}
      className="relative flex-1 overflow-hidden bg-background"
      data-gantt-area
      onContextMenu={(e) => e.preventDefault()}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        data-testid={canvasTestId}
        onContextMenu={(e) => e.preventDefault()}
      />

      {rubberBand && (
        <div
          className="pointer-events-none absolute border border-blue-500/70 bg-blue-500/10"
          style={{
            left: rubberBand.x,
            top: rubberBand.y,
            width: rubberBand.w,
            height: rubberBand.h,
          }}
        />
      )}
      {/* Scrollbar track overlay */}
      {scrollbarGeom && (
        <div
          className={`absolute right-1 z-20 w-2 rounded cursor-pointer transition-colors ${isDraggingScrollbar ? 'bg-muted' : 'bg-muted/50 hover:bg-muted'}`}
          style={{
            top: scrollbarGeom.trackTop,
            height: scrollbarGeom.trackHeight,
          }}
          onMouseDown={handleScrollbarMouseDown}
          onWheel={handleScrollbarWheel}
        />
      )}
      {/* Scrollbar thumb overlay — z-30 so no pane overlay (e.g. offscreen-jump-hint at
          z-20) can intercept hover/drag on the thumb. */}
      {scrollbarGeom && (
        <div
          className={`absolute right-1 z-30 w-2 rounded cursor-pointer transition-colors ${isDraggingScrollbar ? 'bg-primary' : 'bg-primary/60 hover:bg-primary'}`}
          style={{
            top: scrollbarGeom.thumbTop,
            height: scrollbarGeom.thumbHeight,
          }}
          onMouseDown={handleScrollbarMouseDown}
          onWheel={handleScrollbarWheel}
        />
      )}
    </div>
  )
}
