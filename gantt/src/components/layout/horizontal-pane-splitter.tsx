import { useRef, useCallback } from 'react'

interface HorizontalPaneSplitterProps {
  /** dy = incremental pixel delta; startH = measured height of the row above on first move (flex → fixed). */
  onDrag: (dy: number, startH?: number) => void
}

/**
 * Draggable bar between stacked pane rows (roster / pairing / flight).
 * Shared by Live LayoutGrid and ScenarioLayoutGrid (§Gantt-Unify).
 */
export const HorizontalPaneSplitter = ({ onDrag }: HorizontalPaneSplitterProps) => {
  const onDragRef = useRef(onDrag)
  onDragRef.current = onDrag

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    // Measure actual DOM height of the row above for the initial flex-1 case
    const prevRow = (e.currentTarget as HTMLElement).previousElementSibling as HTMLElement | null
    const startH = prevRow?.getBoundingClientRect().height
    let lastY = e.clientY
    let firstMove = true
    const onMove = (ev: MouseEvent) => {
      const dy = ev.clientY - lastY
      lastY = ev.clientY
      onDragRef.current(dy, firstMove ? startH : undefined)
      firstMove = false
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [])

  return (
    <div
      className="group relative h-1.5 shrink-0 cursor-row-resize bg-border/40 transition-colors hover:bg-primary/25 active:bg-primary/40"
      data-testid="pane-row-splitter"
      onMouseDown={handleMouseDown}
    >
      <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 gap-1">
        <span className="block h-1 w-1 rounded-full bg-muted-foreground/30 transition-colors group-hover:bg-primary/50" />
        <span className="block h-1 w-1 rounded-full bg-muted-foreground/30 transition-colors group-hover:bg-primary/50" />
        <span className="block h-1 w-1 rounded-full bg-muted-foreground/30 transition-colors group-hover:bg-primary/50" />
      </div>
    </div>
  )
}
