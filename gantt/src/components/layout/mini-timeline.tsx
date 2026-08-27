// gantt/src/components/layout/mini-timeline.tsx

import { useMemo } from 'react'
import { useLayoutStore } from '@/stores/layout-store'

interface MiniTimelineProps {
  paneId: string
}

export const MiniTimeline = ({ paneId }: MiniTimelineProps) => {
  const pane = useLayoutStore(s => s.panes.get(paneId))
  const scrollX = pane?.viewport.scrollX ?? 0

  const timeLabels = useMemo(() => {
    const labels: { hour: number; x: number }[] = []
    for (let h = 0; h <= 24; h += 6) {
      const x = (h / 24) * 100 - scrollX * 0.3
      if (x >= -5 && x <= 105) {
        labels.push({ hour: h, x: Math.max(2, Math.min(98, x)) })
      }
    }
    return labels
  }, [scrollX])

  return (
    <div className="h-5 flex items-center px-1 border-b border-border bg-muted/10 overflow-hidden">
      <div className="flex-1 relative">
        {timeLabels.map(({ hour, x }) => (
          <span
            key={hour}
            className="absolute text-3xs text-muted-foreground"
            style={{ left: `${x}%` }}
          >
            {hour.toString().padStart(2, '0')}
          </span>
        ))}
      </div>
    </div>
  )
}