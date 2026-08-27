// gantt/src/components/layout/shared-scrollbar.tsx

import { useCallback } from 'react'
import { useLayoutStore } from '@/stores/layout-store'

interface SharedScrollbarProps {
  row: number
}

export const SharedScrollbar = ({ row }: SharedScrollbarProps) => {
  const grid = useLayoutStore(s => s.grid)
  const panes = useLayoutStore(s => s.panes)

  const paneId = grid[row][0]
  const pane = paneId ? panes.get(paneId) : null
  const scrollX = pane?.viewport.scrollX ?? 0
  const setViewport = useLayoutStore(s => s.setViewport)

  const handleClick = useCallback((e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const percent = Math.round((e.clientX - rect.left) / rect.width * 100)
    const clamped = Math.max(0, Math.min(70, percent))

    if (paneId) {
      setViewport(paneId, { scrollX: clamped })
    }
  }, [paneId, setViewport])

  return (
    <div className="h-2 px-1 bg-muted/20">
      <div
        className="h-full bg-border/50 rounded cursor-pointer relative"
        onClick={handleClick}
      >
        <div
          className="absolute h-full bg-muted-foreground rounded"
          style={{ left: `${scrollX}%`, width: '30%' }}
        />
      </div>
    </div>
  )
}