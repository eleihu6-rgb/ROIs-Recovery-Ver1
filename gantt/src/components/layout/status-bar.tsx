import { useGanttViewStore } from '@/stores/gantt-view-store'
import { useUiStore } from '@/stores/ui-store'

/**
 * Bottom status bar.
 *
 * Left: hover info / selection count.
 * Legality alerts are presented by the roster Header bell / Alert Center.
 */
export const StatusBar = () => {
  const selectedTaskIds = useGanttViewStore((s) => s.selectedTaskIds)
  const statusBarText = useUiStore((s) => s.statusBarText)

  return (
    <div className="relative shrink-0">
      {/* Status bar */}
      <div className="flex h-7 items-center justify-between border-t border-border/60 bg-card px-3 text-xs text-muted-foreground">
        {/* Left: hover info or selection */}
        <div className="flex items-center gap-3" data-testid="status-bar-text">
          {statusBarText ? (
            <span>{statusBarText}</span>
          ) : selectedTaskIds.size > 0 ? (
            <span>Selected: {selectedTaskIds.size} task(s)</span>
          ) : (
            <span className="text-muted-foreground/60">No selection</span>
          )}
        </div>

      </div>
    </div>
  )
}
