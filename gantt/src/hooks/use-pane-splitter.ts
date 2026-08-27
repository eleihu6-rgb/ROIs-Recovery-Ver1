import { useCallback, useRef } from 'react'
import { usePaneStore } from '@/stores/pane-store'
import type { PaneType } from '@/types/pane'

/**
 * Hook that manages pane height drag-resize.
 * Returns handlers for the splitter bar between two panes.
 */
export const usePaneSplitter = (upperPaneType: PaneType, lowerPaneType: PaneType) => {
  const resizePane = usePaneStore((s) => s.resizePane)
  const panes = usePaneStore((s) => s.panes)
  const isDragging = useRef(false)

  const onDragStart = useCallback(() => {
    isDragging.current = true
  }, [])

  const onDrag = useCallback((deltaY: number) => {
    if (!isDragging.current) return

    const upperConfig = panes.find((p) => p.type === upperPaneType)
    if (upperConfig) {
      const newHeight = Math.max(upperConfig.minHeight, upperConfig.height + deltaY)
      resizePane(upperPaneType, newHeight)
    }
  }, [upperPaneType, panes, resizePane])

  const onDragEnd = useCallback(() => {
    isDragging.current = false
  }, [])

  return { onDrag, onDragStart, onDragEnd }
}
