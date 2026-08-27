import { useRef, useCallback, useEffect, useState } from 'react'
import { useGanttViewStore } from '@/stores/gantt-view-store'
import { usePaneStore } from '@/stores/pane-store'
import { useFilterStore } from '@/stores/filter-store'
import { SPLITTER_WIDTH } from '@/components/gantt/gantt-constants'
import { differenceInDays } from 'date-fns'

const SCROLLBAR_HEIGHT = 14
const THUMB_MIN_WIDTH = 30

/**
 * Global horizontal scrollbar placed above the StatusBar.
 * Syncs with gantt-view-store.scrollX so all 4 panes scroll together.
 */
export const HorizontalScrollbar = () => {
  const trackRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const dragStartX = useRef(0)
  const dragStartScrollX = useRef(0)

  const scrollX = useGanttViewStore((s) => s.scrollX)
  const scrollWindowStartX = useGanttViewStore((s) => s.scrollWindowStartX)
  const scrollWindowEndX = useGanttViewStore((s) => s.scrollWindowEndX)
  const setScrollX = useGanttViewStore((s) => s.setScrollX)
  const setScrollXCoalesced = useGanttViewStore((s) => s.setScrollXCoalesced)
  const scroll = useGanttViewStore((s) => s.scroll)
  const pxPerHour = useGanttViewStore((s) => s.pxPerHour)

  const leftPanelWidth = usePaneStore((s) => s.leftPanelWidth)
  const dateRange = useFilterStore((s) => s.dateRange)

  const [trackWidth, setTrackWidth] = useState(0)

  // Calculate total content width
  const pixelsPerHour = pxPerHour
  const totalDays = Math.max(1, differenceInDays(dateRange.end, dateRange.start) + 1)
  const totalContentWidth = totalDays * 24 * pixelsPerHour

  // Observe track width changes
  useEffect(() => {
    const track = trackRef.current
    if (!track) return

    const update = () => {
      setTrackWidth(track.clientWidth)
    }
    update()

    const ro = new ResizeObserver(update)
    ro.observe(track)
    return () => ro.disconnect()
  }, [])

  // Thumb dimensions
  const viewportWidth = trackWidth
  const visibleStartX = Math.max(0, scrollWindowStartX)
  const visibleContentWidth = Math.max(
    viewportWidth,
    (scrollWindowEndX != null ? Math.min(totalContentWidth, scrollWindowEndX) : totalContentWidth) - visibleStartX,
  )
  const thumbWidth = visibleContentWidth > 0
    ? Math.max(THUMB_MIN_WIDTH, (viewportWidth / visibleContentWidth) * trackWidth)
    : trackWidth
  const maxScrollX = Math.max(visibleStartX, visibleStartX + visibleContentWidth - viewportWidth)
  const scrollableTrack = trackWidth - thumbWidth
  const thumbLeft = maxScrollX > 0
    ? ((scrollX - visibleStartX) / Math.max(1, maxScrollX - visibleStartX)) * scrollableTrack
    : 0

  // Don't render if content fits in viewport
  const isNeeded = totalContentWidth > viewportWidth && viewportWidth > 0

  // --- Drag handlers ---
  const onThumbMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragging.current = true
    dragStartX.current = e.clientX
    dragStartScrollX.current = scrollX
  }, [scrollX])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const dx = e.clientX - dragStartX.current
      const scrollablePx = trackWidth - thumbWidth
      if (scrollablePx <= 0) return
      const ratio = dx / scrollablePx
      const newScrollX = dragStartScrollX.current + ratio * maxScrollX
      setScrollXCoalesced(Math.max(visibleStartX, Math.min(maxScrollX, newScrollX)))
    }

    const onMouseUp = () => {
      dragging.current = false
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [trackWidth, thumbWidth, maxScrollX, visibleStartX, setScrollXCoalesced])

  // --- Track click (jump) ---
  const onTrackClick = useCallback((e: React.MouseEvent) => {
    const track = trackRef.current
    if (!track) return
    const rect = track.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    // Center thumb on click position
    const scrollablePx = trackWidth - thumbWidth
    if (scrollablePx <= 0) return
    const targetThumbLeft = clickX - thumbWidth / 2
    const ratio = Math.max(0, Math.min(1, targetThumbLeft / scrollablePx))
    setScrollX(visibleStartX + ratio * (maxScrollX - visibleStartX))
  }, [trackWidth, thumbWidth, maxScrollX, visibleStartX, setScrollX])

  // --- Wheel handler ---
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaX !== 0 ? e.deltaX : e.deltaY
    // Delta-based + coalesced: same path as pane wheel scrolling. The store's flushScroll
    // now clamps to maxScrollX (content right edge), so wheel/trackpad input can no longer
    // overscroll past the last day into blank space.
    scroll(delta, 0)
  }, [scroll])

  return (
    <div
      className="flex shrink-0 bg-muted/30"
      style={{ height: SCROLLBAR_HEIGHT }}
    >
      {/* Left spacer: aligns with panel + divider */}
      <div style={{ width: leftPanelWidth + SPLITTER_WIDTH, minWidth: leftPanelWidth + SPLITTER_WIDTH, flexShrink: 0 }} />

      {/* Scrollbar track */}
      <div
        ref={trackRef}
        className="relative flex-1 cursor-pointer"
        style={{ height: SCROLLBAR_HEIGHT }}
        data-testid="gantt-horizontal-scrollbar"
        onClick={onTrackClick}
        onWheel={onWheel}
      >
        {isNeeded && (
          <div
            className="absolute top-1 rounded-full bg-foreground/25 hover:bg-foreground/40 transition-colors"
            style={{
              left: thumbLeft,
              width: thumbWidth,
              height: SCROLLBAR_HEIGHT - 4,
              cursor: 'grab',
              transition: dragging.current ? 'none' : 'left 0.05s ease-out, background-color 0.15s',
            }}
            data-testid="gantt-horizontal-scrollbar-thumb"
            onMouseDown={onThumbMouseDown}
            onClick={(e) => e.stopPropagation()}
          />
        )}
      </div>
    </div>
  )
}
