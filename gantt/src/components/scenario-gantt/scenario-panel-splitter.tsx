// gantt/src/components/scenario-gantt/scenario-panel-splitter.tsx
import { useCallback, useRef } from 'react'

/**
 * Vertical splitter between left panel and right canvas in a scenario pane.
 * Dragging left/right adjusts the shared leftPanelWidth.
 */
export const ScenarioPanelSplitter = ({ onDrag }: { onDrag: (dx: number) => void }) => {
  const isDragging = useRef(false)
  const startX = useRef(0)
  const onDragRef = useRef(onDrag)
  onDragRef.current = onDrag

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
    startX.current = e.clientX

    const onMove = (ev: MouseEvent) => {
      if (!isDragging.current) return
      const dx = ev.clientX - startX.current
      startX.current = ev.clientX
      onDragRef.current(dx)
    }
    const onUp = () => {
      isDragging.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [])

  return (
    <div
      className="shrink-0 w-0.5 cursor-col-resize bg-border hover:bg-primary/40 transition-colors active:bg-primary/60"
      onMouseDown={handleMouseDown}
    />
  )
}
