// gantt/src/components/layout/shared-timeline.tsx

import { useMemo } from 'react'
import { useLayoutStore } from '@/stores/layout-store'

interface SharedTimelineProps {
  row: number
}

export const SharedTimeline = ({ row }: SharedTimelineProps) => {
  // Get first pane's viewport for this row
  const grid = useLayoutStore(s => s.grid)
  const panes = useLayoutStore(s => s.panes)

  const paneId = grid[row][0]
  const pane = paneId ? panes.get(paneId) : null
  const scrollX = pane?.viewport.scrollX ?? 0

  // Time labels (00:00 to 24:00)
  const timeLabels = useMemo(() => {
    const labels: { hour: number; x: number }[] = []
    for (let h = 0; h <= 24; h += 4) {
      const x = (h / 24) * 100 - scrollX * 0.3
      if (x >= -5 && x <= 105) {
        labels.push({ hour: h, x: Math.max(2, Math.min(98, x)) })
      }
    }
    return labels
  }, [scrollX])

  return (
    <div className="h-7 flex items-center px-2 border-b border-border bg-muted/20 overflow-hidden">
      <div className="flex-1 relative">
        {timeLabels.map(({ hour, x }) => (
          <span
            key={hour}
            className="absolute text-2xs text-muted-foreground"
            style={{ left: `${x}%` }}
          >
            {hour.toString().padStart(2, '0')}:00
          </span>
        ))}
      </div>
    </div>
  )
}