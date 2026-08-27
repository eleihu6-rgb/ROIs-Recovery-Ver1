import { useRef, useCallback, useEffect, useState } from 'react'
import { getScenarioGanttStore } from '@/stores/scenario-gantt-store'

const SCROLLBAR_HEIGHT = 14
const THUMB_MIN_WIDTH = 30

interface ScenarioHorizontalScrollbarProps {
  scenarioId: number
  leftSpacer: number
}

/**
 * DOM-based horizontal scrollbar for Scenario Gantt.
 * Mirrors Live Gantt's HorizontalScrollbar but reads from the scenario store.
 */
export const ScenarioHorizontalScrollbar = ({ scenarioId, leftSpacer }: ScenarioHorizontalScrollbarProps) => {
  const trackRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const dragStartX = useRef(0)
  const dragStartScrollX = useRef(0)

  const useStore = getScenarioGanttStore(scenarioId)
  const data = useStore((s) => s.data)
  const scrollX = useStore((s) => s.scrollX)
  const scrollWindowStartX = useStore((s) => s.scrollWindowStartX)
  const scrollWindowEndX = useStore((s) => s.scrollWindowEndX)
  const setScrollX = useStore((s) => s.setScrollX)
  const pxPerHour = useStore((s) => s.pxPerHour)

  const [trackWidth, setTrackWidth] = useState(0)

  // Total content width based on time range
  const rangeStartMs = data ? new Date(data.strDtLoc).getTime() : 0
  const rangeEndMs = data ? new Date(data.endDtLoc).getTime() : 0
  const totalMs = Math.max(rangeEndMs - rangeStartMs, 1)
  const totalContentWidth = (totalMs / 3_600_000) * pxPerHour

  // Observe track width
  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    const update = () => setTrackWidth(track.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(track)
    return () => ro.disconnect()
  }, [])

  // Thumb dimensions
  const visibleStartX = Math.max(0, scrollWindowStartX)
  const visibleContentWidth = Math.max(
    trackWidth,
    (scrollWindowEndX != null ? Math.min(totalContentWidth, scrollWindowEndX) : totalContentWidth) - visibleStartX,
  )
  const thumbWidth = visibleContentWidth > 0
    ? Math.max(THUMB_MIN_WIDTH, (trackWidth / visibleContentWidth) * trackWidth)
    : trackWidth
  const maxScrollX = Math.max(visibleStartX, visibleStartX + visibleContentWidth - trackWidth)
  const scrollableTrack = trackWidth - thumbWidth
  const thumbLeft = maxScrollX > 0
    ? ((scrollX - visibleStartX) / Math.max(1, maxScrollX - visibleStartX)) * scrollableTrack
    : 0

  const isNeeded = totalContentWidth > trackWidth && trackWidth > 0

  // Drag handlers
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
      setScrollX(Math.max(visibleStartX, Math.min(maxScrollX, newScrollX)))
    }
    const onMouseUp = () => { dragging.current = false }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [trackWidth, thumbWidth, maxScrollX, visibleStartX, setScrollX])

  // Track click (jump)
  const onTrackClick = useCallback((e: React.MouseEvent) => {
    const track = trackRef.current
    if (!track) return
    const rect = track.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const scrollablePx = trackWidth - thumbWidth
    if (scrollablePx <= 0) return
    const targetThumbLeft = clickX - thumbWidth / 2
    const ratio = Math.max(0, Math.min(1, targetThumbLeft / scrollablePx))
    setScrollX(visibleStartX + ratio * (maxScrollX - visibleStartX))
  }, [trackWidth, thumbWidth, maxScrollX, visibleStartX, setScrollX])

  // Wheel handler
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaX !== 0 ? e.deltaX : e.deltaY
    setScrollX(Math.max(visibleStartX, Math.min(maxScrollX, scrollX + delta)))
  }, [scrollX, maxScrollX, visibleStartX, setScrollX])

  return (
    <div
      className="flex shrink-0 bg-muted/30"
      style={{ height: SCROLLBAR_HEIGHT }}
    >
      {/* Left spacer — aligns thumb track with canvas area past the left panel */}
      <div style={{ width: leftSpacer, minWidth: leftSpacer, flexShrink: 0 }} />

      {/* Scrollbar track */}
      <div
        ref={trackRef}
        className="relative flex-1 cursor-pointer"
        style={{ height: SCROLLBAR_HEIGHT }}
        data-testid="scenario-horizontal-scrollbar"
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
            data-testid="scenario-horizontal-scrollbar-thumb"
            onMouseDown={onThumbMouseDown}
            onClick={(e) => e.stopPropagation()}
          />
        )}
      </div>
    </div>
  )
}
