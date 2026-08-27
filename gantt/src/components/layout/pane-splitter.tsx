import { useRef, useCallback } from 'react'
import { PANE_SPLITTER_HEIGHT } from '@/components/gantt/gantt-constants'

interface PaneSplitterProps {
  /** Called continuously during drag with the delta Y in pixels */
  onDrag: (deltaY: number) => void
  /** Called when drag starts */
  onDragStart?: () => void
  /** Called when drag ends */
  onDragEnd?: () => void
}

/**
 * Draggable splitter bar between two panes.
 * Allows the user to resize pane heights by dragging up/down.
 * Features: hover color change + three small dot handle in the center.
 */
export const PaneSplitter = ({ onDrag, onDragStart, onDragEnd }: PaneSplitterProps) => {
  const isDragging = useRef(false)
  const startY = useRef(0)

  // Use refs so the document-level listeners always call the latest callbacks
  const onDragRef = useRef(onDrag)
  const onDragStartRef = useRef(onDragStart)
  const onDragEndRef = useRef(onDragEnd)
  onDragRef.current = onDrag
  onDragStartRef.current = onDragStart
  onDragEndRef.current = onDragEnd

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
    startY.current = e.clientY
    onDragStartRef.current?.()

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDragging.current) return
      const delta = moveEvent.clientY - startY.current
      startY.current = moveEvent.clientY
      onDragRef.current(delta)
    }

    const handleMouseUp = () => {
      isDragging.current = false
      onDragEndRef.current?.()
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [])

  return (
    <div
      className="group relative shrink-0 cursor-row-resize bg-border transition-colors hover:bg-primary/20 active:bg-primary/30"
      style={{ height: PANE_SPLITTER_HEIGHT }}
      onMouseDown={handleMouseDown}
    >
      {/* Three small dots handle in the center */}
      <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 gap-1">
        <span className="block h-1 w-1 rounded-full bg-muted-foreground/40 transition-colors group-hover:bg-primary/60" />
        <span className="block h-1 w-1 rounded-full bg-muted-foreground/40 transition-colors group-hover:bg-primary/60" />
        <span className="block h-1 w-1 rounded-full bg-muted-foreground/40 transition-colors group-hover:bg-primary/60" />
      </div>
    </div>
  )
}
