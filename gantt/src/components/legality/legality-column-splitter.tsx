// gantt/src/components/legality/legality-column-splitter.tsx
import { useCallback, useRef } from 'react'

/**
 * Vertical drag bar between Legality Rule Sets columns (catalog / sets / detail).
 * Mirrors ScenarioPanelSplitter: reports incremental dx on mousemove.
 */
export const LegalityColumnSplitter = ({
  onDrag,
  testId,
}: {
  onDrag: (dx: number) => void
  testId?: string
}) => {
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
      data-testid={testId}
      role="separator"
      aria-orientation="vertical"
      className="w-0.5 shrink-0 cursor-col-resize bg-border transition-colors hover:bg-primary/40 active:bg-primary/60"
      onMouseDown={handleMouseDown}
    />
  )
}
