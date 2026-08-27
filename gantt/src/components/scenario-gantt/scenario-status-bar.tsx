import { useUiStore } from '@/stores/ui-store'

/**
 * Scenario bottom status bar. Legality alerts are presented by the roster Header bell /
 * Alert Center; keeping a second violation counter here created a separate, misleading
 * counting scope.
 */
export const ScenarioStatusBar = (_props: { scenarioId: number }) => {
  const statusBarText = useUiStore((s) => s.statusBarText)

  return (
    <div className="relative shrink-0" data-testid="scenario-status-bar">
      {/* Status bar */}
      <div className="flex h-7 items-center justify-between border-t border-border/60 bg-card px-3 text-xs text-muted-foreground">
        {/* Left: hover info (scenario panes set statusBarText on hover). */}
        <div className="flex items-center gap-3" data-testid="scenario-status-bar-text">
          {statusBarText ? (
            <span>{statusBarText}</span>
          ) : (
            <span className="text-muted-foreground/60">No selection</span>
          )}
        </div>

      </div>
    </div>
  )
}
