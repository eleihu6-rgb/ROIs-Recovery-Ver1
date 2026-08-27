import { useCallback, useRef } from 'react'
import { usePaneStore } from '@/stores/pane-store'
import { SPLITTER_WIDTH } from '@/components/gantt/gantt-constants'

/**
 * Vertical splitter bar between left panel and right canvas.
 * Dragging left/right adjusts the shared leftPanelWidth in the pane store.
 */
export const VerticalSplitter = () => {
  const leftPanelWidth = usePaneStore((s) => s.leftPanelWidth)
  const setLeftPanelWidth = usePaneStore((s) => s.setLeftPanelWidth)
  const isDragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
    startX.current = e.clientX
    startWidth.current = leftPanelWidth

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDragging.current) return
      const dx = moveEvent.clientX - startX.current
      setLeftPanelWidth(startWidth.current + dx)
    }

    const handleMouseUp = () => {
      isDragging.current = false
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [leftPanelWidth, setLeftPanelWidth])

  return (
    <div
      className="shrink-0 cursor-col-resize hover:bg-primary/20 active:bg-primary/30"
      style={{
        width: SPLITTER_WIDTH,
        backgroundColor: '#9ca3af',
      }}
      onMouseDown={handleMouseDown}
    />
  )
}
