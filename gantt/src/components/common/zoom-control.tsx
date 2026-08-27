import { Tooltip, TooltipContent, TooltipTrigger } from '@rois/ui'
import { ZoomIn, ZoomOut } from 'lucide-react'
import { useGanttViewStore } from '@/stores/gantt-view-store'

interface ZoomControlViewProps {
  pxPerHour: number
  zoomMin: number
  zoomMax: number
  onZoomIn: () => void
  onZoomOut: () => void
}

/**
 * Presentational zoom control — shared by Live and Scenario. Holds no store wiring so each
 * context can supply its own zoom state + handlers (and its own bounds: Live 7–50, Scenario
 * 2–200). The `ZoomControl` wrapper below binds it to the Live gantt-view-store.
 */
export const ZoomControlView = ({ pxPerHour, zoomMin, zoomMax, onZoomIn, onZoomOut }: ZoomControlViewProps) => {
  // Allow 1% tolerance for float comparison
  const atMax = pxPerHour >= zoomMax * 0.99
  const atMin = pxPerHour <= zoomMin * 1.01

  return (
    <div className="flex items-center gap-0.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className={[
              'inline-flex h-7 w-7 items-center justify-center rounded-md transition-all duration-100',
              atMax
                ? 'pointer-events-none text-muted-foreground/30'
                : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground active:scale-95',
            ].join(' ')}
            onClick={onZoomIn}
            disabled={atMax}
            data-testid="zoom-in"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Zoom In</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className={[
              'inline-flex h-7 w-7 items-center justify-center rounded-md transition-all duration-100',
              atMin
                ? 'pointer-events-none text-muted-foreground/30'
                : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground active:scale-95',
            ].join(' ')}
            onClick={onZoomOut}
            disabled={atMin}
            data-testid="zoom-out"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Zoom Out</TooltipContent>
      </Tooltip>
    </div>
  )
}

/** Live gantt zoom control — binds the shared view to the Live gantt-view-store. */
export const ZoomControl = () => {
  const pxPerHour = useGanttViewStore((s) => s.pxPerHour)
  const zoomMin = useGanttViewStore((s) => s.zoomMin)
  const zoomMax = useGanttViewStore((s) => s.zoomMax)
  const zoomIn = useGanttViewStore((s) => s.zoomIn)
  const zoomOut = useGanttViewStore((s) => s.zoomOut)

  return (
    <ZoomControlView
      pxPerHour={pxPerHour}
      zoomMin={zoomMin}
      zoomMax={zoomMax}
      onZoomIn={zoomIn}
      onZoomOut={zoomOut}
    />
  )
}
