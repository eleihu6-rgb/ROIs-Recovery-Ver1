// gantt/src/components/layout/mini-scrollbar.tsx

import { useCallback } from 'react'
import { useLayoutStore } from '@/stores/layout-store'

interface MiniScrollbarProps {
  paneId: string
}

export const MiniScrollbar = ({ paneId }: MiniScrollbarProps) => {
  const pane = useLayoutStore(s => s.panes.get(paneId))
  const scrollX = pane?.viewport.scrollX ?? 0
  const setViewport = useLayoutStore(s => s.setViewport)

  const handleClick = useCallback((e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const percent = Math.round((e.clientX - rect.left) / rect.width * 100)
    const clamped = Math.max(0, Math.min(70, percent))

    setViewport(paneId, { scrollX: clamped })
  }, [paneId, setViewport])

  return (
    <div className="h-1.5 px-0.5 bg-muted/10">
      <div
        className="h-full bg-border/30 rounded cursor-pointer relative"
        onClick={handleClick}
      >
        <div
          className="absolute h-full bg-muted-foreground/70 rounded"
          style={{ left: `${scrollX}%`, width: '25%' }}
        />
      </div>
    </div>
  )
}